import requests
import json
import os
import time  # 新增：用于 API 限速保护
from datetime import datetime

# ==========================================
# 1. 🔑 配置区：通过 GitHub Secrets 动态获取
# ==========================================
CLIENT_ID = os.getenv('STRAVA_CLIENT_ID')
CLIENT_SECRET = os.getenv('STRAVA_CLIENT_SECRET')
REFRESH_TOKEN = os.getenv('STRAVA_REFRESH_TOKEN')

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
            
        formatted_new_data.append({
            "run_id": item.get('id'),
            "name": item.get('name', '未命名运动'),
            "type": item.get('type', 'Workout'),
            "distance": round(item.get('distance', 0) / 1000, 2),
            "moving_time": format_time(item.get('moving_time', 0)),
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