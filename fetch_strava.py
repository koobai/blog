import requests
import json
import os
import time
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
# 2. 📁 路径绑定与全局变量
# ==========================================
PROJECT_ROOT = os.path.dirname(os.path.abspath(__file__))
TARGET_DIR = os.path.join(PROJECT_ROOT, 'assets')

if not os.path.exists(TARGET_DIR):
    os.makedirs(TARGET_DIR)

FILE_NAME = os.path.join(TARGET_DIR, 'activities.json')

# 锁定系统当前年份，用于数据过滤和跨年清空
CURRENT_YEAR = str(datetime.now().year)

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
    """读取本地数据，并执行【跨年销毁】逻辑"""
    if os.path.exists(FILE_NAME):
        with open(FILE_NAME, 'r', encoding='utf-8') as f:
            try:
                data = json.load(f) or []
                # 🔪 核心过滤：只保留当前年份的数据。往年数据在此刻被直接丢弃（销毁）
                filtered_data = [item for item in data if item.get('start_date_local', '').startswith(CURRENT_YEAR)]
                return filtered_data
            except json.JSONDecodeError:
                return []
    return []

def get_latest_timestamp(local_data):
    """获取同步起点。如果有本地数据则从最新一条开始；如果为空则从今年1月1日开始"""
    if local_data:
        latest_date_str = local_data[0].get('start_date_local', '') 
        try:
            latest_time = datetime.strptime(latest_date_str, "%Y-%m-%dT%H:%M:%S")
            return int(latest_time.timestamp())
        except ValueError:
            pass
            
    # 如果本地无数据（例如刚跨年被销毁，或首次运行），则返回今年 1月1日 00:00:00 的时间戳
    jan1_dt = datetime(datetime.now().year, 1, 1)
    return int(jan1_dt.timestamp())

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
            time.sleep(0.5) # API 限速保护
            
        except Exception as e:
            print(f"❌ 拉取数据时发生异常: {e}")
            break

    return all_activities

def parse_time(time_str):
    try:
        return datetime.strptime(time_str, "%Y-%m-%dT%H:%M:%S")
    except Exception:
        return datetime.min

def process_and_merge(local_data, raw_new_data):
    formatted_new_data = []
    
    for item in raw_new_data:
        start_date = item.get('start_date_local', '')
        safe_time = start_date.replace('Z', '') if start_date else ""
        
        # 🛡️ 双重保险：Strava API 有时会因为时区问题返回去年末的数据，强制过滤掉非今年的数据
        if not safe_time.startswith(CURRENT_YEAR):
            continue
            
        # 🔪 极致精简：只保留 去重ID、运动类型、距离、本地时间。摒弃所有用不到的数据
        formatted_new_data.append({
            "run_id": item.get('id'),
            "type": item.get('type', 'Workout'),
            "distance": round(item.get('distance', 0) / 1000, 2),
            "start_date_local": safe_time
        })
        
    if not formatted_new_data:
        return local_data, 0, 0

    # 合并去重 (依赖 run_id 进行精准去重)
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
    print(f"📅 当前系统年份: {CURRENT_YEAR}年")
    
    local_data = load_local_data()
    print(f"📁 本地已成功加载 {len(local_data)} 条【当年】记录（往年数据若存在已自动销毁）。")
    
    after_ts = get_latest_timestamp(local_data)
    print(f"⏱️ 增量同步时间起点: {datetime.fromtimestamp(after_ts)}")

    token = get_access_token()
    if token:
        raw_new_activities = fetch_activities(token, after_ts)
        final_data, fetched_count, added_count = process_and_merge(local_data, raw_new_activities)
        
        if fetched_count > 0 or len(final_data) != len(local_data):
            # 原子化写入
            tmp_file = FILE_NAME + ".tmp"
            with open(tmp_file, 'w', encoding='utf-8') as f:
                json.dump(final_data, f, ensure_ascii=False, indent=2)
            os.replace(tmp_file, FILE_NAME)
            
            print(f"✅ 大功告成！本次获取了 {fetched_count} 条有效数据，净新增 {added_count} 条。")
            print(f"📊 目前总库中共有 {len(final_data)} 条【{CURRENT_YEAR}年度】记录。")
        else:
            print("💤 没有发现新的运动记录，或旧数据无需清理，JSON 文件未变更。")