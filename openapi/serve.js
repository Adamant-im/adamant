'use strict';

const fs = require('fs');
const http = require('http');
const path = require('path');

const distDir = path.join(__dirname, 'dist');
const swaggerUiDir = path.resolve(__dirname, '..', 'docs', 'node_modules', 'swagger-ui-dist');
const port = Number(process.env.PORT) || 3000;
const host = process.env.HOST || '127.0.0.1';

const SWAGGER_UI_ASSETS = new Set([
  'swagger-ui.css',
  'swagger-ui-bundle.js',
  'swagger-ui-standalone-preset.js'
]);

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.svg': 'image/svg+xml'
};

const server = http.createServer((req, res) => {
  const urlPath = (req.url || '/').split('?')[0];
  const relativePath = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
  const baseDir = SWAGGER_UI_ASSETS.has(relativePath) ? swaggerUiDir : distDir;
  const resolved = path.resolve(baseDir, relativePath);

  if (!resolved.startsWith(baseDir + path.sep) && resolved !== baseDir) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Forbidden');
    return;
  }

  fs.readFile(resolved, (err, content) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }

    const ext = path.extname(resolved).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    res.end(content);
  });
});

server.listen(port, host, () => {
  console.log(`ADAMANT OpenAPI Swagger UI listening on http://${host}:${port}`);
});
