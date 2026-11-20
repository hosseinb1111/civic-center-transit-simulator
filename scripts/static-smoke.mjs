import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mimeTypes = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css' };
const server = http.createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\//, '');
    const fullPath = path.resolve(root, relative);
    if (!fullPath.startsWith(`${root}${path.sep}`)) throw new Error('Path traversal blocked');
    const body = await fs.readFile(fullPath);
    response.writeHead(200, { 'content-type': `${mimeTypes[path.extname(fullPath)] || 'application/octet-stream'}; charset=utf-8` });
    response.end(body);
  } catch {
    response.writeHead(404);
    response.end('Not found');
  }
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const { port } = server.address();
const base = `http://127.0.0.1:${port}`;
try {
  for (const resource of ['/index.html', '/data/config.json', '/src/main.js', '/src/simulation.js', '/src/rendering.js']) {
    const response = await fetch(`${base}${resource}`);
    if (!response.ok) throw new Error(`${resource} returned HTTP ${response.status}`);
  }
  const html = await (await fetch(`${base}/index.html`)).text();
  if (!html.includes('type="module"')) throw new Error('index.html did not load the app as an ES module.');
  const config = await (await fetch(`${base}/data/config.json`)).json();
  if (!config.services.length) throw new Error('data/config.json contains no illustrative services.');
  process.stdout.write('Static-server smoke test passed (HTML, configuration and ES modules served successfully).\n');
} finally {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}
