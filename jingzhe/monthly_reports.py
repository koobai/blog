"""Monthly report providers, validation, persistence, and freeze state machine."""

import hashlib
import json
import os
import re
import time
from datetime import datetime
from zoneinfo import ZoneInfo

import requests

from jingzhe.monthly_stats import (
    RIDE_TYPES,
    RUN_WALK_TYPES,
    SPORT_NAMES,
    activities_through_day,
    build_evidence,
    calculate_monthly_stats,
    group_by_month,
    parse_local_datetime,
    previous_month_key,
    public_stats,
    source_data_hash,
)

REPORT_VERSION = 6
MODEL = 'deepseek-v4-flash'
API_URL = 'https://api.deepseek.com/chat/completions'
MID_MONTH_DAY = 16
MIN_MID_MONTH_SESSIONS = 6
MIN_MID_MONTH_ACTIVE_DAYS = 5


def report_hash(facts):
    stable_facts = {key: value for key, value in facts.items() if key != 'style_avoidance'}
    encoded = json.dumps(stable_facts, ensure_ascii=False, sort_keys=True, separators=(',', ':'))
    return hashlib.sha256(encoded.encode('utf-8')).hexdigest()


def without_last_update(entry):
    """Exclude persistence metadata when deciding whether report content changed."""
    return {key: value for key, value in entry.items() if key != 'last_update'}


def parse_json_content(content):
    text = str(content or '').strip().replace('```json', '').replace('```', '').strip()
    try:
        value = json.loads(text)
        return value if isinstance(value, dict) else None
    except json.JSONDecodeError:
        match = re.search(r'\{.*\}', text, re.S)
        if not match:
            return None
        try:
            value = json.loads(match.group(0))
            return value if isinstance(value, dict) else None
        except json.JSONDecodeError:
            return None


def validate_report(report, evidence_ids):
    if not isinstance(report, dict):
        return '没有得到 JSON 对象'
    required = ('verdict', 'analysis', 'next_plan')
    for field in required:
        if not str(report.get(field) or '').strip():
            return f'缺少 {field}'
    lengths = {
        'verdict': (25, 120),
        'analysis': (90, 360),
        'next_plan': (45, 220)
    }
    for field, (minimum, maximum) in lengths.items():
        size = len(str(report.get(field) or '').strip())
        if size < minimum or size > maximum:
            return f'{field} 长度不合适（{size}）'
    used_ids = report.get('evidence_ids')
    if not isinstance(used_ids, list) or len(set(used_ids)) < 3:
        return '至少需要引用三个证据维度'
    if any(item not in evidence_ids for item in used_ids):
        return '引用了不存在的证据维度'
    combined = ''.join(str(report.get(field) or '') for field in required)
    if any(term in combined for term in (
        '你', '您', '博主',
        '重复路线', '同一路线', '同路', '路线复现',
        '心肺功能提升', '恢复良好', '燃脂区', '有氧区', '医学诊断',
        '体重下降', '减重成功', '减脂效果', '燃脂效果', '血糖改善', '糖尿病改善',
        '睡眠改善', '代谢提升'
    )):
        return '出现了私聊称谓或无数据支持的健康结论'
    if not re.search(r'\d', combined):
        return '没有引用任何具体数字证据'
    return None


def deepseek_error(response):
    try:
        payload = response.json()
        error = payload.get('error') if isinstance(payload, dict) else None
        if isinstance(error, dict):
            return str(error.get('message') or error.get('code') or error)[:240]
        return str(payload)[:240]
    except ValueError:
        return str(response.text or '')[:240]


def request_deepseek_report(api_key, facts, correction=None):
    evidence_json = json.dumps(facts, ensure_ascii=False, indent=2)
    correction_text = (
        f'\n上一次未通过程序校验：{correction}。请重写完整 JSON，并重点修正该问题；'
        'next_plan 必须压缩在 80～180 个中文字符内。'
        if correction else ''
    )
    system_prompt = (
        '你是个人运动博客的月度教练。程序已经完成全部计算；只能使用输入中的证据，'
        '不得补充常识推测、医学判断、天气、身体感受或不存在的训练目标。'
        '不得判断或总结重复路线、同路表现及路线复现情况。'
        '六个基础维度和动态信号都是候选证据，不是固定栏目；需要自行找出本月真正值得讲的主线。输出必须是 JSON。'
    )
    user_prompt = f"""
下面是本期月度运动报告唯一可使用的证据包：
{evidence_json}

请围绕既定目标写一份真正能指导下一阶段的公开月报：
1. 先从全部 evidence 中自行选择三至五项最有解释力的事实，可以选动态信号，也可以发现两项证据之间的新关系；不得按输入顺序逐项汇报。
2. verdict 用一句话给出本阶段最重要的判断，必须带具体数字。
3. analysis 用两至四句话解释选中的事实为什么重要。不能罗列全部数据；要把出勤、总量、单次耐力、节奏心率或运动结构交叉起来，形成一条自然主线。
4. next_plan 给出未来半个月或下个月可执行、可验证的安排。可以发挥教练判断，不必照抄示例，但必须服从 coaching_boundaries，并说明届时用什么记录判断是否做到。
5. sample_limits 只用于避免把少量样本写成长期趋势，不要把它单独写成结尾声明；尤其不要输出“缺少体重、饮食、睡眠、心率区间”一类固定免责声明。
6. 使用公开旁观视角，不出现“你、您、博主”。不写“继续保持、加油”，不把平均心率变化等同于心肺能力、恢复或减脂成果。
7. style_avoidance 只是近期月报的表达参考，不是运动事实；避免复用相同开头、句式和收束。
8. evidence_ids 列出实际使用的三至五个证据 id。
9. 严格控制篇幅：verdict 35～90 个中文字符，analysis 120～300 个中文字符，next_plan 80～180 个中文字符；不要贴近程序允许的长度上限。
{correction_text}

只返回以下 JSON 结构：
{{
  "verdict": "...",
  "analysis": "...",
  "next_plan": "...",
  "evidence_ids": ["consistency", "event_longest_session", "quality"]
}}
"""
    payload = {
        'model': MODEL,
        'messages': [
            {'role': 'system', 'content': system_prompt},
            {'role': 'user', 'content': user_prompt}
        ],
        'thinking': {'type': 'enabled'},
        'reasoning_effort': 'high',
        'response_format': {'type': 'json_object'},
        'max_tokens': 6000,
        'stream': False
    }
    headers = {'Authorization': f'Bearer {api_key}', 'Content-Type': 'application/json'}
    for attempt, delay in enumerate((0, 8, 25)):
        if delay:
            print(f'⏳ DeepSeek 暂时繁忙，{delay} 秒后重试...')
            time.sleep(delay)
        try:
            response = requests.post(API_URL, headers=headers, json=payload, timeout=120)
        except requests.RequestException as error:
            print(f'⚠️ DeepSeek 请求异常: {error}')
            if attempt < 2:
                continue
            return None
        if response.status_code == 200:
            body = response.json()
            choices = body.get('choices') if isinstance(body, dict) else None
            content = (((choices or [{}])[0].get('message') or {}).get('content'))
            usage = body.get('usage') or {}
            if usage:
                print(
                    f"   ↳ DeepSeek 用量：输入 {usage.get('prompt_tokens', 0)}，"
                    f"输出 {usage.get('completion_tokens', 0)} tokens"
                )
            return parse_json_content(content)
        print(f'⚠️ DeepSeek 请求失败 (HTTP {response.status_code}): {deepseek_error(response)}')
        if response.status_code not in (408, 429, 500, 502, 503, 504):
            return None
    return None


def generate_report(api_key, facts):
    evidence_ids = {item['id'] for item in facts['evidence']}
    report = request_deepseek_report(api_key, facts)
    issue = validate_report(report, evidence_ids)
    if not issue:
        return {
            key: report[key]
            for key in ('verdict', 'analysis', 'next_plan', 'evidence_ids')
        }
    print(f'🔁 DeepSeek 月报未通过校验，定向重写一次: {issue}')
    report = request_deepseek_report(api_key, facts, correction=issue)
    issue = validate_report(report, evidence_ids)
    if issue:
        print(f'⚠️ DeepSeek 月报仍未通过校验: {issue}')
        return None
    return {
        key: report[key]
        for key in ('verdict', 'analysis', 'next_plan', 'evidence_ids')
    }


class DeepSeekReportProvider:
    """Default adapter; the state machine only depends on generate() and model."""

    model = MODEL

    def __init__(self, api_key):
        self.api_key = api_key

    def generate(self, facts):
        return generate_report(self.api_key, facts)


def update_monthly_insights(
    activities,
    output_path,
    api_key=None,
    now=None,
    report_provider=None
):
    # GitHub Actions 使用 UTC；月中和月末边界必须按博客所在的杭州时区判断。
    now = now or datetime.now(ZoneInfo('Asia/Shanghai'))
    api_key = api_key or os.getenv('DEEPSEEK_API_KEY')
    provider = report_provider or (DeepSeekReportProvider(api_key) if api_key else None)
    grouped = group_by_month(activities)
    try:
        with open(output_path, 'r', encoding='utf-8') as file:
            existing = json.load(file)
            if not isinstance(existing, dict):
                existing = {}
    except (FileNotFoundError, json.JSONDecodeError):
        existing = {}

    current_month = now.strftime('%Y-%m')
    updated = {}
    changed = False
    recent_report_styles = []

    for month_key in sorted(grouped):
        month_activities = grouped[month_key]
        stats = calculate_monthly_stats(month_activities)
        current_source_hash = source_data_hash(month_activities)
        midmonth_activities = activities_through_day(month_activities, MID_MONTH_DAY - 1)
        midmonth_stats = calculate_monthly_stats(midmonth_activities)
        midmonth_source_hash = source_data_hash(midmonth_activities)
        old_entry = existing.get(month_key, {})
        is_current = month_key == current_month
        cutoff_day = now.day if is_current else max(
            (parse_local_datetime(item.get('start_date_local')).day for item in month_activities if parse_local_datetime(item.get('start_date_local'))),
            default=1
        )

        existing_midmonth = (
            old_entry.get('report_version') == REPORT_VERSION
            and old_entry.get('report_phase') == 'midmonth'
            and isinstance(old_entry.get('coach_report'), dict)
        )
        previous_midmonth_source_hash = old_entry.get('midmonth_source_hash')
        midmonth_source_changed = bool(
            existing_midmonth
            and previous_midmonth_source_hash
            and previous_midmonth_source_hash != midmonth_source_hash
        )
        midmonth_eligible = (
            now.day >= MID_MONTH_DAY
            and midmonth_stats['total_count'] >= MIN_MID_MONTH_SESSIONS
            and midmonth_stats['active_days_count'] >= MIN_MID_MONTH_ACTIVE_DAYS
        )

        # 月中报告固定统计 1～15 日。16 日 04:00 会主动检查；若当时数据尚未
        # 同步，之后任意一次普通同步达到门槛后都会补生成。已生成后若 1～15 日
        # 的源数据迟到变化则纠正一次，16 日之后新发生的运动不会反复改写它。
        if is_current and not existing_midmonth and not midmonth_eligible:
            if now.day < MID_MONTH_DAY:
                accumulating_text = '还在热身，继续动起来，月报稍后见。'
            elif not midmonth_eligible:
                accumulating_text = '热身继续，再动几次，就有话说了。'
            else:
                accumulating_text = '本月数据已就绪'
            entry = {
                'month_str': month_key,
                'stats': public_stats(stats),
                'report_phase': 'accumulating',
                'status_text': accumulating_text,
                'comparison_basis': '等待月中样本',
                'source_data_hash': current_source_hash
            }
            if without_last_update(entry) != without_last_update(old_entry):
                entry['last_update'] = now.strftime('%Y-%m-%dT%H:%M:%S')
                changed = True
            else:
                entry['last_update'] = old_entry.get('last_update')
            updated[month_key] = entry
            continue

        existing_final = (
            old_entry.get('report_version') == REPORT_VERSION
            and old_entry.get('report_phase') == 'final'
            and isinstance(old_entry.get('coach_report'), dict)
        )
        previous_source_hash = old_entry.get('source_data_hash')
        final_source_changed = bool(
            existing_final
            and previous_source_hash
            and previous_source_hash != current_source_hash
        )

        # 已完成且源数据未变化的终稿永久冻结。旧终稿第一次遇到源数据指纹时
        # 只补记当前基线，不因代码或提示词变化而重写。
        if not is_current and existing_final and not final_source_changed:
            entry = dict(old_entry)
            entry['month_str'] = month_key
            entry['stats'] = public_stats(stats)
            entry['source_data_hash'] = current_source_hash
            if without_last_update(entry) != without_last_update(old_entry):
                entry['last_update'] = now.strftime('%Y-%m-%dT%H:%M:%S')
                changed = True
            else:
                entry['last_update'] = old_entry.get('last_update')
            updated[month_key] = entry
            if isinstance(entry.get('coach_report'), dict):
                recent_report_styles.append(entry['coach_report'])
            continue

        phase = 'midmonth' if is_current else 'final'
        report_stats = midmonth_stats if phase == 'midmonth' else stats
        report_cutoff_day = MID_MONTH_DAY - 1 if phase == 'midmonth' else cutoff_day
        comparison_month = previous_month_key(month_key)
        previous_activities = grouped.get(comparison_month, [])
        previous_full_stats = calculate_monthly_stats(previous_activities) if previous_activities else None
        previous_period_activities = activities_through_day(previous_activities, report_cutoff_day) if phase == 'midmonth' else previous_activities
        previous_period_stats = calculate_monthly_stats(previous_period_activities) if previous_period_activities else None
        facts = build_evidence(
            month_key,
            phase,
            report_stats,
            previous_period_stats,
            previous_full_stats,
            report_cutoff_day,
            recent_report_styles=recent_report_styles
        )
        current_hash = report_hash(facts)
        old_report_valid = (
            old_entry.get('report_version') == REPORT_VERSION
            and old_entry.get('report_phase') == phase
            and old_entry.get('report_data_hash') == current_hash
            and isinstance(old_entry.get('coach_report'), dict)
        )
        # 月中报告生成后冻结；后续运动只更新统计，直到完整月份再生成最终复盘。
        frozen_midmonth = (
            phase == 'midmonth'
            and old_entry.get('report_version') == REPORT_VERSION
            and old_entry.get('report_phase') == 'midmonth'
            and isinstance(old_entry.get('coach_report'), dict)
            and not midmonth_source_changed
        )
        # 终稿只有在源运动数据没有迟到变化时才冻结；迟到同步会让它重新生成。
        frozen_final = (
            not is_current
            and old_entry.get('report_version') == REPORT_VERSION
            and old_entry.get('report_phase') == 'final'
            and isinstance(old_entry.get('coach_report'), dict)
            and not final_source_changed
        )

        report = old_entry.get('coach_report') if (old_report_valid or frozen_midmonth or frozen_final) else None
        # 已有报告继续保留其实际生成模型；切换默认模型不会改写历史元数据。
        report_model = old_entry.get('model') if report is not None else None
        report_data_hash = old_entry.get('report_data_hash') if (frozen_midmonth or frozen_final) else current_hash
        report_as_of = old_entry.get('report_as_of') if (frozen_midmonth or frozen_final) else f'{month_key}-{report_cutoff_day:02d}'

        if report is None and provider:
            print(f"🧠 {month_key} 正在生成{'月中报告' if phase == 'midmonth' else '最终报告'}...")
            report = provider.generate(facts)
            if report is not None:
                report_model = getattr(provider, 'model', MODEL)
        elif report is None:
            print(f'⏸️ {month_key} 等待 DEEPSEEK_API_KEY，保留现有月报。')

        if report is not None:
            entry = {
                'month_str': month_key,
                'stats': public_stats(stats),
                'report_phase': phase,
                'report_as_of': report_as_of,
                'coach_report': report,
                'report_version': REPORT_VERSION,
                'report_data_hash': report_data_hash,
                'source_data_hash': current_source_hash,
                **({'midmonth_source_hash': midmonth_source_hash} if phase == 'midmonth' else {}),
                'model': report_model or MODEL,
                'comparison_basis': facts['comparison_basis']
            }
        else:
            entry = dict(old_entry)
            entry['month_str'] = month_key
            entry['stats'] = public_stats(stats)

        if without_last_update(entry) != without_last_update(old_entry):
            entry['last_update'] = now.strftime('%Y-%m-%dT%H:%M:%S')
            changed = True
        else:
            entry['last_update'] = old_entry.get('last_update')
        updated[month_key] = entry
        if isinstance(entry.get('coach_report'), dict):
            recent_report_styles.append(entry['coach_report'])

    if set(existing) != set(updated):
        changed = True
    if changed:
        with open(output_path, 'w', encoding='utf-8') as file:
            json.dump(updated, file, ensure_ascii=False, indent=2)
    return changed
