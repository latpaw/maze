import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const portArg = process.argv.indexOf('--port');
const port = Number(portArg === -1 ? process.env.PORT || 4173 : process.argv[portArg + 1]);
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' };
const server = http.createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const path = resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
    const relative = path.slice(root.length);
    if (!path.startsWith(root) || relative.split(sep).some(part => part.startsWith('.'))) {
      res.writeHead(403); res.end('Forbidden'); return;
    }
    if (!(await stat(path)).isFile()) { res.writeHead(404); res.end('Not found'); return; }
    const data = await readFile(path);
    res.writeHead(200, { 'Content-Type': mime[extname(path)] || 'application/octet-stream', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
    res.end(data);
  } catch (_) { res.writeHead(404); res.end('Not found'); }
});
server.listen(port, '127.0.0.1', () => { console.log(`小小迷宫工坊  http://127.0.0.1:${port}`); console.log('按 Ctrl+C 关闭预览。'); });
server.on('error', error => { console.error(error.message); process.exitCode = 1; });
