"""Source-neutral activity facts and deterministic blog-output materialization."""

import copy
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

from jingzhe.exercise_sync_contract import (
    ACTIVITY_FIELDS,
    IDENTIFIER_PATTERN,
    MAX_BATCH_ITEMS,
    validate_exercise_sync_payload,
)


PROJECT_ROOT = Path(__file__).resolve().parents[1]
RAW_ACTIVITY_FILE = PROJECT_ROOT / 'data/exercise/activities.json'
PROCESSED_ACTIVITY_FILE = PROJECT_ROOT / 'assets/activities.json'
RAW_STORE_FIELDS = frozenset({'schema_version', 'sources'})

# These values belong to the blog processor. They are reused from the existing
# output so normal updates do not re-geocode routes or rewrite stable presentation.
PROCESSOR_CACHE_FIELDS = frozenset({
    'run_id',
    'pace_num',
    'pace_unit',
    'energy_title',
    'food_key',
    'food_title_version',
    'distance_title',
    'distance_title_key',
    'distance_title_version',
    'route_title',
    'route_title_version',
    'display_name',
    'sport_display_name',
    'card_achievement',
    'calendar_achievements',
})


def _load_json(path, missing_default=None):
    path = Path(path)
    if not path.exists():
        return copy.deepcopy(missing_default)
    try:
        return json.loads(path.read_text(encoding='utf-8'))
    except json.JSONDecodeError as error:
        raise RuntimeError('{} 格式错误: {}'.format(path.name, error)) from error


def validate_raw_activity_store(store):
    """Validate the repository form without duplicating the API activity rules."""
    if not isinstance(store, dict):
        return ['原始运动事实根节点必须是对象']

    errors = []
    unknown_fields = sorted(set(store) - RAW_STORE_FIELDS)
    if unknown_fields:
        errors.append('原始运动事实包含未知字段：{}'.format(', '.join(unknown_fields)))
    if store.get('schema_version') != 1:
        errors.append('原始运动事实 schema_version 必须为 1')

    sources = store.get('sources')
    if not isinstance(sources, dict):
        errors.append('原始运动事实 sources 必须是对象')
        return errors

    for source, activities in sorted(sources.items()):
        if not isinstance(source, str) or not IDENTIFIER_PATTERN.fullmatch(source):
            errors.append('原始运动来源名称无效：{}'.format(source))
            continue
        if not isinstance(activities, list):
            errors.append('来源 {} 的活动必须是数组'.format(source))
            continue
        if not activities:
            errors.append('来源 {} 不应保留空数组'.format(source))
            continue
        if len(activities) > 100000:
            errors.append('来源 {} 最多保存 100000 条活动'.format(source))
            continue
        seen_external_ids = set()
        duplicate_external_ids = set()
        for item in activities:
            external_id = item.get('external_id') if isinstance(item, dict) else None
            if not isinstance(external_id, str):
                continue
            if external_id in seen_external_ids:
                duplicate_external_ids.add(external_id)
            seen_external_ids.add(external_id)
        duplicates = sorted(duplicate_external_ids)
        if duplicates:
            errors.append(
                '{}：原始事实包含重复 external_id：{}'.format(source, ', '.join(duplicates))
            )
        for offset in range(0, len(activities), MAX_BATCH_ITEMS):
            payload_errors = validate_exercise_sync_payload({
                'schema_version': 1,
                'source': source,
                'mode': 'delta',
                'upsert': activities[offset:offset + MAX_BATCH_ITEMS],
            })
            errors.extend('{}：{}'.format(source, error) for error in payload_errors)
    return errors


def load_raw_activity_store(path=RAW_ACTIVITY_FILE):
    store = _load_json(path, {'schema_version': 1, 'sources': {}})
    errors = validate_raw_activity_store(store)
    if errors:
        raise RuntimeError('；'.join(errors))
    return store


def load_processed_activities(path=PROCESSED_ACTIVITY_FILE):
    """Load the generated blog asset only as a processor cache."""
    activities = _load_json(path, []) or []
    if not isinstance(activities, list):
        raise RuntimeError('{} 根节点必须是数组'.format(Path(path).name))
    activities.sort(
        key=lambda item: item.get('start_date_local') or '',
        reverse=True,
    )
    return activities


def _duration_seconds(value):
    if not isinstance(value, str):
        raise ValueError('moving_time 必须是 MM:SS 或 HH:MM:SS 字符串')
    parts = value.split(':')
    if len(parts) not in {2, 3}:
        raise ValueError('moving_time 必须是 MM:SS 或 HH:MM:SS 字符串')
    try:
        numbers = [int(part) for part in parts]
    except ValueError as error:
        raise ValueError('moving_time 必须是 MM:SS 或 HH:MM:SS 字符串') from error
    hours, minutes, seconds = (0, *numbers) if len(numbers) == 2 else numbers
    if hours < 0 or not 0 <= minutes < 60 or not 0 <= seconds < 60:
        raise ValueError('moving_time 数值无效')
    return hours * 3600 + minutes * 60 + seconds


def activity_source_id(source, external_id):
    """Return an opaque, source-aware processor identity for every provider."""
    digest = hashlib.sha256(
        '{}\0{}'.format(source, external_id).encode('utf-8')
    ).hexdigest()
    return 'jingzhe-sync-{}'.format(digest)


def _fact_times(started_at):
    try:
        started = datetime.fromisoformat(started_at.replace('Z', '+00:00'))
    except (AttributeError, ValueError) as error:
        raise ValueError('started_at 格式无效') from error
    if started.tzinfo is None:
        raise ValueError('started_at 必须带时区')
    local = started.replace(tzinfo=None).isoformat(timespec='seconds')
    utc = started.astimezone(timezone.utc).isoformat(timespec='seconds').replace('+00:00', 'Z')
    return local, utc


def _moving_time(seconds):
    hours, remainder = divmod(int(seconds), 3600)
    minutes, seconds = divmod(remainder, 60)
    if hours:
        return '{:02d}:{:02d}:{:02d}'.format(hours, minutes, seconds)
    return '{:02d}:{:02d}'.format(minutes, seconds)


def _calculated_pace(activity_type, distance, duration):
    distance = float(distance or 0)
    duration = int(duration or 0)
    if activity_type in {'Ride', 'VirtualRide', 'EBikeRide'}:
        speed = distance / duration * 3600 if duration else 0
        return '{:.2f}'.format(speed), 'km/h'
    if distance <= 0:
        return "0'00''", ''
    seconds_per_km = duration / distance
    return "{}'{:02d}''".format(int(seconds_per_km) // 60, int(seconds_per_km) % 60), ''


def _base_run_id(start_date_local):
    return int(''.join(character for character in start_date_local if character.isdigit())[:14])


def materialize_activity_store(store, processed_cache=None):
    """Build the historical output shape while reusing stable processor fields."""
    errors = validate_raw_activity_store(store)
    if errors:
        raise RuntimeError('；'.join(errors))

    cache_by_source_id = {
        str(item.get('source_id')): item
        for item in (processed_cache or [])
        if item.get('source_id')
    }
    used_run_ids = {
        str(item.get('run_id'))
        for item in (processed_cache or [])
        if item.get('run_id') is not None
    }
    activities = []

    source_facts = [
        (source, fact)
        for source, facts in store['sources'].items()
        for fact in facts
    ]
    source_facts.sort(
        key=lambda pair: (pair[1].get('started_at') or '', pair[0], pair[1]['external_id']),
        reverse=True,
    )

    for source, fact in source_facts:
        source_id = activity_source_id(source, fact['external_id'])
        cached = cache_by_source_id.get(source_id)
        # Starting from the current output keeps key order and optional processor
        # extensions stable. Every source-owned fact is overwritten below, so
        # the cache can never override canonical input or restore a track.
        record = copy.deepcopy(cached) if cached else {}
        start_date_local, start_date_utc = _fact_times(fact['started_at'])
        moving_time = _moving_time(fact['duration_seconds'])
        cached_duration = None
        if cached and cached.get('moving_time'):
            try:
                cached_duration = _duration_seconds(cached['moving_time'])
            except ValueError:
                cached_duration = None
        if cached_duration == fact['duration_seconds']:
            moving_time = cached['moving_time']

        record.update({
            'run_id': record.get('run_id'),
            'name': fact.get('name') or '',
            'type': fact['type'],
            'distance': fact['distance_km'],
            'moving_time': moving_time,
            'start_date_local': start_date_local,
            'average_heartrate': fact.get('average_heartrate_bpm', 0),
            'pace_num': record.get('pace_num'),
            'pace_unit': record.get('pace_unit'),
            'total_elevation_gain': fact.get('elevation_gain_m', 0),
            'calories': fact.get('calories_kcal', 0),
            'source_id': source_id,
            'start_date_utc': start_date_utc,
            'route_status': fact['route_status'],
            'is_indoor': fact['is_indoor'],
        })

        facts_changed = cached is None or any((
            cached.get('type') != record['type'],
            cached.get('distance') != record['distance'],
            cached_duration != fact['duration_seconds'],
        ))
        if facts_changed or not record.get('pace_num'):
            record['pace_num'], record['pace_unit'] = _calculated_pace(
                fact['type'], fact['distance_km'], fact['duration_seconds']
            )

        if fact['route_status'] == 'available':
            record['summary_polyline'] = fact['summary_polyline']
        else:
            record.pop('summary_polyline', None)

        if record['run_id'] is None:
            run_id = _base_run_id(start_date_local)
            while str(run_id) in used_run_ids:
                run_id += 1
            record['run_id'] = run_id
        used_run_ids.add(str(record['run_id']))
        activities.append(record)

    activities.sort(
        key=lambda item: (item.get('start_date_local') or '', str(item.get('run_id') or '')),
        reverse=True,
    )
    return activities


def raw_fact_field_names():
    """Expose the exact source-owned activity fields for contract tests."""
    return ACTIVITY_FIELDS
