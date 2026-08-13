import json
import os
import hashlib
import math
import re
from datetime import datetime

from monthly_coach import update_monthly_insights as update_monthly_coach_insights

# ==========================================
# 1. 🔑 配置区：DeepSeek 只负责月中与月末教练月报
# ==========================================
DEEPSEEK_API_KEY = os.getenv('DEEPSEEK_API_KEY')

if not DEEPSEEK_API_KEY:
    print("ℹ️ 未提供 DEEPSEEK_API_KEY：运动数据照常处理，月报保留现有内容。")

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

# 已退出当前数据契约的旧字段；同步脚本会自动清理，兼容尚未升级的客户端。
OBSOLETE_ACTIVITY_FIELDS = (
    'ai_title',
    'ai_comment',
    'ai_comment_version',
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

    if needs_save:
        with open(FILE_NAME, 'w', encoding='utf-8') as f:
            json.dump(local_data, f, ensure_ascii=False, indent=2)
        print("✅ 路线分组、趣味标题与杭州距离数据已更新！")
    else:
        print("💤 所有记录均已具备趣味标题与杭州距离，跳过更新。")

    print("📊 正在同步月度教练报告...")
    update_monthly_coach_insights(
        local_data,
        MONTHLY_FILE,
        api_key=DEEPSEEK_API_KEY
    )
    print("✨ 全部流程执行完毕！")
