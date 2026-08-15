"""Public route decoding, Nominatim lookup, and privacy-safe title selection."""

import math
import os
import re
import time

import requests

NOMINATIM_BASE_URL = os.getenv(
    'NOMINATIM_BASE_URL',
    'https://nominatim.openstreetmap.org'
).rstrip('/')
NOMINATIM_USER_AGENT = os.getenv(
    'NOMINATIM_USER_AGENT',
    'KoobaiExerciseBlog/1.0 (https://koobai.com/exercise/)'
).strip()
NOMINATIM_REFERER = os.getenv(
    'NOMINATIM_REFERER',
    'https://koobai.com/exercise/'
).strip()

PUBLIC_ROUTE_TITLE_VERSION = 1
PUBLIC_ROUTE_TITLE_VERBS = {
    'Run': '跑过',
    'TrailRun': '跑过',
    'Ride': '骑过',
    'EBikeRide': '骑过',
    'Walk': '走过',
    'Hike': '走过',
    'Swim': '游过'
}
SCENIC_PLACE_SUFFIXES = (
    '公园', '景区', '风景区', '森林公园', '湿地', '绿道', '步道', '古道',
    '风光带', '植物园', '体育场', '湖', '江', '河', '山', '堤', '桥'
)
PRIVATE_OR_TRIVIAL_PLACE_WORDS = (
    '小区', '家园', '公寓', '宿舍', '住宅', '花园', '别墅', '公司', '酒店',
    '宾馆', '银行', '医院', '学校', '幼儿园', '便利店', '餐厅', '商场'
)


def decode_polyline(encoded, precision=5):
    if not encoded:
        return []
    coordinates = []
    index = lat = lng = 0
    factor = 10 ** precision
    try:
        while index < len(encoded):
            values = []
            for _ in range(2):
                shift = result = 0
                while True:
                    byte = ord(encoded[index]) - 63
                    index += 1
                    result |= (byte & 0x1f) << shift
                    shift += 5
                    if byte < 0x20:
                        break
                values.append(~(result >> 1) if result & 1 else result >> 1)
            lat += values[0]
            lng += values[1]
            coordinates.append((lat / factor, lng / factor))
    except (IndexError, TypeError, ValueError):
        return []
    return coordinates

def haversine_meters(left, right):
    lat1, lng1 = map(math.radians, left)
    lat2, lng2 = map(math.radians, right)
    dlat, dlng = lat2 - lat1, lng2 - lng1
    value = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlng / 2) ** 2
    return 6371000 * 2 * math.atan2(math.sqrt(value), math.sqrt(max(0, 1 - value)))

def sample_route(points, sample_count=31):
    if len(points) < 2:
        return []
    cumulative = [0.0]
    for index in range(1, len(points)):
        cumulative.append(cumulative[-1] + haversine_meters(points[index - 1], points[index]))
    total = cumulative[-1]
    if total <= 0:
        return []

    result = []
    segment_index = 1
    for sample_index in range(sample_count):
        target = total * sample_index / (sample_count - 1)
        while segment_index < len(cumulative) - 1 and cumulative[segment_index] < target:
            segment_index += 1
        start_distance = cumulative[segment_index - 1]
        end_distance = cumulative[segment_index]
        ratio = 0 if end_distance == start_distance else (target - start_distance) / (end_distance - start_distance)
        start_point, end_point = points[segment_index - 1], points[segment_index]
        result.append((
            start_point[0] + (end_point[0] - start_point[0]) * ratio,
            start_point[1] + (end_point[1] - start_point[1]) * ratio
        ))
    return result

def clean_geo_name(value, strip_city_suffix=False):
    """清理地图服务返回的展示名称，不把空值、门牌号或无名道路写进标题。"""
    if not isinstance(value, str):
        return None
    name = re.sub(r'\s+', ' ', value).strip(' ·,，;；')
    if not name or name.lower() in {'unnamed road', 'unknown road', 'unknown'}:
        return None
    if name in {'无名道路', '未知道路'} or re.fullmatch(r'[\d\W]+', name):
        return None
    if strip_city_suffix and len(name) > 2 and name.endswith('市'):
        name = name[:-1]
    return name or None


def is_scenic_place(name):
    if not name or any(word in name for word in PRIVATE_OR_TRIVIAL_PLACE_WORDS):
        return False
    return any(name.endswith(suffix) or suffix in name for suffix in SCENIC_PLACE_SUFFIXES)

def parse_nominatim_observation(payload):
    """从一次 OSM 地点反查中提取城市、真实区域、道路和行政区候选。"""
    observation = {'city': None, 'scenic': [], 'street': [], 'district': []}

    def append_unique(key, value):
        if value and value not in observation[key]:
            observation[key].append(value)

    address = (payload or {}).get('address') or {}
    for key in ('city', 'town', 'municipality', 'county', 'state_district'):
        city = clean_geo_name(address.get(key), strip_city_suffix=True)
        if city:
            observation['city'] = city
            break

    for key in ('road', 'pedestrian', 'cycleway', 'footway', 'path'):
        append_unique('street', clean_geo_name(address.get(key)))

    for key in ('city_district', 'district', 'borough', 'suburb', 'quarter', 'neighbourhood'):
        append_unique('district', clean_geo_name(address.get(key)))

    name = clean_geo_name((payload or {}).get('name'))
    category = (payload or {}).get('category')
    place_type = (payload or {}).get('type')
    if name and is_scenic_place(name) and (
        category in {'leisure', 'tourism', 'natural', 'boundary'} or
        place_type in {'park', 'nature_reserve', 'attraction', 'water', 'peak'}
    ):
        append_unique('scenic', name)
    return observation

_nominatim_last_request_at = None


def wait_for_nominatim_slot(min_interval):
    """公共 Nominatim 的周期脚本请求严格限制为每分钟不超过四次。"""
    global _nominatim_last_request_at
    if min_interval <= 0:
        return
    now = time.monotonic()
    if _nominatim_last_request_at is not None:
        remaining = min_interval - (now - _nominatim_last_request_at)
        if remaining > 0:
            time.sleep(remaining)
    _nominatim_last_request_at = time.monotonic()


def reverse_route_observations(sampled, session=None, attempts=2, min_interval=15):
    """低频反查路线 25%、50%、75% 三处；最终标题写入 JSON 后不再请求。"""
    if not sampled:
        return []
    client = session or requests
    indices = sorted({
        round((len(sampled) - 1) * ratio)
        for ratio in (0.25, 0.5, 0.75)
    })
    observations = []
    for index in indices:
        lat, lng = sampled[index]
        for attempt in range(attempts):
            wait_for_nominatim_slot(min_interval)
            try:
                response = client.get(
                    f'{NOMINATIM_BASE_URL}/reverse',
                    params={
                        'format': 'jsonv2',
                        'lat': f'{lat:.6f}',
                        'lon': f'{lng:.6f}',
                        'zoom': 18,
                        'addressdetails': 1,
                        'namedetails': 1,
                        'accept-language': 'zh-CN,zh,en'
                    },
                    headers={
                        'User-Agent': NOMINATIM_USER_AGENT,
                        **({'Referer': NOMINATIM_REFERER} if NOMINATIM_REFERER else {})
                    },
                    timeout=20
                )
                if response.status_code == 200:
                    observations.append(parse_nominatim_observation(response.json()))
                    break
                if response.status_code not in {429, 500, 502, 503, 504}:
                    print(f"⚠️ OSM 地点识别失败（HTTP {response.status_code}），跳过当前采样点。")
                    break
            except (requests.RequestException, ValueError) as error:
                if attempt == attempts - 1:
                    print(f"⚠️ OSM 地点识别请求异常：{error}")
    return observations

def most_common_name(values):
    counts = {}
    first_seen = {}
    for index, value in enumerate(values):
        name = clean_geo_name(value)
        if not name:
            continue
        counts[name] = counts.get(name, 0) + 1
        first_seen.setdefault(name, index)
    if not counts:
        return None, 0
    selected = max(counts, key=lambda name: (counts[name], -first_seen[name], len(name)))
    return selected, counts[selected]

def choose_public_route_title(activity_type, road_names, observations):
    """按整条轨迹投票：城市看覆盖多数，地点优先连续出现的景区，再选主要道路。"""
    verb = PUBLIC_ROUTE_TITLE_VERBS.get(activity_type)
    if not verb:
        return None

    city, _ = most_common_name([
        observation.get('city')
        for observation in observations
    ])
    city = clean_geo_name(city, strip_city_suffix=True)

    scenic, scenic_count = most_common_name([
        name
        for observation in observations
        for name in observation.get('scenic', [])
    ])
    road, _ = most_common_name(road_names + [
        name
        for observation in observations
        for name in observation.get('street', [])
    ])
    district, _ = most_common_name([
        name
        for observation in observations
        for name in observation.get('district', [])
    ])

    # 单个采样点附近的景点很可能只是擦肩而过；至少两处命中才覆盖主要路线。
    place = scenic if scenic_count >= 2 else road
    if not place:
        place = scenic or district
    if not city or not place:
        return None

    for suffix in ('市',):
        if place.startswith(city + suffix):
            place = place[len(city + suffix):].lstrip(' ·')
    if place == city:
        place = district
    if not place or place == city:
        return None
    return f'{verb}{city} · {place}'

def generate_public_route_title(activity, session=None):
    polyline = activity.get('summary_polyline') or ''
    points = decode_polyline(polyline)
    if len(points) < 2:
        return None
    sampled = sample_route(points, sample_count=min(41, max(11, len(points))))
    observations = reverse_route_observations(sampled, session=session)
    return choose_public_route_title(activity.get('type'), [], observations)
