import json
import os
import hashlib
import re
from datetime import datetime


from jingzhe.activity_store import (
    RAW_ACTIVITY_FILE,
    load_processed_activities,
    load_raw_activity_store,
    materialize_activity_store,
)
from jingzhe.exercise_contract import (
    ACTIVITY_DISTANCE_GROUPS,
    ACTIVITY_DISTANCE_VERBS,
    ACTIVITY_TYPE_CN,
    DISPLAY_RUN_WALK_TYPES,
    FOOD_EQUIVALENTS,
    RIDE_TYPES,
    SPORTS,
)
from jingzhe.monthly_reports import update_monthly_insights as update_monthly_coach_insights
from jingzhe.public_routes import (
    NOMINATIM_BASE_URL,
    NOMINATIM_REFERER,
    NOMINATIM_USER_AGENT,
    PUBLIC_ROUTE_TITLE_VERSION,
    choose_public_route_title,
    clean_geo_name,
    decode_polyline,
    generate_public_route_title,
    haversine_meters,
    is_scenic_place,
    most_common_name,
    parse_nominatim_observation,
    reverse_route_observations,
    sample_route,
    wait_for_nominatim_slot,
)

# ==========================================
# 1. 🔑 配置区：DeepSeek 只负责月中与月末教练月报
# ==========================================
DEEPSEEK_API_KEY = os.getenv('DEEPSEEK_API_KEY')
if not DEEPSEEK_API_KEY:
    print("ℹ️ 未提供 DEEPSEEK_API_KEY：运动数据照常处理，月报保留现有内容。")

# ==========================================
# 2. 📁 路径绑定
# ==========================================
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TARGET_DIR = os.path.join(PROJECT_ROOT, 'assets')
FILE_NAME = os.path.join(TARGET_DIR, 'activities.json')
RAW_FILE_NAME = str(RAW_ACTIVITY_FILE)
MONTHLY_FILE = os.path.join(TARGET_DIR, 'monthly_insights.json')
LANDMARK_ROUTE_FILE = os.path.join(TARGET_DIR, 'landmark_route_library.json')
PUBLISH_START_DATE = datetime(2026, 1, 1)

# 趣味能量换算、运动中文名和距离分组统一来自 data/jingzhe/exercise.json。
MAX_FOOD_RELATIVE_ERROR = 0.12
FOOD_TITLE_VERSION = 6

def load_landmark_route_library():
    """地标几何、名称和选择规则只从同一份 JSON 加载。"""
    with open(LANDMARK_ROUTE_FILE, 'r', encoding='utf-8') as route_file:
        return json.load(route_file)


LANDMARK_ROUTE_LIBRARY = load_landmark_route_library()
DISTANCE_EQUIVALENTS = [
    {
        'key': item['key'],
        'name': item['name'],
        'unit': item['unit'],
        'km': item['reference_km'],
        'min_km': item['min_km'],
        'max_km': item['max_km'],
        'max_count': item['max_count'],
        'preferred_groups': tuple(item['preferred_groups'])
    }
    for item in LANDMARK_ROUTE_LIBRARY
    if item.get('kind') == 'distance'
]
ELEVATION_EQUIVALENTS = [
    {
        'key': item['key'],
        'name': item['name'],
        'unit': item['unit'],
        'meters': item['reference_meters'],
        'max_count': item['max_count']
    }
    for item in LANDMARK_ROUTE_LIBRARY
    if item.get('kind') == 'elevation'
]

ELEVATION_ACTIVITY_TYPES = {'StairStepper'}
DISTANCE_TITLE_VERSION = 6
DEFAULT_ACTIVITY_NAME_PATTERN = re.compile(
    r'^(晨间|上午|午间|午后|下午|傍晚|晚间|夜间|凌晨|清晨|Morning|Afternoon|Evening|Night|Lunch)'
    r'.*(跑步|骑行|行走|徒步|游泳|运动|爬楼梯|Run|Ride|Walk|Swim|Hike|Treadmill|VirtualRun|StairStepper)$'
)
DEFAULT_ACTIVITY_NAMES = {'Run', 'Ride', 'Walk', 'StairStepper', 'Workout', ''}


def validate_landmark_route_library(activities=None):
    route_library = load_landmark_route_library()
    route_keys = [item.get('key') for item in route_library]
    actual_keys = set(route_keys)
    duplicate_keys = sorted({key for key in route_keys if route_keys.count(key) > 1})
    invalid_routes = sorted(
        item.get('key', '<unknown>')
        for item in route_library
        if not item.get('geometry') or item.get('path_type') not in {'line', 'loop'}
    )
    invalid_rules = sorted(
        item.get('key', '<unknown>')
        for item in route_library
        if (
            item.get('kind') == 'distance' and (
                not isinstance(item.get('reference_km'), (int, float)) or
                not isinstance(item.get('min_km'), (int, float)) or
                not isinstance(item.get('max_km'), (int, float)) or
                item.get('min_km', 0) > item.get('max_km', 0) or
                not item.get('preferred_groups')
            )
        ) or (
            item.get('kind') == 'elevation' and
            not isinstance(item.get('reference_meters'), (int, float))
        ) or item.get('kind') not in {'distance', 'elevation'}
    )

    activity_keys = {
        item.get('distance_title_key') for item in (activities or [])
        if item.get('distance_title_key')
    }
    missing_activity_keys = sorted(activity_keys - actual_keys)

    problems = []
    if duplicate_keys:
        problems.append(f"重复 key：{', '.join(duplicate_keys)}")
    if invalid_routes:
        problems.append(f"路线几何无效：{', '.join(invalid_routes)}")
    if invalid_rules:
        problems.append(f"路线选择规则无效：{', '.join(invalid_rules)}")
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

def load_activity_input():
    """Materialize the only source of truth with the current output as cache."""
    raw_store = load_raw_activity_store()
    existing_output = load_processed_activities()
    activities = materialize_activity_store(raw_store, existing_output)
    return activities, activities != existing_output

def parse_time(time_str):
    try:
        return datetime.strptime(time_str, "%Y-%m-%dT%H:%M:%S")
    except Exception:
        return datetime.min

def is_default_activity_name(value):
    name = value if isinstance(value, str) else ''
    return name in DEFAULT_ACTIVITY_NAMES or bool(DEFAULT_ACTIVITY_NAME_PATTERN.match(name))


def activity_display_fields(activity):
    """把运动名称与类型文案在数据处理阶段一次确定。"""
    activity_type = activity.get('type')
    sport = SPORTS.get(activity_type, {})
    sport_display_name = sport.get('displayName') or sport.get('name') or '运动'
    if activity_type in {'Run', 'Ride'} and activity.get('is_indoor') is True:
        sport_display_name = f'室内{sport_display_name}'

    original_name = activity.get('name') or ''
    display_name = original_name
    if is_default_activity_name(original_name):
        fallback_title = sport.get('fallbackTitle') or '动起来'
        if activity.get('route_status') == 'available':
            display_name = activity.get('route_title') or fallback_title
        else:
            display_name = activity.get('distance_title') or fallback_title

    return display_name, sport_display_name


def _distance_value(activity):
    try:
        return float(activity.get('distance') or 0)
    except (TypeError, ValueError):
        return 0.0


def _achievement_group(activity_type):
    if activity_type in RIDE_TYPES:
        return 'ride'
    if activity_type in DISPLAY_RUN_WALK_TYPES:
        return 'run_walk'
    return None


def _calendar_achievement(group, level):
    return {
        'group': group,
        'group_label': '骑行' if group == 'ride' else '跑走',
        'level': level,
        'label': '年度最远' if level == 'year' else '月度最远'
    }


def apply_activity_display_fields(activities):
    """
    为页面、日历和海报生成稳定展示字段。

    列表卡片沿用“单次最远”；日历沿用“单日累计最远”，
    两种现有语义在处理层明确区分，展示层不再重复判断。
    """
    sorted_activities = sorted(
        activities,
        key=lambda item: item.get('start_date_local') or '',
        reverse=True
    )
    card_maxima = {}
    daily_totals = {}

    for activity in sorted_activities:
        start = activity.get('start_date_local') or ''
        if len(start) < 10:
            continue
        group = _achievement_group(activity.get('type'))
        distance = _distance_value(activity)
        if not group or distance <= 0:
            continue

        year = start[:4]
        month = start[:7]
        date = start[:10]
        for period, value in (('year', year), ('month', month)):
            key = (period, value, group)
            if distance > card_maxima.get(key, (0, None))[0]:
                card_maxima[key] = (distance, str(activity.get('run_id')))
        daily_totals[(date, group)] = daily_totals.get((date, group), 0) + distance

    daily_maxima = {}
    for (date, group), distance in daily_totals.items():
        year = date[:4]
        month = date[:7]
        for period, value in (('year', year), ('month', month)):
            key = (period, value, group)
            if distance > daily_maxima.get(key, (0, None))[0]:
                daily_maxima[key] = (distance, date)

    changed = False
    for activity in activities:
        display_name, sport_display_name = activity_display_fields(activity)
        start = activity.get('start_date_local') or ''
        run_id = str(activity.get('run_id'))
        group = _achievement_group(activity.get('type'))
        card_achievement = None
        calendar_achievements = []

        if len(start) >= 10:
            year = start[:4]
            month = start[:7]
            date = start[:10]
            if group and _distance_value(activity) > 0:
                if card_maxima.get(('year', year, group), (0, None))[1] == run_id:
                    card_achievement = {
                        'group': group,
                        'level': 'year',
                        'label': '年度单次最远'
                    }
                elif card_maxima.get(('month', month, group), (0, None))[1] == run_id:
                    card_achievement = {
                        'group': group,
                        'level': 'month',
                        'label': '月度单次最远'
                    }

            for achievement_group in ('ride', 'run_walk'):
                if daily_maxima.get(('year', year, achievement_group), (0, None))[1] == date:
                    calendar_achievements.append(_calendar_achievement(achievement_group, 'year'))
                elif daily_maxima.get(('month', month, achievement_group), (0, None))[1] == date:
                    calendar_achievements.append(_calendar_achievement(achievement_group, 'month'))

        fields = {
            'display_name': display_name,
            'sport_display_name': sport_display_name,
            'card_achievement': card_achievement,
            'calendar_achievements': calendar_achievements
        }
        for key, value in fields.items():
            if key not in activity or activity.get(key) != value:
                activity[key] = value
                changed = True
    return changed

# ==========================================
# 5. 🚀 兼容编排入口
# ==========================================
def process_activity_data(
    all_local_data,
    public_route_resolver=generate_public_route_title,
    publish_start_date=PUBLISH_START_DATE,
    logger=print
):
    """Apply deterministic display and privacy fields without reading or writing files."""
    local_data = [
        item for item in all_local_data
        if parse_time(item.get('start_date_local', '')) >= publish_start_date
    ]
    removed_before_publish_date = len(all_local_data) - len(local_data)
    needs_save = removed_before_publish_date > 0
    if removed_before_publish_date:
        logger(f"🧹 已移除 2026 年以前的 {removed_before_publish_date} 条记录。")

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

    for item in local_data:
        if item.get('route_status') != 'available':
            for key in ('route_title', 'route_title_version'):
                if key in item:
                    del item[key]
                    needs_save = True
            continue

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
            logger(
                f"🗺️ 公开轨迹 [{item.get('start_date_local', '未知时间')}] "
                "正在识别真实地点..."
            )
            route_title = public_route_resolver(item)
            if route_title:
                item['route_title'] = route_title
                item['route_title_version'] = PUBLIC_ROUTE_TITLE_VERSION
                needs_save = True
                logger(f"   ↳ {route_title}")
            else:
                logger("   ↳ 暂未找到可靠地点，保留原始运动名称并在下次同步重试。")

        if item.get('route_title'):
            for key in ('distance_title', 'distance_title_key', 'distance_title_version'):
                if key in item:
                    del item[key]
                    needs_save = True

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

    if apply_activity_display_fields(local_data):
        needs_save = True
    return local_data, needs_save


def write_activity_data(activities, output_path=FILE_NAME):
    """Keep the historical iOS-friendly JSON formatting contract."""
    with open(output_path, 'w', encoding='utf-8') as file:
        json.dump(
            activities,
            file,
            ensure_ascii=False,
            indent=2,
            separators=(',', ' : ')
        )


def main():
    print(f"🎯 正在扫描原始运动事实: {RAW_FILE_NAME}")
    all_local_data, output_changed = load_activity_input()
    validate_landmark_route_library(all_local_data)
    local_data, processor_changed = process_activity_data(all_local_data)
    needs_save = output_changed or processor_changed

    if needs_save:
        write_activity_data(local_data)
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
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
