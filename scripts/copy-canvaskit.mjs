/**
 * Puts canvaskit.wasm where the web dev server can serve it.
 *
 * The file is 8MB and is just a copy of node_modules/canvaskit-wasm, so it is
 * not committed -- it is copied into public/ before `expo start --web` runs
 * (see the "preweb" hook in package.json). The production path is handled by
 * scripts/serve-web.mjs, which copies it into the exported build instead.
 */

import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = resolve(__dirname, '../node_modules/canvaskit-wasm/bin/full/canvaskit.wasm');
const dst = resolve(__dirname, '../public/canvaskit.wasm');

if (!existsSync(src)) {
  console.error('canvaskit.wasm not found in node_modules -- run npm install first');
  process.exit(1);
}

mkdirSync(dirname(dst), { recursive: true });
if (!existsSync(dst)) {
  copyFileSync(src, dst);
  console.log('copied canvaskit.wasm into public/');
}
