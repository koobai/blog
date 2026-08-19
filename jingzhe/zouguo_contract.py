"""Validation helpers for the generated Zouguo feed v1 read model."""

import json
import math
import re
from datetime import datetime
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCHEMA_PATH = ROOT / 'schemas/data/zouguo-feed-v1.schema.json'
IDENTIFIER_PATTERN = re.compile(r'^[a-z0-9][a-z0-9._:-]{0,199}$')
COUNTRY_CODE_PATTERN = re.compile(r'^[A-Z]{2}$')


def load_zouguo_schema():
    return json.loads(SCHEMA_PATH.read_text(encoding='utf-8'))


SCHEMA = load_zouguo_schema()
ROOT_FIELDS = frozenset(SCHEMA['properties'])
ROOT_REQUIRED_FIELDS = frozenset(SCHEMA['required'])
ITEM_SCHEMA = SCHEMA['$defs']['item']
ITEM_FIELDS = frozenset(ITEM_SCHEMA['properties'])
ITEM_REQUIRED_FIELDS = frozenset(ITEM_SCHEMA['required'])
SOURCE_SCHEMA = SCHEMA['$defs']['source']
SOURCE_FIELDS = frozenset(SOURCE_SCHEMA['properties'])
SOURCE_REQUIRED_FIELDS = frozenset(SOURCE_SCHEMA['required'])
SOURCE_TYPES = frozenset(SOURCE_SCHEMA['properties']['type']['enum'])
PLACE_SCHEMA = SCHEMA['$defs']['place']
PLACE_FIELDS = frozenset(PLACE_SCHEMA['properties'])
PLACE_REQUIRED_FIELDS = frozenset(PLACE_SCHEMA['required'])
PLACE_PRECISIONS = frozenset(PLACE_SCHEMA['properties']['precision']['enum'])
IMAGE_SCHEMA = SCHEMA['$defs']['image']
IMAGE_FIELDS = frozenset(IMAGE_SCHEMA['properties'])
IMAGE_REQUIRED_FIELDS = frozenset(IMAGE_SCHEMA['required'])
MAX_IMAGES = ITEM_SCHEMA['properties']['images']['maxItems']


def _is_number(value):
    return (
        isinstance(value, (int, float))
        and not isinstance(value, bool)
        and math.isfinite(value)
    )


def _valid_timestamp(value):
    if not isinstance(value, str) or not value:
        return False
    try:
        parsed = datetime.fromisoformat(
            value[:-1] + '+00:00' if value.endswith('Z') else value
        )
    except ValueError:
        return False
    return parsed.tzinfo is not None and parsed.utcoffset() is not None


def zouguo_identity(source_type, source_id):
    """Return the only supported identity; callers must never fuzzy-deduplicate."""
    return '{}:{}'.format(source_type, source_id)


def _unknown_fields(value, allowed):
    return sorted(set(value) - allowed) if isinstance(value, dict) else []


def _missing_fields(value, required):
    return sorted(required - set(value)) if isinstance(value, dict) else sorted(required)


def validate_zouguo_feed(payload):
    """Return deterministic v1 contract errors without changing the payload."""
    if not isinstance(payload, dict):
        return ['走过数据根节点必须是对象']

    errors = []
    unknown_root_fields = _unknown_fields(payload, ROOT_FIELDS)
    if unknown_root_fields:
        errors.append('根节点包含未知字段：{}'.format(', '.join(unknown_root_fields)))
    missing_root_fields = _missing_fields(payload, ROOT_REQUIRED_FIELDS)
    if missing_root_fields:
        errors.append('根节点缺少：{}'.format(', '.join(missing_root_fields)))
    if payload.get('schemaVersion') != 1:
        errors.append('schemaVersion 必须为 1')
    if not _valid_timestamp(payload.get('generatedAt')):
        errors.append('generatedAt 必须是带时区的 RFC 3339 时间')

    items = payload.get('items', [])
    if not isinstance(items, list):
        errors.append('items 必须是数组')
        return errors

    seen_ids = set()
    for index, item in enumerate(items):
        prefix = 'items 第 {} 项'.format(index)
        if not isinstance(item, dict):
            errors.append('{}必须是对象'.format(prefix))
            continue

        unknown_item_fields = _unknown_fields(item, ITEM_FIELDS)
        if unknown_item_fields:
            errors.append('{}包含未知字段：{}'.format(prefix, ', '.join(unknown_item_fields)))
        missing_item_fields = _missing_fields(item, ITEM_REQUIRED_FIELDS)
        if missing_item_fields:
            errors.append('{}缺少：{}'.format(prefix, ', '.join(missing_item_fields)))

        source = item.get('source')
        source_type = None
        source_id = None
        if not isinstance(source, dict):
            errors.append('{} source 必须是对象'.format(prefix))
        else:
            unknown_source_fields = _unknown_fields(source, SOURCE_FIELDS)
            if unknown_source_fields:
                errors.append(
                    '{} source 包含未知字段：{}'.format(
                        prefix, ', '.join(unknown_source_fields)
                    )
                )
            missing_source_fields = _missing_fields(source, SOURCE_REQUIRED_FIELDS)
            if missing_source_fields:
                errors.append(
                    '{} source 缺少：{}'.format(prefix, ', '.join(missing_source_fields))
                )
            source_type = source.get('type')
            source_id = source.get('id')
            if source_type not in SOURCE_TYPES:
                errors.append('{} source.type 无效'.format(prefix))
            if not isinstance(source_id, str) or not IDENTIFIER_PATTERN.fullmatch(source_id):
                errors.append('{} source.id 无效'.format(prefix))
            source_url = source.get('url')
            if not isinstance(source_url, str) or not 1 <= len(source_url) <= 500:
                errors.append('{} source.url 必须是 1-500 位字符串'.format(prefix))

        item_id = item.get('id')
        if source_type in SOURCE_TYPES and isinstance(source_id, str):
            expected_id = zouguo_identity(source_type, source_id)
            if item_id != expected_id:
                errors.append('{} id 必须等于 {}'.format(prefix, expected_id))
        if isinstance(item_id, str):
            if item_id in seen_ids:
                errors.append('{} id 重复：{}'.format(prefix, item_id))
            seen_ids.add(item_id)

        title = item.get('title')
        if not isinstance(title, str) or not 1 <= len(title) <= 200:
            errors.append('{} title 必须是 1-200 位字符串'.format(prefix))
        summary = item.get('summary')
        if not isinstance(summary, str) or len(summary) > 2000:
            errors.append('{} summary 必须是不超过 2000 位的字符串'.format(prefix))
        if source_type == 'post' and summary != '':
            errors.append('{} 随笔来源 summary 必须为空'.format(prefix))
        for field in ('occurredAt', 'publishedAt'):
            if not _valid_timestamp(item.get(field)):
                errors.append('{} {} 必须是带时区的 RFC 3339 时间'.format(prefix, field))

        place = item.get('place')
        if not isinstance(place, dict):
            errors.append('{} place 必须是对象'.format(prefix))
        else:
            unknown_place_fields = _unknown_fields(place, PLACE_FIELDS)
            if unknown_place_fields:
                errors.append(
                    '{} place 包含未知字段：{}'.format(
                        prefix, ', '.join(unknown_place_fields)
                    )
                )
            missing_place_fields = _missing_fields(place, PLACE_REQUIRED_FIELDS)
            if missing_place_fields:
                errors.append(
                    '{} place 缺少：{}'.format(prefix, ', '.join(missing_place_fields))
                )
            place_id = place.get('id')
            if not isinstance(place_id, str) or not IDENTIFIER_PATTERN.fullmatch(place_id):
                errors.append('{} place.id 无效'.format(prefix))
            name = place.get('name')
            if not isinstance(name, str) or not 1 <= len(name) <= 200:
                errors.append('{} place.name 必须是 1-200 位字符串'.format(prefix))
            longitude = place.get('longitude')
            if not _is_number(longitude) or not -180 <= longitude <= 180:
                errors.append('{} place.longitude 必须介于 -180 与 180'.format(prefix))
            latitude = place.get('latitude')
            if not _is_number(latitude) or not -90 <= latitude <= 90:
                errors.append('{} place.latitude 必须介于 -90 与 90'.format(prefix))
            if place.get('precision') not in PLACE_PRECISIONS:
                errors.append('{} place.precision 无效'.format(prefix))
            if not isinstance(place.get('countryCode'), str) or not COUNTRY_CODE_PATTERN.fullmatch(
                place.get('countryCode', '')
            ):
                errors.append('{} place.countryCode 必须是两位大写字母'.format(prefix))

        images = item.get('images')
        if not isinstance(images, list):
            errors.append('{} images 必须是数组'.format(prefix))
            continue
        if len(images) > MAX_IMAGES:
            errors.append('{} images 最多 {} 张'.format(prefix, MAX_IMAGES))
        for image_index, image in enumerate(images):
            image_prefix = '{} images 第 {} 项'.format(prefix, image_index)
            if not isinstance(image, dict):
                errors.append('{}必须是对象'.format(image_prefix))
                continue
            unknown_image_fields = _unknown_fields(image, IMAGE_FIELDS)
            if unknown_image_fields:
                errors.append(
                    '{}包含未知字段：{}'.format(
                        image_prefix, ', '.join(unknown_image_fields)
                    )
                )
            missing_image_fields = _missing_fields(image, IMAGE_REQUIRED_FIELDS)
            if missing_image_fields:
                errors.append(
                    '{}缺少：{}'.format(image_prefix, ', '.join(missing_image_fields))
                )
            url = image.get('url')
            if not isinstance(url, str) or not 1 <= len(url) <= 1000:
                errors.append('{} url 必须是 1-1000 位字符串'.format(image_prefix))
            alt = image.get('alt')
            if not isinstance(alt, str) or len(alt) > 500:
                errors.append('{} alt 必须是不超过 500 位的字符串'.format(image_prefix))
            for dimension in ('width', 'height'):
                value = image.get(dimension)
                if value is not None and (
                    not isinstance(value, int) or isinstance(value, bool) or value < 1
                ):
                    errors.append('{} {} 必须是正整数'.format(image_prefix, dimension))

    return errors
