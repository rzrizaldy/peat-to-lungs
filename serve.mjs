import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

const args = process.argv.slice(2);
const port = Number(args[0] ?? process.env.PORT ?? 4173);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Port harus 1–65535.');
const root = new URL('./', import.meta.url);
const allowed = /^(?:index\.html|styles\.css|app\.mjs|map\.mjs|iso\.mjs|tools\/model\.mjs|assets\/[a-z0-9-]+\.png|pocket\/[a-z0-9-]+\.html|data\/[a-z0-9-]+\.json)$/i;
const types = { html: 'text/html; charset=utf-8', css: 'text/css; charset=utf-8', mjs: 'text/javascript; charset=utf-8',
  json: 'application/json; charset=utf-8', png: 'image/png' };

createServer(async (request, response) => {
  if (!['GET', 'HEAD'].includes(request.method)) {
    response.writeHead(405, { Allow: 'GET, HEAD' }).end();
    return;
  }
  try {
    const path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname).slice(1) || 'index.html';
    if (!allowed.test(path)) {
      response.writeHead(404).end('Halaman tidak ditemukan.');
      return;
    }
    const bytes = await readFile(new URL(path, root));
    const extension = path.split('.').at(-1);
    response.writeHead(200, {
      'Content-Type': types[extension], 'Content-Length': bytes.length, 'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
    }).end(request.method === 'HEAD' ? undefined : bytes);
  } catch {
    response.writeHead(404).end('Halaman tidak ditemukan.');
  }
}).listen(port, '127.0.0.1', () => console.log(`Dashboard: http://127.0.0.1:${port}`));
