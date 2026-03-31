import requests
import json
import os
import time  # 用于 API 限速保护
from datetime import datetime
import random

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
    
    1. title: 一个简短有意境的标题（绝不能超过6个字）。不要使用固定的标点符号！请结合环境和【{type_cn}】特性（{examples}）发挥创意。
    
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
        "temperature": 0.9 
    }

    try:
        response = requests.post(url, headers=headers, json=payload, timeout=15)
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
        else:
            print("💤 没有发现新运动，历史记录也完好无缺，无需更新。")