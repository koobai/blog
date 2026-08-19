#!/usr/bin/env python3
"""Build the local Zouguo administrative-boundary catalog.

The catalog is build-time input. Hugo emits only boundaries referenced by the
current generated feed, so browsers never download this complete file.
"""

import argparse
import json
import struct
import zipfile
from pathlib import Path


NATURAL_EARTH_ARCHIVE = 'natural-earth-admin0.zip'
CHINA_COUNTRY = 'china-country.geojson'
CHINA_PROVINCES = 'china-provinces.geojson'
CHINA_CITIES = 'china-cities.geojson'


def read_dbf(data):
    record_count = struct.unpack_from('<I', data, 4)[0]
    header_length, record_length = struct.unpack_from('<HH', data, 8)
    fields = []
    offset = 32
    while data[offset] != 0x0D:
        descriptor = data[offset:offset + 32]
        name = descriptor[:11].split(b'\0', 1)[0].decode('ascii')
        fields.append((name, descriptor[16]))
        offset += 32

    records = []
    offset = header_length
    for _ in range(record_count):
        raw = data[offset:offset + record_length]
        offset += record_length
        if not raw or raw[0:1] == b'*':
            continue
        cursor = 1
        record = {}
        for name, length in fields:
            value = raw[cursor:cursor + length].decode('utf-8', errors='replace').strip(' \0')
            cursor += length
            record[name] = value
        records.append(record)
    return records


def read_polygon_shapes(data):
    shapes = []
    offset = 100
    while offset + 8 <= len(data):
        _, word_length = struct.unpack_from('>II', data, offset)
        offset += 8
        content = data[offset:offset + word_length * 2]
        offset += word_length * 2
        if len(content) < 44:
            continue
        shape_type = struct.unpack_from('<I', content, 0)[0]
        if shape_type not in (5, 15, 25):
            shapes.append(None)
            continue
        part_count, point_count = struct.unpack_from('<II', content, 36)
        parts = list(struct.unpack_from('<{}I'.format(part_count), content, 44))
        points_offset = 44 + part_count * 4
        points = [
            [round(x, 5), round(y, 5)]
            for x, y in struct.iter_unpack('<dd', content[points_offset:points_offset + point_count * 16])
        ]
        rings = []
        for index, start in enumerate(parts):
            end = parts[index + 1] if index + 1 < len(parts) else len(points)
            ring = points[start:end]
            if len(ring) >= 4:
                if ring[0] != ring[-1]:
                    ring.append(ring[0])
                rings.append([ring])
        shapes.append({'type': 'MultiPolygon', 'coordinates': rings})
    return shapes


def natural_earth_features(archive_path):
    with zipfile.ZipFile(archive_path) as archive:
        rows = read_dbf(archive.read('ne_110m_admin_0_countries.dbf'))
        shapes = read_polygon_shapes(archive.read('ne_110m_admin_0_countries.shp'))

    features = []
    for row, geometry in zip(rows, shapes):
        if not geometry:
            continue
        iso2_candidates = (row.get('ISO_A2'), row.get('ISO_A2_EH'), row.get('WB_A2'))
        iso2 = next((value for value in iso2_candidates if value and len(value) == 2 and value != '-9'), '')
        if not iso2:
            continue
        iso3_candidates = (row.get('ISO_A3'), row.get('ISO_A3_EH'), row.get('ADM0_A3'))
        iso3 = next((value for value in iso3_candidates if value and len(value) == 3 and value != '-99'), '')
        name = row.get('NAME_ZH') or row.get('ADMIN') or row.get('NAME') or iso2
        features.append({
            'type': 'Feature',
            'properties': {
                'level': 'country',
                'groupCode': iso2,
                'iso2': iso2,
                'iso3': iso3,
                'name': name,
            },
            'geometry': geometry,
        })
    return features


def rounded_geometry(geometry):
    def visit(value):
        if isinstance(value, float):
            return round(value, 5)
        if isinstance(value, list):
            return [visit(item) for item in value]
        return value
    return {'type': geometry['type'], 'coordinates': visit(geometry['coordinates'])}


def china_features(path, normalized_level):
    payload = json.loads(path.read_text(encoding='utf-8'))
    features = []
    for feature in payload['features']:
        properties = feature.get('properties', {})
        code = str(properties.get('adcode') or '')
        if not code:
            continue
        features.append({
            'type': 'Feature',
            'properties': {
                'level': normalized_level,
                'groupCode': 'CN' if normalized_level == 'country' else code,
                'iso2': 'CN',
                'name': properties.get('name') or code,
                'parentCode': str((properties.get('parent') or {}).get('adcode') or ''),
                'sourceLevel': properties.get('level') or normalized_level,
            },
            'geometry': rounded_geometry(feature['geometry']),
        })
    return features


def build_catalog(source_dir):
    world = natural_earth_features(source_dir / NATURAL_EARTH_ARCHIVE)
    world = [feature for feature in world if feature['properties']['groupCode'] != 'CN']
    features = world
    features += china_features(source_dir / CHINA_COUNTRY, 'country')
    provinces = china_features(source_dir / CHINA_PROVINCES, 'province')
    features += provinces
    features += china_features(source_dir / CHINA_CITIES, 'city')
    for province in provinces:
        if province['properties']['groupCode'] in {'110000', '120000', '310000', '500000'}:
            municipality = json.loads(json.dumps(province))
            municipality['properties']['level'] = 'city'
            municipality['properties']['sourceLevel'] = 'municipality'
            features.append(municipality)
    features.sort(key=lambda feature: (
        {'country': 0, 'province': 1, 'city': 2}[feature['properties']['level']],
        feature['properties']['groupCode'],
    ))
    return {
        'type': 'FeatureCollection',
        'catalogVersion': 1,
        'sources': {
            'countries': 'Natural Earth 1:110m Admin 0 Countries, version 5.1.2',
            'china': 'Supeset/China-GeoData',
        },
        'features': features,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--source-dir', type=Path, required=True)
    parser.add_argument(
        '--output',
        type=Path,
        default=Path('data/jingzhe/zouguo_boundary_catalog.json'),
    )
    args = parser.parse_args()
    payload = build_catalog(args.source_dir)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(payload, ensure_ascii=False, separators=(',', ':')) + '\n',
        encoding='utf-8',
    )
    levels = {}
    for feature in payload['features']:
        level = feature['properties']['level']
        levels[level] = levels.get(level, 0) + 1
    print('Generated {} with {}'.format(args.output, levels))


if __name__ == '__main__':
    main()
