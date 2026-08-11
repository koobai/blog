import json
import os
import time
import random
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
    'Ride': '骑行',
    'Walk': '步行',
    'Hike': '徒步',
    'StairStepper': '爬楼梯',
    'Swim': '游泳'
}

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
# 🚀 3. Cloudflare AI 智能私教生成引擎 (保留高级特性)
# ==========================================
def generate_ai_content(activity_type, distance, time_str, hr, pace_str, start_date, 
                        global_gap_days=None, last_type=None, 
                        same_gap_days=None, old_dist=None, old_pace=None, old_hr=None):
    if not CF_ACCOUNT_ID or not CF_AI_TOKEN:
        return None, None
        
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
    
    请作为一个懂行且高情商的运动私教，生成两段内容：
    
    1. title: 一个极具张力和意境的标题（绝不能超过6个字）。
    【标题致命铁律】：绝对禁止使用“春风”、“春日”、“暮色”、“清晨”等千篇一律的时间/季节词汇作为开头！必须直接从动作、情绪、身体感受或抽象意象切入！
    
    2. comment: 一段 50-80 字的专业短评。根据心率和配速的比例给出反馈。
    
    【评价策略指引】：如果有【上下文记忆情报】，请将其融入短评（如调侃懈怠、夸奖交叉训练、对比影子对手）。
    【强制创意视角】：本次生成，请你务必强制使用【{current_focus}】的视角来构思标题和短评！
    【运动类型铁律】：当前运动是【{type_cn}】！绝对禁止出现其他运动的词汇！
    【JSON安全铁律】：内部绝对禁止使用双引号（"）和换行符！需要强调请用单引号（'）。
    【绝对禁令】：绝不能在短评中像机器一样重复写出距离、配速、用时、心率的具体数字！将它们化为感性的描述。

    请严格只返回 JSON 格式数据：
    {{"title": "...", "comment": "..."}}
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
            return result_json.get('title'), result_json.get('comment')
    except Exception as e:
        print(f"⚠️ AI 生成失败: {e}")
    return None, None

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
    
    # 🚀 AI 补全文案自愈程序
    for i, item in enumerate(local_data):
        # 兼容处理：如果没有AI标题，或者标题是兜底预设词，就触发高级AI重新生成
        ai_title = item.get('ai_title', '')
        if not ai_title or ai_title in ["破风前行", "破风逐光"]:
            safe_time = item.get('start_date_local', '')
            print(f"🛠️ 发现记录 [{safe_time}] 缺乏高级 AI 文案，正在呼叫私人教练...")
            
            older_history = local_data[i+1:]
            current_dt = parse_time(safe_time)
            global_prev = older_history[0] if older_history else None
            same_prev = next((x for x in older_history if x.get('type') == item.get('type')), None)
            
            t, c = generate_ai_content(
                item.get('type'), item.get('distance', 0), item.get('moving_time', ''), item.get('average_heartrate'), f"{item.get('pace_num', '')}{item.get('pace_unit', '')}", safe_time,
                (current_dt - parse_time(global_prev['start_date_local'])).days if global_prev else None,
                global_prev.get('type') if global_prev else None,
                (current_dt - parse_time(same_prev['start_date_local'])).days if same_prev else None,
                same_prev.get('distance') if same_prev else None,
                f"{same_prev.get('pace_num', '')}{same_prev.get('pace_unit', '')}" if same_prev else None,
                same_prev.get('average_heartrate') if same_prev else None
            )
            
            if t and c:
                item['ai_title'] = t
                item['ai_comment'] = c
                needs_save = True
                print(f"   ↳ 生成成功: [{t}]")
            time.sleep(1) # 防止触发 API 频率限制
            
    if needs_save:
        with open(FILE_NAME, 'w', encoding='utf-8') as f:
            json.dump(local_data, f, ensure_ascii=False, indent=2)
        print("✅ 历史记录 AI 文案填充完毕！")
    else:
        print("💤 所有数据均已具备高级文案，跳过更新。")

    print("📊 正在同步月度洞察报告...")
    update_monthly_insights(local_data)
    print("✨ 全部流程执行完毕！")
