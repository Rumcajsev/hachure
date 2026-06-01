"""Fetch OSM landcover polygons via Overpass API and map to terrain types."""
import httpx
from shapely.geometry import Polygon

OVERPASS_URL = "https://overpass-api.de/api/interpreter"

OSM_TERRAIN_MAP: dict[str, str] = {
    "wood": "woods",
    "forest": "woods",
    "orchard": "woods",
    "water": "water",
    "wetland": "marsh",
    "scrub": "rough",
    "heath": "rough",
    "bare_rock": "rough",
    "vineyard": "rough",
    "military": "rough",
    "grassland": "clear",
    "farmland": "clear",
    "farmyard": "clear",
    "meadow": "clear",
    "village_green": "clear",
    "cemetery": "clear",
    "allotments": "clear",
    "beach": "clear",
    "coastline": "water",
    "residential": "clear",
    "commercial": "clear",
    "industrial": "clear",
    "retail": "clear",
    "grass": "clear",
    "mud": "rough",
    "sand": "clear",
    "reservoir": "water",
    "basin": "water",
    "floodplain": "marsh",
}

TERRAIN_PRIORITY = ["water", "marsh", "woods", "rough", "clear"]


def _osm_tag_to_terrain(tags: dict) -> str | None:
    """Extract terrain type from OSM element tags."""
    for tag_key in ("natural", "landuse", "waterway", "leisure"):
        val = tags.get(tag_key)
        if val and val in OSM_TERRAIN_MAP:
            return OSM_TERRAIN_MAP[val]
    return None


def _geometry_to_polygon(coords: list[dict]) -> Polygon | None:
    """Convert Overpass geometry (list of {lat, lon}) to Shapely Polygon."""
    if len(coords) < 3:
        return None
    try:
        pts = [(pt["lon"], pt["lat"]) for pt in coords]
        poly = Polygon(pts)
        if not poly.is_valid:
            poly = poly.buffer(0)
        return poly if not poly.is_empty else None
    except Exception:
        return None


async def fetch_landcover(
    min_lat: float, min_lon: float, max_lat: float, max_lon: float
) -> list[tuple[Polygon, str]]:
    """Fetch OSM landcover polygons within the given bounding box.

    Returns a list of (polygon, terrain_type) tuples.
    """
    bbox = f"{min_lat},{min_lon},{max_lat},{max_lon}"

    query = f"""
[out:json][timeout:60][bbox:{min_lat},{min_lon},{max_lat},{max_lon}];
(
  way["natural"];
  way["landuse"];
  way["waterway"];
  way["leisure"];
  relation["natural"]["type"="multipolygon"];
  relation["landuse"]["type"="multipolygon"];
);
out geom;
"""

    features: list[tuple[Polygon, str]] = []

    async with httpx.AsyncClient(timeout=90.0) as client:
        from urllib.parse import urlencode
        resp = await client.post(
            OVERPASS_URL,
            content=urlencode({"data": query}).encode(),
            headers={
                "Content-Type": "application/x-www-form-urlencoded",
                "Accept": "application/json",
                "User-Agent": "IG2HexMap/1.0",
            },
        )
        resp.raise_for_status()
        data = resp.json()

    for element in data.get("elements", []):
        tags = element.get("tags", {})
        terrain = _osm_tag_to_terrain(tags)
        if terrain is None:
            continue

        if element["type"] == "way":
            geom = element.get("geometry", [])
            poly = _geometry_to_polygon(geom)
            if poly:
                features.append((poly, terrain))

        elif element["type"] == "relation":
            # Use outer members' geometry
            for member in element.get("members", []):
                if member.get("role") != "outer":
                    continue
                geom = member.get("geometry", [])
                poly = _geometry_to_polygon(geom)
                if poly:
                    features.append((poly, terrain))

    return features
