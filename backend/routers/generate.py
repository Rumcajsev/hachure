from typing import Optional
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
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
