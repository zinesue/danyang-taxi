"""Build a conservative, reproducible road graph from the supplied SHP files.

Only shared vertices and bounded endpoint-on-line contacts (<= 0.50 m) connect.
Interior/interior geometric crossings are NEVER automatically intersected.
All source records remain traceable. No invented access/oneway attributes.
"""
import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path
import time

import geopandas as gpd
import networkx as nx
from pyproj import Transformer
from shapely.geometry import LineString
from shapely.ops import substring

from export_network import feature, feature_collection, write_json
from topology import point_key, repair_topology


def build(roads_path, boundary_path, output, contact_tolerance=0.50):
    start = time.perf_counter()
    output = Path(output)
    roads = gpd.read_file(roads_path)
    boundary = gpd.read_file(boundary_path)
    if roads.crs is None or boundary.crs is None:
        raise ValueError('Missing CRS; supply a valid .prj before building.')
    if 'RN' not in roads.columns:
        raise ValueError('Expected the inspected RN road-name field; update the mapping for a new schema.')
    if roads.geometry.is_empty.any() or (~roads.geometry.is_valid).any():
        raise ValueError('Empty/invalid source geometries must be reviewed before building.')
    roads = roads.to_crs(5179)
    boundary = boundary.to_crs(4326)
    transformer = Transformer.from_crs(5179, 4326, always_xy=True)
    lines, attrs = [], []
    for record, row in roads.iterrows():
        geometry = row.geometry
        parts = list(geometry.geoms) if geometry.geom_type == 'MultiLineString' else [geometry]
        for part in parts:
            if part.geom_type != 'LineString' or part.length <= 0.01:
                continue
            lines.append(part)
            attrs.append({'record': int(record), 'name': str(row.RN or '이름 없는 도로'),
                          'class': str(row.get('ROA_CLS_SE', '')), 'code': str(row.get('SIG_CD', ''))})
    line_splits, repairs, contact_count = repair_topology(lines, attrs, contact_tolerance)
    nodes, node_index, names, name_index, edges = [], {}, [], {}, []

    def node(xy):
        key = point_key(xy)
        if key not in node_index:
            lon, lat = transformer.transform(*key)
            node_index[key] = len(nodes)
            nodes.append([*key, round(lon, 7), round(lat, 7)])
        return node_index[key]

    for line_id, line in enumerate(lines):
        unique = line_splits[line_id]
        attr = attrs[line_id]
        if attr['name'] not in name_index:
            name_index[attr['name']] = len(names)
            names.append(attr['name'])
        for (s, sxy), (t, txy) in zip(unique, unique[1:]):
            if t - s < 0.03:
                continue
            section = substring(line, s, t)
            if section.geom_type != 'LineString':
                continue
            a, b = node(sxy), node(txy)
            points = list(section.simplify(0.35, preserve_topology=True).coords)
            points[0], points[-1] = tuple(nodes[a][:2]), tuple(nodes[b][:2])
            length = LineString(points).length
            if length <= 0.02:
                continue
            coordinates = []
            for x, y in points:
                lon, lat = transformer.transform(x, y)
                coordinates.append([round(x, 2), round(y, 2), round(lon, 7), round(lat, 7)])
            coordinates[0], coordinates[-1] = nodes[a], nodes[b]
            edges.append({'a': a, 'b': b, 'm': round(length, 3), 'dir': 0,
                          'name': name_index[attr['name']], 'coords': coordinates,
                          'record': attr['record'], 'roadClass': attr['class']})
    topology = nx.Graph()
    topology.add_nodes_from(range(len(nodes)))
    topology.add_edges_from((edge['a'], edge['b']) for edge in edges)
    components = sorted(nx.connected_components(topology), key=len, reverse=True)
    component_by_node = {n: i for i, component in enumerate(components) for n in component}
    component_lengths = Counter()
    for edge in edges:
        edge['component'] = component_by_node[edge['a']]
        component_lengths[edge['component']] += edge['m']
    source_hash = hashlib.sha256()
    for path in [Path(roads_path), Path(boundary_path)]:
        for suffix in ['.shp', '.dbf', '.prj']:
            source_hash.update(path.with_suffix(suffix).read_bytes())
    # Include preprocessing code and tolerance, so saved plans cannot silently
    # reuse a graph with different connectivity or a different fixed origin.
    source_hash.update(str(contact_tolerance).encode())
    for script in ['build_graph.py', 'topology.py']:
        source_hash.update(Path(__file__).with_name(script).read_bytes())
    version = 'shp-v2-' + source_hash.hexdigest()[:12]
    graph = {'version': version, 'crs': 'EPSG:5179', 'nodes': nodes, 'edges': edges, 'names': names}
    graph_size = write_json(output / 'road-graph.json.gz', graph, True)
    road_features = [feature({'type': 'LineString', 'coordinates': [c[2:] for c in e['coords']]},
                             {'name': names[e['name']], 'component': e['component']}) for e in edges]
    map_size = write_json(output / 'road-display.geojson.gz', feature_collection(road_features), True)
    write_json(output / 'danyang-boundary.geojson', json.loads(boundary.to_json()))
    # Search is local and uses real road names, not fabricated POIs/geocoding results.
    search_edges = {}
    for edge in edges:
        key = edge['name']
        if edge['component'] == 0 and (key not in search_edges or edge['m'] > search_edges[key]['m']):
            search_edges[key] = edge
    places = []
    for key, edge in search_edges.items():
        midpoint = LineString([c[:2] for c in edge['coords']]).interpolate(0.5, normalized=True)
        lon, lat = transformer.transform(midpoint.x, midpoint.y)
        places.append({'name': names[key], 'lng': round(lon, 7), 'lat': round(lat, 7)})
    places.sort(key=lambda p: p['name'])
    write_json(output / 'road-search.json', places)
    default_start = next((place for place in places if place['name'] == '소노길'), None)
    if default_start is None:
        raise ValueError('소노길 must be connected to the main network before exporting.')
    for repair in repairs:
        repair['sourceLngLat'] = list(transformer.transform(*repair['sourceXY']))
        repair['targetLngLat'] = list(transformer.transform(*repair['targetXY']))
    repair_summary = dict(Counter(repair['status'] for repair in repairs))
    write_json(output / 'topology-repairs.json', {
        'version': version, 'toleranceM': contact_tolerance,
        'policy': 'endpoint-only; bounded clusters; interior crossings untouched; access-risk names reviewed',
        'summary': repair_summary, 'repairs': repairs})
    warnings = [
        '제공된 단양군 내 도로만 분석합니다. 인접 시·군을 경유하는 경로는 누락될 수 있습니다.',
        '원본에 일방통행·회전 제한·차량 접근 제한·고도 정보가 없습니다. 모든 구간을 양방향으로 가정합니다.',
        f'기존 공통 꼭짓점과 {contact_tolerance:.2f}m 이내 끝점 접촉을 연결합니다. 선 내부 교차는 자동 연결하지 않습니다.',
        '고속도로·자전거·등산 명칭이 있는 도로의 새 간격 연결은 보류합니다. 보정은 지리적 근접에 따른 추정입니다.',
        '입체교차와 차량 통행 가능 여부는 검증되지 않았습니다. 실제 운행 전 경로 확인이 필요합니다.',
        '원본 도로의 ROAD_LT 속성은 사용하지 않습니다. 분할된 실제 선형의 평면 길이로 계산합니다.',
    ]
    metadata = {'version': version, 'source': [Path(roads_path).name, Path(boundary_path).name],
                'sourceCrs': 'EPSG:5179', 'sourceRecords': len(roads), 'sourceParts': len(lines),
                'nodes': len(nodes), 'edges': len(edges), 'components': len(components),
                'componentSummary': [{'id': i, 'nodes': len(c), 'lengthKm': round(component_lengths[i]/1000, 3)}
                                     for i, c in enumerate(components)],
                'totalLengthKm': round(sum(e['m'] for e in edges)/1000, 3),
                'endpointContactCandidates': contact_count, 'contactToleranceM': contact_tolerance,
                'repairSummary': repair_summary,
                'directionSource': 'assumed-bidirectional', 'warnings': warnings,
                'bounds': boundary.total_bounds.tolist(),
                'defaultStart': default_start,
                'graphSize': graph_size, 'displaySize': map_size,
                'sourceFields': [c for c in roads.columns if c != 'geometry']}
    write_json(output / 'network-metadata.json', metadata)
    print(json.dumps({k: metadata[k] for k in ['version', 'nodes', 'edges', 'components', 'totalLengthKm', 'graphSize']}, ensure_ascii=False, indent=2))
    print('Largest components:', [(len(c), round(component_lengths[i]/1000, 1)) for i,c in enumerate(components[:10])])
    print(f'Completed in {time.perf_counter()-start:.1f}s')
    return graph, metadata


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--roads', default='데이터/단양군도로.shp')
    parser.add_argument('--boundary', default='데이터/단양군경계.shp')
    parser.add_argument('--output', default='public/data')
    args = parser.parse_args()
    build(args.roads, args.boundary, args.output)
