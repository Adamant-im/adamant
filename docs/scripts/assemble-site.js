'use strict';

const fs = require('fs');
const path = require('path');

const docsDir = path.resolve(__dirname, '..');
const repoRoot = path.resolve(docsDir, '..');
const vitepressDist = path.join(docsDir, '.vitepress', 'dist');
const openapiDist = path.join(repoRoot, 'openapi', 'dist');
const targetSchemaDir = path.join(vitepressDist, 'schema');

const indexSrc = path.join(openapiDist, 'index.html');
const schemaSrc = path.join(openapiDist, 'schema.json');

if (!fs.existsSync(vitepressDist)) {
  throw new Error(`VitePress build output not found at ${vitepressDist}. Run "npm run docs:build" first.`);
}

if (!fs.existsSync(indexSrc)) {
  throw new Error(`Swagger UI index.html not found at ${indexSrc}.`);
}

if (!fs.existsSync(schemaSrc)) {
  throw new Error(`Bundled OpenAPI schema not found at ${schemaSrc}. Run "npm run openapi:bundle" first.`);
}

// Validate bundled JSON before copying into the published site output.
JSON.parse(fs.readFileSync(schemaSrc, 'utf8'));

fs.mkdirSync(targetSchemaDir, { recursive: true });
fs.copyFileSync(indexSrc, path.join(targetSchemaDir, 'index.html'));
fs.copyFileSync(schemaSrc, path.join(targetSchemaDir, 'schema.json'));

console.log(`Assembled OpenAPI Swagger UI and schema.json into ${targetSchemaDir}`);
