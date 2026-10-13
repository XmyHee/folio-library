import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';

const base = new URL(process.argv[2] || 'http://127.0.0.1:8080/folio-library/');
async function read(relative) {
  const url = new URL(relative, base);
  const response = await fetch(url, {signal: AbortSignal.timeout(10000)});
  assert.equal(response.status, 200, `${url.pathname}: HTTP ${response.status}`);
  return response;
}
const html = await (await read('')).text();
assert.match(html, /<div id="root"><\/div>/);
const scripts = [...html.matchAll(/<script[^>]*src="([^"]+)"/g)].map(match => match[1]);
assert.ok(scripts.length, 'compiled entry script');
for (const src of scripts) {
  const response = await read(src);
  assert.match(response.headers.get('content-type') || '', /javascript/);
}
const css = [...html.matchAll(/<link[^>]*href="([^"]+\.css)"/g)].map(match => match[1]);
assert.ok(css.length, 'compiled styles');
for (const src of css) assert.match((await read(src)).headers.get('content-type') || '', /text\/css/);
const assets = await readdir(new URL('../dist/assets/', import.meta.url));
const worker = assets.find(name => name.endsWith('.mjs'));
assert.ok(worker, 'PDF module worker');
assert.match((await read('assets/' + worker)).headers.get('content-type') || '', /javascript/);
const font = new Uint8Array(await (await read('fonts/NotoSansSC.ttf.gz')).arrayBuffer());
// Hosts may transparently decode .gz responses; accept valid gzip or decoded TTF/OTF bytes.
assert.ok((font[0] === 0x1f && font[1] === 0x8b)
  || (font[0] === 0 && font[1] === 1 && font[2] === 0 && font[3] === 0)
  || String.fromCharCode(...font.slice(0, 4)) === 'OTTO', 'bundled font bytes');
console.log(`PASS static hosting at ${base.pathname}: HTML, JavaScript, CSS, PDF module-worker MIME and bundled Chinese font`);
