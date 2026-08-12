import json
import os
import time
import hashlib
import math
import re
import statistics
import requests
from datetime import datetime, timedelta 
from collections import defaultdict

# ==========================================
# 1. 🔑 配置区：仅保留 Cloudflare 环境变量
# ==========================================
CF_ACCOUNT_ID = os.getenv('CF_ACCOUNT_ID')
CF_AI_TOKEN = os.getenv('CF_AI_TOKEN')

if not all([CF_ACCOUNT_ID, CF_AI_TOKEN]):
    print("⚠️ 警告: 缺少 Cloudflare AI 环境变量，AI 文案将无法生成。")

# ==========================================
# 2. 📁 路径绑定
# ==========================================
PROJECT_ROOT = os.path.dirname(os.path.abspath(__file__))
TARGET_DIR = os.path.join(PROJECT_ROOT, 'assets')
FILE_NAME = os.path.join(TARGET_DIR, 'activities.json')
MONTHLY_FILE = os.path.join(TARGET_DIR, 'monthly_insights.json')
PUBLISH_START_DATE = datetime(2026, 1, 1)

ACTIVITY_TYPE_CN = {
    'Run': '跑步',
    'TrailRun': '山野跑',
    'Treadmill': '跑步机',
    'VirtualRun': '线上跑',
    'Ride': '骑行',
    'VirtualRide': '虚拟骑',
    'EBikeRide': '电助力骑',
    'Walk': '步行',
    'Hike': '徒步',
    'StairStepper': '爬楼梯',
    'Swim': '游泳',
    'WaterSport': '水上运动'
}

ACTIVITY_DISTANCE_VERBS = {
    'Run': '跑了',
    'TrailRun': '跑了',
    'Treadmill': '跑了',
    'VirtualRun': '跑了',
    'Ride': '骑了',
    'VirtualRide': '骑了',
    'EBikeRide': '骑了',
    'Walk': '走了',
    'Hike': '走了',
    'StairStepper': '爬了'
}

ACTIVITY_DISTANCE_GROUPS = {
    'Run': 'run',
    'TrailRun': 'run',
    'Treadmill': 'run',
    'VirtualRun': 'run',
    'Ride': 'ride',
    'VirtualRide': 'ride',
    'EBikeRide': 'ride',
    'Walk': 'walk',
    'Hike': 'hike'
}

# 趣味能量换算表。数值只用于挑选自然的整数标题，不作为营养建议展示。
FOOD_EQUIVALENTS = [
    {'key': 'sugar_cube', 'name': '方糖', 'unit': '块', 'kcal': 16},
    {'key': 'chocolate', 'name': '巧克力', 'unit': '块', 'kcal': 28},
    {'key': 'cookie', 'name': '曲奇', 'unit': '块', 'kcal': 45},
    {'key': 'banana', 'name': '香蕉', 'unit': '根', 'kcal': 90},
    {'key': 'cola', 'name': '可乐', 'unit': '罐', 'kcal': 139},
    {'key': 'beer', 'name': '啤酒', 'unit': '瓶', 'kcal': 139},
    {'key': 'rice', 'name': '米饭', 'unit': '碗', 'kcal': 180},
    {'key': 'ice_cream_cone', 'name': '甜筒', 'unit': '支', 'kcal': 200},
    {'key': 'egg_tart', 'name': '蛋挞', 'unit': '个', 'kcal': 220},
    {'key': 'fried_chicken', 'name': '炸鸡', 'unit': '块', 'kcal': 250},
    {'key': 'burger', 'name': '汉堡', 'unit': '个', 'kcal': 250},
    {'key': 'pizza', 'name': '披萨', 'unit': '片', 'kcal': 280},
    {'key': 'fries', 'name': '薯条', 'unit': '份', 'kcal': 300},
    {'key': 'milk_tea', 'name': '奶茶', 'unit': '杯', 'kcal': 450},
    {'key': 'instant_noodles', 'name': '泡面', 'unit': '包', 'kcal': 470}
]
FOOD_TITLE_VERSION = 4
AI_COMMENT_VERSION = 3
MONTHLY_AI_COMMENT_VERSION = 3

# 已退出当前数据契约的旧字段；同步脚本会自动清理，兼容尚未升级的客户端。
OBSOLETE_ACTIVITY_FIELDS = (
    'ai_title',
    'food_title',
    'distance_title_kind',
    'average_speed',
    'source_timezone'
)

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

CHINESE_COUNTS = {
    1: '一', 2: '两', 3: '三', 4: '四', 5: '五',
    6: '六', 7: '七', 8: '八', 9: '九', 10: '十'
}

def format_food_count(count):
    """小数量使用更自然的中文，大数量继续支持任意整数。"""
    return CHINESE_COUNTS.get(count, str(count))

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
    eligible = [candidate for candidate in candidates if candidate[0] <= 0.18]
    natural = [candidate for candidate in eligible if candidate[2] <= 6]
    if natural:
        eligible = natural
    elif not eligible:
        eligible = sorted(candidates, key=lambda candidate: candidate[0])[:4]

    non_repeating = [candidate for candidate in eligible if candidate[1]['key'] not in recent_food_keys]
    if non_repeating:
        eligible = non_repeating

    eligible.sort(key=lambda candidate: candidate[1]['key'])
    digest = hashlib.sha256(f"{run_id}:{calories}:food-title".encode('utf-8')).hexdigest()
    selected_index = int(digest[:8], 16) % len(eligible)
    _, selected_food, selected_count = eligible[selected_index]
    food_text = f"{format_food_count(selected_count)}{selected_food['unit']}{selected_food['name']}"
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

def route_match_score(left, right):
    if len(left) != len(right) or not left:
        return None

    def score(candidate):
        distances = sorted(haversine_meters(a, b) for a, b in zip(left, candidate))
        mean = sum(distances) / len(distances)
        p90 = distances[min(len(distances) - 1, math.ceil(len(distances) * 0.9) - 1)]
        return mean, p90

    return min((score(right), score(list(reversed(right)))), key=lambda value: (value[0], value[1]))

def assign_route_groups(activities):
    """给历史轨迹补稳定同路 ID；App 已按原始轨迹生成的 ID 永远优先保留。"""
    prototypes = []
    changed = False
    for activity in sorted(activities, key=lambda item: parse_time(item.get('start_date_local', ''))):
        sampled = sample_route(decode_polyline(activity.get('summary_polyline', '')))
        if not sampled:
            continue

        activity_type = activity.get('type')
        try:
            distance = float(activity.get('distance') or 0)
        except (TypeError, ValueError):
            distance = 0
        if distance <= 0:
            continue

        preferred_group_id = activity.get('route_group_id')
        preferred = next((p for p in prototypes if p['group_id'] == preferred_group_id), None)
        if preferred_group_id and not preferred:
            prototypes.append({'group_id': preferred_group_id, 'type': activity_type, 'distance': distance, 'route': sampled})
            continue
        if preferred:
            continue

        matches = []
        for prototype in prototypes:
            if prototype['type'] != activity_type:
                continue
            distance_ratio = max(distance, prototype['distance']) / min(distance, prototype['distance'])
            if distance_ratio > 1.18:
                continue
            score = route_match_score(sampled, prototype['route'])
            if score and score[0] <= 120 and score[1] <= 250:
                matches.append((score[0], score[1], prototype))

        if matches:
            group_id = min(matches, key=lambda value: (value[0], value[1], value[2]['group_id']))[2]['group_id']
        else:
            source_key = activity.get('source_id') or activity.get('run_id') or activity.get('start_date_local')
            digest = hashlib.sha256(f"route-group:{source_key}".encode('utf-8')).hexdigest()[:12]
            group_id = f"route_{digest}"
            prototypes.append({'group_id': group_id, 'type': activity_type, 'distance': distance, 'route': sampled})

        if activity.get('route_group_id') != group_id:
            activity['route_group_id'] = group_id
            changed = True
    return changed

# ==========================================
# AI 点评不让模型自行寻找叙事角度：程序算事实，模型只组织语言。
AI_FORBIDDEN_TERMS = (
    '天气', '湿热', '湿冷', '阳光', '微风', '风景', '光影', '空气湿度', '温度适宜',
    '多巴胺', '燃脂区', '高效燃脂', '心肺功能', '心脏功能', '乳酸', '无氧极限',
    '身体', '恢复', '体能', '状态', '负荷', '疲劳', '轻松', '从容', '吃力',
    '稳定', '平稳', '强度', '热量', '卡路里', '消耗', '习惯', '体验', '感觉',
    '进步', '退步', '提升', '逊色', '优势', '出色', '优秀', '积极', '可控', '温和',
    '建议', '继续', '加油', '留意', '训练', '减脂', '医学'
)

WRONG_SPORT_TERMS = {
    'Run': ('骑行', '骑车', '游泳', '步行', '徒步', '爬楼'),
    'TrailRun': ('骑行', '骑车', '游泳', '步行', '爬楼'),
    'Treadmill': ('骑行', '骑车', '游泳', '步行', '徒步', '爬楼'),
    'VirtualRun': ('骑行', '骑车', '游泳', '步行', '徒步', '爬楼'),
    'Ride': ('跑步', '长跑', '短跑', '游泳', '步行', '徒步', '爬楼'),
    'VirtualRide': ('跑步', '长跑', '短跑', '游泳', '步行', '徒步', '爬楼'),
    'EBikeRide': ('跑步', '长跑', '短跑', '游泳', '步行', '徒步', '爬楼'),
    'Walk': ('跑步', '长跑', '短跑', '骑行', '骑车', '游泳', '徒步', '爬楼'),
    'Hike': ('跑步', '长跑', '短跑', '骑行', '骑车', '游泳', '步行', '爬楼'),
    'StairStepper': ('跑步', '长跑', '短跑', '骑行', '骑车', '游泳', '步行', '徒步'),
    'Swim': ('跑步', '长跑', '短跑', '骑行', '骑车', '步行', '徒步', '爬楼')
}

def duration_seconds(value):
    if isinstance(value, (int, float)):
        return int(value)
    parts = str(value or '').split(':')
    try:
        numbers = [int(part) for part in parts]
    except ValueError:
        return 0
    if len(numbers) == 2:
        return numbers[0] * 60 + numbers[1]
    if len(numbers) == 3:
        return numbers[0] * 3600 + numbers[1] * 60 + numbers[2]
    return 0

def pace_seconds_per_km(activity):
    seconds = duration_seconds(activity.get('moving_time'))
    try:
        distance = float(activity.get('distance') or 0)
    except (TypeError, ValueError):
        distance = 0
    return seconds / distance if seconds > 0 and distance > 0 else None

def compare_direction(current, baseline, tolerance=0.02, lower_is_better=False):
    if current is None or baseline in (None, 0):
        return '未知'
    change = (current - baseline) / baseline
    if abs(change) <= tolerance:
        return '接近'
    if lower_is_better:
        return '更快' if change < 0 else '更慢'
    return '更高' if change > 0 else '更低'

def build_activity_facts(activity, older_history):
    activity_type = activity.get('type')
    route_group_id = activity.get('route_group_id')
    current_distance = float(activity.get('distance') or 0)
    current_pace = pace_seconds_per_km(activity)
    current_hr = float(activity.get('average_heartrate') or 0) or None

    same_route = [item for item in older_history if route_group_id and item.get('route_group_id') == route_group_id]
    similar_distance = [
        item for item in older_history
        if item.get('type') == activity_type
        and float(item.get('distance') or 0) > 0
        and current_distance > 0
        and abs(float(item.get('distance')) - current_distance) / current_distance <= 0.15
    ]
    recent_same_type = [item for item in older_history if item.get('type') == activity_type][:5]

    baseline = None
    baseline_kind = None
    if same_route:
        baseline, baseline_kind = same_route[0], '同一路线的上一次'
    elif similar_distance:
        baseline, baseline_kind = similar_distance[0], '同类型且距离相近的上一次'
    elif recent_same_type:
        pace_values = [value for value in (pace_seconds_per_km(item) for item in recent_same_type) if value]
        hr_values = [float(item.get('average_heartrate')) for item in recent_same_type if float(item.get('average_heartrate') or 0) > 0]
        baseline = {
            'distance': statistics.median(float(item.get('distance') or 0) for item in recent_same_type),
            '_pace': statistics.median(pace_values) if pace_values else None,
            'average_heartrate': statistics.median(hr_values) if hr_values else None
        }
        baseline_kind = f'最近{len(recent_same_type)}次同类型记录的中位数'

    comparison = None
    if baseline:
        baseline_pace = baseline.get('_pace') or pace_seconds_per_km(baseline)
        baseline_hr = float(baseline.get('average_heartrate') or 0) or None
        comparison = {
            'basis': baseline_kind,
            'pace': compare_direction(current_pace, baseline_pace, tolerance=0.02, lower_is_better=True),
            'heart_rate': compare_direction(current_hr, baseline_hr, tolerance=0.03),
            'distance': compare_direction(current_distance, float(baseline.get('distance') or 0), tolerance=0.03)
        }

    return {
        'sport': ACTIVITY_TYPE_CN.get(activity_type, '运动'),
        'comparison': comparison
    }

def parse_ai_json(response):
    result_data = response.json().get('result', {}).get('response', '')
    if isinstance(result_data, dict):
        return result_data
    clean_text = str(result_data).replace('```json', '').replace('```', '').strip()
    decoder = json.JSONDecoder()
    for match in re.finditer(r'\{', clean_text):
        try:
            value, _ = decoder.raw_decode(clean_text[match.start():])
            if isinstance(value, dict):
                return value
        except json.JSONDecodeError:
            continue
    return {}

def contains_explicit_measurement(text):
    # “上一次”是比较口径，不属于复述数值；其余带单位的中英文数字均拒绝。
    scan_text = re.sub(r'(?:这|上|前|最近|同)一(?:次|回)', '', text)
    chinese_number = r'[零〇一二两三四五六七八九十百千万点半]+'
    unit = r'(?:公里|千米|米|小时|分钟|分|秒|千卡|大卡|天|日|周|月|次|回|种|项|圈|趟)'
    return bool(re.search(rf'{chinese_number}\s*(?:个)?\s*{unit}', scan_text))

def validate_ai_comment(comment, activity_type=None, monthly=False):
    text = re.sub(r'\s+', ' ', str(comment or '')).strip()
    minimum, maximum = (35, 120) if monthly else (28, 110)
    if not minimum <= len(text) <= maximum:
        return None
    if any(term in text for term in AI_FORBIDDEN_TERMS):
        return None
    if not monthly and any(term in text for term in WRONG_SPORT_TERMS.get(activity_type, ())):
        return None
    if re.search(r'\d', text) or contains_explicit_measurement(text):
        return None
    return text

def request_ai_comment(prompt, activity_type=None, monthly=False):
    if not CF_ACCOUNT_ID or not CF_AI_TOKEN:
        return None
    url = f"https://api.cloudflare.com/client/v4/accounts/{CF_ACCOUNT_ID}/ai/run/@cf/meta/llama-4-scout-17b-16e-instruct"
    headers = {"Authorization": f"Bearer {CF_AI_TOKEN}"}
    correction = ''
    for attempt in range(2):
        payload = {
            "messages": [{"role": "user", "content": prompt + correction}],
            "temperature": 0.45 if attempt == 0 else 0.2,
            "max_tokens": 500
        }
        try:
            response = requests.post(url, headers=headers, json=payload, timeout=45)
            if response.status_code == 200:
                comment = parse_ai_json(response).get('comment')
                validated = validate_ai_comment(comment, activity_type=activity_type, monthly=monthly)
                if validated:
                    return validated
        except Exception as error:
            print(f"⚠️ AI 点评生成失败: {error}")
        correction = "\n上一版未通过事实校验。请缩短并重写，绝不添加任何输入中没有的环境、身体、医学或运动数据，也不要出现数字。"
    return None

def fallback_activity_comment(facts):
    sport = facts['sport']
    comparison = facts.get('comparison')
    if not comparison:
        return f"这次{sport}的数据已经完整记下，距离、用时与强度都有据可查。先把这一笔留作基线，下一次再和真实记录比较。"
    pace, heart_rate = comparison['pace'], comparison['heart_rate']
    if pace == '更快' and heart_rate == '更低':
        result = '节奏更快，平均心率也更低'
    elif pace == '更快':
        result = '节奏更快，平均心率没有同步下降' if heart_rate == '更高' else '节奏更快，平均心率变化不大'
    elif pace == '更慢' and heart_rate == '更低':
        result = '节奏放缓，平均心率也更低'
    elif pace == '更慢':
        result = '节奏稍慢，平均心率也更高' if heart_rate == '更高' else '节奏稍慢，平均心率变化不大'
    else:
        result = '节奏接近，平均心率更低' if heart_rate == '更低' else '整体节奏与平均心率都比较接近'
    return f"这次{sport}和{comparison['basis']}相比，{result}。两项变化都能在现有记录里直接找到，是一笔清楚、可以继续追踪的表现。"

def generate_ai_comment(activity, older_history):
    facts = build_activity_facts(activity, older_history)
    if not facts.get('comparison'):
        return fallback_activity_comment(facts)
    prompt = f"""
你是运动记录的事实编辑，不是医生，也不是训练处方师。
程序已计算出以下唯一可用事实：
{json.dumps(facts, ensure_ascii=False, indent=2)}

请把事实写成一段自然、有温度但克制的中文短评。
要求：只改写 comparison 中已经算好的变化方向，并写清比较基准；不做“进步、退步、恢复、状态、轻松、稳定、强度、身体负荷”等综合判断；不猜天气、环境、心情或训练效果；不做医学判断；不提其他运动；不提供训练建议；不复述任何具体数字。若某项为未知就不要提。
只返回 JSON：{{"comment":"..."}}
"""
    return request_ai_comment(prompt, activity_type=activity.get('type')) or fallback_activity_comment(facts)

# ==========================================
# 月报按程序汇总结果，并在当月未结束时采用上月同期口径。
def get_time_of_day(hour):
    if hour < 6: return '凌晨'
    if hour < 9: return '早晨'
    if hour < 12: return '上午'
    if hour < 14: return '中午'
    if hour < 18: return '下午'
    return '晚上'

def calculate_monthly_stats(month_activities):
    total_duration_seconds = 0
    stats = {
        'total_count': len(month_activities),
        'total_distance': 0.0,
        'total_duration_minutes': 0,
        'total_calories': 0,
        'sports_count': defaultdict(int),
        'sports_distance': defaultdict(float),
        'longest_ride_km': 0.0,
        'longest_run_km': 0.0,
        'hardest_session': {'date': None, 'type': None, 'hr': 0, 'zone': '仅按平均心率排序'},
        'time_preferences': defaultdict(int),
        'hr_sums': defaultdict(list),
        'active_days': set()
    }

    for activity in month_activities:
        sport_type = activity.get('type', 'Unknown')
        sport_name = ACTIVITY_TYPE_CN.get(sport_type, '运动')
        distance = float(activity.get('distance') or 0)
        heart_rate = float(activity.get('average_heartrate') or 0)
        calories = float(activity.get('calories') or 0)
        start_date = activity.get('start_date_local', '')

        stats['total_distance'] += distance
        total_duration_seconds += duration_seconds(activity.get('moving_time'))
        stats['total_calories'] += calories
        stats['sports_count'][sport_name] += 1
        stats['sports_distance'][sport_name] += distance
        if sport_type in ('Ride', 'VirtualRide', 'EBikeRide'):
            stats['longest_ride_km'] = max(stats['longest_ride_km'], distance)
        if sport_type in ('Run', 'TrailRun', 'Treadmill', 'VirtualRun', 'Walk', 'Hike'):
            stats['longest_run_km'] = max(stats['longest_run_km'], distance)

        try:
            date = parse_time(start_date)
            if date != datetime.min:
                stats['active_days'].add(date.date())
                stats['time_preferences'][get_time_of_day(date.hour)] += 1
        except (TypeError, ValueError):
            pass

        if heart_rate:
            stats['hr_sums'][sport_name].append(heart_rate)
            if heart_rate > stats['hardest_session']['hr']:
                stats['hardest_session'] = {
                    'date': f"{int(start_date[8:10])}号" if len(start_date) >= 10 else None,
                    'type': sport_name,
                    'hr': round(heart_rate),
                    'zone': '仅按平均心率排序'
                }

    sorted_days = sorted(stats['active_days'])
    max_streak = current_streak = 1 if sorted_days else 0
    for index in range(1, len(sorted_days)):
        current_streak = current_streak + 1 if sorted_days[index] == sorted_days[index - 1] + timedelta(days=1) else 1
        max_streak = max(max_streak, current_streak)

    stats['total_distance'] = round(stats['total_distance'], 2)
    stats['total_duration_minutes'] = round(total_duration_seconds / 60)
    stats['total_calories'] = round(stats['total_calories'])
    stats['sports_count'] = dict(stats['sports_count'])
    stats['sports_distance'] = {key: round(value, 2) for key, value in stats['sports_distance'].items()}
    stats['longest_ride_km'] = round(stats['longest_ride_km'], 2)
    stats['longest_run_km'] = round(stats['longest_run_km'], 2)
    stats['favorite_time'] = max(stats['time_preferences'], key=stats['time_preferences'].get) if stats['time_preferences'] else '未知'
    stats['avg_hr'] = {
        sport: f"{round(sum(values) / len(values))}bpm"
        for sport, values in stats['hr_sums'].items()
    }
    stats['max_streak_days'] = max_streak
    stats['active_days_count'] = len(stats['active_days'])
    del stats['time_preferences'], stats['hr_sums'], stats['active_days']
    return stats

def previous_month(month_key):
    month_date = datetime.strptime(month_key + '-01', '%Y-%m-%d')
    return (month_date - timedelta(days=1)).strftime('%Y-%m')

def build_monthly_comparison(stats, previous_stats, comparison_basis):
    if not previous_stats:
        return None
    return {
        'basis': comparison_basis,
        'activity_count': compare_direction(stats['total_count'], previous_stats['total_count'], tolerance=0.05),
        'total_distance': compare_direction(stats['total_distance'], previous_stats['total_distance'], tolerance=0.05),
        'active_days': compare_direction(stats['active_days_count'], previous_stats['active_days_count'], tolerance=0.05),
        'duration': compare_direction(stats['total_duration_minutes'], previous_stats['total_duration_minutes'], tolerance=0.05)
    }

def fallback_monthly_comment(stats, comparison):
    sports = '、'.join(stats['sports_count'].keys()) or '运动'
    if not comparison:
        return f"这个月已经留下以{sports}为主的完整记录，出勤、距离和用时都有明确汇总。先把它作为月度基线，后续变化只和真实历史数据比较。"
    count, distance = comparison['activity_count'], comparison['total_distance']
    if count == '更高' and distance == '更高':
        change = '出勤和总里程都更高'
    elif count == '更低' and distance == '更低':
        change = '出勤和总里程都更少'
    elif count == '接近' and distance == '接近':
        change = '出勤与总里程都比较接近'
    else:
        change = f"出勤{count}，总里程{distance}"
    basis = '上月同期' if comparison['basis'].startswith('上月同期') else comparison['basis']
    return f"本月以{sports}为主，和{basis}相比，{change}。运动记录的变化方向很清楚，比较采用的是相同日期范围。"

def generate_monthly_ai_report(month_str, stats, previous_stats, comparison_basis):
    comparison = build_monthly_comparison(stats, previous_stats, comparison_basis)
    prompt_comparison = dict(comparison) if comparison else None
    if prompt_comparison and prompt_comparison['basis'].startswith('上月同期'):
        prompt_comparison['basis'] = '上月同期'
    facts = {
        'sports': list(stats['sports_count'].keys()),
        'comparison': prompt_comparison
    }
    prompt = f"""
你是月度运动记录的事实编辑。程序已经完成全部计算，以下是唯一可使用的事实：
{json.dumps(facts, ensure_ascii=False, indent=2)}

请写一段自然、克制的中文月度点评。必须写清比较口径；只改写 comparison 中已经算好的运动次数、活跃天数、距离和用时变化，并可提及 sports 中已有的运动类型。不做“状态、进步、恢复、轻松、稳定、强度”等综合判断；不猜天气、环境、心情、身体情况或训练效果；不做医学判断；不提供训练处方；不复述具体数字。
只返回 JSON：{{"comment":"..."}}
"""
    return request_ai_comment(prompt, monthly=True) or fallback_monthly_comment(stats, comparison)

def update_monthly_insights(local_data):
    if not local_data:
        return
    insights = {}
    if os.path.exists(MONTHLY_FILE):
        with open(MONTHLY_FILE, 'r', encoding='utf-8') as file:
            try:
                insights = json.load(file)
            except json.JSONDecodeError:
                insights = {}

    months_data = defaultdict(list)
    for activity in local_data:
        date_string = activity.get('start_date_local', '')
        if len(date_string) >= 7:
            months_data[date_string[:7]].append(activity)

    changed = False
    for stale_month in set(insights) - set(months_data):
        del insights[stale_month]
        changed = True

    latest_month = max(months_data.keys())
    stats_changed_months = set()
    for month_key in sorted(months_data.keys()):
        month_activities = months_data[month_key]
        stats = calculate_monthly_stats(month_activities)
        previous_key = previous_month(month_key)
        previous_activities = months_data.get(previous_key, [])

        if month_key == latest_month:
            cutoff_day = max(parse_time(item.get('start_date_local', '')).day for item in month_activities)
            comparable_previous = [
                item for item in previous_activities
                if parse_time(item.get('start_date_local', '')) != datetime.min
                and parse_time(item.get('start_date_local', '')).day <= cutoff_day
            ]
            comparison_basis = f'上月同期（截至{cutoff_day}号）'
        else:
            comparable_previous = previous_activities
            comparison_basis = '上一个自然月'

        previous_stats = calculate_monthly_stats(comparable_previous) if comparable_previous else None
        old_entry = insights.get(month_key, {})
        stats_changed = old_entry.get('stats') != stats
        needs_ai = (
            not old_entry.get('ai_comment')
            or old_entry.get('ai_comment_version') != MONTHLY_AI_COMMENT_VERSION
            or stats_changed
            or previous_key in stats_changed_months
        )

        entry = dict(old_entry)
        entry.update({'month_str': month_key, 'stats': stats})
        if needs_ai:
            comparison = build_monthly_comparison(stats, previous_stats, comparison_basis)
            if CF_ACCOUNT_ID and CF_AI_TOKEN:
                print(f"📈 {month_key} 采用可信事实口径重写月报...")
                entry['ai_comment'] = generate_monthly_ai_report(month_key, stats, previous_stats, comparison_basis)
                entry['ai_comment_version'] = MONTHLY_AI_COMMENT_VERSION
                time.sleep(0.5)
            else:
                # 本地没有云端凭证时先落可靠兜底；不写版本号，线上工作流仍会用 AI 重写。
                entry['ai_comment'] = fallback_monthly_comment(stats, comparison)
                entry.pop('ai_comment_version', None)

        if stats_changed or entry != old_entry:
            entry['last_update'] = datetime.now().strftime('%Y-%m-%dT%H:%M:%S')
            insights[month_key] = entry
            changed = True
        if stats_changed:
            stats_changed_months.add(month_key)

    if changed:
        with open(MONTHLY_FILE, 'w', encoding='utf-8') as file:
            json.dump(insights, file, ensure_ascii=False, indent=2)

# ==========================================
# 5. 🚀 核心自愈运行逻辑
# ==========================================
if __name__ == '__main__':
    print(f"🎯 正在扫描本地运动库: {FILE_NAME}")
    all_local_data = load_local_data()
    local_data = [
        item for item in all_local_data
        if parse_time(item.get('start_date_local', '')) >= PUBLISH_START_DATE
    ]
    removed_before_publish_date = len(all_local_data) - len(local_data)
    needs_save = removed_before_publish_date > 0
    if removed_before_publish_date:
        print(f"🧹 已移除 2026 年以前的 {removed_before_publish_date} 条记录。")

    # 🧹 清理已退出数据契约的字段，避免旧客户端再次写回。
    for item in local_data:
        for key in OBSOLETE_ACTIVITY_FIELDS:
            if key in item:
                del item[key]
                needs_save = True

    # 🧭 App 会用未裁剪原始轨迹生成分组；旧数据由脚本按同一套严格阈值补齐。
    if assign_route_groups(local_data):
        needs_save = True

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

    # 📏 根据真实距离或爬升生成杭州参照物；结果写回 JSON，刷新页面不会变化。
    recent_landmark_keys = []
    for item in reversed(local_data):
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

    # 🧠 程序先算事实，AI 只改写语气；版本升级时会重写旧点评。
    if CF_ACCOUNT_ID and CF_AI_TOKEN:
        for i, item in enumerate(local_data):
            if item.get('ai_comment') and item.get('ai_comment_version') == AI_COMMENT_VERSION:
                continue
            safe_time = item.get('start_date_local', '')
            print(f"🛠️ 记录 [{safe_time}] 正在采用可信事实口径重写点评...")
            older_history = local_data[i+1:]
            item['ai_comment'] = generate_ai_comment(item, older_history)
            item['ai_comment_version'] = AI_COMMENT_VERSION
            needs_save = True
            print("   ↳ 点评已写入（AI 校验通过或采用可信兜底）")
            time.sleep(0.5)
    else:
        pending_count = 0
        for i, item in enumerate(local_data):
            if item.get('ai_comment') and item.get('ai_comment_version') == AI_COMMENT_VERSION:
                continue
            fallback = fallback_activity_comment(build_activity_facts(item, local_data[i+1:]))
            if item.get('ai_comment') != fallback:
                item['ai_comment'] = fallback
                needs_save = True
            if item.pop('ai_comment_version', None) is not None:
                needs_save = True
            pending_count += 1
        if pending_count:
            print(f"🛡️ 本地先写入 {pending_count} 条可信兜底；线上同步会再由 AI 优化表达。")
            
    if needs_save:
        with open(FILE_NAME, 'w', encoding='utf-8') as f:
            json.dump(local_data, f, ensure_ascii=False, indent=2)
        print("✅ 路线分组、趣味标题、杭州距离与点评数据已更新！")
    else:
        print("💤 所有记录均已具备趣味标题、杭州距离与 AI 点评，跳过更新。")

    print("📊 正在同步月度洞察报告...")
    update_monthly_insights(local_data)
    print("✨ 全部流程执行完毕！")
