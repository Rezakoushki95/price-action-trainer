/**
 * Serves the exported web build so the app can be opened, and screenshotted,
 * without an Android or iOS toolchain.
 *
 *   npm run web:build && npm run web:serve
 *
 * Two things this does that a generic static server does not:
 *   - copies canvaskit.wasm in, since `expo export` does not carry public/ across
 *   - serves .wasm as application/wasm, which CanvasKit's instantiateStreaming
 *     requires and refuses to work without
 */

import { createServer } from 'node:http';
import { readFile, stat, copyFile, access } from 'node:fs/promises';
import { join, extname, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../dist-web');
const WASM_SRC = resolve(__dirname, '../node_modules/canvaskit-wasm/bin/full/canvaskit.wasm');
const PORT = Number(process.env.PORT || 3000);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css',
  '.json': 'application/json',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.wasm': 'application/wasm',
};

try {
  await access(join(ROOT, 'index.html'));
} catch {
  console.error(`No build at ${ROOT}. Run: npm run web:build`);
  process.exit(1);
}

try {
  await access(join(ROOT, 'canvaskit.wasm'));
} catch {
  await copyFile(WASM_SRC, join(ROOT, 'canvaskit.wasm'));
  console.log('copied canvaskit.wasm into the build');
}

createServer(async (req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p === '/') p = '/index.html';
  let file = join(ROOT, p);
  try {
    if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
  } catch {
    file = join(ROOT, 'index.html');
  }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
}).listen(PORT, () => console.log(`http://localhost:${PORT}`));
