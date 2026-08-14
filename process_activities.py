import json
import os
import hashlib
import math
import re
import time
from datetime import datetime

import requests

from jingzhe.exercise_contract import (
    ACTIVITY_DISTANCE_GROUPS,
    ACTIVITY_DISTANCE_VERBS,
    ACTIVITY_TYPE_CN,
    FOOD_EQUIVALENTS,
)
from monthly_coach import update_monthly_insights as update_monthly_coach_insights

# ==========================================
# 1. 🔑 配置区：DeepSeek 只负责月中与月末教练月报
# ==========================================
DEEPSEEK_API_KEY = os.getenv('DEEPSEEK_API_KEY')
NOMINATIM_BASE_URL = os.getenv(
    'NOMINATIM_BASE_URL',
    'https://nominatim.openstreetmap.org'
).rstrip('/')
NOMINATIM_USER_AGENT = 'KoobaiExerciseBlog/1.0 (https://koobai.com/exercise/)'

if not DEEPSEEK_API_KEY:
    print("ℹ️ 未提供 DEEPSEEK_API_KEY：运动数据照常处理，月报保留现有内容。")

# ==========================================
# 2. 📁 路径绑定
# ==========================================
PROJECT_ROOT = os.path.dirname(os.path.abspath(__file__))
TARGET_DIR = os.path.join(PROJECT_ROOT, 'assets')
FILE_NAME = os.path.join(TARGET_DIR, 'activities.json')
MONTHLY_FILE = os.path.join(TARGET_DIR, 'monthly_insights.json')
LANDMARK_ROUTE_FILE = os.path.join(TARGET_DIR, 'landmark_route_library.json')
PUBLISH_START_DATE = datetime(2026, 1, 1)

# 趣味能量换算、运动中文名和距离分组统一来自 data/jingzhe/exercise.json。
MAX_FOOD_RELATIVE_ERROR = 0.12
FOOD_TITLE_VERSION = 6

# 杭州距离语言：普通运动（包括徒步）按距离换算，只有爬楼按累计爬升换算。
# preferred_groups 是“软归类”：首选类型会有更高概率，其他运动仍可以偶尔抽到。
DISTANCE_EQUIVALENTS = [
    {'key': 'track', 'name': '操场', 'unit': '圈', 'km': 0.4, 'min_km': 0.2, 'max_km': 4.8, 'max_count': 12, 'preferred_groups': ('run', 'walk')},
    {'key': 'bai_causeway', 'name': '白堤', 'unit': '趟', 'km': 1.0, 'min_km': 0.6, 'max_km': 5.5, 'max_count': 6, 'preferred_groups': ('run', 'walk', 'hike')},
    {'key': 'qiantang_bridge', 'name': '钱塘江大桥', 'unit': '趟', 'km': 1.453, 'min_km': 1.2, 'max_km': 8.5, 'max_count': 6, 'preferred_groups': ('ride', 'run', 'walk')},
    {'key': 'hubin_pedestrian_street', 'name': '湖滨步行街', 'unit': '趟', 'km': 2.0, 'min_km': 1.5, 'max_km': 10.0, 'max_count': 5, 'preferred_groups': ('run', 'walk')},
    {'key': 'su_causeway', 'name': '苏堤', 'unit': '趟', 'km': 2.8, 'min_km': 2.3, 'max_km': 16.8, 'max_count': 6, 'preferred_groups': ('ride', 'run', 'walk', 'hike')},
    {'key': 'yang_causeway', 'name': '杨公堤', 'unit': '趟', 'km': 3.4, 'min_km': 2.8, 'max_km': 20.4, 'max_count': 6, 'preferred_groups': ('ride', 'run', 'walk', 'hike')},
    {'key': 'wentao_riverside', 'name': '闻涛沿江线', 'unit': '趟', 'km': 4.4, 'min_km': 3.5, 'max_km': 26.4, 'max_count': 6, 'preferred_groups': ('ride', 'run', 'walk')},
    {'key': 'jiuxi_baita', 'name': '九溪白塔线', 'unit': '趟', 'km': 7.0, 'min_km': 5.2, 'max_km': 35.0, 'max_count': 5, 'preferred_groups': ('run', 'walk', 'hike')},
    {'key': 'imperial_city_route', 'name': '皇城根线', 'unit': '趟', 'km': 8.0, 'min_km': 6.0, 'max_km': 40.0, 'max_count': 5, 'preferred_groups': ('run', 'walk', 'hike')},
    {'key': 'jiangnan_avenue', 'name': '江南大道', 'unit': '趟', 'km': 9.0, 'min_km': 6.7, 'max_km': 45.0, 'max_count': 5, 'preferred_groups': ('ride', 'run', 'walk')},
    {'key': 'west_lake', 'name': '西湖', 'unit': '圈', 'km': 10.0, 'min_km': 7.5, 'max_km': 60.0, 'max_count': 6, 'preferred_groups': ('ride', 'run', 'walk', 'hike')},
    {'key': 'jingshan_trail', 'name': '径山古道', 'unit': '趟', 'km': 10.0, 'min_km': 7.5, 'max_km': 60.0, 'max_count': 6, 'preferred_groups': ('run', 'walk', 'hike')},
    {'key': 'chaoshan_loop', 'name': '超山环线', 'unit': '圈', 'km': 10.7, 'min_km': 8.0, 'max_km': 64.2, 'max_count': 6, 'preferred_groups': ('ride', 'run', 'walk', 'hike')},
    {'key': 'shili_langdang', 'name': '十里琅珰', 'unit': '趟', 'km': 12.0, 'min_km': 9.0, 'max_km': 72.0, 'max_count': 6, 'preferred_groups': ('run', 'walk', 'hike')},
    {'key': 'yuhangtang_river', 'name': '余杭塘河', 'unit': '趟', 'km': 15.73, 'min_km': 11.8, 'max_km': 94.4, 'max_count': 6, 'preferred_groups': ('ride', 'run', 'walk')},
    {'key': 'dajingshan_greenway', 'name': '大径山绿道', 'unit': '趟', 'km': 18.0, 'min_km': 13.5, 'max_km': 108.0, 'max_count': 6, 'preferred_groups': ('ride', 'run', 'hike')},
    {'key': 'gaoting_trail', 'name': '皋亭山步道', 'unit': '趟', 'km': 30.0, 'min_km': 22.5, 'max_km': 180.0, 'max_count': 6, 'preferred_groups': ('ride', 'run', 'walk', 'hike')},
    {'key': 'qingshan_lake_greenway', 'name': '青山湖绿道', 'unit': '圈', 'km': 42.195, 'min_km': 31.6, 'max_km': 253.2, 'max_count': 6, 'preferred_groups': ('ride', 'run', 'hike')}
]

ELEVATION_EQUIVALENTS = [
    {'key': 'leifeng_pagoda', 'name': '雷峰塔', 'unit': '座', 'meters': 71.0, 'max_count': 4},
    {'key': 'north_peak', 'name': '北高峰', 'unit': '座', 'meters': 314.0, 'max_count': 6}
]

ELEVATION_ACTIVITY_TYPES = {'StairStepper'}
DISTANCE_TITLE_VERSION = 6
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

DEFAULT_ACTIVITY_NAME_PATTERN = re.compile(
    r'^(晨间|上午|午间|午后|下午|傍晚|晚间|夜间|凌晨|清晨|Morning|Afternoon|Evening|Night|Lunch)'
    r'.*(跑步|骑行|行走|徒步|游泳|运动|爬楼梯|Run|Ride|Walk|Swim|Hike|Treadmill|VirtualRun|StairStepper)$'
)
DEFAULT_ACTIVITY_NAMES = {'Run', 'Ride', 'Walk', 'StairStepper', 'Workout', ''}


def validate_landmark_route_library(activities=None):
    with open(LANDMARK_ROUTE_FILE, 'r', encoding='utf-8') as route_file:
        route_library = json.load(route_file)

    expected_keys = {
        item['key'] for item in DISTANCE_EQUIVALENTS + ELEVATION_EQUIVALENTS
    }
    route_keys = [item.get('key') for item in route_library]
    actual_keys = set(route_keys)
    duplicate_keys = sorted({key for key in route_keys if route_keys.count(key) > 1})
    missing_keys = sorted(expected_keys - actual_keys)
    extra_keys = sorted(actual_keys - expected_keys)
    invalid_routes = sorted(
        item.get('key', '<unknown>')
        for item in route_library
        if not item.get('geometry') or item.get('path_type') not in {'line', 'loop'}
    )

    activity_keys = {
        item.get('distance_title_key') for item in (activities or [])
        if item.get('distance_title_key')
    }
    missing_activity_keys = sorted(activity_keys - actual_keys)

    problems = []
    if duplicate_keys:
        problems.append(f"重复 key：{', '.join(duplicate_keys)}")
    if missing_keys:
        problems.append(f"标题库缺少路线：{', '.join(missing_keys)}")
    if extra_keys:
        problems.append(f"路线库存在无效地点：{', '.join(extra_keys)}")
    if invalid_routes:
        problems.append(f"路线几何无效：{', '.join(invalid_routes)}")
    if missing_activity_keys:
        problems.append(f"现有记录无法匹配路线：{', '.join(missing_activity_keys)}")
    if problems:
        raise RuntimeError('；'.join(problems))

    print(f"🗺️ 标题地点路线库校验通过：{len(route_library)} 个地点完整对应。")

CHINESE_COUNTS = {
    1: '一', 2: '两', 3: '三', 4: '四', 5: '五',
    6: '六', 7: '七', 8: '八', 9: '九', 10: '十'
}

def format_food_count(count):
    """小数量使用更自然的中文，大数量继续支持任意整数。"""
    return CHINESE_COUNTS.get(count, str(count))

def format_food_quantity(count, unit, name):
    """默认使用整数；极低热量无合适整数时才允许半份表达。"""
    whole = int(count)
    if abs(count - whole) < 0.01:
        return f"{format_food_count(whole)}{unit}{name}"
    if whole == 0:
        return f"半{unit}{name}"
    return f"{format_food_count(whole)}{unit}半{name}"

def generate_energy_title(calories, run_id, recent_food_keys=None):
    """按实际消耗选择一个自然、稳定且尽量不重复的食物换算。"""
    try:
        calories = float(calories or 0)
    except (TypeError, ValueError):
        calories = 0

    if calories <= 0:
        return None, None

    recent_food_keys = set(recent_food_keys or [])
    candidates = []

    for food in FOOD_EQUIVALENTS:
        count = max(1, int(calories / food['kcal'] + 0.5))
        converted_calories = count * food['kcal']
        relative_error = abs(converted_calories - calories) / calories

        candidates.append((relative_error, food, count))

    # 在误差合理的食物中进行稳定随机，优先使用 1～6 份的自然表达。
    # 如果今后消耗大幅超出当前记录，会自动放宽数量，不存在上限。
    eligible = [candidate for candidate in candidates if candidate[0] <= MAX_FOOD_RELATIVE_ERROR]
    natural = [candidate for candidate in eligible if candidate[2] <= 6]
    if natural:
        eligible = natural
    elif not eligible:
        half_candidates = []
        for food in FOOD_EQUIVALENTS:
            count = max(0.5, round(calories / food['kcal'] * 2) / 2)
            relative_error = abs(count * food['kcal'] - calories) / calories
            half_candidates.append((relative_error, food, count))
        half_candidates.sort(key=lambda candidate: (candidate[0], candidate[1]['key']))
        if half_candidates[0][0] <= MAX_FOOD_RELATIVE_ERROR:
            # 半份只作为低热量边界兜底，并固定选取误差最小的一项。
            eligible = [half_candidates[0]]
        else:
            # 极端数据仍取最接近的一项，不再从多个高误差候选中随机。
            eligible = [min(candidates, key=lambda candidate: (candidate[0], candidate[1]['key']))]

    non_repeating = [candidate for candidate in eligible if candidate[1]['key'] not in recent_food_keys]
    if non_repeating:
        eligible = non_repeating

    eligible.sort(key=lambda candidate: candidate[1]['key'])
    digest = hashlib.sha256(f"{run_id}:{calories}:food-title".encode('utf-8')).hexdigest()
    selected_index = int(digest[:8], 16) % len(eligible)
    _, selected_food, selected_count = eligible[selected_index]
    food_text = format_food_quantity(
        selected_count,
        selected_food['unit'],
        selected_food['name']
    )
    energy_title = f"燃掉{food_text}"
    return energy_title, selected_food['key']

def format_landmark_count(count, unit, name):
    """把 1、1.5、2.5 等数量写成适合卡片的简短中文。"""
    whole = int(count)
    has_half = abs(count - whole - 0.5) < 0.01
    if whole == 0 and has_half:
        return f"半{unit}{name}"
    if whole <= 10:
        count_text = format_food_count(whole)
    elif whole < 20:
        digit = '二' if whole - 10 == 2 else CHINESE_COUNTS[whole - 10]
        count_text = f"十{digit}"
    elif whole < 100:
        tens, ones = divmod(whole, 10)
        tens_text = '二' if tens == 2 else CHINESE_COUNTS[tens]
        ones_text = ('二' if ones == 2 else CHINESE_COUNTS[ones]) if ones else ''
        count_text = f"{tens_text}十{ones_text}"
    else:
        count_text = str(whole)
    return f"{count_text}{unit}{'半' if has_half else ''}{name}"

def stable_landmark_choice(candidates, run_id, value, seed_suffix, recent_keys=None):
    recent_keys = set(recent_keys or [])
    non_repeating = [candidate for candidate in candidates if candidate[1]['key'] not in recent_keys]
    if non_repeating:
        candidates = non_repeating
    candidates.sort(key=lambda candidate: candidate[1]['key'])
    digest = hashlib.sha256(f"{run_id}:{value}:{seed_suffix}".encode('utf-8')).hexdigest()
    return candidates[int(digest[:8], 16) % len(candidates)]

def generate_distance_title(activity_type, distance, elevation, run_id, recent_keys=None):
    """生成稳定的杭州距离/爬升参照，保留真实数据作为卡片主信息。"""
    try:
        distance = float(distance or 0)
    except (TypeError, ValueError):
        distance = 0
    try:
        elevation = float(elevation or 0)
    except (TypeError, ValueError):
        elevation = 0

    if activity_type in ELEVATION_ACTIVITY_TYPES and elevation > 0:
        candidates = []
        for landmark in ELEVATION_EQUIVALENTS:
            count = max(1, int(elevation / landmark['meters'] + 0.5))
            relative_error = abs(count * landmark['meters'] - elevation) / elevation
            candidates.append((relative_error, landmark, count))

        eligible = [candidate for candidate in candidates if candidate[0] <= 0.2 and candidate[2] <= candidate[1]['max_count']]
        if not eligible:
            if elevation > ELEVATION_EQUIVALENTS[-1]['meters'] * ELEVATION_EQUIVALENTS[-1]['max_count']:
                eligible = [candidates[-1]]
            else:
                eligible = sorted(candidates, key=lambda candidate: candidate[0])[:1]
        _, landmark, count = stable_landmark_choice(eligible, run_id, elevation, 'elevation-title-v1', recent_keys)
        return f"爬了{format_landmark_count(count, landmark['unit'], landmark['name'])}", landmark['key']

    distance_verb = ACTIVITY_DISTANCE_VERBS.get(activity_type)
    activity_group = ACTIVITY_DISTANCE_GROUPS.get(activity_type)
    if distance <= 0 or not distance_verb or not activity_group:
        return None, None

    candidates = []
    for landmark in DISTANCE_EQUIVALENTS:
        count = max(0.5, round(distance / landmark['km'] * 2) / 2)
        relative_error = abs(count * landmark['km'] - distance) / distance
        in_range = landmark['min_km'] <= distance <= landmark['max_km']
        is_natural_count = count <= landmark['max_count']
        is_preferred = activity_group in landmark['preferred_groups']
        # 类型不合只增加小幅惩罚，不会将地标彻底排除。
        fit_score = relative_error + (0 if is_preferred else 0.05)
        candidates.append((fit_score, landmark, count, in_range and is_natural_count, relative_error, is_preferred))

    eligible = [candidate for candidate in candidates if candidate[3] and candidate[4] <= 0.18]
    if not eligible:
        if distance > DISTANCE_EQUIVALENTS[-1]['max_km']:
            eligible = [candidates[-1]]
        else:
            eligible = sorted(candidates, key=lambda candidate: (candidate[0], candidate[1]['key']))[:3]
    else:
        # 只在最贴近的五个候选中选择，避免为了随机而出现牵强换算。
        eligible = sorted(eligible, key=lambda candidate: (candidate[0], candidate[1]['key']))[:5]

    weighted_candidates = []
    for candidate in eligible:
        weighted_candidates.extend([candidate] * (3 if candidate[5] else 1))

    _, landmark, count, _, _, _ = stable_landmark_choice(
        weighted_candidates, run_id, distance, 'distance-title-v2', recent_keys
    )
    return f"{distance_verb}{format_landmark_count(count, landmark['unit'], landmark['name'])}", landmark['key']

def load_local_data():
    if os.path.exists(FILE_NAME):
        with open(FILE_NAME, 'r', encoding='utf-8') as f:
            try:
                data = json.load(f) or []
                data.sort(key=lambda x: parse_time(x.get('start_date_local', '')), reverse=True)
                return data
            except json.JSONDecodeError as error:
                raise RuntimeError(f"activities.json 格式错误: {error}") from error
    return []

def parse_time(time_str):
    try:
        return datetime.strptime(time_str, "%Y-%m-%dT%H:%M:%S")
    except Exception:
        return datetime.min

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


def is_default_activity_name(value):
    name = value if isinstance(value, str) else ''
    return name in DEFAULT_ACTIVITY_NAMES or bool(DEFAULT_ACTIVITY_NAME_PATTERN.match(name))

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
                        'Referer': 'https://koobai.com/exercise/'
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

# ==========================================
# 5. 🚀 核心自愈运行逻辑
# ==========================================
if __name__ == '__main__':
    print(f"🎯 正在扫描本地运动库: {FILE_NAME}")
    all_local_data = load_local_data()
    validate_landmark_route_library(all_local_data)
    local_data = [
        item for item in all_local_data
        if parse_time(item.get('start_date_local', '')) >= PUBLISH_START_DATE
    ]
    removed_before_publish_date = len(all_local_data) - len(local_data)
    needs_save = removed_before_publish_date > 0
    if removed_before_publish_date:
        print(f"🧹 已移除 2026 年以前的 {removed_before_publish_date} 条记录。")

    # 🍔 食物换算按时间顺序稳定生成。
    recent_food_keys = []
    for item in reversed(local_data):
        should_regenerate_title = (
            not item.get('energy_title') or
            item.get('food_title_version') != FOOD_TITLE_VERSION
        )
        if should_regenerate_title:
            energy_title, food_key = generate_energy_title(
                item.get('calories'),
                item.get('run_id'),
                recent_food_keys[-3:]
            )
            if energy_title:
                item['energy_title'] = energy_title
                item['food_key'] = food_key
                item['food_title_version'] = FOOD_TITLE_VERSION
                needs_save = True
            else:
                for key in ('energy_title', 'food_key', 'food_title_version'):
                    if key in item:
                        del item[key]
                        needs_save = True

        if item.get('food_key'):
            recent_food_keys.append(item['food_key'])

    # 🧭 公开轨迹从路线内部三处识别真实城市与主要道路/区域；成功后永久缓存。
    for item in local_data:
        if item.get('route_status') != 'available':
            for key in ('route_title', 'route_title_version'):
                if key in item:
                    del item[key]
                    needs_save = True
            continue

        # 手工命名优先且页面不会使用自动地点标题，不为它消耗 API 或保留冗余字段。
        if not is_default_activity_name(item.get('name')):
            for key in (
                'route_title', 'route_title_version',
                'distance_title', 'distance_title_key', 'distance_title_version'
            ):
                if key in item:
                    del item[key]
                    needs_save = True
            continue

        should_generate_public_title = (
            not item.get('route_title') or
            item.get('route_title_version') != PUBLIC_ROUTE_TITLE_VERSION
        )
        if should_generate_public_title:
            print(f"🗺️ 公开轨迹 [{item.get('start_date_local', '未知时间')}] 正在识别真实地点...")
            route_title = generate_public_route_title(item)
            if route_title:
                item['route_title'] = route_title
                item['route_title_version'] = PUBLIC_ROUTE_TITLE_VERSION
                needs_save = True
                print(f"   ↳ {route_title}")
            else:
                print("   ↳ 暂未找到可靠地点，保留原始运动名称并在下次同步重试。")

        if item.get('route_title'):
            for key in ('distance_title', 'distance_title_key', 'distance_title_version'):
                if key in item:
                    del item[key]
                    needs_save = True

    # 📏 隐私与室内运动继续根据真实距离或爬升生成杭州参照物。
    recent_landmark_keys = []
    for item in reversed(local_data):
        if item.get('route_status') == 'available':
            continue
        should_regenerate_distance = (
            not item.get('distance_title') or
            item.get('distance_title_version') != DISTANCE_TITLE_VERSION
        )
        if should_regenerate_distance:
            title, landmark_key = generate_distance_title(
                item.get('type'),
                item.get('distance'),
                item.get('total_elevation_gain'),
                item.get('run_id'),
                recent_landmark_keys[-2:]
            )
            if title:
                item['distance_title'] = title
                item['distance_title_key'] = landmark_key
                item['distance_title_version'] = DISTANCE_TITLE_VERSION
                needs_save = True
            else:
                for key in ('distance_title', 'distance_title_key', 'distance_title_version'):
                    if key in item:
                        del item[key]
                        needs_save = True

        if item.get('distance_title_key'):
            recent_landmark_keys.append(item['distance_title_key'])

    if needs_save:
        with open(FILE_NAME, 'w', encoding='utf-8') as f:
            # 保持与 iOS 同步文件一致的冒号空格风格，避免一次标题更新改动整份 JSON。
            json.dump(local_data, f, ensure_ascii=False, indent=2, separators=(',', ' : '))
        print("✅ 路线分组、趣味标题与公开轨迹地点已更新！")
    else:
        print("💤 所有记录均已具备所需标题与地点数据，跳过更新。")

    print("📊 正在同步月度教练报告...")
    update_monthly_coach_insights(
        local_data,
        MONTHLY_FILE,
        api_key=DEEPSEEK_API_KEY
    )
    print("✨ 全部流程执行完毕！")
