import hashlib
import json
import os
import re
import statistics
import time
from collections import defaultdict
from datetime import datetime
from zoneinfo import ZoneInfo

import requests


REPORT_VERSION = 6
MODEL = 'deepseek-v4-pro'
API_URL = 'https://api.deepseek.com/chat/completions'
MID_MONTH_DAY = 16
MIN_MID_MONTH_SESSIONS = 6
MIN_MID_MONTH_ACTIVE_DAYS = 5
GOAL = '稳定减脂优先，兼顾骑行耐力与日常运动习惯，不以竞速和极限成绩为目标'

SPORT_NAMES = {
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

RIDE_TYPES = {'Ride', 'VirtualRide', 'EBikeRide'}
RUN_WALK_TYPES = {'Run', 'TrailRun', 'Treadmill', 'VirtualRun', 'Walk', 'Hike'}


def duration_seconds(value):
    if isinstance(value, (int, float)):
        return max(0, int(value))
    parts = str(value or '').split(':')
    try:
        numbers = [int(part) for part in parts]
    except ValueError:
        return 0
    if len(numbers) == 2:
        return numbers[0] * 60 + numbers[1]
    if len(numbers) == 3:
        return numbers[0] * 3600 + numbers[1] * 60 + numbers[2]
    return 0


def parse_local_datetime(value):
    try:
        return datetime.fromisoformat(str(value or '').replace('Z', '+00:00'))
    except ValueError:
        return None


def round_number(value, digits=1):
    return round(float(value or 0), digits)


def safe_mean(values):
    values = [float(value) for value in values if value not in (None, '')]
    return statistics.mean(values) if values else None


def safe_median(values):
    values = [float(value) for value in values if value not in (None, '')]
    return statistics.median(values) if values else None


def percent_change(current, previous):
    if previous in (None, 0) or current is None:
        return None
    return (float(current) - float(previous)) / float(previous)


def direction(current, previous, tolerance=0.05, lower_is_better=False):
    change = percent_change(current, previous)
    if change is None:
        return '样本不足'
    if abs(change) <= tolerance:
        return '基本持平'
    if lower_is_better:
        return '更快' if change < 0 else '更慢'
    return '增加' if change > 0 else '减少'


def percentage_text(change):
    if change is None:
        return '样本不足'
    return f"{'增加' if change >= 0 else '减少'}约{abs(change) * 100:.0f}%"


def pace_text(seconds_per_km, sport_type):
    if not seconds_per_km:
        return None
    if sport_type in RIDE_TYPES:
        return f'{3600 / seconds_per_km:.1f}公里/小时'
    minutes = int(seconds_per_km // 60)
    seconds = int(round(seconds_per_km % 60))
    if seconds == 60:
        minutes, seconds = minutes + 1, 0
    return f'{minutes}分{seconds:02d}秒/公里'


def longest_streak(active_dates):
    dates = sorted(set(active_dates))
    if not dates:
        return 0
    longest = current = 1
    for previous, current_date in zip(dates, dates[1:]):
        if (current_date - previous).days == 1:
            current += 1
            longest = max(longest, current)
        else:
            current = 1
    return longest


def longest_gap(active_dates):
    dates = sorted(set(active_dates))
    if len(dates) < 2:
        return 0
    return max(max(0, (right - left).days - 1) for left, right in zip(dates, dates[1:]))


def calculate_monthly_stats(activities):
    sport_rows = defaultdict(list)
    sports_count = defaultdict(int)
    sports_distance = defaultdict(float)
    route_counts = defaultdict(int)
    time_preferences = defaultdict(int)
    active_dates = []
    total_seconds = 0
    total_distance = 0.0
    total_calories = 0.0
    total_elevation = 0.0
    highest_hr = None
    longest_activity = None
    indoor_count = 0

    for activity in activities:
        activity_type = activity.get('type', 'Unknown')
        sport_name = SPORT_NAMES.get(activity_type, '运动')
        started_at = parse_local_datetime(activity.get('start_date_local'))
        distance = float(activity.get('distance') or 0)
        seconds = duration_seconds(activity.get('moving_time'))
        calories = float(activity.get('calories') or 0)
        heart_rate = float(activity.get('average_heartrate') or 0)
        elevation = float(activity.get('total_elevation_gain') or 0)
        pace = seconds / distance if seconds > 0 and distance > 0 else None
        row = {
            'type': activity_type,
            'sport': sport_name,
            'distance': distance,
            'duration_seconds': seconds,
            'heart_rate': heart_rate or None,
            'pace_seconds_per_km': pace,
            'elevation': elevation,
            'is_indoor': activity.get('is_indoor') is True,
            'route_group_id': activity.get('route_group_id') or None
        }
        sport_rows[activity_type].append(row)
        sports_count[sport_name] += 1
        sports_distance[sport_name] += distance
        total_seconds += seconds
        total_distance += distance
        total_calories += calories
        total_elevation += elevation
        indoor_count += 1 if row['is_indoor'] else 0
        if started_at:
            active_dates.append(started_at.date())
            hour = started_at.hour
            period = '凌晨' if hour < 6 else '早晨' if hour < 9 else '上午' if hour < 12 else '中午' if hour < 14 else '下午' if hour < 18 else '晚上'
            time_preferences[period] += 1
        if row['route_group_id']:
            route_counts[row['route_group_id']] += 1
        if heart_rate and (highest_hr is None or heart_rate > highest_hr['hr']):
            highest_hr = {
                'date': f'{started_at.day}号' if started_at else None,
                'type': sport_name,
                'hr': round(heart_rate),
                'label': '仅按平均心率排序'
            }
        if longest_activity is None or distance > longest_activity['distance']:
            longest_activity = {'type': sport_name, 'distance': distance}

    sport_metrics = {}
    for activity_type, rows in sport_rows.items():
        sport_name = SPORT_NAMES.get(activity_type, '运动')
        distances = [row['distance'] for row in rows if row['distance'] > 0]
        durations = [row['duration_seconds'] / 60 for row in rows if row['duration_seconds'] > 0]
        heart_rates = [row['heart_rate'] for row in rows if row['heart_rate']]
        paces = [row['pace_seconds_per_km'] for row in rows if row['pace_seconds_per_km']]
        sport_metrics[sport_name] = {
            'type': activity_type,
            'count': len(rows),
            'average_distance': round_number(safe_mean(distances)),
            'median_distance': round_number(safe_median(distances)),
            'average_duration_minutes': round(safe_mean(durations) or 0),
            'median_duration_minutes': round(safe_median(durations) or 0),
            'average_heartrate': round(safe_mean(heart_rates) or 0),
            'median_heartrate': round(safe_median(heart_rates) or 0),
            'pace_seconds_per_km': round(safe_mean(paces) or 0),
            'median_pace_seconds_per_km': round(safe_median(paces) or 0),
            'heart_rate_samples': len(heart_rates)
        }

    primary_sport = None
    primary_type = None
    if sport_rows:
        primary_type = max(sport_rows, key=lambda key: (len(sport_rows[key]), sum(row['duration_seconds'] for row in sport_rows[key])))
        primary_sport = SPORT_NAMES.get(primary_type, '运动')

    ride_distances = [row['distance'] for key in RIDE_TYPES for row in sport_rows.get(key, [])]
    run_walk_distances = [row['distance'] for key in RUN_WALK_TYPES for row in sport_rows.get(key, [])]
    total_count = len(activities)
    active_days = sorted(set(active_dates))
    favorite_time = max(time_preferences, key=time_preferences.get) if time_preferences else '未知'

    return {
        'total_count': total_count,
        'total_distance': round_number(total_distance, 2),
        'total_duration_minutes': round(total_seconds / 60),
        'total_calories': round(total_calories),
        'total_elevation_gain': round(total_elevation),
        'sports_count': dict(sports_count),
        'sports_distance': {key: round_number(value, 2) for key, value in sports_distance.items()},
        'longest_ride_km': round_number(max(ride_distances, default=0), 2),
        'longest_run_km': round_number(max(run_walk_distances, default=0), 2),
        'longest_activity_km': round_number((longest_activity or {}).get('distance'), 2),
        'longest_activity_type': (longest_activity or {}).get('type'),
        'highest_average_hr_session': highest_hr,
        'hardest_session': {
            'date': (highest_hr or {}).get('date'),
            'type': (highest_hr or {}).get('type'),
            'hr': (highest_hr or {}).get('hr', 0),
            'zone': '仅按平均心率排序'
        },
        'average_distance_per_activity': round_number(total_distance / total_count if total_count else 0, 2),
        'average_duration_minutes': round(total_seconds / 60 / total_count) if total_count else 0,
        'primary_sport': primary_sport,
        'primary_sport_type': primary_type,
        'primary_sport_share': round((len(sport_rows.get(primary_type, [])) / total_count), 3) if primary_type and total_count else 0,
        'sport_variety': len(sport_rows),
        'sport_metrics': sport_metrics,
        'repeated_route_groups': sum(1 for count in route_counts.values() if count >= 2),
        'repeated_route_sessions': sum(count for count in route_counts.values() if count >= 2),
        'max_route_visits': max(route_counts.values(), default=0),
        'favorite_time': favorite_time,
        'max_streak_days': longest_streak(active_days),
        'longest_gap_days': longest_gap(active_days),
        'active_days_count': len(active_days),
        'indoor_count': indoor_count,
        'outdoor_count': total_count - indoor_count,
        '_sport_rows': dict(sport_rows)
    }


def public_stats(stats):
    return {key: value for key, value in stats.items() if not key.startswith('_')}


def previous_month_key(month_key):
    current = datetime.strptime(month_key, '%Y-%m')
    year = current.year if current.month > 1 else current.year - 1
    month = current.month - 1 if current.month > 1 else 12
    return f'{year:04d}-{month:02d}'


def group_by_month(activities):
    grouped = defaultdict(list)
    for activity in activities:
        month_key = str(activity.get('start_date_local') or '')[:7]
        if re.fullmatch(r'\d{4}-\d{2}', month_key):
            grouped[month_key].append(activity)
    return dict(grouped)


def source_data_hash(activities):
    """只对会影响月报的运动事实取指纹，不包含轨迹、坐标或提示词版本。"""
    fields = (
        'start_date_local',
        'type',
        'distance',
        'moving_time',
        'calories',
        'average_heartrate',
        'total_elevation_gain',
        'is_indoor',
        'route_group_id'
    )
    normalized = [
        {field: activity.get(field) for field in fields}
        for activity in sorted(
            activities,
            key=lambda item: (
                str(item.get('start_date_local') or ''),
                str(item.get('source_id') or item.get('run_id') or '')
            )
        )
    ]
    encoded = json.dumps(normalized, ensure_ascii=False, sort_keys=True, separators=(',', ':'))
    return hashlib.sha256(encoded.encode('utf-8')).hexdigest()


def activities_through_day(activities, cutoff_day):
    result = []
    for activity in activities:
        started_at = parse_local_datetime(activity.get('start_date_local'))
        if started_at and started_at.day <= cutoff_day:
            result.append(activity)
    return result


def matched_primary_metrics(current_stats, previous_stats):
    primary_type = current_stats.get('primary_sport_type')
    if not primary_type:
        return None
    current_rows = current_stats.get('_sport_rows', {}).get(primary_type, [])
    previous_rows = previous_stats.get('_sport_rows', {}).get(primary_type, []) if previous_stats else []
    if len(current_rows) < 2 or len(previous_rows) < 2:
        return None
    current_distances = [row['distance'] for row in current_rows if row['distance'] > 0]
    if not current_distances:
        return None
    center = safe_median(current_distances)
    lower, upper = center * 0.75, center * 1.25
    current_matched = [row for row in current_rows if lower <= row['distance'] <= upper]
    previous_matched = [row for row in previous_rows if lower <= row['distance'] <= upper]
    if len(current_matched) < 2 or len(previous_matched) < 2:
        return None

    def summarize(rows):
        paces = [row['pace_seconds_per_km'] for row in rows if row['pace_seconds_per_km']]
        heart_rates = [row['heart_rate'] for row in rows if row['heart_rate']]
        return {
            'count': len(rows),
            'median_distance': round_number(safe_median([row['distance'] for row in rows])),
            'median_pace_seconds_per_km': round(safe_median(paces) or 0),
            'median_heartrate': round(safe_median(heart_rates) or 0),
            'heart_rate_samples': len(heart_rates)
        }

    return {
        'sport': SPORT_NAMES.get(primary_type, '运动'),
        'type': primary_type,
        'distance_band': [round_number(lower), round_number(upper)],
        'current': summarize(current_matched),
        'previous': summarize(previous_matched)
    }


def evidence_item(key, title, score, fact, data):
    return {'id': key, 'title': title, 'score': score, 'fact': fact, 'data': data}


def build_dynamic_events(current_stats, previous_period_stats, previous_full_stats, basis):
    """挑出当月真正有辨识度的变化，供模型自由选择，不构成固定栏目。"""
    events = []
    previous_period_stats = previous_period_stats or {}
    previous_full_stats = previous_full_stats or {}

    primary = current_stats.get('primary_sport')
    primary_share = current_stats.get('primary_sport_share') or 0
    if primary and primary_share >= 0.7:
        events.append(evidence_item(
            'event_primary_concentration',
            '主线集中',
            105 if primary_share >= 0.85 else 82,
            f"{primary}占本阶段全部运动的{primary_share * 100:.0f}%，运动安排明显围绕一条主线展开。",
            {'sport': primary, 'share': primary_share}
        ))

    current_sports = set(current_stats.get('sports_count') or {})
    previous_sports = set(previous_period_stats.get('sports_count') or {})
    added_sports = sorted(current_sports - previous_sports)
    if previous_sports and added_sports:
        events.append(evidence_item(
            'event_new_sports',
            '结构变化',
            78,
            f"相比{basis}，本阶段新增了{'、'.join(added_sports)}记录，运动结构不再完全相同。",
            {'added_sports': added_sports, 'basis': basis}
        ))

    current_longest = current_stats.get('longest_activity_km') or 0
    previous_longest = previous_full_stats.get('longest_activity_km') or 0
    longest_change = percent_change(current_longest, previous_longest)
    if longest_change is not None and abs(longest_change) >= 0.12:
        events.append(evidence_item(
            'event_longest_session',
            '单次峰值变化',
            108 if longest_change > 0 else 76,
            f"本阶段最长一次是{current_longest:.1f}公里，上月最长为{previous_longest:.1f}公里，"
            f"单次距离峰值{percentage_text(longest_change)}。",
            {'current_km': current_longest, 'previous_km': previous_longest, 'change': longest_change}
        ))

    repeated_sessions = current_stats.get('repeated_route_sessions') or 0
    total_count = current_stats.get('total_count') or 0
    repeated_share = repeated_sessions / total_count if total_count else 0
    if repeated_sessions >= 3 and repeated_share >= 0.35:
        events.append(evidence_item(
            'event_route_repetition',
            '路线复现',
            88,
            f"本阶段有{repeated_sessions}次运动落在重复路线组，占全部记录约{repeated_share * 100:.0f}%，"
            '适合观察相近条件下节奏是否能够复现。',
            {'sessions': repeated_sessions, 'share': repeated_share}
        ))

    favorite_time = current_stats.get('favorite_time')
    previous_time = previous_period_stats.get('favorite_time')
    if favorite_time and previous_time and favorite_time != '未知' and previous_time != '未知' and favorite_time != previous_time:
        events.append(evidence_item(
            'event_time_shift',
            '运动时段变化',
            58,
            f"最常出现的运动时段由{basis}的{previous_time}变为本阶段的{favorite_time}。",
            {'current': favorite_time, 'previous': previous_time, 'basis': basis}
        ))

    if current_stats.get('max_streak_days', 0) >= 5:
        events.append(evidence_item(
            'event_dense_streak',
            '连续出勤',
            104,
            f"本阶段最长连续运动{current_stats['max_streak_days']}天，是需要在下一阶段安排中留意的密集段。",
            {'days': current_stats['max_streak_days']}
        ))
    elif current_stats.get('longest_gap_days', 0) >= 7:
        events.append(evidence_item(
            'event_long_gap',
            '出勤间隔',
            92,
            f"本阶段最长一次运动间隔达到{current_stats['longest_gap_days']}天，规律性比单次成绩更值得优先观察。",
            {'days': current_stats['longest_gap_days']}
        ))

    previous_indoor = previous_period_stats.get('indoor_count') or 0
    previous_total = previous_period_stats.get('total_count') or 0
    current_indoor_share = (current_stats.get('indoor_count') or 0) / total_count if total_count else 0
    previous_indoor_share = previous_indoor / previous_total if previous_total else 0
    if previous_total >= 4 and abs(current_indoor_share - previous_indoor_share) >= 0.3:
        events.append(evidence_item(
            'event_indoor_outdoor_shift',
            '场景变化',
            62,
            f"室内运动占比由{basis}的{previous_indoor_share * 100:.0f}%变为本阶段的{current_indoor_share * 100:.0f}%。",
            {'current_share': current_indoor_share, 'previous_share': previous_indoor_share, 'basis': basis}
        ))

    return events


def build_evidence(
    month_key,
    phase,
    current_stats,
    previous_period_stats,
    previous_full_stats,
    cutoff_day,
    recent_report_styles=None
):
    basis = '上月同期' if phase == 'midmonth' else '上一个自然月'
    evidence = []
    previous_period_stats = previous_period_stats or {}
    previous_full_stats = previous_full_stats or {}
    has_comparison = bool(previous_period_stats.get('total_count'))

    consistency_change = percent_change(current_stats['active_days_count'], previous_period_stats.get('active_days_count'))
    consistency_fact = (
        f"本阶段共有{current_stats['total_count']}次运动，分布在{current_stats['active_days_count']}个活跃日，"
        f"最长连续{current_stats['max_streak_days']}天"
    )
    if has_comparison:
        consistency_fact += (
            f"；{basis}为{previous_period_stats.get('total_count', 0)}次、"
            f"{previous_period_stats.get('active_days_count', 0)}个活跃日。"
        )
    else:
        consistency_fact += '；此前没有足够的同口径记录，本期先作为出勤基线。'
    evidence.append(evidence_item('consistency', '出勤规律', 90, consistency_fact, {
        'sessions': current_stats['total_count'],
        'active_days': current_stats['active_days_count'],
        'max_streak_days': current_stats['max_streak_days'],
        'longest_gap_days': current_stats['longest_gap_days'],
        'active_days_change': consistency_change,
        'basis': basis
    }))

    distance_change = percent_change(current_stats['total_distance'], previous_period_stats.get('total_distance'))
    duration_change = percent_change(current_stats['total_duration_minutes'], previous_period_stats.get('total_duration_minutes'))
    calories_change = percent_change(current_stats['total_calories'], previous_period_stats.get('total_calories'))
    volume_fact = f"本阶段累计{current_stats['total_distance']:.1f}公里、{current_stats['total_duration_minutes']}分钟，"
    if has_comparison:
        volume_fact += (
            f"相比{basis}距离{percentage_text(distance_change)}、时长{percentage_text(duration_change)}；"
            f"记录消耗{current_stats['total_calories']}千卡，较{basis}{percentage_text(calories_change)}；"
        )
    else:
        volume_fact += f"记录消耗{current_stats['total_calories']}千卡；暂无可用的上一阶段对比；"
    volume_fact += (
        f"平均每次{current_stats['average_distance_per_activity']:.1f}公里、"
        f"{current_stats['average_duration_minutes']}分钟。"
    )
    evidence.append(evidence_item('volume', '运动总量', 85, volume_fact, {
        'distance_change': distance_change,
        'duration_change': duration_change,
        'calories_change': calories_change,
        'basis': basis
    }))

    primary = current_stats.get('primary_sport')
    current_primary = (current_stats.get('sport_metrics') or {}).get(primary, {})
    previous_primary = (previous_full_stats.get('sport_metrics') or {}).get(primary, {})
    if primary and current_primary:
        distance_per_session_change = percent_change(current_primary.get('average_distance'), previous_primary.get('average_distance'))
        duration_per_session_change = percent_change(current_primary.get('average_duration_minutes'), previous_primary.get('average_duration_minutes'))
        endurance_fact = (
            f"{primary}是本阶段主运动，共{current_primary.get('count', 0)}次；平均每次"
            f"{current_primary.get('average_distance', 0):.1f}公里、{current_primary.get('average_duration_minutes', 0)}分钟。"
        )
        if previous_primary:
            endurance_fact += (
                f"上月平均为{previous_primary.get('average_distance', 0):.1f}公里、"
                f"{previous_primary.get('average_duration_minutes', 0)}分钟，单次距离"
                f"{percentage_text(distance_per_session_change)}、单次时长{percentage_text(duration_per_session_change)}。"
            )
        evidence.append(evidence_item('endurance', '单次耐力', 95, endurance_fact, {
            'sport': primary,
            'count': current_primary.get('count', 0),
            'distance_per_session_change': distance_per_session_change,
            'duration_per_session_change': duration_per_session_change
        }))

    matched = matched_primary_metrics(current_stats, previous_full_stats)
    if matched:
        current_matched, previous_matched = matched['current'], matched['previous']
        pace_current = current_matched.get('median_pace_seconds_per_km') or None
        pace_previous = previous_matched.get('median_pace_seconds_per_km') or None
        hr_current = current_matched.get('median_heartrate') or None
        hr_previous = previous_matched.get('median_heartrate') or None
        quality_fact = (
            f"在{matched['distance_band'][0]:.1f}至{matched['distance_band'][1]:.1f}公里的相近{matched['sport']}中，"
            f"本阶段有{current_matched['count']}次、上月有{previous_matched['count']}次可比。"
            f"典型节奏由{pace_text(pace_previous, matched['type'])}变为{pace_text(pace_current, matched['type'])}，"
            f"平均心率中位数由{hr_previous or '缺失'}变为{hr_current or '缺失'}。"
        )
        evidence.append(evidence_item('quality', '节奏质量', 110, quality_fact, {
            'sport': matched['sport'],
            'pace_direction': direction(pace_current, pace_previous, tolerance=0.03, lower_is_better=True),
            'heart_rate_direction': direction(hr_current, hr_previous, tolerance=0.04),
            'current': current_matched,
            'previous': previous_matched
        }))

    sports_text = '、'.join(f'{name}{count}次' for name, count in sorted(current_stats['sports_count'].items(), key=lambda item: -item[1]))
    structure_fact = (
        f"本阶段运动结构为{sports_text}；室外{current_stats['outdoor_count']}次、室内{current_stats['indoor_count']}次，"
        f"累计爬升{current_stats['total_elevation_gain']}米，重复路线覆盖{current_stats['repeated_route_sessions']}次运动。"
    )
    evidence.append(evidence_item('structure', '运动结构', 65, structure_fact, {
        'sports_count': current_stats['sports_count'],
        'primary_sport_share': current_stats['primary_sport_share'],
        'indoor_count': current_stats['indoor_count'],
        'outdoor_count': current_stats['outdoor_count']
    }))

    load_score = 70
    load_parts = []
    if current_stats['max_streak_days'] >= 5:
        load_score += 30
        load_parts.append(f"最长连续运动达到{current_stats['max_streak_days']}天")
    if distance_change is not None and abs(distance_change) >= 0.25:
        load_score += 20
        load_parts.append(f"累计距离较{basis}{percentage_text(distance_change)}")
    if duration_change is not None and abs(duration_change) >= 0.25:
        load_score += 20
        load_parts.append(f"累计时长较{basis}{percentage_text(duration_change)}")
    if not load_parts:
        load_parts.append('运动量与连续出勤没有同时出现明显突变')
    load_fact = '；'.join(load_parts) + '。这只能描述运动安排，不能据此判断身体恢复或健康状态。'
    evidence.append(evidence_item('load_signal', '安排信号', load_score, load_fact, {
        'max_streak_days': current_stats['max_streak_days'],
        'distance_change': distance_change,
        'duration_change': duration_change
    }))

    evidence.extend(build_dynamic_events(current_stats, previous_period_stats, previous_full_stats, basis))

    recommendations = []
    if current_stats['max_streak_days'] >= 5:
        recommendations.append('连续运动达到四至五天后，用休息或短程步行把节奏隔开。')
    if any(change is not None and change >= 0.25 for change in (distance_change, duration_change)):
        recommendations.append('下阶段不要同时增加出勤频率、单次距离和速度，优先稳定已经增加的运动分量。')
    if matched:
        recommendations.append(
            f"再完成二至三次{matched['distance_band'][0]:.0f}至{matched['distance_band'][1]:.0f}公里的相近{matched['sport']}，"
            '用节奏与平均心率是否稳定复现来确认趋势。'
        )
    if primary and current_primary.get('count', 0) >= 3:
        recommendations.append(f"下一阶段以{primary}作为主线，其他运动承担短程补充，不追求所有类型同时增加。")
    recommendations.append('如果某项运动不足三次，只保留事实，不对能力变化下结论。')

    sample_limits = []
    for sport, metric in current_stats.get('sport_metrics', {}).items():
        if metric.get('count', 0) < 3:
            sample_limits.append(f'{sport}本阶段只有{metric.get("count", 0)}次，不适合据此判断长期趋势。')

    return {
        'month': month_key,
        'phase': phase,
        'cutoff_day': cutoff_day,
        'goal': GOAL,
        'comparison_basis': basis,
        'evidence': sorted(evidence, key=lambda item: -item['score']),
        'coaching_boundaries': {
            'objective': GOAL,
            'safe_action_examples': recommendations,
            'freedom': '可以自行组合或提出新的具体安排，但必须能由证据解释、可在下一阶段验证，且不能写医学或极限训练处方。'
        },
        'sample_limits': sample_limits,
        'style_avoidance': [
            {
                'verdict': str(report.get('verdict') or ''),
                'closing': str(report.get('next_plan') or '')
            }
            for report in (recent_report_styles or [])[-3:]
            if isinstance(report, dict)
        ]
    }


def report_hash(facts):
    stable_facts = {key: value for key, value in facts.items() if key != 'style_avoidance'}
    encoded = json.dumps(stable_facts, ensure_ascii=False, sort_keys=True, separators=(',', ':'))
    return hashlib.sha256(encoded.encode('utf-8')).hexdigest()


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
    correction_text = f'\n上一次未通过程序校验：{correction}。请只修正该问题。' if correction else ''
    system_prompt = (
        '你是个人运动博客的月度教练。程序已经完成全部计算；只能使用输入中的证据，'
        '不得补充常识推测、医学判断、天气、身体感受或不存在的训练目标。'
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


def report_label(phase, cutoff_day=None):
    if phase == 'midmonth':
        return f'月中观察 · 截至{cutoff_day}日'
    if phase == 'final':
        return '月度复盘'
    return '月度观察'


def update_monthly_insights(
    activities,
    output_path,
    api_key=None,
    now=None
):
    # GitHub Actions 使用 UTC；月中和月末边界必须按博客所在的杭州时区判断。
    now = now or datetime.now(ZoneInfo('Asia/Shanghai'))
    api_key = api_key or os.getenv('DEEPSEEK_API_KEY')
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

        # 月中观察固定统计 1～15 日。16 日 04:00 会主动检查；若当时数据尚未
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
                'report_label': '月度观察',
                'status_text': accumulating_text,
                'comparison_basis': '等待月中样本',
                'source_data_hash': current_source_hash
            }
            if entry != {key: value for key, value in old_entry.items() if key != 'last_update'}:
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
            comparable_old = {key: value for key, value in old_entry.items() if key != 'last_update'}
            if entry != comparable_old:
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
        report_data_hash = old_entry.get('report_data_hash') if (frozen_midmonth or frozen_final) else current_hash
        report_as_of = old_entry.get('report_as_of') if (frozen_midmonth or frozen_final) else f'{month_key}-{report_cutoff_day:02d}'

        if report is None and api_key:
            print(f"🧠 {month_key} 正在生成{'月中观察' if phase == 'midmonth' else '月度复盘'}...")
            report = generate_report(api_key, facts)
        elif report is None:
            print(f'⏸️ {month_key} 等待 DEEPSEEK_API_KEY，保留现有月报。')

        if report is not None:
            entry = {
                'month_str': month_key,
                'stats': public_stats(stats),
                'report_phase': phase,
                'report_label': report_label(phase, int(str(report_as_of)[-2:])),
                'report_as_of': report_as_of,
                'coach_report': report,
                'report_version': REPORT_VERSION,
                'report_data_hash': report_data_hash,
                'source_data_hash': current_source_hash,
                **({'midmonth_source_hash': midmonth_source_hash} if phase == 'midmonth' else {}),
                'model': MODEL,
                'comparison_basis': facts['comparison_basis']
            }
        else:
            entry = dict(old_entry)
            entry['month_str'] = month_key
            entry['stats'] = public_stats(stats)

        comparable_old = {key: value for key, value in old_entry.items() if key != 'last_update'}
        if entry != comparable_old:
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
