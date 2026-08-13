import json
import os
import time
import hashlib
import difflib
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
AI_COMMENT_VERSION = 7
MONTHLY_AI_COMMENT_VERSION = 4

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
    '强度', '热量', '卡路里', '消耗', '习惯', '体验', '感觉',
    '进步', '退步', '提升', '逊色', '优势', '出色', '优秀', '积极', '可控', '温和',
    '建议', '继续', '加油', '留意', '训练', '减脂', '医学'
)

# 博客点评面向访问者展示，不使用私聊式第二人称或博主称谓。
AI_PUBLIC_VOICE_FORBIDDEN_TERMS = (
    '你', '您', '自己', '本人', '博主'
)

# 单条运动点评额外禁止的模板腔和无依据评价；月报不复用这组风格限制。
AI_ACTIVITY_FORBIDDEN_TERMS = (
    '挑战', '极限', '突破', '里程碑', '最佳', '佳绩', '成就', '不断', '坚持',
    '成长', '更好', '卓越', '新高度', '圆满', '成功', '树立', '目标', '自我',
    '生活节奏', '参照点', '刻度', '痕迹', '表现',
    '意味着', '表明', '说明', '体现出', '舒适性', '技巧', '策略',
    '投入', '精力', '追求', '探索', '付出', '努力'
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

def describe_duration(seconds):
    """把精确用时转换为适合公开点评的模糊时间画像，避免复述数据卡。"""
    minutes = max(0, round(seconds / 60))
    if minutes < 10:
        return '不到十分钟'
    if minutes < 20:
        return '十几分钟'
    if minutes < 30:
        return '二十多分钟'
    if minutes < 40:
        return '半小时左右'
    if minutes < 50:
        return '四十多分钟'
    if minutes < 60:
        return '接近一小时'
    if minutes < 75:
        return '一小时左右'
    if minutes < 105:
        return '一个多小时'
    if minutes < 135:
        return '接近两小时'
    return '两小时以上'

def describe_distance_band(activity_type, distance, historical_distances):
    """距离画像优先按个人同类型历史判断，样本不足时采用宽松运动类型阈值。"""
    values = [float(value) for value in historical_distances if float(value or 0) > 0]
    if values:
        median = statistics.median(values)
        if median > 0 and distance <= median * 0.65:
            return '短程'
        if median > 0 and distance >= median * 1.35:
            return '长距离'
        return '中等距离'

    if activity_type in ('Ride', 'VirtualRide', 'EBikeRide'):
        short_limit, long_limit = 8, 25
    elif activity_type in ('Hike',):
        short_limit, long_limit = 4, 10
    elif activity_type in ('Run', 'TrailRun', 'Treadmill', 'VirtualRun', 'Walk'):
        short_limit, long_limit = 2, 7
    else:
        return None
    if distance < short_limit:
        return '短程'
    if distance > long_limit:
        return '长距离'
    return '中等距离'

def build_current_activity_profile(activity, older_history):
    """生成 AI 可以使用的本次画像；只提供解释性标签，不提供数据卡中的精确数字。"""
    activity_type = activity.get('type')
    sport = ACTIVITY_TYPE_CN.get(activity_type, '运动')
    same_type = [item for item in older_history if item.get('type') == activity_type]
    recent_same_type = same_type[:5]
    distance = float(activity.get('distance') or 0)
    current_duration_seconds = duration_seconds(activity.get('moving_time'))
    duration_phrase = describe_duration(current_duration_seconds) if current_duration_seconds > 0 else None
    distance_band = describe_distance_band(
        activity_type,
        distance,
        [item.get('distance') for item in same_type]
    ) if distance > 0 else None

    current_pace = pace_seconds_per_km(activity)
    pace_values = [value for value in (pace_seconds_per_km(item) for item in recent_same_type) if value]
    pace_direction = compare_direction(
        current_pace,
        statistics.median(pace_values) if pace_values else None,
        tolerance=0.04,
        lower_is_better=True
    )
    pace_phrase = {
        '更快': '节奏快于近期同类型的常见水平',
        '更慢': '节奏慢于近期同类型的常见水平',
        '接近': '节奏处在近期同类型的常见区间',
        '未知': None
    }.get(pace_direction)

    current_hr = float(activity.get('average_heartrate') or 0) or None
    hr_values = [
        float(item.get('average_heartrate'))
        for item in recent_same_type
        if float(item.get('average_heartrate') or 0) > 0
    ]
    hr_direction = compare_direction(
        current_hr,
        statistics.median(hr_values) if hr_values else None,
        tolerance=0.05
    )
    heart_rate_phrase = {
        '更高': '平均心率高于近期同类型的常见水平',
        '更低': '平均心率低于近期同类型的常见水平',
        '接近': '平均心率处在近期同类型的常见区间',
        '未知': None
    }.get(hr_direction)

    elevation = float(activity.get('total_elevation_gain') or 0)
    elevation_phrase = None
    if activity_type in ('Hike', 'TrailRun') and elevation >= 100:
        elevation_phrase = '带有明显爬升'
    elif activity_type == 'StairStepper' and elevation > 0:
        elevation_phrase = '以累计爬升为主要内容'

    markers = [value for value in (duration_phrase, distance_band) if value]
    return {
        'sport': sport,
        'duration': duration_phrase,
        'distance': distance_band,
        'pace': pace_phrase,
        'heart_rate': heart_rate_phrase,
        'elevation': elevation_phrase,
        'venue': '室内' if activity.get('is_indoor') is True else '户外',
        'required_markers': markers,
        'allowed_measurements': [duration_phrase] if duration_phrase else []
    }

def build_activity_coach_angle(focus):
    """只给 AI 语义方向，不提供可直接照抄的成句文案。"""
    kind = (focus or {}).get('kind')
    pace = (focus or {}).get('pace')
    heart_rate = (focus or {}).get('heart_rate')
    distance = (focus or {}).get('distance')
    if kind == 'baseline':
        return {'key': 'baseline', 'primary_dimension': '新的比较基准', 'guardrail': '不虚构历史对象'}
    if kind in ('longest_distance', 'monthly_longest_distance'):
        return {'key': 'distance_record', 'primary_dimension': '距离纪录', 'guardrail': '不延伸为能力提升'}
    if kind == 'same_route_best':
        return {'key': 'route_sharpness', 'primary_dimension': '熟悉路线的速度变化', 'guardrail': '不评价整体能力'}
    if pace == '更快' and heart_rate == '更低':
        return {'key': 'sharper_at_lower_hr', 'signals': ['节奏更快', '平均心率更低'], 'guardrail': '不推断体能变化'}
    if pace == '更慢' and heart_rate == '更低':
        return {'key': 'restrained_rhythm', 'signals': ['节奏较慢', '平均心率较低'], 'tone': '克制', 'guardrail': '不推断主观意图'}
    if pace == '更快' and heart_rate == '更高':
        return {'key': 'speed_emphasis', 'signals': ['节奏更快', '平均心率更高'], 'primary_dimension': '速度'}
    if pace == '更慢' and heart_rate == '更高':
        return {'key': 'pace_hr_contrast', 'signals': ['节奏较慢', '平均心率较高'], 'primary_dimension': '两项反向关系', 'guardrail': '不猜原因'}
    if distance == '更高':
        return {'key': 'distance_emphasis', 'primary_dimension': '距离', 'secondary_dimension': '速度', 'guardrail': '不评价健康能力'}
    if pace == '接近' and heart_rate == '接近' and distance == '接近':
        return {'key': 'everyday_pattern', 'primary_dimension': '近期常见区间', 'tone': '日常'}
    return {'key': 'comparison', 'primary_dimension': '本次最明显的数据关系', 'tone': '克制'}

ACTIVITY_NARRATIVE_MODES = (
    {'key': 'portrait_first', 'instruction': '先勾勒本次运动画像，再写比较，最后用一句教练式判断收束'},
    {'key': 'comparison_first', 'instruction': '先从可靠比较对象切入，再回到本次画像，结尾只点出最鲜明特点'},
    {'key': 'duration_first', 'instruction': '从模糊用时形成的运动轮廓切入，再连接节奏、心率或历史比较'},
    {'key': 'distance_first', 'instruction': '从距离层级切入，再解释这次节奏与比较结果，避免逐项播报数据'},
    {'key': 'observation_first', 'instruction': '先给一句有依据的教练观察，再用本次画像与比较事实把判断落稳'}
)

def select_activity_narrative_modes(activity, focus):
    special = []
    kind = (focus or {}).get('kind')
    if kind in ('longest_distance', 'monthly_longest_distance'):
        special.append({'key': 'record_first', 'instruction': '先写距离纪录这一核心事实，再补本次画像并克制收束'})
    elif kind in ('same_route_change', 'same_route_best'):
        special.append({'key': 'route_first', 'instruction': '从熟悉路线的可靠比较切入，再写本次最明显的变化'})
    elif kind == 'baseline':
        special.append({'key': 'baseline_first', 'instruction': '先说明暂无可靠比较对象，再勾勒本次画像并把它留作基线'})

    source_key = activity.get('source_id') or activity.get('run_id') or activity.get('start_date_local')
    digest = hashlib.sha256(f"activity-narrative-v7:{source_key}".encode('utf-8')).hexdigest()
    offset = int(digest[:8], 16) % len(ACTIVITY_NARRATIVE_MODES)
    rotated = list(ACTIVITY_NARRATIVE_MODES[offset:] + ACTIVITY_NARRATIVE_MODES[:offset])
    modes = special + rotated
    unique = []
    for mode in modes:
        if mode['key'] not in {item['key'] for item in unique}:
            unique.append(mode)
        if len(unique) == 3:
            break
    return unique

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
    route_context = None
    candidates = []

    # 同路信息只在确实有明显变化时成为本次点评焦点，避免每次都重复“又走了这条路”。
    if same_route and current_pace:
        previous_route = same_route[0]
        previous_pace = pace_seconds_per_km(previous_route)
        previous_hr = float(previous_route.get('average_heartrate') or 0) or None
        pace_change = (current_pace - previous_pace) / previous_pace if previous_pace else 0
        heart_rate_change = (
            (current_hr - previous_hr) / previous_hr
            if current_hr and previous_hr else 0
        )

        paced_history = [item for item in same_route if pace_seconds_per_km(item)]
        previous_best = min(paced_history, key=pace_seconds_per_km) if paced_history else None
        previous_best_pace = pace_seconds_per_km(previous_best) if previous_best else None
        is_new_route_best = bool(previous_best_pace and current_pace < previous_best_pace * 0.99)
        has_notable_pace_change = bool(previous_pace and abs(pace_change) >= 0.08)
        has_notable_heart_rate_change = bool(previous_hr and abs(heart_rate_change) >= 0.08)

        if is_new_route_best:
            baseline, baseline_kind = previous_best, '此前同路线最快的一次'
        elif has_notable_pace_change or has_notable_heart_rate_change:
            baseline, baseline_kind = previous_route, '同一路线的上一次'

        if baseline:
            visit_count = len(same_route) + 1
            source_key = activity.get('source_id') or activity.get('run_id') or activity.get('start_date_local')
            digest = hashlib.sha256(f"route-visit:{source_key}".encode('utf-8')).hexdigest()
            milestone = visit_count in (3, 5, 10, 20, 30, 50, 100)
            route_context = {
                'focus': '同一路线的历史表现'
            }
            if is_new_route_best:
                route_context['achievement'] = '刷新同路最快记录'
            # 次数只是偶尔出现的趣味信息；里程碑必写，其余约三分之一记录可写。
            if milestone or int(digest[:2], 16) % 3 == 0:
                route_context['visit_count'] = visit_count

            candidates.append({
                'kind': 'same_route_best' if is_new_route_best else 'same_route_change',
                'priority': 100 if is_new_route_best else 82,
                'basis': baseline_kind,
                'pace': compare_direction(current_pace, pace_seconds_per_km(baseline), tolerance=0.02, lower_is_better=True),
                'heart_rate': compare_direction(current_hr, float(baseline.get('average_heartrate') or 0) or None, tolerance=0.03),
                'distance': compare_direction(current_distance, float(baseline.get('distance') or 0), tolerance=0.03),
                'route': route_context
            })

    if similar_distance:
        similar_baseline = similar_distance[0]
        similar_pace = pace_seconds_per_km(similar_baseline)
        similar_hr = float(similar_baseline.get('average_heartrate') or 0) or None
        similar_comparison = {
            'kind': 'similar_distance_change',
            'priority': 62,
            'basis': '同类型且距离相近的上一次',
            'pace': compare_direction(current_pace, similar_pace, tolerance=0.02, lower_is_better=True),
            'heart_rate': compare_direction(current_hr, similar_hr, tolerance=0.03),
            'distance': compare_direction(current_distance, float(similar_baseline.get('distance') or 0), tolerance=0.03)
        }
        notable_count = sum(
            value not in ('接近', '未知')
            for value in (similar_comparison['pace'], similar_comparison['heart_rate'])
        )
        similar_comparison['priority'] += notable_count * 7
        candidates.append(similar_comparison)

    if recent_same_type:
        pace_values = [value for value in (pace_seconds_per_km(item) for item in recent_same_type) if value]
        hr_values = [float(item.get('average_heartrate')) for item in recent_same_type if float(item.get('average_heartrate') or 0) > 0]
        recent_baseline = {
            'distance': statistics.median(float(item.get('distance') or 0) for item in recent_same_type),
            '_pace': statistics.median(pace_values) if pace_values else None,
            'average_heartrate': statistics.median(hr_values) if hr_values else None
        }
        recent_comparison = {
            'kind': 'recent_median_change',
            'priority': 54,
            'basis': '近期同类型记录的中位数',
            'pace': compare_direction(current_pace, recent_baseline['_pace'], tolerance=0.03, lower_is_better=True),
            'heart_rate': compare_direction(current_hr, recent_baseline['average_heartrate'], tolerance=0.04),
            'distance': compare_direction(current_distance, recent_baseline['distance'], tolerance=0.08)
        }
        notable_count = sum(
            value not in ('接近', '未知')
            for value in (recent_comparison['pace'], recent_comparison['heart_rate'], recent_comparison['distance'])
        )
        recent_comparison['priority'] += notable_count * 6
        candidates.append(recent_comparison)

    all_same_type = [item for item in older_history if item.get('type') == activity_type]
    current_month = str(activity.get('start_date_local') or '')[:7]
    older_same_month_type = [
        item for item in all_same_type
        if str(item.get('start_date_local') or '').startswith(current_month)
    ]
    if older_same_month_type and current_distance > max(float(item.get('distance') or 0) for item in older_same_month_type):
        candidates.append({
            'kind': 'monthly_longest_distance',
            'priority': 88,
            'basis': '本月此前同类型记录',
            'achievement': '刷新本月同类型最远距离'
        })

    if all_same_type and current_distance > max(float(item.get('distance') or 0) for item in all_same_type):
        candidates.append({
            'kind': 'longest_distance',
            'priority': 94,
            'basis': '此前全部同类型记录',
            'achievement': '刷新同类型最远距离'
        })

    valid_candidates = [candidate for candidate in candidates if candidate]
    selected = max(valid_candidates, key=lambda candidate: candidate['priority']) if valid_candidates else {
        'kind': 'baseline',
        'priority': 0,
        'basis': '暂无合适的历史比较记录'
    }
    if selected:
        selected = {key: value for key, value in selected.items() if key != 'priority'}

    current_profile = build_current_activity_profile(activity, older_history)
    return {
        'sport': ACTIVITY_TYPE_CN.get(activity_type, '运动'),
        'current_profile': current_profile,
        'focus': selected,
        'coach_angle': build_activity_coach_angle(selected),
        'candidate_modes': select_activity_narrative_modes(activity, selected)
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

def normalize_comment(text):
    return re.sub(r'[\s，。；：、！？“”‘’（）()·]', '', str(text or ''))

def comment_similarity(left, right):
    left_normalized, right_normalized = normalize_comment(left), normalize_comment(right)
    if not left_normalized or not right_normalized:
        return 0
    return difflib.SequenceMatcher(None, left_normalized, right_normalized).ratio()

def comment_sentences(text):
    return [part.strip() for part in re.split(r'(?<=[。！？])', str(text or '')) if part.strip()]

def contains_explicit_measurement(text):
    # 比较口径里的“上一次”和指代本次的“这一趟”不是复述数值。
    scan_text = re.sub(r'(?:这|上|下|前|最近|同|又|的|最快|此前最快)一(?:次|回|趟)', '', text)
    chinese_number = r'[零〇一二两三四五六七八九十百千万点半]+'
    unit = r'(?:公里|千米|米|小时|分钟|分|秒|千卡|大卡|天|日|周|月|次|回|圈|趟)'
    return bool(re.search(rf'{chinese_number}\s*(?:个)?\s*{unit}', scan_text))

def ai_fact_validation_issue(text, focus):
    if not focus:
        return None
    route_context = focus.get('route')
    route_words = ('熟路', '同路', '同一路线', '这条路线', '同样的路线', '熟悉的路线')
    if not route_context and any(word in text for word in route_words):
        return '没有同路依据却写成了同一路线'

    kind = focus.get('kind')
    if kind == 'baseline' and not any(word in text for word in ('没有', '暂无', '找不到', '缺少', '基线', '参照')):
        return '遗漏了暂无合适历史比较记录的事实'
    if kind == 'baseline' and re.search(r'(?:与|和)暂无.{0,12}(?:相比|比较)', text):
        return '把“暂无比较记录”错误写成了一个比较对象'
    if kind in ('same_route_change', 'same_route_best') and not any(word in text for word in route_words):
        return '遗漏了程序选定的同路线比较口径'
    if kind == 'similar_distance_change' and not (
        ('相近' in text or '接近' in text) and ('距离' in text or '里程' in text)
    ):
        return '遗漏了距离相近的比较口径'
    if kind == 'recent_median_change' and not ('近期' in text and '中位' in text):
        return '遗漏了近期同类型记录中位数的比较口径'
    distance_record_kinds = ('longest_distance', 'monthly_longest_distance')
    if kind in distance_record_kinds and '最远' not in text:
        return '遗漏了程序选定的最远距离事实'
    if kind not in distance_record_kinds and '最远' in text:
        return '加入了未经提供的最远距离结论'
    if kind == 'monthly_longest_distance' and '本月' not in text:
        return '遗漏了程序选定的本月比较口径'
    if kind == 'same_route_best' and '最快' not in text:
        return '遗漏了程序选定的同路最快事实'
    if kind != 'same_route_best' and '最快' in text:
        return '加入了未经提供的最快记录结论'
    if kind not in ('longest_distance', 'monthly_longest_distance', 'same_route_best') and '刷新' in text:
        return '加入了未经提供的刷新纪录结论'

    contradiction_patterns = {
        ('pace', '更快'): r'(?:节奏|速度|配速).{0,6}(?:更慢|放缓|下降)',
        ('pace', '更慢'): r'(?:节奏|速度|配速).{0,6}(?:更快|加快|提高)',
        ('heart_rate', '更高'): r'心率.{0,6}(?:更低|下降|降低)',
        ('heart_rate', '更低'): r'心率.{0,6}(?:更高|上升|提高)',
        ('distance', '更高'): r'距离.{0,6}(?:更短|减少|下降)',
        ('distance', '更低'): r'距离.{0,6}(?:更长|增加|上升)'
    }
    for (field, direction), pattern in contradiction_patterns.items():
        if focus.get(field) == direction and re.search(pattern, text):
            return f'{field} 的描述与程序计算方向相反'
    return None

def activity_profile_validation_issue(text, facts):
    profile = (facts or {}).get('current_profile') or {}
    markers = [marker for marker in profile.get('required_markers', []) if marker]
    if markers and not any(marker in text for marker in markers):
        return '遗漏了本次运动的时间或距离画像'
    return None

def monthly_fact_validation_issue(text, facts):
    if not facts:
        return None
    profile = facts.get('month_profile') or {}
    sports = profile.get('sports') or []
    if sports and not any(sport in text for sport in sports):
        return '遗漏了本月真实运动类型'

    comparison = facts.get('comparison')
    if not comparison:
        if not any(word in text for word in ('基线', '起点', '首个', '第一份')):
            return '没有上月比较对象时应明确这是月度基线'
        return None

    basis = comparison.get('basis')
    if basis == '上月同期' and '上月同期' not in text:
        return '遗漏了上月同期这一比较口径'
    if basis == '上一个自然月' and not any(word in text for word in ('上一个自然月', '上月', '上个月')):
        return '遗漏了上一个自然月这一比较口径'
    comparison_words = ('次数', '出勤', '距离', '里程', '活跃天数', '运动天数', '用时', '时长')
    if not any(word in text for word in comparison_words):
        return '没有写出任何一项月度变化'
    spotlight = facts.get('comparison_spotlight') or []
    if spotlight and not any(
        word in text
        for item in spotlight
        for word in MONTHLY_COMPARISON_FIELDS[item['field']]['words']
    ):
        return '没有使用程序选出的月度重点变化'

    field_patterns = {
        'activity_count': ('次数|出勤', '增加|更多|更高|变多|频繁', '减少|更少|更低|变少'),
        'total_distance': ('距离|里程', '增加|更长|更高|变多', '减少|更短|更低|变少'),
        'active_days': ('活跃天数|运动天数|出勤', '增加|更多|更高|变多|铺开', '减少|更少|更低|变少|收缩'),
        'duration': ('用时|时长|运动时间', '增加|更长|更高|变多', '减少|更短|更低|变少')
    }
    for field, (subject, up, down) in field_patterns.items():
        direction = comparison.get(field)
        if direction == '更高' and re.search(rf'(?:{subject}).{{0,10}}(?:{down})', text):
            return f'{field} 的月度描述与程序计算方向相反'
        if direction == '更低' and re.search(rf'(?:{subject}).{{0,10}}(?:{up})', text):
            return f'{field} 的月度描述与程序计算方向相反'
    return None

def ai_comment_validation_issue(
    comment,
    activity_type=None,
    monthly=False,
    allowed_route_visit=None,
    focus=None,
    facts=None
):
    text = re.sub(r'\s+', ' ', str(comment or '')).strip()
    minimum, maximum = (45, 105) if monthly else (50, 100)
    if not minimum <= len(text) <= maximum:
        return f'长度应为 {minimum}～{maximum} 个字符，实际为 {len(text)}'
    public_voice = next((term for term in AI_PUBLIC_VOICE_FORBIDDEN_TERMS if term in text), None)
    if public_voice:
        return f'公开点评不应出现“{public_voice}”'
    forbidden = next((term for term in AI_FORBIDDEN_TERMS if term in text), None)
    if forbidden:
        return f'出现禁用词“{forbidden}”'
    if not monthly:
        style_forbidden = next((term for term in AI_ACTIVITY_FORBIDDEN_TERMS if term in text), None)
        if style_forbidden:
            return f'出现模板化或无依据表达“{style_forbidden}”'
    if not monthly and any(term in text for term in WRONG_SPORT_TERMS.get(activity_type, ())):
        return '提到了本次记录以外的运动类型'
    sentence_count = len(comment_sentences(text))
    if sentence_count not in (2, 3):
        return '必须写成两至三句完整、相互衔接的话'
    measurement_text = text
    if allowed_route_visit:
        measurement_text = re.sub(rf'第\s*{int(allowed_route_visit)}\s*次', '', measurement_text)
    profile = (facts or {}).get('current_profile') or {}
    for allowed_phrase in profile.get('allowed_measurements', []):
        measurement_text = measurement_text.replace(str(allowed_phrase), '')
    if re.search(r'\d', measurement_text) or contains_explicit_measurement(measurement_text):
        return '出现了未经允许的具体数字或数量'
    fact_issue = monthly_fact_validation_issue(text, facts) if monthly else ai_fact_validation_issue(text, focus)
    if fact_issue:
        return fact_issue
    if not monthly:
        profile_issue = activity_profile_validation_issue(text, facts)
        if profile_issue:
            return profile_issue
    return None

def validate_ai_comment(
    comment,
    activity_type=None,
    monthly=False,
    allowed_route_visit=None,
    focus=None,
    facts=None
):
    text = re.sub(r'\s+', ' ', str(comment or '')).strip()
    issue = ai_comment_validation_issue(
        text,
        activity_type=activity_type,
        monthly=monthly,
        allowed_route_visit=allowed_route_visit,
        focus=focus,
        facts=facts
    )
    return None if issue else text

def focus_result_text(focus):
    pace, heart_rate = focus.get('pace'), focus.get('heart_rate')
    if pace == '更快' and heart_rate == '更低':
        return '节奏更快，平均心率也更低'
    if pace == '更快':
        return '节奏更快，平均心率也更高' if heart_rate == '更高' else '节奏更快，平均心率变化不大'
    if pace == '更慢' and heart_rate == '更低':
        return '节奏放缓，平均心率也更低'
    if pace == '更慢':
        return '节奏稍慢，平均心率也更高' if heart_rate == '更高' else '节奏稍慢，平均心率变化不大'
    if heart_rate == '更低':
        return '节奏接近，平均心率更低'
    if heart_rate == '更高':
        return '节奏接近，平均心率更高'
    if focus.get('distance') == '更高':
        return '节奏与平均心率接近，但距离更长'
    if focus.get('distance') == '更低':
        return '节奏与平均心率接近，但距离更短'
    return '整体节奏与平均心率都比较接近'

def fallback_activity_comment(facts, seed='', recent_comments=None):
    sport = facts['sport']
    focus = facts.get('focus') or {}
    profile = facts.get('current_profile') or {}
    duration = profile.get('duration') or '一段时间'
    distance = profile.get('distance')
    profile_details = [value for value in (profile.get('pace'), profile.get('heart_rate'), profile.get('elevation')) if value]
    detail = profile_details[0] if profile_details else '本次先从用时与距离留下清楚轮廓'
    distance_clause = f"，属于{distance}" if distance else ''
    portraits = [
        f"{duration}的{sport}{distance_clause}，{detail}。",
        f"这一笔{sport}持续{duration}{distance_clause}，{detail}。",
        f"从{duration}的运动量切入，这次{sport}{distance_clause}，{detail}。"
    ]

    kind = focus.get('kind')
    if kind == 'baseline':
        comparisons = [
            "暂时没有可靠的同类型旧记录可比，这一笔先成为后续回看的基线。",
            "眼下还缺少合适的历史对象，本次记录先把月度与同类型比较的起点留好。",
            "没有足够贴近的旧记录时不勉强下结论，这次先作为新的比较基线。"
        ]
    elif kind == 'longest_distance':
        comparisons = [
            "放进此前全部同类型记录里，这次已经刷新最远距离；本次最鲜明的部分落在距离。",
            "此前同类型最远距离被重新写过，这一笔的重点明确落在长距离完成。",
            "与全部同类型旧记录相比，本次达到新的最远距离；速度之外，距离更值得记录。"
        ]
    elif kind == 'monthly_longest_distance':
        comparisons = [
            "放进本月同类型记录里，这次刷新了最远距离；本次重点明确落在距离。",
            "本月此前的同类型最远距离被重新写过，这一笔的长距离轮廓最鲜明。",
            "和本月已有同类型记录相比，本次达到新的最远距离；距离是主要落点。"
        ]
    else:
        result = focus_result_text(focus)
        route_context = focus.get('route') or {}
        coach_key = (facts.get('coach_angle') or {}).get('key')
        coach_endings = {
            'route_sharpness': ('熟悉路线里的这次更利落。', '同路变化让这一笔更有辨识度。'),
            'sharper_at_lower_hr': ('节奏与平均心率的组合更利落。', '这组变化比单看速度更有辨识度。'),
            'restrained_rhythm': ('整体更接近克制完成的一笔记录。', '这一趟呈现出更收敛的节奏。'),
            'speed_emphasis': ('速度感是本次最鲜明的部分。', '这一笔的重点明显偏向速度端。'),
            'pace_hr_contrast': ('节奏与平均心率的反差最值得记录。', '这组反差构成了本次的主要特点。'),
            'distance_emphasis': ('本次重点落在距离完成度。', '耐力感比速度感更突出。'),
            'everyday_pattern': ('整体落在近期常见范围。', '这是一笔接近日常区间的记录。'),
            'comparison': ('最明显的变化已经落在节奏与平均心率上。', '这一笔的特点集中在这组相对变化。')
        }.get(coach_key, ('最明显的数据关系已经写清。', '这一笔的主要特点落在这组变化上。'))
        if route_context:
            visit_count = route_context.get('visit_count')
            route_lead = f"第{visit_count}次经过这条熟路" if visit_count else '再次经过同一路线'
            basis = '此前同路线最快的一次' if kind == 'same_route_best' else '同路上一次'
            comparison_leads = [
                f"{route_lead}，与{basis}相比，{result}",
                f"熟悉路线给出了可靠参照，本次和{basis}相比，{result}",
                f"回到同一路线比较，这一笔相对{basis}呈现出{result}"
            ]
        else:
            basis = focus.get('basis', '可靠的同类型旧记录')
            comparison_leads = [
                f"与{basis}相比，{result}",
                f"把{basis}放在一旁对照，本次呈现出{result}",
                f"回看{basis}，这一笔最明显的变化是{result}"
            ]
        comparisons = [f"{lead}；{ending}" for lead in comparison_leads for ending in coach_endings]

    candidates = [f"{portrait}{comparison}" for portrait in portraits for comparison in comparisons]
    candidates = [candidate for candidate in candidates if 50 <= len(candidate) <= 100] or candidates
    digest = hashlib.sha256(f"ai-fallback-v7:{seed}".encode('utf-8')).hexdigest()
    offset = int(digest[:8], 16) % len(candidates)
    ordered = candidates[offset:] + candidates[:offset]
    previous_comments = [comment for comment in (recent_comments or []) if comment]
    if not previous_comments:
        return ordered[0]
    unused = [candidate for candidate in ordered if candidate not in previous_comments]
    candidate_pool = unused or ordered
    recent_comments = previous_comments[-8:]
    return min(
        candidate_pool,
        key=lambda candidate: max(comment_similarity(candidate, recent) for recent in recent_comments)
    )

def parse_ai_candidates(response):
    data = parse_ai_json(response)
    comments = data.get('comments')
    if isinstance(comments, list):
        return [str(comment).strip() for comment in comments if str(comment).strip()]
    comment = data.get('comment')
    return [str(comment).strip()] if comment else []

def request_activity_ai_comments(prompt, activity_type, allowed_route_visit, recent_comments, focus, facts):
    if not CF_ACCOUNT_ID or not CF_AI_TOKEN:
        return None
    url = f"https://api.cloudflare.com/client/v4/accounts/{CF_ACCOUNT_ID}/ai/run/@cf/meta/llama-4-scout-17b-16e-instruct"
    headers = {"Authorization": f"Bearer {CF_AI_TOKEN}"}
    correction = ''
    for attempt in range(2):
        payload = {
            'messages': [{'role': 'user', 'content': prompt + correction}],
            'temperature': 0.65 if attempt == 0 else 0.45,
            'max_tokens': 800
        }
        try:
            response = requests.post(url, headers=headers, json=payload, timeout=45)
            if response.status_code == 200:
                candidates = parse_ai_candidates(response)
                valid, issues = [], []
                recent_window = recent_comments[-8:]
                previous_openings = [
                    sentences[0]
                    for previous in recent_comments
                    for sentences in [comment_sentences(previous)]
                    if sentences
                ]
                previous_endings = [
                    sentences[-1]
                    for previous in recent_comments
                    for sentences in [comment_sentences(previous)]
                    if sentences
                ]
                recent_openings = previous_openings[-8:]
                recent_endings = previous_endings[-8:]
                for comment in candidates:
                    issue = ai_comment_validation_issue(
                        comment,
                        activity_type=activity_type,
                        allowed_route_visit=allowed_route_visit,
                        focus=focus,
                        facts=facts
                    )
                    if issue:
                        issues.append(issue)
                        continue
                    similarity = max(
                        (comment_similarity(comment, recent) for recent in recent_window),
                        default=0
                    )
                    candidate_sentences = comment_sentences(comment)
                    opening, ending = candidate_sentences[0], candidate_sentences[-1]
                    opening_similarity = max(
                        (comment_similarity(opening, recent) for recent in recent_openings),
                        default=0
                    )
                    ending_similarity = max(
                        (comment_similarity(ending, recent) for recent in recent_endings),
                        default=0
                    )
                    if (
                        similarity < 0.86
                        and opening_similarity < 0.9
                        and ending_similarity < 0.88
                        and comment not in recent_comments
                        and opening not in previous_openings
                        and ending not in previous_endings
                    ):
                        valid.append((max(similarity, opening_similarity, ending_similarity), comment))
                    else:
                        issues.append('整段、开头或收束句与已有点评过于相似')
                if valid:
                    return min(valid, key=lambda item: item[0])[1]
                correction = (
                    "\n这批候选未通过校验：" + '；'.join(sorted(set(issues))) +
                    "。请重新给出三条，继续严格使用同一组事实，但明显改变叙事顺序、开头和收束句。"
                )
        except Exception as error:
            print(f"⚠️ AI 点评生成失败: {error}")
            correction = "\n请求未得到有效候选。请严格按要求返回三条完整点评。"
    return None

def generate_ai_comment(activity, older_history, recent_comments=None):
    facts = build_activity_facts(activity, older_history)
    recent_comments = [comment for comment in (recent_comments or []) if comment]
    focus = facts.get('focus') or {}
    route_context = focus.get('route') or {}
    allowed_route_visit = route_context.get('visit_count')
    prompt = f"""
你是个人运动博客的教练式事实编辑。点评会公开展示给访问者，不是在私下对运动者讲话。程序已经准备好唯一允许使用的事实与语义方向：
{json.dumps(facts, ensure_ascii=False, indent=2)}

最近使用过的点评如下，仅用于避开重复表达，不能当作本次事实：
{json.dumps(recent_comments[-5:], ensure_ascii=False, indent=2)}

请写三条明显不同的候选点评，每条两至三句话、五十五至九十五个汉字。三条依次采用 candidate_modes 中的三种叙事方式，但不复述模式说明。
数据卡已经展示精确公里数、用时、配速或均速、平均心率和千卡，点评不得逐项复述这些数字。必须从 current_profile.required_markers 中自然使用至少一个本次画像，并结合 focus 中最可靠的历史比较；coach_angle 只是允许落脚的语义方向，绝不是可照抄的固定句子。没有可靠比较时，只写本次画像并将记录留作基线。
全文使用公开旁观视角，只能以“本次、这次、这一趟、这笔记录、同一路线、近期记录”等为叙述主体，绝不能出现“你、你的、您、自己、本人、博主”。focus.route 不存在时绝不能声称同路；focus.route.visit_count 存在时可以省略，也可以严格使用“第 N 次”，不得更改数字。除 current_profile.allowed_measurements 和允许的 visit_count 外，不出现任何数字或数量。
教练式判断必须来自当前画像和比较方向，可以主观但要克制；不得猜天气、风景、环境、心情、身体感受、主观意图、技巧、策略、训练效果或健康结论，不给建议，不写“继续保持、加油、进步、退步、突破、挑战、极限、个人最佳、里程碑”等评价，不使用“意味着、表明、说明、体现出”等模板连接词。三条不得采用相同开头、相同句序或相同收束句，也不要照搬最近点评中的表达。
只返回 JSON：{{"comments":["...","...","..."]}}
"""
    comment = request_activity_ai_comments(
        prompt,
        activity_type=activity.get('type'),
        allowed_route_visit=allowed_route_visit,
        recent_comments=recent_comments,
        focus=focus,
        facts=facts
    )
    if comment:
        return comment, True
    return (
        fallback_activity_comment(
            facts,
            seed=activity.get('source_id') or activity.get('run_id'),
            recent_comments=recent_comments
        ),
        False
    )

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

MONTHLY_NARRATIVE_MODES = (
    {'key': 'portrait_first', 'instruction': '先写本月运动构成或主要时段，再挑最重要的一组月度变化，最后简短收束'},
    {'key': 'change_first', 'instruction': '先写与上月可靠口径下最有辨识度的变化，再补本月运动画像'},
    {'key': 'rhythm_first', 'instruction': '先从出勤分布或连续记录切入，再连接运动构成与月度主变化'},
    {'key': 'sport_mix_first', 'instruction': '先从主运动和补充运动的关系切入，再写月度变化与整体观察'},
    {'key': 'observation_first', 'instruction': '先给一句有事实依据的月度观察，再用运动构成和比较口径把判断落稳'}
)

MONTHLY_COMPARISON_FIELDS = {
    'activity_count': {'label': '运动次数', 'stats_key': 'total_count', 'words': ('次数', '出勤')},
    'total_distance': {'label': '总里程', 'stats_key': 'total_distance', 'words': ('距离', '里程')},
    'active_days': {'label': '活跃天数', 'stats_key': 'active_days_count', 'words': ('活跃天数', '运动天数', '出勤')},
    'duration': {'label': '总用时', 'stats_key': 'total_duration_minutes', 'words': ('用时', '时长', '运动时间')}
}

def select_monthly_spotlight(stats, previous_stats, comparison):
    """只把变化最明显的一到两项交给月报，避免 AI 把四项统计逐条播报。"""
    if not previous_stats or not comparison:
        return []
    ranked = []
    for field, config in MONTHLY_COMPARISON_FIELDS.items():
        direction = comparison.get(field)
        if direction in (None, '未知', '接近'):
            continue
        current = float(stats.get(config['stats_key']) or 0)
        previous = float(previous_stats.get(config['stats_key']) or 0)
        relative_change = abs(current - previous) / max(abs(previous), 1)
        ranked.append({
            'field': field,
            'label': config['label'],
            'direction': direction,
            '_strength': relative_change
        })
    ranked.sort(key=lambda item: (-item['_strength'], item['field']))
    return [
        {key: value for key, value in item.items() if key != '_strength'}
        for item in ranked[:2]
    ]

def build_monthly_story(comparison, spotlight=None):
    if not comparison:
        return {'key': 'baseline', 'emphasis': '首份可比较月报，只建立月度基线'}
    count = comparison.get('activity_count')
    distance = comparison.get('total_distance')
    active_days = comparison.get('active_days')
    duration = comparison.get('duration')
    directions = (count, distance, active_days, duration)
    if count == '更低' and distance == '更高':
        return {'key': 'fewer_longer', 'emphasis': '运动次数减少但总距离更长，重点落在单次距离分量'}
    if count == '更高' and distance == '更低':
        return {'key': 'frequent_shorter', 'emphasis': '运动次数增加但总距离更短，重点落在更频繁的短程活动'}
    if all(direction == '接近' for direction in directions):
        return {'key': 'similar_month', 'emphasis': '主要月度指标都接近，重点落在运动结构延续'}
    strongest_field = (spotlight or [{}])[0].get('field')
    if strongest_field in ('total_distance', 'duration'):
        if distance == '更高' and duration == '更高':
            return {'key': 'volume_expanded', 'emphasis': '总距离与总用时同时增加，重点落在月度运动分量扩大'}
        if distance == '更低' and duration == '更低':
            return {'key': 'volume_contracted', 'emphasis': '总距离与总用时同时减少，只描述月度分量收缩'}
    if count == '更高' and active_days == '更高':
        return {'key': 'attendance_expanded', 'emphasis': '运动次数与活跃天数同时增加，重点落在出勤铺得更开'}
    if count == '更低' and active_days == '更低':
        return {'key': 'attendance_contracted', 'emphasis': '运动次数与活跃天数同时减少，重点落在更集中的月度节奏'}
    if distance == '更高' and duration == '更高':
        return {'key': 'volume_expanded', 'emphasis': '总距离与总用时同时增加，重点落在月度运动分量扩大'}
    if distance == '更低' and duration == '更低':
        return {'key': 'volume_contracted', 'emphasis': '总距离与总用时同时减少，只描述月度分量收缩'}
    return {'key': 'mixed_change', 'emphasis': '只挑一至两项最有辨识度的变化，不逐项播报全部指标'}

def select_monthly_narrative_modes(month_str, story):
    special = []
    if story.get('key') == 'baseline':
        special.append({'key': 'baseline_first', 'instruction': '先说明这是首份可靠月度基线，再写运动构成与主要时段'})
    elif story.get('key') in ('fewer_longer', 'frequent_shorter'):
        special.append({'key': 'contrast_first', 'instruction': '从次数与总距离的反向变化切入，再解释本月运动画像'})
    digest = hashlib.sha256(f"monthly-narrative-v4:{month_str}".encode('utf-8')).hexdigest()
    offset = int(digest[:8], 16) % len(MONTHLY_NARRATIVE_MODES)
    rotated = list(MONTHLY_NARRATIVE_MODES[offset:] + MONTHLY_NARRATIVE_MODES[:offset])
    modes = special + rotated
    unique = []
    for mode in modes:
        if mode['key'] not in {item['key'] for item in unique}:
            unique.append(mode)
        if len(unique) == 3:
            break
    return unique

def build_monthly_facts(month_str, stats, previous_stats, comparison_basis):
    comparison = build_monthly_comparison(stats, previous_stats, comparison_basis)
    prompt_comparison = dict(comparison) if comparison else None
    if prompt_comparison and prompt_comparison['basis'].startswith('上月同期'):
        prompt_comparison['basis'] = '上月同期'
    sports_ranked = sorted(stats['sports_count'].items(), key=lambda item: (-item[1], item[0]))
    sports = [name for name, _ in sports_ranked]
    primary_count = sports_ranked[0][1] if sports_ranked else 0
    primary_sports = [name for name, count in sports_ranked if count == primary_count]
    supporting_sports = [name for name, count in sports_ranked if count < primary_count]
    attendance_shape = None
    if stats.get('max_streak_days', 0) >= 3:
        attendance_shape = '本月出现连续出勤'
    elif stats.get('active_days_count', 0) >= max(1, round(stats.get('total_count', 0) * 0.8)):
        attendance_shape = '运动记录分布在较多独立日期'
    spotlight = select_monthly_spotlight(stats, previous_stats, prompt_comparison)
    story = build_monthly_story(prompt_comparison, spotlight)
    facts = {
        'month_profile': {
            'sports': sports,
            'primary_sports': primary_sports,
            'supporting_sports': supporting_sports,
            'favorite_time': stats.get('favorite_time') if stats.get('favorite_time') != '未知' else None,
            'attendance_shape': attendance_shape
        },
        'comparison': prompt_comparison,
        'comparison_spotlight': spotlight,
        'monthly_story': story,
        'candidate_modes': select_monthly_narrative_modes(month_str, story)
    }
    return facts

def monthly_spotlight_sentence(facts):
    spotlight = facts.get('comparison_spotlight') or []
    if not spotlight:
        return '本月只保留有可靠依据的变化作为观察。'
    direction_words = {
        ('activity_count', '更高'): '更多', ('activity_count', '更低'): '更少',
        ('total_distance', '更高'): '更长', ('total_distance', '更低'): '更短',
        ('active_days', '更高'): '更多', ('active_days', '更低'): '更少',
        ('duration', '更高'): '更长', ('duration', '更低'): '更短'
    }
    phrases = [
        f"{item['label']}{direction_words.get((item['field'], item['direction']), item['direction'])}"
        for item in spotlight
    ]
    basis = '上月同期' if (facts.get('comparison') or {}).get('basis') == '上月同期' else '上月'
    if len(phrases) == 1:
        return f"与{basis}相比，{phrases[0]}，这是本月最显眼的变化。"
    connector = '，同时' if spotlight[0]['direction'] == spotlight[1]['direction'] else '，而'
    return f"与{basis}相比，{phrases[0]}{connector}{phrases[1]}，这组变化最有辨识度。"

def monthly_story_sentence(story, facts):
    return {
        'baseline': '这是目前第一份可靠月报，先作为后续自然月比较的基线。',
        'fewer_longer': '运动次数比上月更少，总里程却更长，单次活动的距离分量更突出。',
        'frequent_shorter': '运动次数比上月更多，总里程却更短，月内活动更偏向频繁的短程记录。',
        'attendance_expanded': '与上月相比，运动次数和活跃天数都增加，出勤在月内铺得更开。',
        'attendance_contracted': '与上月相比，运动次数和活跃天数都减少，运动记录集中在更少的日期里。',
        'volume_expanded': '与上月相比，总里程和总用时都增加，本月留下了更充足的运动分量。',
        'volume_contracted': '与上月相比，总里程和总用时都减少，本月的运动分量相对收缩。',
        'similar_month': '与上月相比，主要指标都比较接近，运动构成延续了此前的月度轮廓。',
        'mixed_change': monthly_spotlight_sentence(facts)
    }.get(story.get('key'), monthly_spotlight_sentence(facts))

def fallback_monthly_comment(month_str, facts, recent_comments=None):
    profile = facts.get('month_profile') or {}
    primary = '、'.join(profile.get('primary_sports') or profile.get('sports') or ['运动'])
    supporting = '、'.join(profile.get('supporting_sports') or [])
    favorite_time = profile.get('favorite_time')
    portraits = [
        f"本月以{primary}为主" + (f"，{supporting}作为补充" if supporting else '') + (f"，记录多出现在{favorite_time}。" if favorite_time else '。'),
        f"{primary}构成本月主要运动内容" + (f"，同时穿插{supporting}" if supporting else '') + (f"，{favorite_time}是最常出现的时段。" if favorite_time else '。'),
        f"从运动构成看，本月重心落在{primary}" + (f"，另有{supporting}补足月内记录。" if supporting else '。')
    ]
    story = facts.get('monthly_story') or {'key': 'baseline'}
    comparison = facts.get('comparison')
    story_text = monthly_story_sentence(story, facts)
    if comparison and comparison.get('basis') == '上月同期':
        story_text = story_text.replace('与上月相比', '与上月同期相比').replace('比上月', '比上月同期')
    candidates = [f"{portrait}{story_text}" for portrait in portraits]
    candidates = [candidate for candidate in candidates if 45 <= len(candidate) <= 105] or candidates
    digest = hashlib.sha256(f"monthly-fallback-v4:{month_str}".encode('utf-8')).hexdigest()
    offset = int(digest[:8], 16) % len(candidates)
    ordered = candidates[offset:] + candidates[:offset]
    recent = [comment for comment in (recent_comments or []) if comment][-6:]
    if not recent:
        return ordered[0]
    return min(ordered, key=lambda candidate: max(comment_similarity(candidate, item) for item in recent))

def request_monthly_ai_comments(prompt, facts, recent_comments):
    if not CF_ACCOUNT_ID or not CF_AI_TOKEN:
        return None
    url = f"https://api.cloudflare.com/client/v4/accounts/{CF_ACCOUNT_ID}/ai/run/@cf/meta/llama-4-scout-17b-16e-instruct"
    headers = {"Authorization": f"Bearer {CF_AI_TOKEN}"}
    correction = ''
    for attempt in range(2):
        payload = {
            'messages': [{'role': 'user', 'content': prompt + correction}],
            'temperature': 0.65 if attempt == 0 else 0.4,
            'max_tokens': 800
        }
        try:
            response = requests.post(url, headers=headers, json=payload, timeout=45)
            if response.status_code == 200:
                candidates = parse_ai_candidates(response)
                valid, issues = [], []
                recent_window = [comment for comment in recent_comments if comment][-6:]
                recent_openings = [comment_sentences(item)[0] for item in recent_window if comment_sentences(item)]
                recent_endings = [comment_sentences(item)[-1] for item in recent_window if comment_sentences(item)]
                for comment in candidates:
                    issue = ai_comment_validation_issue(comment, monthly=True, facts=facts)
                    if issue:
                        issues.append(issue)
                        continue
                    sentences = comment_sentences(comment)
                    similarity = max((comment_similarity(comment, item) for item in recent_window), default=0)
                    opening_similarity = max((comment_similarity(sentences[0], item) for item in recent_openings), default=0)
                    ending_similarity = max((comment_similarity(sentences[-1], item) for item in recent_endings), default=0)
                    if similarity < 0.86 and opening_similarity < 0.9 and ending_similarity < 0.88:
                        valid.append((max(similarity, opening_similarity, ending_similarity), comment))
                    else:
                        issues.append('整段、开头或收束句与已有月报过于相似')
                if valid:
                    return min(valid, key=lambda item: item[0])[1]
                correction = (
                    "\n这批候选未通过校验：" + '；'.join(sorted(set(issues))) +
                    "。请继续使用同一组事实，重新改变切入角度、句序和收束方式。"
                )
        except Exception as error:
            print(f"⚠️ AI 月度点评生成失败: {error}")
            correction = "\n请求未得到有效候选。请严格按要求返回三条完整月度点评。"
    return None

def generate_monthly_ai_report(month_str, stats, previous_stats, comparison_basis, recent_comments=None):
    facts = build_monthly_facts(month_str, stats, previous_stats, comparison_basis)
    recent_comments = [comment for comment in (recent_comments or []) if comment]
    prompt = f"""
你是个人运动博客的月度教练式编辑。月报会公开展示给访问者，程序已经完成全部计算，以下是唯一可使用的事实：
{json.dumps(facts, ensure_ascii=False, indent=2)}

最近使用过的月度点评如下，只用于避开重复表达，不能当作本月事实：
{json.dumps(recent_comments[-5:], ensure_ascii=False, indent=2)}

请写三条明显不同的候选月度点评，每条两至三句话、五十至九十五个汉字，三条依次采用 candidate_modes 中的三种叙事方式，但不复述模式说明。
先形成“这个月是什么样”的运动画像，再优先使用 comparison_spotlight 中已按变化幅度选出的一至两项，不要把 comparison 里的运动次数、活跃天数、距离和用时逐项念完。comparison 存在时必须写清“上月同期”或“上月”的比较口径；不存在时明确这是月度基线。monthly_story 只提供语义方向，不是可以照抄的固定句子。
全文使用公开旁观视角，不得出现“你、你的、您、自己、本人、博主”，不复述具体次数、公里数、分钟数、心率或千卡。不得猜天气、环境、心情、身体情况、训练效果或健康结论，不做医学判断，不给训练处方，不写“继续保持、加油、进步、退步、突破、挑战”等评价。三条必须明显改变开头、句序和收束方式，也不要照搬近期月报。
只返回 JSON：{{"comments":["...","...","..."]}}
"""
    comment = request_monthly_ai_comments(prompt, facts, recent_comments)
    if comment:
        return comment, True, facts
    return fallback_monthly_comment(month_str, facts, recent_comments), False, facts

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
    monthly_recent_comments = []
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
        monthly_facts = build_monthly_facts(month_key, stats, previous_stats, comparison_basis)
        old_entry = insights.get(month_key, {})
        stats_changed = old_entry.get('stats') != stats
        comparison_basis_changed = old_entry.get('comparison_basis') != comparison_basis
        needs_ai = (
            not old_entry.get('ai_comment')
            or old_entry.get('ai_comment_version') != MONTHLY_AI_COMMENT_VERSION
            or not validate_ai_comment(old_entry.get('ai_comment'), monthly=True, facts=monthly_facts)
            or stats_changed
            or comparison_basis_changed
            or previous_key in stats_changed_months
        )

        entry = dict(old_entry)
        entry.update({
            'month_str': month_key,
            'stats': stats,
            # 最新月份使用上月同期；月份结束后会自动转为完整自然月口径并重写一次。
            'comparison_basis': comparison_basis
        })
        if needs_ai:
            if CF_ACCOUNT_ID and CF_AI_TOKEN:
                print(f"📈 {month_key} 采用可信事实口径重写月报...")
                comment, generated_by_ai, _ = generate_monthly_ai_report(
                    month_key,
                    stats,
                    previous_stats,
                    comparison_basis,
                    monthly_recent_comments
                )
                entry['ai_comment'] = comment
                if generated_by_ai:
                    entry['ai_comment_version'] = MONTHLY_AI_COMMENT_VERSION
                else:
                    # 兜底不冒充已完成，下次同步继续请求 AI。
                    entry.pop('ai_comment_version', None)
                time.sleep(0.5)
            elif (
                not old_entry.get('ai_comment')
                or stats_changed
                or comparison_basis_changed
                or previous_key in stats_changed_months
            ):
                # 无云端凭证时只为缺失或已过期的统计补安全兜底，避免无故覆盖已有月报。
                entry['ai_comment'] = fallback_monthly_comment(month_key, monthly_facts, monthly_recent_comments)
                entry.pop('ai_comment_version', None)

        if entry.get('ai_comment'):
            monthly_recent_comments.append(entry['ai_comment'])

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
        recent_comments = []
        for i, item in enumerate(local_data):
            older_history = local_data[i+1:]
            facts = build_activity_facts(item, older_history)
            focus = facts.get('focus') or {}
            allowed_route_visit = (focus.get('route') or {}).get('visit_count')
            if (
                item.get('ai_comment_version') == AI_COMMENT_VERSION
                and validate_ai_comment(
                    item.get('ai_comment'),
                    activity_type=item.get('type'),
                    allowed_route_visit=allowed_route_visit,
                    focus=focus,
                    facts=facts
                )
            ):
                recent_comments.append(item['ai_comment'])
                continue
            safe_time = item.get('start_date_local', '')
            print(f"🛠️ 记录 [{safe_time}] 正在采用可信事实口径重写点评...")
            comment, generated_by_ai = generate_ai_comment(item, older_history, recent_comments)
            item['ai_comment'] = comment
            if generated_by_ai:
                item['ai_comment_version'] = AI_COMMENT_VERSION
            else:
                # 兜底只负责保证页面有内容，不冒充已完成；下一次同步继续请求 AI。
                item.pop('ai_comment_version', None)
            recent_comments.append(item['ai_comment'])
            needs_save = True
            print("   ↳ AI 点评已通过校验" if generated_by_ai else "   ↳ 暂用可信兜底，下次同步继续重试 AI")
            time.sleep(0.5)
    else:
        pending_count = 0
        recent_comments = []
        for i, item in enumerate(local_data):
            facts = build_activity_facts(item, local_data[i+1:])
            focus = facts.get('focus') or {}
            allowed_route_visit = (focus.get('route') or {}).get('visit_count')
            if (
                item.get('ai_comment_version') == AI_COMMENT_VERSION
                and validate_ai_comment(
                    item.get('ai_comment'),
                    activity_type=item.get('type'),
                    allowed_route_visit=allowed_route_visit,
                    focus=focus,
                    facts=facts
                )
            ):
                recent_comments.append(item['ai_comment'])
                continue
            # 无 AI 凭证时保留已有点评；仅为真正没有点评的新记录补安全兜底。
            if not item.get('ai_comment'):
                fallback = fallback_activity_comment(
                    facts,
                    seed=item.get('source_id') or item.get('run_id'),
                    recent_comments=recent_comments
                )
                item['ai_comment'] = fallback
                needs_save = True
            recent_comments.append(item['ai_comment'])
            pending_count += 1
        if pending_count:
            print(f"🛡️ 有 {pending_count} 条点评等待线上 AI 升级；本地保留现有内容。")
            
    if needs_save:
        with open(FILE_NAME, 'w', encoding='utf-8') as f:
            json.dump(local_data, f, ensure_ascii=False, indent=2)
        print("✅ 路线分组、趣味标题、杭州距离与点评数据已更新！")
    else:
        print("💤 所有记录均已具备趣味标题、杭州距离与 AI 点评，跳过更新。")

    print("📊 正在同步月度洞察报告...")
    update_monthly_insights(local_data)
    print("✨ 全部流程执行完毕！")
