"""Build an offline *approximate* address locator from road basic sections.

Entrance points are deliberately not used: the supplied entrance table has no
road-name/building-number fields or address join table. Basic numbers are not a
register of existing buildings. Each result represents a source line midpoint.
"""
import argparse
import hashlib
import json
from collections import Counter
from pathlib import Path

import geopandas as gpd
from pyproj import Transformer

from export_network import write_json


def build(roads_path, sections_path, output):
    output = Path(output)
    roads = gpd.read_file(roads_path).reset_index(names='road_record')
    sections = gpd.read_file(sections_path)
    if roads.crs is None or sections.crs is None:
        raise ValueError('Both source files must declare their CRS.')
    sections = sections.to_crs(5179)
    keys = ['SIG_CD', 'RDS_MAN_NO']
    if roads.duplicated(keys).any():
        raise ValueError('Road join key is not unique; inspect the source data.')
    joined = sections.merge(roads[keys + ['RN', 'RN_CD', 'road_record']],
                            on=keys, how='left', validate='many_to_one')
    local = joined[joined.SIG_CD == '43800'].copy()
    if local[['RN', 'RN_CD', 'road_record']].isna().any().any():
        raise ValueError('A Danyang basic section has no matching named road.')
    if local.geometry.is_empty.any() or (~local.geometry.is_valid).any():
        raise ValueError('Invalid/empty source geometry; inspect before exporting.')

    names = sorted(local.RN.unique().tolist())
    name_ids = {name: index for index, name in enumerate(names)}
    to_wgs = Transformer.from_crs(5179, 4326, always_xy=True)
    entries = []
    for row in local.sort_values(['BSI_INT_SN', 'RDS_MAN_NO']).itertuples():
        numbers = [int(row.EVE_BSI_MN), int(row.EVE_BSI_SL),
                   int(row.ODD_BSI_MN), int(row.ODD_BSI_SL)]
        if min(numbers[0], numbers[2]) <= 0 or min(numbers[1], numbers[3]) < 0:
            raise ValueError(f'Invalid basic number: {row.BSI_INT_SN}')
        geometry = row.geometry
        parts = list(geometry.geoms) if geometry.geom_type == 'MultiLineString' else [geometry]
        for part in parts:
            if part.geom_type != 'LineString' or part.length <= 0:
                raise ValueError(f'Invalid line: {row.BSI_INT_SN}')
            point = part.interpolate(0.5, normalized=True)
            lng, lat = to_wgs.transform(point.x, point.y)
            entries.append([name_ids[row.RN], *numbers, round(lng, 7), round(lat, 7),
                            int(row.road_record), round(part.length, 2), int(row.BSI_INT_SN)])

    network = json.loads((output / 'network-metadata.json').read_text(encoding='utf-8'))
    digest = hashlib.sha256(Path(__file__).read_bytes())
    for source in [Path(roads_path), Path(sections_path)]:
        for extension in ['.shp', '.dbf', '.prj', '.cpg']:
            digest.update(source.with_suffix(extension).read_bytes())
    digest.update(network['version'].encode())
    data = {'schema': 1, 'version': 'basic-sections-v1-' + digest.hexdigest()[:12],
            'graphVersion': network['version'], 'roads': names, 'sections': entries}
    size = write_json(output / 'address-index.json.gz', data, compressed=True)
    number_counts = Counter((row[0], row[side], row[side + 1])
                            for row in entries for side in [1, 3])
    report = {
        'version': data['version'], 'graphVersion': network['version'],
        'source': str(sections_path), 'join': 'SIG_CD + RDS_MAN_NO → road RN',
        'sourceRecords': len(sections), 'includedRecords': len(local),
        'excludedOtherMunicipality': len(joined) - len(local),
        'unmatchedDanyangRecords': 0, 'roadNames': len(names),
        'lineParts': len(entries), 'numberLocations': len(entries) * 2,
        'distinctBasicNumbers': len(number_counts),
        'ambiguousBasicNumbers': sum(count > 1 for count in number_counts.values()),
        'maxLocationsPerNumber': max(number_counts.values()),
        'partsLongerThan100m': sum(row[8] > 100 for row in entries), 'size': size,
        'sectionColumns': ['roadNameIndex', 'evenMain', 'evenSub', 'oddMain', 'oddSub',
                           'lng', 'lat', 'roadRecord', 'lengthM', 'BSI_INT_SN'],
        'limitations': [
            '기초번호와 입력 번호가 일치하는 도로 구간의 중점이며 건물·출입구 좌표가 아님.',
            '기초번호 존재는 해당 주소의 건물 존재를 보증하지 않음.',
            '읍면은 입력 시 생략 가능하며 읍면별 실제 주소 유효성은 검증하지 않음.',
            '본번·부번을 정확히 대조하며 없는 번호를 인접 번호로 대체하지 않음.',
            '동일 번호의 다른 구간은 병합하지 않고 별도 후보로 제공.',
            '단양군(SIG_CD=43800)만 포함. 출입구 데이터는 사용하지 않음.',
        ],
    }
    write_json(output / 'address-metadata.json', report)
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--roads', default='데이터/단양군도로.shp')
    parser.add_argument('--sections', default='데이터/단양군도로명기초구간.shp')
    parser.add_argument('--output', default='public/data')
    args = parser.parse_args()
    build(args.roads, args.sections, args.output)
