"""Read-only inventory: python scripts/inspect_shp.py --input 데이터"""
import argparse
import json
from pathlib import Path
import geopandas as gpd


def inspect(folder):
    result = []
    for path in sorted(Path(folder).glob('*.shp')):
        frame = gpd.read_file(path)
        result.append({
            'file': path.name, 'count': len(frame), 'crs': str(frame.crs),
            'geometryTypes': frame.geom_type.value_counts().to_dict(),
            'invalid': int((~frame.is_valid).sum()),
            'empty': int(frame.geometry.is_empty.sum()),
            'bounds': frame.total_bounds.tolist(),
            'fields': {str(k): str(v) for k, v in frame.dtypes.items()},
            'sample': frame.drop(columns='geometry').head(3).fillna('').to_dict('records'),
        })
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--input', default='데이터')
    args = parser.parse_args()
    print(json.dumps(inspect(args.input), ensure_ascii=False, indent=2))
