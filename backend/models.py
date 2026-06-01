from pydantic import BaseModel
from typing import Optional


class BaseRegionConfig(BaseModel):
    center_lon: float
    center_lat: float
    bearing: float = 0.0
    width_m: float
    height_m: float


class GridConfig(BaseModel):
    center_lon: float
    center_lat: float
    bearing: float = 0.0       # degrees clockwise from north (MapLibre convention)
    width_m: float             # geographic width of paper frame in metres
    height_m: float            # geographic height of paper frame in metres
    hex_size_mm: float         # flat-to-flat diameter in mm
    paper_size: str            # "A4" | "A3" | "A2" | "A1"
    orientation: str           # "portrait" | "landscape"
    hex_orientation: str       # "flat" | "pointy"
    margin_mm: float = 0.0     # print margin in mm
    slider: float = 0.4        # unused legacy field kept for API compatibility
    terrain_rules: Optional[dict[str, list[dict]]] = None  # {terrain: [{classCode, threshold}]}
    paper_width_mm: Optional[float] = None   # combined paper width (overrides paper_size lookup)
    paper_height_mm: Optional[float] = None  # combined paper height (overrides paper_size lookup)


class ReclassifyRequest(BaseModel):
    hexes: list[dict]
    slider: float = 0.4


class SettlementsConfig(BaseRegionConfig):
    paper_size: str
    orientation: str
    limit: int = 30
    types: list[str] = ["city", "town", "village"]


class RiversConfig(BaseRegionConfig):
    hex_orientation: str
    R_m: float
    types: list[str] = ["river"]
    hex_size_km: float = 10.0
    limit: int = 15


class RoadsConfig(BaseRegionConfig):
    hex_orientation: str       # "flat" | "pointy"
    R_m: float                 # hex outer radius in metres (outer_radius_m from metadata)
    highway_types: list[str] = ["motorway", "trunk", "primary"]


class MotorwayHexesConfig(BaseRegionConfig):
    hex_orientation: str
    R_m: float
    fast: bool = False


class RailsConfig(BaseRegionConfig):
    hex_orientation: str       # "flat" | "pointy"
    R_m: float
    rail_types: list[str] = ["rail"]


class ElevationConfig(BaseRegionConfig):
    hexes: list[dict]
    hex_orientation: str
    outer_radius_m: float


class HexLookupConfig(BaseModel):
    vertices: list[list[float]]   # [[lon, lat], ...] hex polygon
    types: Optional[list[str]] = None


class MapImageClassifyConfig(BaseModel):
    image_b64: str
    cols: int
    rows: int

class SettlementRoadsConfig(BaseRegionConfig):
    hex_orientation: str        # "flat" | "pointy"
    R_m: float                  # hex outer radius in metres
    settlements: list[dict]     # each: {lat, lon, name}
    highway_types: list[str] = ["motorway", "trunk", "primary", "secondary"]
