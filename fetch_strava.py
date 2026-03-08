import requests
import json
import os
from datetime import datetime

# ==========================================
# 1. 🔑 配置区：通过 GitHub Secrets 动态获取
# ==========================================
CLIENT_ID = os.getenv('STRAVA_CLIENT_ID')
CLIENT_SECRET = os.getenv('STRAVA_CLIENT_SECRET')
REFRESH_TOKEN = os.getenv('STRAVA_REFRESH_TOKEN')

# 安全检查：确保环境变量已正确加载
if not all([CLIENT_ID, CLIENT_SECRET, REFRESH_TOKEN]):
    print("❌ 致命错误: 缺少 Strava API 环境变量凭证！请检查 GitHub Secrets 设置。")
    exit(1)

# ==========================================
# 2. 📁 路径绑定：强制生成到博客的 assets 目录
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
    response = requests.post(auth_url, data=payload, verify=True)
    if response.status_code == 200:
        return response.json().get('access_token')
    print(f"❌ 认证失败: {response.text}")
    return None

def load_local_data():
    if os.path.exists(FILE_NAME):
        with open(FILE_NAME, 'r', encoding='utf-8') as f:
            try:
                return json.load(f)
            except json.JSONDecodeError:
                return []
    return []

def get_latest_timestamp(local_data):
    if not local_data:
        return None
    latest_date_str = local_data[0]['start_date_local'] + "Z"
    latest_time = datetime.strptime(latest_date_str, "%Y-%m-%dT%H:%M:%SZ")
    return int(latest_time.timestamp())

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
        response = requests.get(activities_url, headers=headers, params=params)
        
        if response.status_code != 200:
            print(f"❌ 数据拉取失败: {response.text}")
            break
            
        data = response.json()
        if not data:
            break
            
        all_activities.extend(data)
        page += 1
        if after_timestamp:
            break

    return all_activities

def format_time(seconds):
    m, s = divmod(seconds, 60)
    h, m = divmod(m, 60)
    if h > 0:
        return f"{int(h):02d}:{int(m):02d}:{int(s):02d}"
    return f"{int(m):02d}:{int(s):02d}"

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

def process_and_merge(local_data, raw_new_data):
    formatted_new_data = []
    
    for item in raw_new_data:
        if not item.get('map', {}).get('summary_polyline'):
            continue
            
        safe_time = item['start_date_local'].replace('Z', '')
        avg_speed_ms = item.get('average_speed', 0)
        pace_num, pace_unit = calculate_pace(item['type'], avg_speed_ms)
        hr = item.get('average_heartrate', 0)
        safe_hr = round(hr) if hr else 0
            
        formatted_new_data.append({
            "run_id": item['id'],
            "name": item['name'],
            "type": item['type'],
            "distance": round(item['distance'] / 1000, 2),
            "moving_time": format_time(item['moving_time']),
            "start_date_local": safe_time,               
            "average_heartrate": safe_hr,                
            "average_speed": round(avg_speed_ms * 3.6, 2), 
            "pace_num": pace_num,                        
            "pace_unit": pace_unit,                      
            "total_elevation_gain": item.get('total_elevation_gain', 0),
            "summary_polyline": item['map']['summary_polyline']
        })
        
    if not formatted_new_data:
        return local_data, 0

    merged_dict = {item['run_id']: item for item in local_data}
    for item in formatted_new_data:
        merged_dict[item['run_id']] = item
        
    final_list = list(merged_dict.values())
    final_list.sort(key=lambda x: x['start_date_local'], reverse=True)
    
    return final_list, len(formatted_new_data)

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
        print("🌍 本地无数据，开启首次全量同步模式")

    token = get_access_token()
    if token:
        raw_new_activities = fetch_activities(token, after_ts)
        final_data, new_count = process_and_merge(local_data, raw_new_activities)
        
        if new_count > 0:
            with open(FILE_NAME, 'w', encoding='utf-8') as f:
                json.dump(final_data, f, ensure_ascii=False, indent=2)
            print(f"✅ 大功告成！成功获取 {new_count} 条新记录。目前总库中共有 {len(final_data)} 条记录。")
        else:
            print("💤 没有发现新的运动记录，JSON 文件无需更新。")