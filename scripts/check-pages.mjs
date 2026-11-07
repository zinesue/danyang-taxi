import { readdir } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import assert from 'node:assert/strict';
import { createStaticServer } from './serve-dist.mjs';

const server = createStaticServer('/repository-name/');
await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
const base = `http://127.0.0.1:${server.address().port}/repository-name/`;
try {
  const response = await fetch(base); assert.equal(response.status,200);
  const html = await response.text();
  const references = [...html.matchAll(/(?:src|href)="(\.\/assets\/[^"]+)"/g)].map(m => m[1]);
  assert(references.length >= 2, 'Use relative asset paths for Pages');
  for (const path of references) assert.equal((await fetch(new URL(path,base))).status,200,path);
  const assets = await readdir('dist/assets');
  const worker = assets.find(name => name.startsWith('routingWorker-') && name.endsWith('.js'));
  assert(worker); assert.equal((await fetch(base + 'assets/' + worker)).status,200);
  for (const file of ['network-metadata.json','fare-config.json','road-search.json','address-metadata.json','danyang-boundary.geojson']) {
    const r = await fetch(base + 'data/' + file); assert.equal(r.status,200,file); await r.json();
  }
  for (const file of ['road-graph.json.gz','road-display.geojson.gz','address-index.json.gz']) {
    const r = await fetch(base + 'data/' + file); assert.equal(r.status,200,file);
    JSON.parse(gunzipSync(Buffer.from(await r.arrayBuffer())).toString());
  }
  assert.equal((await fetch(base + 'data/missing.json')).status,404);
  console.log('PASS: HTML, JS, CSS, Worker, JSON and gzip data resolve under /repository-name/.');
} finally { await new Promise(resolve => server.close(resolve)); }
