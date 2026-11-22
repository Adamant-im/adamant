'use strict';

const fs = require('fs');
const path = require('path');

const docsDir = path.resolve(__dirname, '..');
const repoRoot = path.resolve(docsDir, '..');
const vitepressDist = path.join(docsDir, '.vitepress', 'dist');
const openapiDist = path.join(repoRoot, 'openapi', 'dist');
const swaggerUiDir = path.join(docsDir, 'node_modules', 'swagger-ui-dist');
const targetSchemaDir = path.join(vitepressDist, 'schema');

const indexSrc = path.join(openapiDist, 'index.html');
const schemaSrc = path.join(openapiDist, 'schema.json');
const swaggerUiAssets = [
  'swagger-ui.css',
  'swagger-ui-bundle.js',
  'swagger-ui-standalone-preset.js'
];

if (!fs.existsSync(vitepressDist)) {
  throw new Error(`VitePress build output not found at ${vitepressDist}. Run "npm run docs:build" first.`);
}

if (!fs.existsSync(indexSrc)) {
  throw new Error(`Swagger UI index.html not found at ${indexSrc}.`);
}

if (!fs.existsSync(schemaSrc)) {
  throw new Error(`Bundled OpenAPI schema not found at ${schemaSrc}. Run "npm run openapi:bundle" first.`);
}

for (const asset of swaggerUiAssets) {
  const assetPath = path.join(swaggerUiDir, asset);
  if (!fs.existsSync(assetPath)) {
    throw new Error(`Swagger UI asset not found at ${assetPath}. Run "npm ci --ignore-scripts" in docs/ first.`);
  }
}

// Validate bundled JSON before copying into the published site output.
JSON.parse(fs.readFileSync(schemaSrc, 'utf8'));

fs.mkdirSync(targetSchemaDir, { recursive: true });
fs.copyFileSync(indexSrc, path.join(targetSchemaDir, 'index.html'));
fs.copyFileSync(schemaSrc, path.join(targetSchemaDir, 'schema.json'));
for (const asset of swaggerUiAssets) {
  fs.copyFileSync(path.join(swaggerUiDir, asset), path.join(targetSchemaDir, asset));
}

console.log(`Assembled OpenAPI Swagger UI, local swagger-ui-dist assets, and schema.json into ${targetSchemaDir}`);
