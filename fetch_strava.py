import requests
import json
import os
import time
from datetime import datetime, timedelta 
import random
from collections import defaultdict

# ==========================================
# 1. 🔑 配置区：通过 GitHub Secrets 动态获取
# ==========================================
CLIENT_ID = os.getenv('STRAVA_CLIENT_ID')
CLIENT_SECRET = os.getenv('STRAVA_CLIENT_SECRET')
REFRESH_TOKEN = os.getenv('STRAVA_REFRESH_TOKEN')

# 👇 CF 环境变量
CF_ACCOUNT_ID = os.getenv('CF_ACCOUNT_ID')
CF_AI_TOKEN = os.getenv('CF_AI_TOKEN')

if not all([CLIENT_ID, CLIENT_SECRET, REFRESH_TOKEN]):
    print("❌ 致命错误: 缺少 Strava API 环境变量凭证！请检查 GitHub Secrets 设置。")
    exit(1)

# ==========================================
# 2. 📁 路径绑定
# ==========================================
PROJECT_ROOT = os.path.dirname(os.path.abspath(__file__))
TARGET_DIR = os.path.join(PROJECT_ROOT, 'assets')

if not os.path.exists(TARGET_DIR):
    os.makedirs(TARGET_DIR)

FILE_NAME = os.path.join(TARGET_DIR, 'activities.json')

# ==========================================
# 3. ⚙️ 核心逻辑与计算引擎
# ==========================================
def get_access_token():
    print("🔄 正在向 Strava 申请最新通行证...")
    auth_url = "https://www.strava.com/oauth/token"
    payload = {
        'client_id': CLIENT_ID,
        'client_secret': CLIENT_SECRET,
        'refresh_token': REFRESH_TOKEN,
        'grant_type': 'refresh_token',
        'f': 'json'
    }
    try:
        response = requests.post(auth_url, data=payload, verify=True, timeout=20)
        if response.status_code == 200:
            return response.json().get('access_token')
        print(f"❌ 认证失败: {response.text}")
    except Exception as e:
        print(f"❌ 认证请求发生异常: {e}")
    return None

def load_local_data():
    if os.path.exists(FILE_NAME):
        with open(FILE_NAME, 'r', encoding='utf-8') as f:
            try:
                data = json.load(f) or []
                # 确保读取出的数据是严格按照时间倒序（最新在最前）
                data.sort(key=lambda x: parse_time(x.get('start_date_local', '')), reverse=True)
                return data
            except json.JSONDecodeError:
                return []
    return []

def get_latest_timestamp(local_data):
    if not local_data:
        return None
    latest_date_str = local_data[0].get('start_date_local', '') 
    try:
        latest_time = datetime.strptime(latest_date_str, "%Y-%m-%dT%H:%M:%S")
        return int(latest_time.timestamp())
    except ValueError:
        return None

def fetch_activities(access_token, after_timestamp=None):
    activities_url = "https://www.strava.com/api/v3/athlete/activities"
    headers = {'Authorization': f'Bearer {access_token}'}
    all_activities = []
    page = 1
    
    while True:
        params = {'per_page': 200, 'page': page}
        if after_timestamp:
            params['after'] = after_timestamp
            
        print(f"📡 正在拉取第 {page} 页数据...")
        try:
            response = requests.get(activities_url, headers=headers, params=params, timeout=20)
            
            if response.status_code != 200:
                print(f"❌ 数据拉取失败 (状态码 {response.status_code}): {response.text}")
                break
                
            data = response.json()
            if not data:
                break
                
            all_activities.extend(data)
            page += 1
            time.sleep(0.5) 
            
        except Exception as e:
            print(f"❌ 拉取数据时发生异常: {e}")
            break

    return all_activities

def format_time(seconds):
    if not seconds: return "--"
    m, s = divmod(int(seconds), 60)
    h, m = divmod(m, 60)
    if h > 0:
        return f"{h:02d}:{m:02d}:{s:02d}"
    return f"{m:02d}:{s:02d}"

def calculate_pace(activity_type, average_speed_ms):
    if not average_speed_ms or average_speed_ms <= 0:
        return "--", ""
        
    if activity_type in ['Ride', 'VirtualRide', 'EBikeRide']:
        kmh = average_speed_ms * 3.6
        return f"{kmh:.2f}", "km/h"
    elif activity_type in ['Swim', 'WaterSport']:
        sec_per_100m = 100 / average_speed_ms
        mins, secs = divmod(sec_per_100m, 60)
        return f"{int(mins)}'{int(secs):02d}''", "/100m"
    else:
        sec_per_km = 1000 / average_speed_ms
        mins, secs = divmod(sec_per_km, 60)
        return f"{int(mins)}'{int(secs):02d}''", ""

def parse_time(time_str):
    try:
        return datetime.strptime(time_str, "%Y-%m-%dT%H:%M:%S")
    except Exception:
        return datetime.min

# ==========================================
# 🚀 Cloudflare AI 智能私教生成引擎 (双轨时间线 + 随机视角熵机制)
# ==========================================
def generate_ai_content(activity_type, distance, time_str, hr, pace_str, start_date, 
                        global_gap_days=None, last_type=None, 
                        same_gap_days=None, old_dist=None, old_pace=None, old_hr=None):
    if not CF_ACCOUNT_ID or not CF_AI_TOKEN:
        return None, None
        
    type_cn = {'Run': '跑步', 'Ride': '骑行', 'Walk': '徒步', 'Swim': '游泳'}.get(activity_type, '运动')
    
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
            
    # 🧠 动态词汇表
    if activity_type in ['Ride', 'VirtualRide', 'EBikeRide']:
        examples = '比如：破风、巡航、飞驰、踏频'
    elif activity_type in ['Walk', 'Hike']:
        examples = '比如：漫步、丈量、穿梭、闲步'
    elif activity_type in ['Run', 'TrailRun', 'Treadmill']:
        examples = '比如：微汗、步履、追影、奔袭'
    else:
        examples = '比如：微汗、前行'
        
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
        last_type_cn = {'Run': '跑步', 'Ride': '骑行', 'Walk': '徒步', 'Swim': '游泳'}.get(last_type, '运动')
        context_str += f"\n【上下文记忆情报】\n* 整体活跃度：距离上一次运动（{last_type_cn}）相隔了 {global_gap_days} 天。"
        
        # 只有当同类运动天数和全局天数不同，或者同类运动天数很大时，才特别强调同类表现
        if same_gap_days is not None and same_gap_days != global_gap_days:
            context_str += f"\n* 单项连贯性：这是时隔 {same_gap_days} 天后，再次进行【{type_cn}】。"
        
        # 只要找到了同类记录，就把影子数据喂进去
        if old_dist is not None and old_pace is not None:
            context_str += f"\n* 影子对手：上次【{type_cn}】的距离为 {old_dist}公里，配速/均速为 {old_pace}，心率为 {old_hr or '未知'}。"
    
    prompt = f"""
    我刚在【{season}】的【{time_of_day}】完成了一次【{type_cn}】。距离：{distance}公里，用时：{time_str}，配速/均速：{pace_str}，平均心率：{hr or '未知'}。{context_str}
    
    请作为一个懂行且高情商的运动私教，生成两段内容：
    
    1. title: 一个极具张力和意境的标题（绝不能超过6个字）。
    
    【标题致命铁律（最高优先级）】：绝对禁止使用“春风”、“春日”、“暮色”、“清晨”等千篇一律的时间/季节词汇作为开头！必须直接从动作、情绪、身体感受或抽象意象切入（例如：破风逐光、踏碎静谧、心跳轰鸣、野径寻迹、野蛮生长 等）！如果标题里出现了“春”字，我就判你任务失败！
    
    2. comment: 一段 50-80 字的专业短评。根据心率和配速的比例给出反馈。
    
    【评价策略指引（重要！）】：
    * 如果有【上下文记忆情报】，请将其融入短评：
      1. 若整体活跃度相隔很久（>7天），请适度调侃我的懈怠，并庆祝我的回归。
      2. 若整体活跃度很近，但本次单项（{type_cn}）相隔很久，请夸奖我的“交叉训练”或运动丰富度。
      3. 对比“影子对手”数据，自然地指出我在配速、心率或距离上的进步与退步。
    
    【强制创意视角（最高优先级）】：本次生成，请你务必强制使用【{current_focus}】的视角来构思标题和短评！每一次的遣词造句必须绝对新颖，绝不许使用类似"轻抚山径"、"春意漫步"这种机械套话！
    
    【运动类型铁律】：当前运动是【{type_cn}】！标题和短评中绝对禁止出现其他运动的词汇！（例如：如果是跑步绝不能用"漫步/行走"，如果是徒步绝不能用"奔跑/骑行"）！
    【季节与常理铁律】：当前是【{season}】！绝对禁止出现跨季节的词汇（例如春季绝不能说"炎热的夏日/酷暑"，冬季绝不能说"初春"）！
    【JSON安全铁律】：内部绝对禁止使用双引号（"）和换行符！需要强调请用单引号（'）。
    【绝对禁令】：绝不能在短评中像机器一样重复写出距离、配速、用时、心率的具体数字！将它们化为感性的描述（比如“配速稳步提升”）。

    请严格只返回 JSON 格式数据：
    {{"title": "...", "comment": "..."}}
    """

    url = f"https://api.cloudflare.com/client/v4/accounts/{CF_ACCOUNT_ID}/ai/run/@cf/meta/llama-4-scout-17b-16e-instruct"
    headers = {"Authorization": f"Bearer {CF_AI_TOKEN}"}
    
    payload = {
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.9,
        "max_tokens": 1000
    }

    try:
        response = requests.post(url, headers=headers, json=payload, timeout=45)
        if response.status_code == 200:
            result_text = response.json()['result']['response']
            clean_text = result_text.replace('```json', '').replace('```', '').strip()
            clean_text = clean_text.replace('\n', ' ').replace('\r', '') 
            result_json = json.loads(clean_text)
            return result_json.get('title'), result_json.get('comment')
    except Exception as e:
        print(f"⚠️ AI 生成失败 (忽略): {e}")
    
    return None, None

def process_and_merge(local_data, raw_new_data):
    # 将新数据按时间由旧到新排序（这样在处理每一条新数据时，它的上一条“新数据”才能作为它的上下文）
    raw_new_data.sort(key=lambda x: parse_time(x.get('start_date_local', '')))
    
    # 构建一个可供查询的完整历史库（保持最新在最前）
    searchable_history = list(local_data) 
    
    formatted_new_data = []
    
    for item in raw_new_data:
        polyline = item.get('map', {}).get('summary_polyline') or ""
        start_date = item.get('start_date_local', '')
        safe_time = start_date.replace('Z', '') if start_date else ""
        
        avg_speed_ms = item.get('average_speed', 0)
        pace_num, pace_unit = calculate_pace(item.get('type'), avg_speed_ms)
        hr = item.get('average_heartrate', 0)
        safe_hr = round(hr) if hr else None
        
        distance_km = round(item.get('distance', 0) / 1000, 2)
        moving_time_str = format_time(item.get('moving_time', 0))
        full_pace = f"{pace_num}{pace_unit}"
        
        # 🕵️‍♂️ --- 提取上下文记忆 ---
        current_dt = parse_time(safe_time)
        
        # 全局上一条（列表第一项，因为 searchable_history 始终是最新在最前）
        global_prev = searchable_history[0] if searchable_history else None
        # 单项上一条
        same_prev = next((x for x in searchable_history if x.get('type') == item.get('type')), None)
        
        global_gap_days = (current_dt - parse_time(global_prev['start_date_local'])).days if global_prev else None
        last_type = global_prev.get('type') if global_prev else None
        
        same_gap_days = (current_dt - parse_time(same_prev['start_date_local'])).days if same_prev else None
        old_dist = same_prev.get('distance') if same_prev else None
        old_pace = f"{same_prev.get('pace_num', '')}{same_prev.get('pace_unit', '')}" if same_prev else None
        old_hr = same_prev.get('average_heartrate') if same_prev else None
        # ---------------------------

        print(f"🤖 正在为新运动 [{safe_time}] 请求 AI...")
        if global_gap_days is not None:
            print(f"   ↳ 记忆加载：距上次运动 {global_gap_days} 天，距上次同类运动 {same_gap_days} 天")
            
        ai_title, ai_comment = generate_ai_content(
            item.get('type'), distance_km, moving_time_str, safe_hr, full_pace, safe_time,
            global_gap_days, last_type, same_gap_days, old_dist, old_pace, old_hr
        )
            
        new_record = {
            "run_id": item.get('id'),
            "name": item.get('name', '未命名运动'),
            "ai_title": ai_title,       
            "ai_comment": ai_comment,   
            "type": item.get('type', 'Workout'),
            "distance": distance_km,
            "moving_time": moving_time_str,
            "start_date_local": safe_time,               
            "average_heartrate": safe_hr,                
            "average_speed": round(avg_speed_ms * 3.6, 2), 
            "pace_num": pace_num,                        
            "pace_unit": pace_unit,                      
            "total_elevation_gain": item.get('total_elevation_gain', 0),
            "summary_polyline": polyline
        }
        formatted_new_data.append(new_record)
        
        # 将刚刚处理完的新记录，插入到历史记录的最前面，成为下一条新数据的“上下文”
        searchable_history.insert(0, new_record)
        
    if not formatted_new_data:
        return local_data, 0, 0

    merged_dict = {item['run_id']: item for item in local_data if 'run_id' in item}
    initial_count = len(merged_dict)
    
    for item in formatted_new_data:
        merged_dict[item['run_id']] = item
        
    final_list = list(merged_dict.values())
    final_list.sort(key=lambda x: parse_time(x.get('start_date_local', '')), reverse=True)
    added_count = len(final_list) - initial_count
    
    return final_list, len(formatted_new_data), added_count

# ==========================================
# 📊 月度洞察数据引擎 (Monthly Insights Engine)
# ==========================================

def get_hr_zone_info(bpm):
    """将冷冰冰的心率数字翻译成专业的心率区间术语"""
    if not bpm or bpm <= 0: return "未知区间"
    if bpm < 115: return "舒缓有氧 (Z1)"
    elif bpm <= 129: return "稳态燃脂 (Z2)"
    elif bpm <= 144: return "有氧强化 (Z3)"
    elif bpm <= 159: return "乳酸阈值 (Z4)"
    else: return "无氧极限 (Z5)"

def get_time_of_day(hour):
    """将小时映射为诗意的时间段"""
    time_zones = ["午夜", "破晓", "清晨", "上午", "正午", "午后", "暮色", "暗夜"]
    return time_zones[hour // 3]

def calculate_monthly_stats(month_activities):
    """提取单个月份的极值、偏好与统计数据"""
    
    # 👇 新增：中英文运动映射表
    TYPE_CN = {'Run': '跑步', 'Ride': '骑行', 'VirtualRide': '室内骑行', 'EBikeRide': '电助力骑行', 'Walk': '徒步', 'Hike': '远足', 'Swim': '游泳'}
    
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
        raw_type = act.get('type', 'Unknown')
        # 👇 转换为中文类型
        sport_type_cn = TYPE_CN.get(raw_type, '运动')
        
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

        if raw_type in ['Ride', 'VirtualRide', 'EBikeRide'] and dist > stats['longest_ride_km']:
            stats['longest_ride_km'] = dist
        elif raw_type in ['Run', 'TrailRun'] and dist > stats['longest_run_km']:
            stats['longest_run_km'] = dist
            
        if hr and hr > stats['hardest_session']['hr']:
            # 👇 优化：将 "03-03" 智能转换为 "3号"
            day_str = f"{int(start_date[8:10])}号" if len(start_date) >= 10 else "未知"
            stats['hardest_session'] = {
                "date": day_str,
                "type": sport_type_cn,
                "hr": round(hr),
                "zone": get_hr_zone_info(hr)
            }
            
        if hr:
            stats['hr_sums'][sport_type_cn].append(hr)

    stats['total_distance'] = round(stats['total_distance'], 2)
    stats['sports_count'] = dict(stats['sports_count'])
    stats['favorite_time'] = max(stats['time_preferences'], key=stats['time_preferences'].get) if stats['time_preferences'] else "未知"
    
    stats['avg_hr'] = {}
    for stype_cn, hrs in stats['hr_sums'].items():
        avg_bpm = round(sum(hrs) / len(hrs))
        stats['avg_hr'][stype_cn] = f"{avg_bpm}bpm ({get_hr_zone_info(avg_bpm)})"
        
    sorted_days = sorted(list(stats['active_days']))
    max_streak = 1 if sorted_days else 0
    current_streak = 1 if sorted_days else 0
    for i in range(1, len(sorted_days)):
        if sorted_days[i] == sorted_days[i-1] + timedelta(days=1):
            current_streak += 1
            max_streak = max(max_streak, current_streak)
        else:
            current_streak = 1
    stats['max_streak_days'] = max_streak
    
    del stats['active_days']
    del stats['time_preferences']
    del stats['hr_sums']

    return stats

def generate_monthly_ai_report(month_str, stats, prev_stats, current_day):
    """请求 AI 生成高情商月报"""
    if not CF_ACCOUNT_ID or not CF_AI_TOKEN: return None, None
    
    # 🧠 动态雷达与时态切分（完美匹配真实私教逻辑）
    if current_day <= 10:
        phase = "月初开局阶段"
        action_target = "本月中下旬"
        radar_rule = "【开局雷达】：月初数据少是正常的，重点评价单次运动的质量（如心率峰值、配速表现等），给予专业肯定。"
        critique_directive = "【敲打与防懈怠】：绝对禁止吐槽'总距离短'、'次数少'或'运动单一'。你的'挑刺'环节必须转化为【防懈怠警告】：严厉提醒我保持纪律，防止出现热度减退。（注意：每次生成请发挥创意，用不同的专业私教话术来敲打，绝对不要总是像机器人一样重复“千万别给我搞三分钟热度”之类的固定句式！）"

    elif current_day <= 22:
        phase = "月中巡航阶段"
        action_target = "本月冲刺期"
        radar_rule = "【中和评估雷达】：现在是月中，你需要进行中立、客观的评估。综合考量目前的出勤频率、心率强度以及偏好分布。"
        critique_directive = "【抓出隐患】：指出目前的潜在短板。例如：是否有氧散步（Z1）太多缺乏高强度？或者频次开始下降？鞭策我不要懈怠，及时调整节奏。"

    else:
        phase = "月末总结阶段"
        action_target = "下个自然月"
        radar_rule = "【全维度月度雷达】：现在是月末。你必须全盘考量本月总运动容量、最长连胜、运动比例分配，以及整体心肺强度。如果有上月数据，必须自然地【结合上个月的数据进行对比】（例如进步或退步）。"
        critique_directive = "【无情复盘】：抓出本月整体数据的最大短板！例如：总容量大但都是无效消耗、出勤率低等，给出犀利专业的诊断。"

    # 组装数据上下文
    context = f"【本月 ({month_str}) 数据】：总运动 {stats['total_count']} 次，总里程 {stats['total_distance']}公里。最长连续运动 {stats['max_streak_days']} 天。\n"
    context += f"运动偏好：{stats['sports_count']}，最爱在【{stats['favorite_time']}】出没。\n"
    context += f"心率表现：各运动平均心率 {stats['avg_hr']}。\n"
    if stats['hardest_session']['hr'] > 0:
        context += f"高光时刻：{stats['hardest_session']['date']} 的 {stats['hardest_session']['type']} 平均心率高达 {stats['hardest_session']['hr']}，达到了【{stats['hardest_session']['zone']}】！\n"
    
    if prev_stats:
        context += f"【对比情报 (上个月)】：总运动 {prev_stats['total_count']} 次，总里程 {prev_stats['total_distance']}公里。\n"

    prompt = f"""
    你是我的专属“魔鬼”减脂私教。当前处于【{phase}】（今天是本月第 {current_day} 天）。
    我的核心诉求是：高效减脂、提升心肺引擎与养成强悍的运动习惯。请根据以下数据，为我的表现写一段全面、专业的深度总结：
    
    {context}
    
    请生成：
    1. comment: 一段 100-130 字的专业私教评语。
    
    【核心评价铁律（极度重要）】：
    1. {radar_rule}
    2. {critique_directive}
    3. 【专业减脂黑话】：请自然运用“稳态燃脂(Z2)”、“有氧强化(Z3)”、“乳酸阈值”、“心肺引擎”、“无效消耗”等专业词汇。
    4. 【结构要求】：先结合当前表现给予肯定 -> 话锋一转（结合当前阶段的挑刺规则）敲打一下 -> 给出对【{action_target}】的具体行动指令。
    5. 【语气与人设】：语气要是硬核、专业的铁血教练，带有调侃和严厉。直接称呼“兄弟”或直奔主题，绝对禁止使用“小宝贝”、“亲爱的”等油腻或神经病的称呼！拒绝冰冷罗列数字，要把数据化为诊断依据。
    6. 内部绝对禁止使用双引号（"）和换行符！需要强调请用单引号（'）。
    
    严格返回 JSON: {{"comment": "..."}}
    """
    
    url = f"https://api.cloudflare.com/client/v4/accounts/{CF_ACCOUNT_ID}/ai/run/@cf/meta/llama-4-scout-17b-16e-instruct"
    headers = {"Authorization": f"Bearer {CF_AI_TOKEN}"}

    payload = {
        "messages": [{"role": "user", "content": prompt}], 
        "temperature": 0.8,
        "max_tokens": 1000
    }

    try:
        res = requests.post(url, headers=headers, json=payload, timeout=45)
        if res.status_code == 200:
            result_data = res.json()['result']['response']
            
            if isinstance(result_data, dict):
                result_json = result_data
            else:
                text_str = str(result_data)
                # 🔪 终极暴力截取
                start_idx = text_str.find('{')
                end_idx = text_str.rfind('}')
                
                if start_idx != -1 and end_idx != -1:
                    clean_text = text_str[start_idx:end_idx+1].replace('\n', ' ')
                    result_json = json.loads(clean_text)
                else:
                    print(f"⚠️ AI 严重幻觉，未返回 JSON 结构: {text_str}")
                    return None 
                    
            return result_json.get('comment')
    except Exception as e:
        print(f"⚠️ 月报 AI 生成失败: {e}")
    return None

def update_monthly_insights(local_data):
    """主调度函数：分析所有数据并生成月报 JSON"""
    if not local_data: return
    
    MONTHLY_FILE = os.path.join(TARGET_DIR, 'monthly_insights.json')
    insights = {}
    if os.path.exists(MONTHLY_FILE):
        with open(MONTHLY_FILE, 'r', encoding='utf-8') as f:
            try: insights = json.load(f)
            except: pass

    months_data = defaultdict(list)
    for act in local_data:
        date_str = act.get('start_date_local', '')
        if len(date_str) >= 7:
            month_key = date_str[0:7] 
            months_data[month_key].append(act)
            
    sorted_months = sorted(months_data.keys(), reverse=True)
    if not sorted_months: return
    
    # 👇 核心修改：不再只取 [0]，而是循环遍历所有月份
    for i, current_month_key in enumerate(sorted_months):
        current_stats = calculate_monthly_stats(months_data[current_month_key])
        
        # 动态获取当前月份的“上个月”作为对比基准
        prev_month_key = sorted_months[i+1] if i + 1 < len(sorted_months) else None
        prev_stats = calculate_monthly_stats(months_data[prev_month_key]) if prev_month_key else None
        
        need_ai_update = True
        if current_month_key in insights:
            old_stats = insights[current_month_key].get('stats', {})
            if old_stats.get('total_count') == current_stats['total_count'] and old_stats.get('total_distance') == current_stats['total_distance']:
                need_ai_update = False 

        if need_ai_update:
            print(f"📈 检测到 {current_month_key} 数据需要更新，正在呼叫 AI 教练撰写月报...")
            latest_act_date = months_data[current_month_key][0].get('start_date_local', '')
            current_day = int(latest_act_date[8:10]) if len(latest_act_date) >= 10 else 15
            
            comment = generate_monthly_ai_report(current_month_key, current_stats, prev_stats, current_day)
            
            if comment:
                insights[current_month_key] = {
                    "month_str": current_month_key,
                    "last_update": datetime.now().strftime("%Y-%m-%dT%H:%M:%S"),
                    # 👇 移除了 phase 和 ai_title
                    "stats": current_stats,
                    "ai_comment": comment
                }
                with open(MONTHLY_FILE, 'w', encoding='utf-8') as f:
                    json.dump(insights, f, ensure_ascii=False, indent=2)
                print(f"🎉 {current_month_key} AI 月报已火热出炉并保存！")
                
                time.sleep(2)


# ==========================================
# 4. 🚀 运行
# ==========================================
if __name__ == '__main__':
    print(f"🎯 目标保存路径: {FILE_NAME}")
    
    local_data = load_local_data()
    print(f"📁 本地已存在 {len(local_data)} 条记录。")
    
    after_ts = get_latest_timestamp(local_data)
    start_of_2026_ts = int(datetime(2026, 1, 1).timestamp())
    
    if after_ts:
        after_ts = max(after_ts, start_of_2026_ts)
        print(f"⏱️ 开启增量同步模式 (仅拉取 {datetime.fromtimestamp(after_ts)} 之后的新记录)")
    else:
        after_ts = start_of_2026_ts
        print(f"🌍 本地无数据，开启同步模式 (强制从 2026-01-01 开始拉取)")

    token = get_access_token()
    if token:
        needs_save = False
        
        # 🚀 自愈程序（含双轨时间线记忆提取）
        for i, item in enumerate(local_data):
            if not item.get('ai_title') or not item.get('ai_comment'):
                safe_time = item.get('start_date_local', '')
                print(f"🛠️ 发现历史记录 [{safe_time}] 缺失 AI 文案，正在尝试自愈修复...")
                
                # 在列表中寻找它“之前”发生的事情（即索引大于它的数据）
                older_history = local_data[i+1:]
                
                current_dt = parse_time(safe_time)
                global_prev = older_history[0] if older_history else None
                same_prev = next((x for x in older_history if x.get('type') == item.get('type')), None)
                
                global_gap_days = (current_dt - parse_time(global_prev['start_date_local'])).days if global_prev else None
                last_type = global_prev.get('type') if global_prev else None
                same_gap_days = (current_dt - parse_time(same_prev['start_date_local'])).days if same_prev else None
                old_dist = same_prev.get('distance') if same_prev else None
                old_pace = f"{same_prev.get('pace_num', '')}{same_prev.get('pace_unit', '')}" if same_prev else None
                old_hr = same_prev.get('average_heartrate') if same_prev else None
                
                dist = item.get('distance', 0)
                mov_time = item.get('moving_time', '')
                hr = item.get('average_heartrate')
                pace = f"{item.get('pace_num', '')}{item.get('pace_unit', '')}"
                
                t, c = generate_ai_content(
                    item.get('type'), dist, mov_time, hr, pace, safe_time,
                    global_gap_days, last_type, same_gap_days, old_dist, old_pace, old_hr
                )
                
                if t and c:
                    item['ai_title'] = t
                    item['ai_comment'] = c
                    needs_save = True
                
                # 给 AI 留点喘息时间，防止触发速率限制
                time.sleep(1)
        
        # 拉取新数据
        raw_new_activities = fetch_activities(token, after_ts)
        final_data, fetched_count, added_count = process_and_merge(local_data, raw_new_activities)
        
        # 只要有新数据拉取，或者修复了旧数据，就保存 JSON
        if fetched_count > 0 or needs_save:
            tmp_file = FILE_NAME + ".tmp"
            with open(tmp_file, 'w', encoding='utf-8') as f:
                json.dump(final_data, f, ensure_ascii=False, indent=2)
            os.replace(tmp_file, FILE_NAME)
            
            print(f"✅ 大功告成！本次新增 {added_count} 条，并执行了历史记录自愈检测。总库共 {len(final_data)} 条。")

            update_monthly_insights(final_data)
        else:
            print("💤 没有发现新运动，历史记录也完好无缺，无需更新。")
            update_monthly_insights(final_data)