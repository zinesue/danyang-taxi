"""Deterministic UTF-8 JSON/gzip exports for GitHub Pages."""
import gzip
import json
from pathlib import Path


def write_json(path, value, compressed=False):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    content = json.dumps(value, ensure_ascii=False, separators=(',', ':'), allow_nan=False).encode('utf-8')
    if compressed:
        path.write_bytes(gzip.compress(content, compresslevel=9, mtime=0))
    else:
        path.write_bytes(content)
    return {'bytes': len(content), 'storedBytes': path.stat().st_size}


def feature_collection(features):
    return {'type': 'FeatureCollection', 'features': features}


def feature(geometry, properties=None):
    return {'type': 'Feature', 'properties': properties or {}, 'geometry': geometry}
