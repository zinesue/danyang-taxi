// Local verification only; the deployed application itself has no server.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

export function createStaticServer(base = '/danyang-taxi/') {
  const root = resolve('dist');
  const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.geojson': 'application/geo+json', '.gz': 'application/gzip', '.png': 'image/png', '.svg': 'image/svg+xml' };
  return createServer(async (req, res) => {
    try {
      const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      if (!pathname.startsWith(base)) { res.writeHead(404); res.end('Not found'); return; }
      const relative = pathname.slice(base.length) || 'index.html';
      const path = resolve(root, relative);
      if (!path.startsWith(root + sep)) { res.writeHead(403); res.end(); return; }
      const bytes = await readFile(path);
      res.writeHead(200, { 'Content-Type': mime[extname(path)] || 'application/octet-stream' }); res.end(bytes);
    } catch { res.writeHead(404); res.end('Not found'); }
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const server = createStaticServer(); server.listen(4173, '127.0.0.1', () => console.log('Pages subpath preview: http://127.0.0.1:4173/danyang-taxi/'));
}
