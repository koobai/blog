"""Place identity, privacy and administrative-boundary helpers for Zouguo."""

from collections import defaultdict


PRECISION_DECIMALS = {
    'exact': 5,
    'poi': 5,
    'locality': 2,
    'region': 1,
    'approximate': 2,
}


def public_coordinates(longitude, latitude, precision='poi', privacy='public'):
    """Return publishable coordinates; callers must never persist raw GPS too."""
    decimals = PRECISION_DECIMALS.get(precision, 2)
    if privacy == 'reduced':
        decimals = min(decimals, 2)
    return [round(float(longitude), decimals), round(float(latitude), decimals)]


def group_by_place_id(items):
    """Group only by stable blog-owned placeId, never by fuzzy coordinates/name."""
    grouped = defaultdict(list)
    for item in items:
        grouped[item['place']['id']].append(item)
    return dict(grouped)


def _ring_contains(ring, longitude, latitude):
    inside = False
    previous = ring[-1]
    for current in ring:
        x1, y1 = previous
        x2, y2 = current
        crosses = (y1 > latitude) != (y2 > latitude)
        if crosses:
            intersection = (x2 - x1) * (latitude - y1) / (y2 - y1) + x1
            if longitude < intersection:
                inside = not inside
        previous = current
    return inside


def geometry_contains(geometry, longitude, latitude):
    """Point-in-polygon for catalog verification and coordinate resolution."""
    if not geometry:
        return False
    polygons = geometry.get('coordinates', [])
    if geometry.get('type') == 'Polygon':
        polygons = [polygons]
    if geometry.get('type') not in ('Polygon', 'MultiPolygon'):
        return False
    for polygon in polygons:
        if not polygon or not _ring_contains(polygon[0], longitude, latitude):
            continue
        if any(_ring_contains(hole, longitude, latitude) for hole in polygon[1:]):
            continue
        return True
    return False


def resolve_admin_codes(catalog, longitude, latitude):
    """Resolve public coordinates to known country/region/locality codes."""
    result = {'countryCode': '', 'regionCode': '', 'localityCode': ''}
    field_for_level = {
        'country': 'countryCode',
        'province': 'regionCode',
        'city': 'localityCode',
    }
    locality_priority = -1
    for feature in catalog.get('features', []):
        level = feature.get('properties', {}).get('level')
        field = field_for_level.get(level)
        if field and geometry_contains(feature.get('geometry'), longitude, latitude):
            if level == 'city':
                priority = {
                    'district': 1,
                    'city': 2,
                    'municipality': 2,
                }.get(feature['properties'].get('sourceLevel'), 0)
                if priority < locality_priority:
                    continue
                locality_priority = priority
            result[field] = str(feature['properties'].get('groupCode') or '')
    return result
