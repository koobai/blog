import requests
import json
import os
import time  # 用于 API 限速保护
from datetime import datetime

# ==========================================
# 1. 🔑 配置区：通过 GitHub Secrets 动态获取
# ==========================================
CLIENT_ID = os.getenv('STRAVA_CLIENT_ID')
CLIENT_SECRET = os.getenv('STRAVA_CLIENT_SECRET')
REFRESH_TOKEN = os.getenv('STRAVA_REFRESH_TOKEN')

# 👇 新增 CF 环境变量
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
        # 🛡️ 优化：增加 20 秒超时防御
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
                # 🛡️ 优化：防御解析出 None 的情况
                return json.load(f) or []
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
            # 🛡️ 优化：增加 20 秒超时防御
            response = requests.get(activities_url, headers=headers, params=params, timeout=20)
            
            if response.status_code != 200:
                print(f"❌ 数据拉取失败 (状态码 {response.status_code}): {response.text}")
                break
                
            data = response.json()
            if not data:
                break
                
            all_activities.extend(data)
            page += 1
            
            # 🛡️ 优化：API 限速保护，温柔对待 Strava 服务器
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

# 🛡️ 优化：安全的时间解析器，用于排序
def parse_time(time_str):
    try:
        return datetime.strptime(time_str, "%Y-%m-%dT%H:%M:%S")
    except Exception:
        # 如果格式错误，沉到最下面
        return datetime.min

# ==========================================
# 🚀 Cloudflare AI 智能私教生成引擎 (专属词库 + 纯正中文版)
# ==========================================
def generate_ai_content(activity_type, distance, time_str, hr, pace_str, start_date):
    if not CF_ACCOUNT_ID or not CF_AI_TOKEN:
        return None, None
        
    type_cn = {'Run': '跑步', 'Ride': '骑行', 'Walk': '徒步', 'Swim': '游泳'}.get(activity_type, '运动')
    
    # 🧠 计算 8 段时间切分
    time_of_day = "未知时间"
    if start_date:
        try:
            hour = int(start_date[11:13])
            block_idx = hour // 3
            time_zones = [
                "午夜(00:00-03:00)", "破晓(03:00-06:00)", 
                "清晨(06:00-09:00)", "骄阳上午(09:00-12:00)",
                "烈日正午(12:00-15:00)", "午后(15:00-18:00)", 
                "暮色掠影(18:00-21:00)", "暗夜(21:00-24:00)"
            ]
            time_of_day = time_zones[block_idx]
        except:
            pass
            
    # 🧠 动态词汇表：根据不同运动类型，给 AI 不同的取名示范
    if activity_type in ['Ride', 'VirtualRide', 'EBikeRide']:
        examples = '词汇参考：晨光破风、午后巡航、暗夜飞驰、烈日踏频等'
    elif activity_type in ['Walk', 'Hike']:
        examples = '词汇参考：晨光漫步、落日丈量、暗夜穿梭、清晨闲步等（绝对禁止使用"破风"、"巡航"、"飞驰"等速度感太强的词汇）'
    elif activity_type in ['Run', 'TrailRun', 'Treadmill']:
        examples = '词汇参考：晨光微汗、落日步履、暗夜追影、骄阳奔袭等'
    else:
        examples = '词汇参考：晨光微汗、破浪前行等'
    
    prompt = f"""
    我刚在【{time_of_day}】完成了一次{type_cn}。距离：{distance}公里，用时：{time_str}，配速/均速：{pace_str}，平均心率：{hr or '未知'}。
    请作为一个懂行且高情商的运动私教，生成两段内容：
    
    1. title: 一个简短有意境的标题（绝不能超过6个字）。不要使用任何固定的标点符号！请强烈结合【{time_of_day}】的光线特点和{type_cn}的运动特性发挥创意。
    【命名铁律】：{examples}。你可以直接使用这些参考词汇，但为了避免几百条记录千篇一律，强烈要求你发散思维，原创更多同等意境的新词汇！绝对不能在白天使用夜晚的词汇！
    
    2. comment: 一段 50-80 字的专业短评。
    
    【语言要求】：必须是纯正流畅的中文，绝对不能夹杂任何英文单词或生硬的机器翻译腔！
    【绝对禁令】：绝不能在短评中重复写出距离、配速、用时、心率的具体数字！
    【点评要求】：根据心率和配速的比例，给出真实的训练反馈（比如心率低配速快夸耐力好，心率高提示多做低心率有氧打底，或者对长距离给予恢复建议）。
    【多样性】：每次生成请尽量使用不同的修辞和视角，语气像老朋友一样自然。

    请严格只返回 JSON 格式数据，不要带任何 markdown 标记或其他废话：
    {{"title": "...", "comment": "..."}}
    """

    url = f"https://api.cloudflare.com/client/v4/accounts/{CF_ACCOUNT_ID}/ai/run/@cf/meta/llama-3.1-8b-instruct"
    headers = {"Authorization": f"Bearer {CF_AI_TOKEN}"}
    
    payload = {
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.85 
    }

    try:
        response = requests.post(url, headers=headers, json=payload, timeout=15)
        if response.status_code == 200:
            result_text = response.json()['result']['response']
            clean_text = result_text.replace('```json', '').replace('```', '').strip()
            result_json = json.loads(clean_text)
            return result_json.get('title'), result_json.get('comment')
    except Exception as e:
        print(f"⚠️ AI 生成失败 (忽略): {e}")
    
    return None, None

def process_and_merge(local_data, raw_new_data):
    formatted_new_data = []
    
    for item in raw_new_data:
        polyline = item.get('map', {}).get('summary_polyline') or ""
        
        start_date = item.get('start_date_local', '')
        safe_time = start_date.replace('Z', '') if start_date else ""
        
        avg_speed_ms = item.get('average_speed', 0)
        pace_num, pace_unit = calculate_pace(item.get('type'), avg_speed_ms)
        hr = item.get('average_heartrate', 0)
        # 🛡️ 优化：没有心率时赋予 null 语义 (Python中的 None)
        safe_hr = round(hr) if hr else None
        
        distance_km = round(item.get('distance', 0) / 1000, 2)
        moving_time_str = format_time(item.get('moving_time', 0))
        full_pace = f"{pace_num}{pace_unit}"
        
        # 👇 只有在抓取到新数据时，才请求 AI 生成文案
        print(f"🤖 正在为新运动 [{safe_time}] 请求 AI 智能私教生成文案...")
        ai_title, ai_comment = generate_ai_content(item.get('type'), distance_km, moving_time_str, safe_hr, full_pace, safe_time)
            
        formatted_new_data.append({
            "run_id": item.get('id'),
            "name": item.get('name', '未命名运动'),
            "ai_title": ai_title,       # 👈 新增字段
            "ai_comment": ai_comment,   # 👈 新增字段
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
        })
        
    if not formatted_new_data:
        return local_data, 0, 0

    merged_dict = {item['run_id']: item for item in local_data if 'run_id' in item}
    initial_count = len(merged_dict)
    
    for item in formatted_new_data:
        merged_dict[item['run_id']] = item
        
    final_list = list(merged_dict.values())
    
    # 🛡️ 优化：使用真实的 datetime 对象进行严谨倒序
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
    if after_ts:
        print(f"⏱️ 开启增量同步模式 (仅拉取 {datetime.fromtimestamp(after_ts)} 之后的新记录)")
    else:
        print("🌍 本地无数据或格式异常，开启首次全量同步模式")

    token = get_access_token()
    if token:
        raw_new_activities = fetch_activities(token, after_ts)
        final_data, fetched_count, added_count = process_and_merge(local_data, raw_new_activities)
        
        if fetched_count > 0:
            # 🛡️ 优化：原子化写入，防止构建意外中断导致 JSON 变砖
            tmp_file = FILE_NAME + ".tmp"
            with open(tmp_file, 'w', encoding='utf-8') as f:
                json.dump(final_data, f, ensure_ascii=False, indent=2)
            os.replace(tmp_file, FILE_NAME)
            
            print(f"✅ 大功告成！本次从 Strava 获取了 {fetched_count} 条数据，净新增 {added_count} 条记录。")
            print(f"📊 目前总库中共有 {len(final_data)} 条记录。")
        else:
            print("💤 没有发现新的运动记录，JSON 文件无需更新。")