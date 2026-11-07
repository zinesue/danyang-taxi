import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from shapely.geometry import LineString
from topology import repair_topology


def repair(coordinates, names=None):
    lines = [LineString(c) for c in coordinates]
    attrs = [{'name': names[i] if names else '일반도로', 'record': i} for i in range(len(lines))]
    return repair_topology(lines, attrs)[0]


class TopologyTests(unittest.TestCase):
    def test_close_endpoints_share_one_node(self):
        splits = repair([[(0, 0), (10, 0)], [(10.047, 0), (20, 0)]])
        self.assertEqual(splits[0][-1][1], splits[1][0][1])

    def test_t_junction_splits_target_at_shared_node(self):
        splits = repair([[(0, 0), (20, 0)], [(10, 10), (10, 0.346)]])
        self.assertEqual(len(splits[0]), 3)
        self.assertEqual(splits[0][1][1], splits[1][-1][1])

    def test_interior_crossing_stays_disconnected(self):
        splits = repair([[(0, 5), (10, 5)], [(5, 0), (5, 10)]])
        self.assertEqual([len(s) for s in splits], [2, 2])
        self.assertFalse(set(xy for _, xy in splits[0]) & set(xy for _, xy in splits[1]))

    def test_large_gap_and_access_risk_are_not_bridged(self):
        for gap, names in [(0.6, None), (0.2, ['일반도로', '중앙고속도로']),
                           (0.2, ['일반도로', '자전거길'])]:
            splits = repair([[(0, 0), (10, 0)], [(10 + gap, 0), (20, 0)]], names)
            self.assertNotEqual(splits[0][-1][1], splits[1][0][1])

    def test_chain_cannot_expand_snap_cluster_beyond_tolerance(self):
        splits = repair([[(-10, 0), (0, 0)], [(0.4, 0), (0.4, 10)],
                         [(0.8, 0), (10, 0)]])
        self.assertNotEqual(splits[0][-1][1], splits[2][0][1])


if __name__ == '__main__':
    unittest.main()
