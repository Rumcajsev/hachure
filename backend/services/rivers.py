import logging
import math

from models import RiversConfig
from services.geometry import compute_bbox, make_lonlat_to_hex, METERS_PER_DEGREE
from services.overpass import post_overpass

log = logging.getLogger(__name__)

_RIVER_SCALE_TIERS: list[tuple[float, set[str]]] = [
    (200,  {"river", "canal", "stream", "drain"}),
    (500,  {"river", "canal"}),
    (float("inf"), {"river"}),
]


def _scale_filter_river(types: list[str], width_m: float) -> tuple[list[str], int, float]:
    """Return (filtered_types, overpass_timeout_s, http_timeout_s) for the given map width."""
    width_km = width_m / 1000
    for max_km, allowed in _RIVER_SCALE_TIERS:
        if width_km < max_km:
            filtered = [t for t in types if t in allowed]
            break
    else:
        filtered = [t for t in types if t in _RIVER_SCALE_TIERS[-1][1]]
    if not filtered:
        filtered = ["river"]
    if width_km < 200:
        return filtered, 45, 55.0
    elif width_km < 500:
        return filtered, 75, 90.0
    else:
        return filtered, 120, 140.0


# ---------------------------------------------------------------------------
# Way / chain helpers
# ---------------------------------------------------------------------------

def _extract_ways(members: list[dict]) -> list[list[tuple[float, float]]]:
    ways = []
    for m in members:
        if m.get("type") != "way":
            continue
        if m.get("role", "") not in ("", "main_stream"):
            continue
        geom = m.get("geometry", [])
        if len(geom) < 2:
            continue
        ways.append([(p["lon"], p["lat"]) for p in geom])
    return ways


def _chain_ways(ways: list[list[tuple[float, float]]]) -> list[tuple[float, float]]:
    """Greedily join way segments end-to-end into one ordered polyline."""
    if not ways:
        return []

    chain: list[tuple[float, float]] = list(ways[0])
    used = {0}

    for _ in range(len(ways) - 1):
        tail = chain[-1]
        best_idx, best_reversed, best_dist = -1, False, math.inf

        for i, way in enumerate(ways):
            if i in used:
                continue
            d_s = math.hypot(way[0][0] - tail[0], way[0][1] - tail[1])
            d_e = math.hypot(way[-1][0] - tail[0], way[-1][1] - tail[1])
            if d_s < best_dist:
                best_dist, best_idx, best_reversed = d_s, i, False
            if d_e < best_dist:
                best_dist, best_idx, best_reversed = d_e, i, True

        if best_idx == -1 or best_dist > 0.005:
            break

        used.add(best_idx)
        nxt = list(ways[best_idx])
        if best_reversed:
            nxt = nxt[::-1]
        chain.extend(nxt[1:])

    return chain


def _clip_to_paper(
    coords: list[tuple[float, float]],
    config: RiversConfig,
) -> list[tuple[float, float]]:
    """Return the longest contiguous segment of the polyline within the paper rectangle."""
    β = math.radians(config.bearing)
    cos_β, sin_β = math.cos(β), math.sin(β)
    cos_lat = math.cos(math.radians(config.center_lat))
    hw = config.width_m / 2 + config.R_m * 2
    hh = config.height_m / 2 + config.R_m * 2

    def in_paper(lon: float, lat: float) -> bool:
        E_m = (lon - config.center_lon) * cos_lat * METERS_PER_DEGREE
        N_m = (lat - config.center_lat) * METERS_PER_DEGREE
        px = cos_β * E_m - sin_β * N_m
        py = sin_β * E_m + cos_β * N_m
        return abs(px) <= hw and abs(py) <= hh

    segments: list[list[tuple[float, float]]] = []
    current: list[tuple[float, float]] = []
    for lon, lat in coords:
        if in_paper(lon, lat):
            current.append((lon, lat))
        else:
            if current:
                segments.append(current)
                current = []
    if current:
        segments.append(current)

    return max(segments, key=len) if segments else []


def _parse_width(raw: str | None) -> float | None:
    if not raw:
        return None
    try:
        return float(raw.split()[0])
    except (ValueError, IndexError):
        return None


# ---------------------------------------------------------------------------
# Hex vertex geometry helpers
# ---------------------------------------------------------------------------

def _make_hex_geometry(config: RiversConfig, R_m: float):
    """Return closures for hex vertex computation and coordinate conversion."""
    flat_top = config.hex_orientation == "flat"
    β = math.radians(config.bearing)
    cos_β, sin_β = math.cos(β), math.sin(β)
    cos_lat = math.cos(math.radians(config.center_lat))
    sqrt3 = math.sqrt(3)

    def lonlat_to_paper_m(lon: float, lat: float) -> tuple[float, float]:
        E_m = (lon - config.center_lon) * cos_lat * METERS_PER_DEGREE
        N_m = (lat - config.center_lat) * METERS_PER_DEGREE
        px = cos_β * E_m - sin_β * N_m
        py = sin_β * E_m + cos_β * N_m
        return px, py

    def paper_m_to_lonlat(px: float, py: float) -> tuple[float, float]:
        E_m = px * cos_β + py * sin_β
        N_m = -px * sin_β + py * cos_β
        return (
            config.center_lon + E_m / (cos_lat * METERS_PER_DEGREE),
            config.center_lat + N_m / METERS_PER_DEGREE,
        )

    def hex_center_paper_m(q: int, r: int) -> tuple[float, float]:
        if flat_top:
            return R_m * 1.5 * q, R_m * (sqrt3 / 2 * q + sqrt3 * r)
        else:
            return R_m * (sqrt3 * q + sqrt3 / 2 * r), R_m * 1.5 * r

    base_angle = 0 if flat_top else 30

    def hex_vertices_lonlat(q: int, r: int) -> list[tuple[float, float]]:
        cx, cy = hex_center_paper_m(q, r)
        verts = []
        for i in range(6):
            angle = math.radians(base_angle + 60 * i)
            lon, lat = paper_m_to_lonlat(cx + R_m * math.cos(angle), cy + R_m * math.sin(angle))
            verts.append((round(lon, 6), round(lat, 6)))
        return verts

    return hex_vertices_lonlat, lonlat_to_paper_m, paper_m_to_lonlat, cos_lat


# ---------------------------------------------------------------------------
# Vertex-snapping conversion: polyline → hex edges
# ---------------------------------------------------------------------------

# Center hex + all 6 neighbors
_HEX_NEIGHBOR_DIRS = [(0, 0), (1, 0), (-1, 0), (0, 1), (0, -1), (1, -1), (-1, 1)]


def _nearest_hex_vertex(
    lon: float, lat: float,
    lonlat_to_hex,
    hex_vertices_lonlat,
    cos_lat: float,
    R_m: float,
) -> tuple[float, float] | None:
    """Find the nearest hex vertex (lon, lat) to a given geographic coordinate."""
    center_q, center_r = lonlat_to_hex(lon, lat)
    best_d2 = math.inf
    best_v: tuple[float, float] | None = None
    for dq, dr in _HEX_NEIGHBOR_DIRS:
        for vlon, vlat in hex_vertices_lonlat(center_q + dq, center_r + dr):
            dE = (vlon - lon) * cos_lat * METERS_PER_DEGREE
            dN = (vlat - lat) * METERS_PER_DEGREE
            d2 = dE * dE + dN * dN
            if d2 < best_d2:
                best_d2 = d2
                best_v = (vlon, vlat)
    return best_v


def _polyline_to_hex_edges(
    coords: list[tuple[float, float]],
    lonlat_to_hex,
    hex_vertices_lonlat,
    lonlat_to_paper_m,
    paper_m_to_lonlat,
    cos_lat: float,
    R_m: float,
) -> list[dict]:
    """Convert an OSM polyline to a list of hex adjacency edges via vertex snapping.

    Algorithm:
    1. Dense-sample the polyline (every R_m/3 meters).
    2. Snap each sample to the nearest hex vertex → vertex path. When two
       consecutive samples snap to non-adjacent vertices (shallow angles /
       sharp bends can skip a lattice vertex), recursively bisect the source
       segment between them until the snapped vertices are adjacent, so the
       walk never silently jumps over a vertex.
    3. For each consecutive vertex pair, find the two hexes sharing that edge
       by probing R_m*0.3 to either side of the midpoint perpendicular.
    4. Validate adjacency and deduplicate.
    """
    sample_interval = R_m / 3.0
    max_vertex_gap_m = R_m * 1.2
    max_bisect_depth = 16

    def _vkey(v: tuple[float, float]) -> tuple[int, int]:
        return (round(v[0] * 1_000_000), round(v[1] * 1_000_000))

    def _vertex_gap_m(vA: tuple[float, float], vB: tuple[float, float]) -> float:
        pAx, pAy = lonlat_to_paper_m(*vA)
        pBx, pBy = lonlat_to_paper_m(*vB)
        return math.hypot(pBx - pAx, pBy - pAy)

    # Step 1 + 2: dense sample, snap to nearest hex vertex, bridging gaps
    vertex_path: list[tuple[float, float]] = []
    prev_key: tuple[int, int] | None = None
    prev_lonlat: tuple[float, float] | None = None

    def _emit(v: tuple[float, float], lon: float, lat: float) -> None:
        nonlocal prev_key, prev_lonlat
        key = _vkey(v)
        if key != prev_key:
            vertex_path.append(v)
            prev_key = key
        prev_lonlat = (lon, lat)

    def _bridge(
        lon1: float, lat1: float, v1: tuple[float, float],
        lon2: float, lat2: float, v2: tuple[float, float],
        depth: int,
    ) -> None:
        if _vertex_gap_m(v1, v2) <= max_vertex_gap_m or depth >= max_bisect_depth:
            _emit(v2, lon2, lat2)
            return
        mlon, mlat = (lon1 + lon2) / 2, (lat1 + lat2) / 2
        vm = _nearest_hex_vertex(mlon, mlat, lonlat_to_hex, hex_vertices_lonlat, cos_lat, R_m)
        if vm is None:
            _emit(v2, lon2, lat2)
            return
        _bridge(lon1, lat1, v1, mlon, mlat, vm, depth + 1)
        _bridge(mlon, mlat, vm, lon2, lat2, v2, depth + 1)

    for i in range(len(coords) - 1):
        lon1, lat1 = coords[i]
        lon2, lat2 = coords[i + 1]
        dE = (lon2 - lon1) * cos_lat * METERS_PER_DEGREE
        dN = (lat2 - lat1) * METERS_PER_DEGREE
        dist = math.hypot(dE, dN)
        n = max(2, int(dist / sample_interval) + 1)
        for j in range(n):
            t = j / (n - 1)
            lon, lat = lon1 + t * (lon2 - lon1), lat1 + t * (lat2 - lat1)
            v = _nearest_hex_vertex(lon, lat, lonlat_to_hex, hex_vertices_lonlat, cos_lat, R_m)
            if v is None:
                continue
            if not vertex_path:
                _emit(v, lon, lat)
                continue
            if _vkey(v) == prev_key:
                continue
            plon, plat = prev_lonlat
            _bridge(plon, plat, vertex_path[-1], lon, lat, v, 0)

    if len(vertex_path) < 2:
        log.debug("vertex_path too short (%d vertices)", len(vertex_path))
        return []

    # Step 3 + 4: vertex pairs → hex edges
    edges: list[dict] = []
    seen: set[tuple[str, str]] = set()
    skipped_same = 0
    skipped_nonadj = 0

    for i in range(len(vertex_path) - 1):
        vA, vB = vertex_path[i], vertex_path[i + 1]

        # Convert vertices to paper-space to compute perpendicular
        pAx, pAy = lonlat_to_paper_m(*vA)
        pBx, pBy = lonlat_to_paper_m(*vB)
        mx, my = (pAx + pBx) / 2, (pAy + pBy) / 2

        dx, dy = pBx - pAx, pBy - pAy
        elen = math.hypot(dx, dy)
        if elen < 1e-9:
            continue

        # Skip vertex pairs that are too far apart to be adjacent hex vertices
        # Adjacent hex vertex distance is exactly R_m; allow 20% tolerance
        if elen > R_m * 1.2:
            continue

        # Unit perpendicular in paper-space
        perp_x, perp_y = -dy / elen, dx / elen
        eps = R_m * 0.35

        def _probe(sign: float, _mx=mx, _my=my, _perp_x=perp_x, _perp_y=perp_y, _eps=eps) -> tuple[int, int]:
            ppx = _mx + _perp_x * _eps * sign
            ppy = _my + _perp_y * _eps * sign
            lon_p, lat_p = paper_m_to_lonlat(ppx, ppy)
            return lonlat_to_hex(lon_p, lat_p)

        h1 = _probe(1.0)
        h2 = _probe(-1.0)

        if h1 == h2:
            skipped_same += 1
            continue

        q1, r1 = h1
        q2, r2 = h2

        # Validate adjacency: |dq| + |dr| + |ds| must be exactly 2
        dq, dr = q2 - q1, r2 - r1
        if abs(dq) + abs(dr) + abs(dq + dr) != 2:
            skipped_nonadj += 1
            continue

        # Canonical edge key for deduplication
        a, b = f"{q1},{r1}", f"{q2},{r2}"
        ekey = (min(a, b), max(a, b))
        if ekey in seen:
            continue
        seen.add(ekey)

        edges.append({"q1": q1, "r1": r1, "q2": q2, "r2": r2})

    if skipped_same or skipped_nonadj:
        log.debug(
            "_polyline_to_hex_edges: %d edges ok, %d same-hex probes, %d non-adjacent",
            len(edges), skipped_same, skipped_nonadj,
        )

    return edges


# ---------------------------------------------------------------------------
# Length helper
# ---------------------------------------------------------------------------

def _polyline_length(coords: list) -> float:
    total = 0.0
    for i in range(len(coords) - 1):
        lon1, lat1 = coords[i]
        lon2, lat2 = coords[i + 1]
        dlat = (lat2 - lat1) * METERS_PER_DEGREE
        dlon = (lon2 - lon1) * math.cos(math.radians((lat1 + lat2) / 2)) * METERS_PER_DEGREE
        total += math.hypot(dlat, dlon)
    return total


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

async def fetch_rivers(config: RiversConfig) -> list[dict]:
    min_lat, min_lon, max_lat, max_lon = compute_bbox(
        config.center_lon, config.center_lat, config.bearing,
        config.width_m, config.height_m,
    )
    types = config.types
    hex_size_km = config.hex_size_km

    if not types:
        return []

    active_types, opa_timeout, http_timeout = _scale_filter_river(types, config.width_m)

    name_filter = "[name]" if hex_size_km > 20 else ""
    type_pattern = "|".join(active_types)
    bbox = f"{min_lat},{min_lon},{max_lat},{max_lon}"

    # Fetch both relations (named river systems) and individual ways
    query = (
        f'[out:json][timeout:{opa_timeout}][maxsize:52428800];\n'
        f'(\n'
        f'  relation["waterway"~"^({type_pattern})$"]{name_filter}({bbox});\n'
        f'  way["waterway"~"^({type_pattern})$"]{name_filter}({bbox});\n'
        f');\n'
        f'out tags geom;\n'
    )

    data = await post_overpass(query, timeout=http_timeout)
    elements = data.get("elements", [])
    log.info("fetch_rivers: %d OSM elements returned", len(elements))

    # Build geometry helpers
    lonlat_to_hex = make_lonlat_to_hex(config, config.R_m)
    hex_vertices_lonlat, lonlat_to_paper_m, paper_m_to_lonlat, cos_lat = _make_hex_geometry(config, config.R_m)

    rivers = []
    for el in elements:
        el_type = el.get("type")
        tags = el.get("tags", {})
        wtype = tags.get("waterway", "river")

        if el_type == "relation":
            ways = _extract_ways(el.get("members", []))
            if not ways:
                continue
            coords = _chain_ways(ways)
        elif el_type == "way":
            geom = el.get("geometry", [])
            if len(geom) < 2:
                continue
            coords = [(p["lon"], p["lat"]) for p in geom]
        else:
            continue

        coords = _clip_to_paper(coords, config)
        if len(coords) < 2:
            continue

        edges = _polyline_to_hex_edges(
            coords, lonlat_to_hex, hex_vertices_lonlat,
            lonlat_to_paper_m, paper_m_to_lonlat, cos_lat, config.R_m,
        )
        if not edges:
            log.debug("skip %r (%s): no edges from %d coords", tags.get("name", ""), wtype, len(coords))
            continue

        osm_width = _parse_width(tags.get("width"))
        if osm_width is not None:
            width_multiplier = round(max(0.2, min(4.0, osm_width / 40.0)), 3)
        else:
            width_multiplier = 1.0 if wtype == "river" else 0.6

        rivers.append({
            "name": tags.get("name", ""),
            "type": wtype,
            "coords": [[lon, lat] for lon, lat in coords],
            "segments": [[[lon, lat] for lon, lat in coords]],
            "edges": edges,
            "width_multiplier": width_multiplier,
        })

    log.info("fetch_rivers: %d river segments before merging", len(rivers))

    # Merge segments that share the same (name, type) into a single entry.
    # A river like "Labe" is stored in OSM as dozens of way segments — we want
    # one toggle per named waterway, not one per segment.
    # Unnamed entries are kept separate (they are genuinely distinct waterways).
    named: dict[tuple[str, str], dict] = {}
    unnamed: list[dict] = []
    _unnamed_counter = 0

    for r in rivers:
        name = r["name"]
        if not name:
            unnamed.append(r)
            continue
        key = (name, r["type"])
        if key not in named:
            named[key] = {
                "name": name,
                "type": r["type"],
                "coords": r["coords"],
                "segments": list(r["segments"]),
                "edges": list(r["edges"]),
                "_edge_keys": {
                    (min(f"{e['q1']},{e['r1']}", f"{e['q2']},{e['r2']}"),
                     max(f"{e['q1']},{e['r1']}", f"{e['q2']},{e['r2']}"))
                    for e in r["edges"]
                },
                "width_multiplier": r["width_multiplier"],
                "_total_length": _polyline_length(r["coords"]),
            }
        else:
            entry = named[key]
            seg_len = _polyline_length(r["coords"])
            entry["_total_length"] += seg_len
            # Accumulate all coordinate segments for full-river hover preview
            entry["segments"].extend(r["segments"])
            # Use coords from the longest individual segment for representative display
            if seg_len > _polyline_length(entry["coords"]):
                entry["coords"] = r["coords"]
            # Merge edges, deduplicating
            for e in r["edges"]:
                ekey = (
                    min(f"{e['q1']},{e['r1']}", f"{e['q2']},{e['r2']}"),
                    max(f"{e['q1']},{e['r1']}", f"{e['q2']},{e['r2']}"),
                )
                if ekey not in entry["_edge_keys"]:
                    entry["_edge_keys"].add(ekey)
                    entry["edges"].append(e)
            # Width: take the max across segments (widest measurement wins)
            entry["width_multiplier"] = max(entry["width_multiplier"], r["width_multiplier"])

    merged = list(named.values()) + unnamed

    log.info("fetch_rivers: %d rivers after merging", len(merged))
    merged.sort(key=lambda r: r.get("_total_length") or _polyline_length(r["coords"]), reverse=True)
    merged = merged[:config.limit]

    # Strip internal bookkeeping fields before returning
    for r in merged:
        r.pop("_edge_keys", None)
        r.pop("_total_length", None)

    return merged
