"""Versioned validation helpers for the self-hosted Exercise Sync API input."""

import json
import math
import re
from datetime import datetime
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCHEMA_PATH = ROOT / 'schemas/data/exercise-sync-v1.schema.json'
IDENTIFIER_PATTERN = re.compile(r'^[a-z0-9][a-z0-9._-]{0,63}$')


def load_exercise_sync_schema():
    return json.loads(SCHEMA_PATH.read_text(encoding='utf-8'))


SCHEMA = load_exercise_sync_schema()
ACTIVITY_SCHEMA = SCHEMA['$defs']['activity']
PAYLOAD_FIELDS = frozenset(SCHEMA['properties'])
ACTIVITY_FIELDS = frozenset(ACTIVITY_SCHEMA['properties'])
ACTIVITY_REQUIRED_FIELDS = frozenset(ACTIVITY_SCHEMA['required'])
SUPPORTED_TYPES = frozenset(ACTIVITY_SCHEMA['properties']['type']['enum'])
ROUTE_STATUSES = frozenset(ACTIVITY_SCHEMA['properties']['route_status']['enum'])
MAX_BATCH_ITEMS = SCHEMA['properties']['upsert']['maxItems']


def _is_number(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def _valid_timestamp(value):
    if not isinstance(value, str) or not value:
        return False
    try:
        parsed = datetime.fromisoformat(value[:-1] + '+00:00' if value.endswith('Z') else value)
    except ValueError:
        return False
    return parsed.tzinfo is not None and parsed.utcoffset() is not None


def exercise_identity(source, external_id):
    """Return the exact gateway identity; callers must not fuzzy-match across sources."""
    return source, external_id


def validate_exercise_sync_payload(payload):
    """Return deterministic v1 contract errors without mutating the request."""
    if not isinstance(payload, dict):
        return ['请求根节点必须是对象']

    errors = []
    unknown_payload_fields = sorted(set(payload) - PAYLOAD_FIELDS)
    if unknown_payload_fields:
        errors.append('请求包含未知字段：{}'.format(', '.join(unknown_payload_fields)))

    if payload.get('schema_version') != 1:
        errors.append('schema_version 必须为 1')

    source = payload.get('source')
    if not isinstance(source, str) or not IDENTIFIER_PATTERN.fullmatch(source):
        errors.append('source 必须是 1-64 位小写字母、数字、点、下划线或连字符')

    producer = payload.get('producer')
    if producer is not None and (
        not isinstance(producer, str) or not IDENTIFIER_PATTERN.fullmatch(producer)
    ):
        errors.append('producer 必须是 1-64 位小写字母、数字、点、下划线或连字符')

    mode = payload.get('mode')
    if mode not in {'snapshot', 'delta'}:
        errors.append('mode 必须是 snapshot 或 delta')

    request_id = payload.get('request_id')
    if request_id is not None and (
        not isinstance(request_id, str) or not 1 <= len(request_id) <= 128
    ):
        errors.append('request_id 必须是 1-128 位字符串')

    upsert = payload.get('upsert', [])
    delete = payload.get('delete', [])
    if not isinstance(upsert, list):
        errors.append('upsert 必须是数组')
        upsert = []
    if not isinstance(delete, list):
        errors.append('delete 必须是数组')
        delete = []
    if mode == 'delta' and not upsert and not delete:
        errors.append('upsert 和 delete 至少有一项非空')
    if mode == 'snapshot' and 'upsert' not in payload:
        errors.append('snapshot 必须显式提供完整 upsert 数组')
    if mode == 'snapshot' and 'delete' in payload:
        errors.append('snapshot 不接受 delete；未出现在 upsert 的同来源记录会被删除')
    if len(upsert) > MAX_BATCH_ITEMS:
        errors.append('upsert 单次最多 {} 项'.format(MAX_BATCH_ITEMS))
    if len(delete) > MAX_BATCH_ITEMS:
        errors.append('delete 单次最多 {} 项'.format(MAX_BATCH_ITEMS))

    delete_ids = []
    for index, external_id in enumerate(delete):
        if not isinstance(external_id, str) or not 1 <= len(external_id) <= 200:
            errors.append('delete 第 {} 项必须是 1-200 位字符串'.format(index))
            continue
        delete_ids.append(external_id)
    duplicate_delete_ids = sorted({item for item in delete_ids if delete_ids.count(item) > 1})
    if duplicate_delete_ids:
        errors.append('delete 包含重复 external_id：{}'.format(', '.join(duplicate_delete_ids)))

    upsert_ids = []
    for index, activity in enumerate(upsert):
        prefix = 'upsert 第 {} 项'.format(index)
        if not isinstance(activity, dict):
            errors.append('{}必须是对象'.format(prefix))
            continue

        unknown_fields = sorted(set(activity) - ACTIVITY_FIELDS)
        if unknown_fields:
            errors.append('{}包含未知字段：{}'.format(prefix, ', '.join(unknown_fields)))
        missing_fields = sorted(ACTIVITY_REQUIRED_FIELDS - set(activity))
        if missing_fields:
            errors.append('{}缺少：{}'.format(prefix, ', '.join(missing_fields)))

        external_id = activity.get('external_id')
        if not isinstance(external_id, str) or not 1 <= len(external_id) <= 200:
            errors.append('{} external_id 必须是 1-200 位字符串'.format(prefix))
        else:
            upsert_ids.append(external_id)

        name = activity.get('name')
        if name is not None and (not isinstance(name, str) or len(name) > 200):
            errors.append('{} name 最多 200 位'.format(prefix))
        if activity.get('type') not in SUPPORTED_TYPES:
            errors.append('{} type 不受支持'.format(prefix))
        if not _valid_timestamp(activity.get('started_at')):
            errors.append('{} started_at 必须是带时区的 RFC 3339 时间'.format(prefix))

        duration = activity.get('duration_seconds')
        if not isinstance(duration, int) or isinstance(duration, bool) or not 1 <= duration <= 604800:
            errors.append('{} duration_seconds 必须是 1-604800 的整数'.format(prefix))
        for field, maximum in (
            ('distance_km', None),
            ('average_heartrate_bpm', 300),
            ('elevation_gain_m', None),
            ('calories_kcal', None),
        ):
            value = activity.get(field)
            if value is None and field not in ACTIVITY_REQUIRED_FIELDS:
                continue
            if not _is_number(value) or value < 0 or (maximum is not None and value > maximum):
                errors.append('{} {} 数值无效'.format(prefix, field))

        is_indoor = activity.get('is_indoor')
        if not isinstance(is_indoor, bool):
            errors.append('{} is_indoor 必须是布尔值'.format(prefix))
        route_status = activity.get('route_status')
        if route_status not in ROUTE_STATUSES:
            errors.append('{} route_status 无效'.format(prefix))
        polyline = activity.get('summary_polyline')
        if polyline is not None and (not isinstance(polyline, str) or len(polyline) > 500000):
            errors.append('{} summary_polyline 无效'.format(prefix))
        if route_status == 'available' and not polyline:
            errors.append('{} available 必须包含 summary_polyline'.format(prefix))
        if route_status in ROUTE_STATUSES - {'available'} and polyline:
            errors.append('{} 非公开轨迹状态不得包含 summary_polyline'.format(prefix))
        if is_indoor is True and route_status not in {'unavailable', 'pending'}:
            errors.append(
                '{} 室内运动的 route_status 必须是 unavailable 或 pending'.format(prefix)
            )

    duplicate_upsert_ids = sorted({item for item in upsert_ids if upsert_ids.count(item) > 1})
    if duplicate_upsert_ids:
        errors.append('upsert 包含重复 external_id：{}'.format(', '.join(duplicate_upsert_ids)))
    conflicting_ids = sorted(set(upsert_ids) & set(delete_ids))
    if conflicting_ids:
        errors.append('同一 external_id 不能同时 upsert 和 delete：{}'.format(', '.join(conflicting_ids)))
    return errors
