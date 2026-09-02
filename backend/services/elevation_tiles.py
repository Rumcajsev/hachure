import asyncio
import base64
import json
import math
from io import BytesIO
from pathlib import Path
from typing import AsyncGenerator

import httpx
import numpy as np
from PIL import Image

from .geometry import compute_bbox, make_lonlat_to_hex

TILE_URL = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"
CACHE_DIR = Path.home() / ".cache" / "ig2" / "terrarium"
SKIP_TERRAINS = {"sea", "lake"}
METERS_PER_DEGREE = 111_319.0


def select_zoom(hex_diameter_m: float) -> int:
    """Pick zoom level targeting ~64 pixel samples across one hex diameter."""
    target_mpp = hex_diameter_m / 64
    z = math.log2(156_543 / target_mpp)
    return max(5, min(15, round(z)))


def _lon_to_tile_x(lon: float, z: int) -> int:
    return int((lon + 180) / 360 * 2**z)


def _lat_to_tile_y(lat: float, z: int) -> int:
    lat_r = math.radians(lat)
    return int((1 - math.log(math.tan(lat_r) + 1 / math.cos(lat_r)) / math.pi) / 2 * 2**z)


def bbox_to_tiles(
    min_lon: float, min_lat: float, max_lon: float, max_lat: float, z: int
) -> list[tuple[int, int]]:
    x0 = _lon_to_tile_x(min_lon, z)
    x1 = _lon_to_tile_x(max_lon, z)
    y0 = _lat_to_tile_y(max_lat, z)  # tile y increases southward
    y1 = _lat_to_tile_y(min_lat, z)
    return [(tx, ty) for tx in range(x0, x1 + 1) for ty in range(y0, y1 + 1)]


def _decode_terrarium(png_bytes: bytes) -> np.ndarray:
    """Return (256, 256) float32 array of elevation in metres."""
    img = np.array(Image.open(BytesIO(png_bytes)).convert("RGB"), dtype=np.float32)
    return img[:, :, 0] * 256 + img[:, :, 1] + img[:, :, 2] / 256 - 32768


async def _fetch_tile(client: httpx.AsyncClient, z: int, tx: int, ty: int) -> bytes | None:
    cache_path = CACHE_DIR / str(z) / str(tx) / f"{ty}.png"
    if cache_path.exists():
        return cache_path.read_bytes()
    url = TILE_URL.format(z=z, x=tx, y=ty)
    try:
        resp = await client.get(url, timeout=30.0)
        if not resp.is_success:
            return None
        data = resp.content
    except Exception:
        return None
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    cache_path.write_bytes(data)
    return data


def _bilinear_sample(
    grid: np.ndarray, row_f: np.ndarray, col_f: np.ndarray
) -> np.ndarray:
    h, w = grid.shape
    r0 = np.clip(np.floor(row_f).astype(np.int32), 0, h - 2)
    c0 = np.clip(np.floor(col_f).astype(np.int32), 0, w - 2)
    dr = (row_f - r0).astype(np.float32)
    dc = (col_f - c0).astype(np.float32)
    r1, c1 = r0 + 1, c0 + 1
    return (
        grid[r0, c0] * (1 - dr) * (1 - dc)
        + grid[r0, c1] * (1 - dr) * dc
        + grid[r1, c0] * dr * (1 - dc)
        + grid[r1, c1] * dr * dc
    )


def _reproject_heightmap(
    stitched: np.ndarray,
    tx_min: int,
    ty_min: int,
    z: int,
    config,
    out_w: int = 4096,
) -> np.ndarray:
    """Reproject stitched tile grid (lat/lon Mercator) into map-rotated canvas space."""
    n = 2 ** z
    width_m = config.width_m
    height_m = config.height_m
    out_h = max(1, round(out_w * height_m / width_m))

    β = math.radians(config.bearing)
    cos_β, sin_β = math.cos(β), math.sin(β)
    cos_lat = math.cos(math.radians(config.center_lat))

    # Output pixel centre → map-space metres (row 0 = north, y-up)
    ox = (np.arange(out_w, dtype=np.float64) + 0.5) / out_w - 0.5
    oy = 0.5 - (np.arange(out_h, dtype=np.float64) + 0.5) / out_h
    px_m, py_m = np.meshgrid(ox * width_m, oy * height_m)

    # Map-space metres → geographic (inverse of frontend projectToCanvas)
    E_m = px_m * cos_β + py_m * sin_β
    N_m = -px_m * sin_β + py_m * cos_β
    lon = config.center_lon + E_m / (cos_lat * METERS_PER_DEGREE)
    lat = config.center_lat + N_m / METERS_PER_DEGREE

    # Geographic → stitched-grid pixel coordinates (Web Mercator)
    col_f = ((lon + 180) / 360 * n - tx_min) * 256
    lat_r = np.radians(lat)
    with np.errstate(invalid="ignore"):
        y_merc = (1 - np.log(np.tan(lat_r) + 1.0 / np.cos(lat_r)) / np.pi) / 2 * n
    row_f = (y_merc - ty_min) * 256

    return _bilinear_sample(stitched, row_f.ravel(), col_f.ravel()).reshape(out_h, out_w)


def _encode_rg16_png(heightmap: np.ndarray) -> tuple[bytes, float, float]:
    """Encode float32 heightmap as RGBA PNG where elevation = R*256 + G (0–65535).
    Returns (png_bytes, min_elev_m, max_elev_m)."""
    flat = heightmap.ravel()
    min_elev = float(np.nanmin(flat)) if not np.all(np.isnan(flat)) else 0.0
    max_elev = float(np.nanmax(flat)) if not np.all(np.isnan(flat)) else 1.0
    if max_elev == min_elev:
        max_elev = min_elev + 1.0

    q = np.clip((heightmap - min_elev) / (max_elev - min_elev), 0, 1)
    q16 = (q * 65535).round().astype(np.uint16)

    h, w = q16.shape
    rgba = np.zeros((h, w, 4), dtype=np.uint8)
    rgba[:, :, 0] = (q16 >> 8).astype(np.uint8)   # high byte
    rgba[:, :, 1] = (q16 & 0xFF).astype(np.uint8)  # low byte
    rgba[:, :, 3] = 255

    buf = BytesIO()
    Image.fromarray(rgba, "RGBA").save(buf, format="PNG", compress_level=1)
    return buf.getvalue(), min_elev, max_elev


def _process_tiles(
    tiles_data: list[tuple[int, int, int, bytes]],
    hex_index: dict,
    config,
) -> tuple[dict[str, dict], tuple[np.ndarray, int, int, int] | None]:
    """CPU-bound: decode tiles, accumulate per-hex stats, and stitch a heightmap."""
    β = math.radians(config.bearing)
    cos_β, sin_β = math.cos(β), math.sin(β)
    cos_lat_val = math.cos(math.radians(config.center_lat))
    flat_top = config.hex_orientation == "flat"
    R_m = config.outer_radius_m
    sqrt3 = math.sqrt(3)

    QR_OFFSET = 50_000
    QR_STRIDE = 2 * QR_OFFSET

    buckets: dict[tuple[int, int], list] = {}

    # Tile extent for stitching
    tx_min = min(t[1] for t in tiles_data)
    tx_max = max(t[1] for t in tiles_data)
    ty_min = min(t[2] for t in tiles_data)
    ty_max = max(t[2] for t in tiles_data)
    z_val = tiles_data[0][0]
    grid_w = (tx_max - tx_min + 1) * 256
    grid_h = (ty_max - ty_min + 1) * 256
    stitched = np.zeros((grid_h, grid_w), dtype=np.float32)

    for z, tx, ty, png_bytes in tiles_data:
        n = 2 ** z

        px_frac = (np.arange(256, dtype=np.float64) + 0.5) / 256
        lon_arr = ((tx + px_frac) / n) * 360 - 180

        py_frac = (np.arange(256, dtype=np.float64) + 0.5) / 256
        lat_arr = np.degrees(np.arctan(np.sinh(np.pi * (1 - 2 * (ty + py_frac) / n))))

        lon_grid = lon_arr[np.newaxis, :]
        lat_grid = lat_arr[:, np.newaxis]

        E_m = (lon_grid - config.center_lon) * cos_lat_val * METERS_PER_DEGREE
        N_m = (lat_grid - config.center_lat) * METERS_PER_DEGREE
        px_m = cos_β * E_m - sin_β * N_m
        py_m = sin_β * E_m + cos_β * N_m

        if flat_top:
            q_f = 2 * px_m / (3 * R_m)
            r_f = py_m / (R_m * sqrt3) - px_m / (3 * R_m)
        else:
            r_f = 2 * py_m / (3 * R_m)
            q_f = px_m / (R_m * sqrt3) - py_m / (3 * R_m)

        s_f = -q_f - r_f
        q_r = np.round(q_f).astype(np.int32)
        s_r = np.round(s_f).astype(np.int32)
        r_r = np.round(r_f).astype(np.int32)

        dq = np.abs(q_r.astype(np.float32) - q_f)
        ds = np.abs(s_r.astype(np.float32) - s_f)
        dr = np.abs(r_r.astype(np.float32) - r_f)

        mask_q = (dq > ds) & (dq > dr)
        mask_r = (~mask_q) & (dr >= ds)
        q_final = np.where(mask_q, -s_r - r_r, q_r)
        r_final = np.where(mask_r, -q_r - s_r, r_r)

        qr_key = (q_final + QR_OFFSET).astype(np.int64) * QR_STRIDE + (r_final + QR_OFFSET)

        elev_grid = _decode_terrarium(png_bytes)

        # Stitch into composite grid
        row_off = (ty - ty_min) * 256
        col_off = (tx - tx_min) * 256
        stitched[row_off:row_off + 256, col_off:col_off + 256] = elev_grid

        qr_flat = qr_key.flatten()
        elev_flat = elev_grid.flatten()

        sort_idx = np.argsort(qr_flat, kind="stable")
        qr_sorted = qr_flat[sort_idx]
        elev_sorted = elev_flat[sort_idx]

        boundaries = np.flatnonzero(np.diff(qr_sorted)) + 1
        groups_qr = np.split(qr_sorted, boundaries)
        groups_elev = np.split(elev_sorted, boundaries)

        for gqr, gelev in zip(groups_qr, groups_elev):
            encoded = int(gqr[0])
            q = encoded // QR_STRIDE - QR_OFFSET
            r = encoded % QR_STRIDE - QR_OFFSET
            key = f"{q},{r}"
            if key not in hex_index:
                continue
            if hex_index[key].get("terrain") in SKIP_TERRAINS:
                continue
            hk = (q, r)
            if hk not in buckets:
                buckets[hk] = []
            buckets[hk].extend(gelev.tolist())

    stats: dict[str, dict] = {}
    for (q, r), values in buckets.items():
        arr = np.array(values, dtype=np.float32)
        stats[f"{q},{r}"] = {
            "elevation_avg_m": round(float(arr.mean()), 1),
            "elevation_median_m": round(float(np.median(arr)), 1),
            "elevation_max_m": round(float(arr.max()), 1),
            "elevation_min_m": round(float(arr.min()), 1),
            "elevation_range_m": round(float(arr.max() - arr.min()), 1),
        }
    return stats, (stitched, tx_min, ty_min, z_val)


async def generate_elevation(
    hexes: list[dict],
    config,
    progress_cb=None,
) -> list[dict]:
    for h in hexes:
        h["elevation_avg_m"] = None
        h["elevation_median_m"] = None
        h["elevation_max_m"] = None
        h["elevation_min_m"] = None
        h["elevation_range_m"] = None
        h["elevation_class"] = None

    active = [h for h in hexes if h.get("terrain") not in SKIP_TERRAINS]
    if not active:
        return hexes

    if progress_cb:
        await progress_cb("Computing tile coverage…", 5)

    hex_diameter_m = 2 * config.outer_radius_m
    zoom = select_zoom(hex_diameter_m)

    min_lat, min_lon, max_lat, max_lon = compute_bbox(
        config.center_lon, config.center_lat, config.bearing,
        config.width_m, config.height_m, buffer=0.1,
    )
    tiles = bbox_to_tiles(min_lon, min_lat, max_lon, max_lat, zoom)

    if progress_cb:
        await progress_cb(f"Fetching {len(tiles)} elevation tiles (zoom {zoom})…", 10)

    FETCH_BATCH = 20
    tiles_data: list[tuple[int, int, int, bytes]] = []
    async with httpx.AsyncClient() as client:
        for i in range(0, len(tiles), FETCH_BATCH):
            batch = tiles[i:i + FETCH_BATCH]
            results = await asyncio.gather(
                *[_fetch_tile(client, zoom, tx, ty) for tx, ty in batch]
            )
            for (tx, ty), data in zip(batch, results):
                if data is not None:
                    tiles_data.append((zoom, tx, ty, data))
            if progress_cb:
                fetched = min(i + FETCH_BATCH, len(tiles))
                pct = 10 + int(60 * fetched / len(tiles))
                await progress_cb(f"Fetched tiles {fetched}/{len(tiles)}…", pct)

    if progress_cb:
        await progress_cb("Processing elevation pixels…", 72)

    hex_index = {f"{h['q']},{h['r']}": h for h in hexes}

    def _process_and_encode():
        stats, stitch_info = _process_tiles(tiles_data, hex_index, config)
        if stitch_info is not None:
            stitched, tx_min, ty_min, z = stitch_info
            heightmap = _reproject_heightmap(stitched, tx_min, ty_min, z, config)
            png_bytes, min_elev, max_elev = _encode_rg16_png(heightmap)
            hm = (base64.b64encode(png_bytes).decode(), min_elev, max_elev)
        else:
            hm = None
        return stats, hm

    loop = asyncio.get_event_loop()
    stats, hm_result = await loop.run_in_executor(None, _process_and_encode)

    if progress_cb:
        await progress_cb("Classifying…", 92)

    for h in hexes:
        s = stats.get(f"{h['q']},{h['r']}")
        if s is None:
            continue
        h.update(s)

    result = {"hexes": hexes}
    if hm_result is not None:
        hm_b64, min_elev, max_elev = hm_result
        result["heightmap_b64"] = hm_b64
        result["heightmap_min_elev"] = min_elev
        result["heightmap_max_elev"] = max_elev
        result["heightmap_width_m"] = config.width_m
        result["heightmap_height_m"] = config.height_m

    return result


async def elevation_stream_generator(
    hexes: list[dict],
    config,
) -> AsyncGenerator[str, None]:
    try:
        yield f"data: {json.dumps({'step': 'progress', 'message': 'Starting elevation fetch…', 'progress': 2})}\n\n"

        progress_queue: asyncio.Queue = asyncio.Queue()

        async def cb(message: str, pct: int) -> None:
            await progress_queue.put((message, pct))

        async def run() -> None:
            try:
                result = await generate_elevation(hexes, config, progress_cb=cb)
                await progress_queue.put(("__done__", result))
            except Exception as exc:
                await progress_queue.put(("__error__", str(exc)))

        asyncio.create_task(run())

        while True:
            kind, payload = await progress_queue.get()
            if kind == "__done__":
                event = {"step": "done", "message": "Done", "progress": 100, **payload}
                yield f"data: {json.dumps(event)}\n\n"
                break
            if kind == "__error__":
                raise RuntimeError(payload)
            yield f"data: {json.dumps({'step': 'progress', 'message': kind, 'progress': payload})}\n\n"

    except Exception as e:
        yield f"data: {json.dumps({'step': 'error', 'message': str(e), 'progress': 0})}\n\n"
