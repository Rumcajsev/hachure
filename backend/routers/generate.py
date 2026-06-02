from typing import Optional
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse, Response
from models import GridConfig, ReclassifyRequest, SettlementsConfig, RoadsConfig, RailsConfig, RiversConfig, ElevationConfig, HexLookupConfig, SettlementRoadsConfig, MotorwayHexesConfig, MapImageClassifyConfig
from services.hex_grid import generate_hex_grid
from services.terrain import generate_terrain, classify_hex, terrain_stream_generator
from services.elevation_tiles import elevation_stream_generator
from services.geometry import compute_bbox

router = APIRouter()


@router.post("/grid")
async def generate_grid(config: GridConfig) -> dict:
    return generate_hex_grid(config)


@router.post("/terrain")
async def generate_terrain_endpoint(config: GridConfig) -> dict:
    return await generate_terrain(config, slider=config.slider)


@router.post("/settlements")
async def generate_settlements(config: SettlementsConfig) -> dict:
    from services.settlements import fetch_settlements

    min_lat, min_lon, max_lat, max_lon = compute_bbox(
        config.center_lon, config.center_lat, config.bearing,
        config.width_m, config.height_m,
    )
    settlements = await fetch_settlements(
        min_lat, min_lon, max_lat, max_lon,
        limit=config.limit,
        types=config.types,
        width_m=config.width_m,
    )
    return {"settlements": settlements}


@router.post("/settlement-hex-lookup")
async def settlement_hex_lookup(config: HexLookupConfig) -> dict:
    from services.settlements import fetch_settlements_in_hex
    results = await fetch_settlements_in_hex(config.vertices, config.types)
    return {"settlements": results}


@router.post("/rivers")
async def generate_rivers(config: RiversConfig) -> dict:
    from services.rivers import fetch_rivers
    try:
        rivers = await fetch_rivers(config)
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Overpass API error: {exc}")
    return {"rivers": rivers}


@router.post("/roads")
async def generate_roads(config: RoadsConfig) -> dict:
    from services.roads_v2 import generate_road_hexes
    try:
        return await generate_road_hexes(config)
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Overpass API error: {exc}")


@router.post("/settlement-roads")
async def generate_settlement_roads(config: SettlementRoadsConfig) -> dict:
    from services.roads import generate_settlement_roads as _generate_settlement_roads
    try:
        return await _generate_settlement_roads(config)
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Overpass API error: {exc}")


@router.post("/motorway-hexes")
async def generate_motorway_hexes(config: MotorwayHexesConfig) -> dict:
    from services.motorway_hexes import generate_motorway_hexes as _generate_motorway_hexes
    try:
        return await _generate_motorway_hexes(config)
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Overpass API error: {exc}")


@router.post("/rails")
async def generate_rails(config: RailsConfig) -> dict:
    from services.rails_v2 import generate_rail_hexes
    try:
        return await generate_rail_hexes(config)
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Overpass API error: {exc}")


@router.post("/elevation-stream")
async def elevation_stream(config: ElevationConfig) -> StreamingResponse:
    hexes = [dict(h) for h in config.hexes]
    return StreamingResponse(
        elevation_stream_generator(hexes, config),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("/map-image-stream")
async def map_image_stream(config: MapImageClassifyConfig) -> StreamingResponse:
    from services.map_image import map_image_stream_generator
    return StreamingResponse(
        map_image_stream_generator(config.image_b64, config.cols, config.rows),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("/reclassify")
def reclassify(req: ReclassifyRequest) -> dict:
    for hex_data in req.hexes:
        if hex_data.get("manual_override"):
            continue
        hex_data["terrain"] = classify_hex(hex_data.get("coverage", {}), req.slider)
    return {"hexes": req.hexes}


@router.post("/terrain-stream")
async def terrain_stream(config: GridConfig) -> StreamingResponse:

    return StreamingResponse(
        terrain_stream_generator(config),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ESA WorldCover class code → RGBA (matches WORLDCOVER_CLASSES in mapStore.ts)
_WC_PALETTE: dict[int, tuple[int, int, int]] = {
    10:  (0x2d, 0x6a, 0x2d),  # Tree cover
    20:  (0xa3, 0xc4, 0x6c),  # Shrubland
    30:  (0xd4, 0xe8, 0x9a),  # Grassland
    40:  (0xe8, 0xd8, 0x7a),  # Cropland
    50:  (0xc0, 0xa8, 0x82),  # Built-up
    60:  (0xb8, 0xa8, 0x82),  # Bare / sparse veg
    70:  (0xe8, 0xf0, 0xf8),  # Snow and ice
    80:  (0x3a, 0x68, 0x98),  # Permanent water
    90:  (0x6b, 0x9e, 0x8a),  # Herbaceous wetland
    95:  (0x4a, 0x8a, 0x6a),  # Mangroves
    100: (0x9a, 0xaa, 0x7a),  # Moss and lichen
    0:   (0x3a, 0x68, 0x98),  # No data / ocean → same as water
}
_WC_DEFAULT_RGB = (0xdd, 0xdd, 0xdd)


@router.post("/worldcover-image")
async def worldcover_image(config: GridConfig) -> Response:
    """Return a PNG of the raw ESA WorldCover raster for the map bbox, colored by class."""
    import io
    import numpy as np
    from PIL import Image
    from services.worldcover import load_worldcover_window
    from services.terrain import compute_geo_bbox

    min_lat, min_lon, max_lat, max_lon = compute_geo_bbox(config)
    data, _transform = await load_worldcover_window(min_lat, min_lon, max_lat, max_lon)

    h, w = data.shape
    rgb = np.full((h, w, 3), _WC_DEFAULT_RGB, dtype=np.uint8)
    for code, color in _WC_PALETTE.items():
        mask = data == code
        rgb[mask] = color

    img = Image.fromarray(rgb, mode="RGB")
    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=False)
    return Response(content=buf.getvalue(), media_type="image/png")
