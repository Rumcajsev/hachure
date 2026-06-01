"""ESA WorldCover terrain classification via COG raster streaming."""
import asyncio
import math
from typing import AsyncIterator

import numpy as np
import rasterio
from rasterio.enums import Resampling
from rasterio.merge import merge
from rasterio import features as rio_features
from shapely.geometry import Polygon, mapping

WORLDCOVER_TERRAIN: dict[int, str] = {
    10: "woods",   # Tree cover
    20: "rough",   # Shrubland
    30: "clear",   # Grassland
    40: "clear",   # Cropland
    50: "clear",   # Built-up (urban handled via settlements overlay)
    60: "rough",   # Bare / sparse vegetation
    70: "rough",   # Snow and ice
    80: "water",   # Permanent water bodies (ocean, coastal water, lakes)
    90: "marsh",   # Herbaceous wetland
    95: "marsh",   # Mangroves
    100: "rough",  # Moss and lichen
    0: "water",    # No data = ocean (WorldCover only covers land; 0 over water)
}

# ~100m resolution — plenty for hex classification, drastically cuts download size
TARGET_RES_DEG = 0.0009


def get_tile_ids(min_lat: float, min_lon: float, max_lat: float, max_lon: float) -> list[str]:
    return [tid for tid, *_ in get_tile_extents(min_lat, min_lon, max_lat, max_lon)]


def get_tile_extents(
    min_lat: float, min_lon: float, max_lat: float, max_lon: float
) -> list[tuple[str, float, float, float, float]]:
    """Return (tile_id, tile_min_lat, tile_min_lon, tile_max_lat, tile_max_lon) for every 3-degree tile that intersects the bbox."""
    tiles = []
    lat = math.floor(min_lat / 3) * 3
    while lat <= max_lat:
        lon = math.floor(min_lon / 3) * 3
        while lon <= max_lon:
            ns = "N" if lat >= 0 else "S"
            ew = "E" if lon >= 0 else "W"
            tiles.append((f"{ns}{abs(lat):02d}{ew}{abs(lon):03d}", lat, lon, lat + 3, lon + 3))
            lon += 3
        lat += 3
    return tiles


def load_tile_window(
    tile_id: str,
    clip_min_lat: float, clip_min_lon: float,
    clip_max_lat: float, clip_max_lon: float,
) -> tuple[np.ndarray, object] | None:
    """Load one WorldCover tile clipped to the given bounds. Returns None if the tile doesn't exist."""
    try:
        ds = rasterio.open(_tile_url(tile_id))
    except Exception:
        return None
    try:
        data, transform = merge(
            [ds],
            bounds=(clip_min_lon, clip_min_lat, clip_max_lon, clip_max_lat),
            res=(TARGET_RES_DEG, TARGET_RES_DEG),
            resampling=Resampling.mode,
            nodata=0,
        )
        return data[0], transform
    except Exception:
        return None
    finally:
        ds.close()


def _tile_url(tile_id: str) -> str:
    return (
        "/vsicurl/https://esa-worldcover.s3.eu-central-1.amazonaws.com"
        f"/v200/2021/map/ESA_WorldCover_10m_2021_v200_{tile_id}_Map.tif"
    )


def _load_window(
    min_lat: float, min_lon: float, max_lat: float, max_lon: float
) -> tuple[np.ndarray, object]:
    tile_ids = get_tile_ids(min_lat, min_lon, max_lat, max_lon)

    # Not all tiles exist on S3 — ocean-only tiles return 404. Skip missing ones.
    datasets = []
    for tid in tile_ids:
        try:
            datasets.append(rasterio.open(_tile_url(tid)))
        except Exception:
            pass

    if not datasets:
        # Entire area is ocean (no land tiles) — return a zero-filled array.
        import math
        width = max(1, math.ceil((max_lon - min_lon) / TARGET_RES_DEG))
        height = max(1, math.ceil((max_lat - min_lat) / TARGET_RES_DEG))
        from rasterio.transform import from_bounds
        transform = from_bounds(min_lon, min_lat, max_lon, max_lat, width, height)
        return np.zeros((height, width), dtype=np.uint8), transform

    try:
        data, transform = merge(
            datasets,
            bounds=(min_lon, min_lat, max_lon, max_lat),
            res=(TARGET_RES_DEG, TARGET_RES_DEG),
            resampling=Resampling.mode,
            nodata=0,
        )
        return data[0], transform
    finally:
        for ds in datasets:
            ds.close()


async def load_worldcover_window(
    min_lat: float, min_lon: float, max_lat: float, max_lon: float
) -> tuple[np.ndarray, object]:
    return await asyncio.to_thread(_load_window, min_lat, min_lon, max_lat, max_lon)


def extract_land_polygon(
    data: np.ndarray,
    transform,
    tolerance: float = 0.0003,
    smooth: float = 0.0003,
    min_area: float = 1e-5,
):
    """Vectorize the WorldCover land mask into a smoothed Shapely polygon.

    Land = pixels that are neither nodata (0) nor open water (class 80).
    Class 80 covers oceans, seas, and large water bodies — treating it as land
    would mean the coastline clip boundary falls in the wrong place.
    Returns a Shapely (Multi)Polygon or None if the window contains no land.
    """
    from shapely.geometry import shape
    from shapely.ops import unary_union

    land_mask = ((data > 0) & (data != 80)).astype(np.uint8)
    polys = [
        shape(geom)
        for geom, val in rio_features.shapes(land_mask, mask=land_mask, transform=transform)
        if val == 1
    ]
    if not polys:
        return None
    # Drop tiny raster fragments (isolated pixel noise) that appear as white artifacts.
    # TARGET_RES_DEG=0.0009 → one pixel ≈ 8e-7 deg²; min_area=1e-5 filters < ~12 pixels.
    polys = [p for p in polys if p.area >= min_area]
    if not polys:
        return None
    land = unary_union(polys)
    if smooth > 0:
        # Buffer out then back in rounds off the 100m pixel-block stepped edges without
        # shifting the overall coastline position.
        land = land.buffer(smooth, resolution=8).buffer(-smooth, resolution=8)
    if tolerance > 0:
        land = land.simplify(tolerance, preserve_topology=True)
    return land


def compute_hex_coverage(
    hex_poly: Polygon,
    data: np.ndarray,
    transform: object,
) -> dict[str, float]:
    mask = rio_features.rasterize(
        [(mapping(hex_poly), 1)],
        out_shape=data.shape,
        transform=transform,
        fill=0,
        dtype=np.uint8,
    )
    pixels = data[mask == 1]
    if len(pixels) == 0:
        return {}

    terrain_counts: dict[str, int] = {}
    for val, count in zip(*np.unique(pixels, return_counts=True)):
        terrain = WORLDCOVER_TERRAIN.get(int(val), "clear")
        terrain_counts[terrain] = terrain_counts.get(terrain, 0) + int(count)

    total = sum(terrain_counts.values())
    return {t: round(c / total, 3) for t, c in terrain_counts.items() if c / total > 0.001}
