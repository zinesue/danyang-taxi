"""Endpoint-only topology repair; never node an interior/interior crossing."""
from collections import defaultdict
from math import hypot

from shapely import STRtree
from shapely.geometry import Point


def point_key(xy):
    return (round(xy[0], 2), round(xy[1], 2))


def repair_topology(lines, attrs, tolerance=0.5):
    if not 0 <= tolerance <= 1:
        raise ValueError('Automatic endpoint repair is limited to 0–1 metre.')
    splits = [[] for _ in lines]
    positions, parent, members = [], [], []

    def anchor(line_id, distance):
        # Reuse the actual endpoint when a projection coincides with it.
        # Crucially, union the anchors instead of dropping a duplicate split.
        for d, index in splits[line_id]:
            if abs(d - distance) <= 0.02:
                return index
        index = len(parent)
        positions.append(tuple(lines[line_id].interpolate(distance).coords[0]))
        parent.append(index)
        members.append([index])
        splits[line_id].append((distance, index))
        return index

    def root(index):
        while parent[index] != index:
            parent[index] = parent[parent[index]]
            index = parent[index]
        return index

    def join(a, b, bounded=False):
        a, b = sorted((root(a), root(b)))
        if a == b:
            return 'existing'
        if bounded and any(hypot(positions[i][0] - positions[j][0],
                                 positions[i][1] - positions[j][1]) > tolerance + 0.02
                           for i in members[a] for j in members[b]):
            return 'cluster-too-wide'
        parent[b] = a
        members[a].extend(members[b])
        return 'applied'

    owners = defaultdict(set)
    for line_id, line in enumerate(lines):
        for xy in line.coords:
            owners[point_key(xy)].add(line_id)
    shared = {}
    endpoints = []
    for line_id, line in enumerate(lines):
        endpoints.extend((line_id, anchor(line_id, d)) for d in (0, line.length))
        distance, previous = 0, None
        for xy in line.coords:
            if previous is not None:
                distance += hypot(xy[0] - previous[0], xy[1] - previous[1])
            key = point_key(xy)
            if len(owners[key]) > 1:
                index = anchor(line_id, distance)
                if key in shared:
                    join(index, shared[key])
                else:
                    shared[key] = index
            previous = xy

    candidates = []
    tree = STRtree(lines)
    for line_id, index in endpoints:
        point = Point(positions[index])
        for other in tree.query(point.buffer(max(tolerance, 0.001))):
            other = int(other)
            if other == line_id:
                continue
            gap = lines[other].distance(point)
            if gap <= tolerance:
                candidates.append((gap, line_id, index, other, lines[other].project(point)))
    audit = []
    for gap, line_id, index, other, distance in sorted(candidates):
        source, target = attrs[line_id], attrs[other]
        target_xy = tuple(lines[other].interpolate(distance).coords[0])
        restricted = any(word in attr['name'] for attr in (source, target)
                         for word in ('고속도로', '자전거', '등산'))
        if gap > 0.01 and restricted:
            status = 'review-road-access'
        else:
            target_index = anchor(other, distance)
            status = join(index, target_index, bounded=True)
        if status != 'existing' and gap > 0.01:
            audit.append({'status': status, 'gapM': round(gap, 6),
                          'sourceRecord': source['record'], 'targetRecord': target['record'],
                          'sourceName': source['name'], 'targetName': target['name'],
                          'sourceXY': list(positions[index]), 'targetXY': list(target_xy)})
    result = []
    for entries in splits:
        result.append([(d, positions[root(index)]) for d, index in sorted(entries)])
    return result, audit, len(candidates)
