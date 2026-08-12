import json
import os
import time
import random
import hashlib
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

ACTIVITY_TITLE_VERBS = {
    'Run': '跑掉',
    'TrailRun': '跑掉',
    'Treadmill': '跑掉',
    'VirtualRun': '跑掉',
    'Ride': '骑掉',
    'VirtualRide': '骑掉',
    'EBikeRide': '骑掉',
    'Walk': '走掉',
    'Hike': '走掉',
    'StairStepper': '爬掉',
    'Swim': '游掉',
    'WaterSport': '游掉'
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

def generate_food_title(activity_type, calories, run_id, recent_food_keys=None):
    """按实际消耗选择一个自然、稳定且尽量不重复的趣味标题。"""
    verb = ACTIVITY_TITLE_VERBS.get(activity_type)
    try:
        calories = float(calories or 0)
    except (TypeError, ValueError):
        calories = 0

    if not verb or calories <= 0:
        return None, None, None

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
    title = f"{verb}{food_text}"
    energy_title = f"燃掉{food_text}"
    return title, energy_title, selected_food['key']

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
        return f"爬了{format_landmark_count(count, landmark['unit'], landmark['name'])}", landmark['key'], 'elevation'

    distance_verb = ACTIVITY_DISTANCE_VERBS.get(activity_type)
    activity_group = ACTIVITY_DISTANCE_GROUPS.get(activity_type)
    if distance <= 0 or not distance_verb or not activity_group:
        return None, None, None

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
    return f"{distance_verb}{format_landmark_count(count, landmark['unit'], landmark['name'])}", landmark['key'], 'distance'

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

# ==========================================
# 🚀 3. Cloudflare AI 智能私教点评引擎
# ==========================================
def generate_ai_comment(activity_type, distance, time_str, hr, pace_str, start_date,
                        global_gap_days=None, last_type=None,
                        same_gap_days=None, old_dist=None, old_pace=None, old_hr=None):
    if not CF_ACCOUNT_ID or not CF_AI_TOKEN:
        return None
        
    type_cn = ACTIVITY_TYPE_CN.get(activity_type, '运动')
    
    # 🧠 计算季节与时间
    time_of_day = "未知时间"
    season = "未知季节"
    if start_date:
        try:
            hour = int(start_date[11:13])
            block_idx = hour // 3
            time_zones = ["午夜", "破晓", "清晨", "上午", "正午", "午后", "暮色", "暗夜"]
            time_of_day = time_zones[block_idx]
            
            month = int(start_date[5:7])
            if month in [3, 4, 5]: season = "春季"
            elif month in [6, 7, 8]: season = "夏季"
            elif month in [9, 10, 11]: season = "秋季"
            else: season = "冬季"
        except:
            pass
            
    # 🎲 随机视角
    creative_angles = [
        "侧重于呼吸、心跳与肌肉的律动感",
        "侧重于沿途的风景、光影与自然的变化",
        "侧重于内心的平静、独处与自我对话",
        "侧重于脚步的节奏、踏频与大地的接触",
        "侧重于季节的温度、空气的湿度与风的触感",
        "采用充满力量感、突破极限的激昂语境",
        "带一点点武侠风、禅意或极其诗意的抽象表达",
        "侧重于运动后的汗水、卡路里燃烧与多巴胺释放的快感"
    ]
    current_focus = random.choice(creative_angles)

    # 💡 组装【双轨时间线】上下文记忆情报
    context_str = ""
    if global_gap_days is not None:
        last_type_cn = ACTIVITY_TYPE_CN.get(last_type, '运动')
        context_str += f"\n【上下文记忆情报】\n* 整体活跃度：距离上一次运动（{last_type_cn}）相隔了 {global_gap_days} 天。"
        if same_gap_days is not None and same_gap_days != global_gap_days:
            context_str += f"\n* 单项连贯性：这是时隔 {same_gap_days} 天后，再次进行【{type_cn}】。"
        if old_dist is not None and old_pace is not None:
            context_str += f"\n* 影子对手：上次【{type_cn}】的距离为 {old_dist}公里，配速/均速为 {old_pace}，心率为 {old_hr or '未知'}。"
    
    prompt = f"""
    我刚在【{season}】的【{time_of_day}】完成了一次【{type_cn}】。距离：{distance}公里，用时：{time_str}，配速/均速：{pace_str}，平均心率：{hr or '未知'}。{context_str}
    
    请作为一个懂行且高情商的运动私教，生成一段 50-80 字的专业短评。根据心率和配速的比例给出反馈。
    
    【评价策略指引】：如果有【上下文记忆情报】，请将其融入短评（如调侃懈怠、夸奖交叉训练、对比影子对手）。
    【强制创意视角】：本次生成，请使用【{current_focus}】的视角来构思短评！
    【运动类型铁律】：当前运动是【{type_cn}】！绝对禁止出现其他运动的词汇！
    【JSON安全铁律】：内部绝对禁止使用双引号（"）和换行符！需要强调请用单引号（'）。
    【绝对禁令】：绝不能在短评中像机器一样重复写出距离、配速、用时、心率的具体数字！将它们化为感性的描述。

    请严格只返回 JSON 格式数据：
    {{"comment": "..."}}
    """

    url = f"https://api.cloudflare.com/client/v4/accounts/{CF_ACCOUNT_ID}/ai/run/@cf/meta/llama-4-scout-17b-16e-instruct"
    headers = {"Authorization": f"Bearer {CF_AI_TOKEN}"}
    payload = {"messages": [{"role": "user", "content": prompt}], "temperature": 0.9, "max_tokens": 1000}

    try:
        response = requests.post(url, headers=headers, json=payload, timeout=45)
        if response.status_code == 200:
            result_text = response.json()['result']['response']
            clean_text = result_text.replace('```json', '').replace('```', '').strip().replace('\n', ' ').replace('\r', '') 
            result_json = json.loads(clean_text)
            return result_json.get('comment')
    except Exception as e:
        print(f"⚠️ AI 点评生成失败: {e}")
    return None

# ==========================================
# 📊 4. 月度洞察数据引擎 (保留完整高级雷达逻辑)
# ==========================================
def get_hr_zone_info(bpm):
    if not bpm or bpm <= 0: return "未知区间"
    if bpm < 115: return "舒缓有氧 (Z1)"
    elif bpm <= 129: return "稳态燃脂 (Z2)"
    elif bpm <= 144: return "有氧强化 (Z3)"
    elif bpm <= 159: return "乳酸阈值 (Z4)"
    else: return "无氧极限 (Z5)"

def get_time_of_day(hour):
    time_zones = ["午夜", "破晓", "清晨", "上午", "正午", "午后", "暮色", "暗夜"]
    return time_zones[hour // 3]

def calculate_monthly_stats(month_activities):
    stats = {
        "total_count": len(month_activities),
        "total_distance": 0.0,
        "sports_count": defaultdict(int),
        "time_preferences": defaultdict(int),
        "longest_ride_km": 0.0,
        "longest_run_km": 0.0,
        "hardest_session": {"date": None, "type": None, "hr": 0, "zone": "未知"},
        "hr_sums": defaultdict(list), 
        "active_days": set()
    }

    for act in month_activities:
        sport_type_cn = ACTIVITY_TYPE_CN.get(act.get('type', 'Unknown'), '运动')
        dist = act.get('distance', 0)
        hr = act.get('average_heartrate', 0)
        start_date = act.get('start_date_local', '')
        
        stats['total_distance'] += dist
        stats['sports_count'][sport_type_cn] += 1
        
        if start_date:
            try:
                dt = datetime.strptime(start_date, "%Y-%m-%dT%H:%M:%S")
                stats['active_days'].add(dt.date())
                stats['time_preferences'][get_time_of_day(dt.hour)] += 1
            except: pass

        if hr and hr > stats['hardest_session']['hr']:
            day_str = f"{int(start_date[8:10])}号" if len(start_date) >= 10 else "未知"
            stats['hardest_session'] = {"date": day_str, "type": sport_type_cn, "hr": round(hr), "zone": get_hr_zone_info(hr)}
            
        if hr: stats['hr_sums'][sport_type_cn].append(hr)

    stats['total_distance'] = round(stats['total_distance'], 2)
    stats['sports_count'] = dict(stats['sports_count'])
    stats['favorite_time'] = max(stats['time_preferences'], key=stats['time_preferences'].get) if stats['time_preferences'] else "未知"
    
    stats['avg_hr'] = {}
    for stype_cn, hrs in stats['hr_sums'].items():
        avg_bpm = round(sum(hrs) / len(hrs))
        stats['avg_hr'][stype_cn] = f"{avg_bpm}bpm ({get_hr_zone_info(avg_bpm)})"
        
    sorted_days = sorted(list(stats['active_days']))
    stats['max_streak_days'] = 1 if sorted_days else 0
    current_streak = 1 if sorted_days else 0
    for i in range(1, len(sorted_days)):
        if sorted_days[i] == sorted_days[i-1] + timedelta(days=1):
            current_streak += 1
            stats['max_streak_days'] = max(stats['max_streak_days'], current_streak)
        else:
            current_streak = 1
    
    del stats['active_days'], stats['time_preferences'], stats['hr_sums']
    return stats

def generate_monthly_ai_report(month_str, stats, prev_stats, current_day):
    if not CF_ACCOUNT_ID or not CF_AI_TOKEN: return None
    
    if current_day <= 10:
        phase, action_target = "月初开局阶段", "本月中下旬"
        radar_rule = "【开局雷达】：月初数据少是正常的，重点评价单次运动的质量。"
        critique_directive = "【防懈怠警告】：严厉提醒我保持纪律，防止出现热度减退。"
    elif current_day <= 22:
        phase, action_target = "月中巡航阶段", "本月冲刺期"
        radar_rule = "【中和评估雷达】：中立、客观的评估，综合考量目前的出勤频率、心率强度。"
        critique_directive = "【抓出隐患】：指出目前的潜在短板，及时调整节奏。"
    else:
        phase, action_target = "月末总结阶段", "下个自然月"
        radar_rule = "【全维度月度雷达】：必须全盘考量本月总运动容量。如果有上月数据，必须结合进行对比。"
        critique_directive = "【无情复盘】：抓出本月整体数据的最大短板，给出犀利专业的诊断。"

    context = f"【本月 ({month_str}) 数据】：总运动 {stats['total_count']} 次，总里程 {stats['total_distance']}公里。最长连续运动 {stats['max_streak_days']} 天。\n偏好：{stats['sports_count']}，最爱【{stats['favorite_time']}】。\n各运动平均心率 {stats['avg_hr']}。\n"
    if prev_stats: context += f"【对比情报 (上个月)】：总运动 {prev_stats['total_count']} 次，总里程 {prev_stats['total_distance']}公里。\n"

    prompt = f"你是专属“魔鬼”减脂私教。当前处于【{phase}】。请为我的表现写一段全面专业的总结：\n{context}\n\n生成：1. comment: 50-80字专业评语。要求：{radar_rule} {critique_directive} 使用专业减脂词汇。严格返回 JSON: {{\"comment\": \"...\"}}"
    
    url = f"https://api.cloudflare.com/client/v4/accounts/{CF_ACCOUNT_ID}/ai/run/@cf/meta/llama-4-scout-17b-16e-instruct"
    headers = {"Authorization": f"Bearer {CF_AI_TOKEN}"}
    try:
        res = requests.post(url, headers=headers, json={"messages": [{"role": "user", "content": prompt}], "temperature": 0.8, "max_tokens": 1000}, timeout=45)
        if res.status_code == 200:
            result_data = res.json()['result']['response']
            if isinstance(result_data, dict): return result_data.get('comment')
            clean_text = result_data[result_data.find('{'):result_data.rfind('}')+1].replace('\n', ' ')
            return json.loads(clean_text).get('comment')
    except: pass
    return None

def update_monthly_insights(local_data):
    if not local_data: return
    insights = {}
    if os.path.exists(MONTHLY_FILE):
        with open(MONTHLY_FILE, 'r', encoding='utf-8') as f:
            try: insights = json.load(f)
            except: pass

    months_data = defaultdict(list)
    for act in local_data:
        date_str = act.get('start_date_local', '')
        if len(date_str) >= 7: months_data[date_str[0:7]].append(act)
            
    sorted_months = sorted(months_data.keys(), reverse=True)
    for i, current_month_key in enumerate(sorted_months):
        current_stats = calculate_monthly_stats(months_data[current_month_key])
        prev_month_key = sorted_months[i+1] if i + 1 < len(sorted_months) else None
        prev_stats = calculate_monthly_stats(months_data[prev_month_key]) if prev_month_key else None
        
        need_ai_update = True
        if current_month_key in insights:
            old_stats = insights[current_month_key].get('stats', {})
            old_comment = insights[current_month_key].get('ai_comment', '')
            
            # 💡 核心修复：检查数据是否变化 AND 文案是否有效
            is_data_unchanged = (old_stats.get('total_count') == current_stats['total_count'] and old_stats.get('total_distance') == current_stats['total_distance'])
            # 如果旧文案是以 "【" 开头的，说明它是本地解析出来的兜底模板，属于无效文案，必须重写
            is_ai_comment_valid = bool(old_comment) and not old_comment.startswith("【")
            
            # 只有当数据一模一样，且现有的文案是真实的 AI 文案时，才跳过更新
            if is_data_unchanged and is_ai_comment_valid:
                need_ai_update = False 

        if need_ai_update:
            print(f"📈 检测到 {current_month_key} 数据或文案需要更新，正在呼叫 AI 教练撰写月报...")
            latest_act_date = months_data[current_month_key][0].get('start_date_local', '')
            comment = generate_monthly_ai_report(current_month_key, current_stats, prev_stats, int(latest_act_date[8:10]) if len(latest_act_date) >= 10 else 15)
            if comment:
                insights[current_month_key] = {
                    "month_str": current_month_key, 
                    "last_update": datetime.now().strftime("%Y-%m-%dT%H:%M:%S"), 
                    "stats": current_stats, 
                    "ai_comment": comment
                }
                with open(MONTHLY_FILE, 'w', encoding='utf-8') as f:
                    json.dump(insights, f, ensure_ascii=False, indent=2)
                time.sleep(2)

# ==========================================
# 5. 🚀 核心自愈运行逻辑
# ==========================================
if __name__ == '__main__':
    print(f"🎯 正在扫描本地运动库: {FILE_NAME}")
    local_data = load_local_data()
    needs_save = False

    # 🍔 旧 AI 标题全部清理；趣味标题按时间顺序稳定生成。
    recent_food_keys = []
    for item in reversed(local_data):
        if 'ai_title' in item:
            del item['ai_title']
            needs_save = True

        should_regenerate_title = (
            not item.get('food_title') or
            not item.get('energy_title') or
            item.get('food_title_version') != FOOD_TITLE_VERSION
        )
        if should_regenerate_title:
            title, energy_title, food_key = generate_food_title(
                item.get('type'),
                item.get('calories'),
                item.get('run_id'),
                recent_food_keys[-3:]
            )
            if title:
                item['food_title'] = title
                item['energy_title'] = energy_title
                item['food_key'] = food_key
                item['food_title_version'] = FOOD_TITLE_VERSION
                needs_save = True
            else:
                for key in ('food_title', 'energy_title', 'food_key', 'food_title_version'):
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
            title, landmark_key, title_kind = generate_distance_title(
                item.get('type'),
                item.get('distance'),
                item.get('total_elevation_gain'),
                item.get('run_id'),
                recent_landmark_keys[-2:]
            )
            if title:
                item['distance_title'] = title
                item['distance_title_key'] = landmark_key
                item['distance_title_kind'] = title_kind
                item['distance_title_version'] = DISTANCE_TITLE_VERSION
                needs_save = True
            else:
                for key in ('distance_title', 'distance_title_key', 'distance_title_kind', 'distance_title_version'):
                    if key in item:
                        del item[key]
                        needs_save = True

        if item.get('distance_title_key'):
            recent_landmark_keys.append(item['distance_title_key'])

    # 🧠 AI 只补全专业点评，不再参与标题生成。
    for i, item in enumerate(local_data):
        if not item.get('ai_comment'):
            safe_time = item.get('start_date_local', '')
            print(f"🛠️ 发现记录 [{safe_time}] 缺乏 AI 点评，正在呼叫私人教练...")
            
            older_history = local_data[i+1:]
            current_dt = parse_time(safe_time)
            global_prev = older_history[0] if older_history else None
            same_prev = next((x for x in older_history if x.get('type') == item.get('type')), None)
            
            comment = generate_ai_comment(
                item.get('type'), item.get('distance', 0), item.get('moving_time', ''), item.get('average_heartrate'), f"{item.get('pace_num', '')}{item.get('pace_unit', '')}", safe_time,
                (current_dt - parse_time(global_prev['start_date_local'])).days if global_prev else None,
                global_prev.get('type') if global_prev else None,
                (current_dt - parse_time(same_prev['start_date_local'])).days if same_prev else None,
                same_prev.get('distance') if same_prev else None,
                f"{same_prev.get('pace_num', '')}{same_prev.get('pace_unit', '')}" if same_prev else None,
                same_prev.get('average_heartrate') if same_prev else None
            )
            
            if comment:
                item['ai_comment'] = comment
                needs_save = True
                print("   ↳ 点评生成成功")
            time.sleep(1) # 防止触发 API 频率限制
            
    if needs_save:
        with open(FILE_NAME, 'w', encoding='utf-8') as f:
            json.dump(local_data, f, ensure_ascii=False, indent=2)
        print("✅ 趣味标题、杭州距离与 AI 点评更新完毕！")
    else:
        print("💤 所有记录均已具备趣味标题、杭州距离与 AI 点评，跳过更新。")

    print("📊 正在同步月度洞察报告...")
    update_monthly_insights(local_data)
    print("✨ 全部流程执行完毕！")
