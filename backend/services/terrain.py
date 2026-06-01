"""Terrain classification for hex grid cells using OSM landcover data."""
import json
import math
from typing import AsyncGenerator

from shapely.geometry import Polygon

from models import GridConfig
from services.hex_grid import generate_hex_grid
from services.osm import fetch_landcover, TERRAIN_PRIORITY
from services.geometry import METERS_PER_DEGREE, compute_bbox


def compute_geo_bbox(config: GridConfig) -> tuple[float, float, float, float]:
    """Compute geographic bounding box of the paper area, with 10% buffer.

    Returns (min_lat, min_lon, max_lat, max_lon).
    """
    return compute_bbox(
        config.center_lon, config.center_lat, config.bearing,
        config.width_m, config.height_m, buffer=0.10,
    )


PRIORITY = ["water", "marsh", "woods", "light_woods", "rough", "clear"]

# Default classification rules: terrain → list of (worldcover_class_code, threshold) pairs.
# A hex qualifies for a terrain if ANY rule's class coverage meets its threshold.
# Rules sent from the frontend override these defaults.
DEFAULT_TERRAIN_RULES: dict[str, list[dict]] = {
    "water":       [{"classCode": 80, "threshold": 0.5}, {"classCode": 0, "threshold": 0.5}],
    "marsh":       [{"classCode": 90, "threshold": 0.25}, {"classCode": 95, "threshold": 0.25}],
    "woods":       [{"classCode": 10, "threshold": 0.65}],
    "light_woods": [{"classCode": 10, "threshold": 0.5}, {"classCode": 20, "threshold": 0.25}],
    "rough":       [{"classCode": 60, "threshold": 0.3}, {"classCode": 70, "threshold": 0.3}, {"classCode": 100, "threshold": 0.3}],
}


def _compute_coverage(
    hex_poly: Polygon,
    features: list[tuple[Polygon, str]],
) -> dict[str, float]:
    """Compute terrain coverage fractions for a hex polygon."""
    hex_area = hex_poly.area
    if hex_area == 0:
        return {}

    coverage: dict[str, float] = {}
    for poly, terrain in features:
        try:
            inter = hex_poly.intersection(poly)
        except Exception:
            continue
        if inter.is_empty:
            continue
        frac = inter.area / hex_area
        if frac > 0.001:
            coverage[terrain] = coverage.get(terrain, 0.0) + frac

    return {k: min(v, 1.0) for k, v in coverage.items()}


def classify_hex(coverage: dict[int, float], rules: dict[str, list[dict]] | None = None) -> str:
    """Classify terrain using per-terrain rules against raw WorldCover class coverage.

    coverage: {worldcover_class_code: fraction} e.g. {10: 0.35, 20: 0.18}
    rules: {terrain: [{classCode, threshold}, ...]} — first terrain in PRIORITY whose
           any rule fires wins. Defaults to DEFAULT_TERRAIN_RULES.
    """
    effective_rules = rules if rules is not None else DEFAULT_TERRAIN_RULES
    for terrain in PRIORITY[:-1]:
        for rule in effective_rules.get(terrain, []):
            if coverage.get(rule["classCode"], 0) >= rule["threshold"]:
                return terrain
    return "clear"


def classify_hex_terrain(
    hex_poly: Polygon,
    features: list[tuple[Polygon, str]],
    slider: float = 0.4,
) -> tuple[str, dict[str, float]]:
    """Classify a hex polygon's terrain based on OSM feature coverage.

    Returns (dominant_terrain, coverage_dict) where coverage values are 0-1 fractions.
    """
    coverage = _compute_coverage(hex_poly, features)
    terrain = classify_hex(coverage, slider)
    return terrain, coverage


async def generate_terrain(config: GridConfig, slider: float = 0.4) -> dict:
    from services.worldcover import load_worldcover_window, compute_hex_coverage

    grid = generate_hex_grid(config)
    hexes = grid["hexes"]

    min_lat, min_lon, max_lat, max_lon = compute_geo_bbox(config)
    data, transform = await load_worldcover_window(min_lat, min_lon, max_lat, max_lon)

    for hex_data in hexes:
        pts = [(v[0], v[1]) for v in hex_data["vertices"]]
        try:
            hex_poly = Polygon(pts)
            if not hex_poly.is_valid:
                hex_poly = hex_poly.buffer(0)
        except Exception:
            hex_data["terrain"] = "clear"
            hex_data["coverage"] = {}
            continue

        coverage = compute_hex_coverage(hex_poly, data, transform)
        hex_data["coverage"] = coverage
        hex_data["terrain"] = classify_hex(coverage, slider)

    return grid


async def terrain_stream_generator(config: GridConfig) -> AsyncGenerator[str, None]:
    """Async generator that yields SSE-formatted strings for the terrain-stream endpoint."""
    import asyncio
    from shapely.ops import unary_union
    from services.worldcover import get_tile_extents, load_tile_window, compute_hex_coverage, extract_land_polygon

    rules = config.terrain_rules if config.terrain_rules else None

    try:
        # Step 1: hex grid — emit positions immediately so frontend can show placeholder hexes
        grid = generate_hex_grid(config)
        hexes = grid["hexes"]
        meta = grid["metadata"]
        n_hexes = len(hexes)
        yield f"data: {json.dumps({'step': 'grid', 'message': 'Loading WorldCover raster…', 'progress': 10, 'hexes': hexes, 'metadata': meta})}\n\n"

        # Steps 2+3: load tiles one at a time and classify hexes immediately after each tile.
        min_lat, min_lon, max_lat, max_lon = compute_geo_bbox(config)
        tile_extents = get_tile_extents(min_lat, min_lon, max_lat, max_lon)

        # Pre-assign each hex to the tile that contains its center (lon/lat order).
        tile_hex_indices: dict[str, list[int]] = {}
        for i, hd in enumerate(hexes):
            cx, cy = hd["center"]  # [lon, lat]
            t_lat = math.floor(cy / 3) * 3
            t_lon = math.floor(cx / 3) * 3
            ns = "N" if t_lat >= 0 else "S"
            ew = "E" if t_lon >= 0 else "W"
            tid = f"{ns}{abs(t_lat):02d}{ew}{abs(t_lon):03d}"
            tile_hex_indices.setdefault(tid, []).append(i)

        active_tiles = [(tid, tl, tlo, tla, tloa) for tid, tl, tlo, tla, tloa in tile_extents if tid in tile_hex_indices]
        n_active = max(len(active_tiles), 1)

        hex_polys: dict[int, Polygon] = {}
        classified_count = 0
        tile_land_polys = []

        for tile_num, (tile_id, t_min_lat, t_min_lon, t_max_lat, t_max_lon) in enumerate(active_tiles):
            clip_min_lat = max(t_min_lat, min_lat)
            clip_max_lat = min(t_max_lat, max_lat)
            clip_min_lon = max(t_min_lon, min_lon)
            clip_max_lon = min(t_max_lon, max_lon)

            pct_loading = 15 + int(65 * tile_num / n_active)
            yield f"data: {json.dumps({'step': 'raster', 'message': f'Loading tile {tile_num + 1}/{n_active}…', 'progress': pct_loading})}\n\n"

            tile_result = await asyncio.to_thread(
                load_tile_window, tile_id, clip_min_lat, clip_min_lon, clip_max_lat, clip_max_lon
            )

            hex_indices = tile_hex_indices[tile_id]
            batch: list[dict] = []

            if tile_result is None:
                for i in hex_indices:
                    hd = hexes[i]
                    hd["coverage"] = {0: 1.0}
                    hd["terrain"] = "water"
                    batch.append(hd)
            else:
                data_tile, transform_tile = tile_result
                tile_land_polys.append((data_tile, transform_tile))

                for i in hex_indices:
                    hd = hexes[i]
                    pts = [(v[0], v[1]) for v in hd["vertices"]]
                    try:
                        hex_poly = Polygon(pts)
                        if not hex_poly.is_valid:
                            hex_poly = hex_poly.buffer(0)
                    except Exception:
                        hd["terrain"] = "clear"
                        hd["coverage"] = {}
                        batch.append(hd)
                        continue
                    coverage = compute_hex_coverage(hex_poly, data_tile, transform_tile)
                    hd["coverage"] = coverage
                    hd["terrain"] = classify_hex(coverage, rules)
                    hex_polys[i] = hex_poly
                    batch.append(hd)

            classified_count += len(batch)
            pct_done = 15 + int(65 * (tile_num + 1) / n_active)
            yield f"data: {json.dumps({'step': 'classify', 'message': f'Classified {classified_count}/{n_hexes} hexes…', 'progress': pct_done, 'hexes': batch})}\n\n"

        # Step 4: coastline clips
        yield f"data: {json.dumps({'step': 'coastline', 'message': 'Computing coastline clips…', 'progress': 82})}\n\n"

        def _build_land_poly():
            polys = []
            for d, t in tile_land_polys:
                lp = extract_land_polygon(d, t)
                if lp:
                    polys.append(lp)
            return unary_union(polys) if polys else None

        land_poly = await asyncio.to_thread(_build_land_poly)

        def _boundary_rings(poly) -> list:
            if poly is None:
                return []
            if poly.geom_type == 'Polygon':
                return [[[round(c[0], 6), round(c[1], 6)] for c in poly.exterior.coords[:-1]]]
            if poly.geom_type == 'MultiPolygon':
                return [[[round(c[0], 6), round(c[1], 6)] for c in p.exterior.coords[:-1]] for p in poly.geoms]
            return []

        meta['coastline_boundary'] = _boundary_rings(land_poly)

        def _rings(geom) -> list[list[list[float]]]:
            if geom.geom_type == "Polygon":
                return [[[round(c[0], 6), round(c[1], 6)] for c in geom.exterior.coords]]
            if geom.geom_type == "MultiPolygon":
                return [[[round(c[0], 6), round(c[1], 6)] for c in p.exterior.coords] for p in geom.geoms]
            return []

        for i, hex_data in enumerate(hexes):
            if land_poly is None:
                hex_data["coastline_clip"] = None
                continue
            hex_poly = hex_polys.get(i)
            if hex_poly is None:
                hex_data["coastline_clip"] = None
                continue
            try:
                inter = hex_poly.intersection(land_poly)
            except Exception:
                hex_data["coastline_clip"] = None
                continue
            if inter.is_empty:
                hex_data["coastline_clip"] = None
                continue
            area_ratio = inter.area / hex_poly.area if hex_poly.area > 0 else 0
            if area_ratio > 0.99 or area_ratio < 0.01:
                hex_data["coastline_clip"] = None
                continue
            rings = _rings(inter)
            hex_data["coastline_clip"] = rings if rings else None

        yield f"data: {json.dumps({'step': 'done', 'message': 'Done', 'progress': 100, 'hexes': hexes, 'metadata': meta})}\n\n"

    except Exception as e:
        yield f"data: {json.dumps({'step': 'error', 'message': str(e), 'progress': 0})}\n\n"
