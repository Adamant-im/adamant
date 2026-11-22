# ADAMANT Node OpenAPI Specification

OpenAPI 3.2 specification for the ADAMANT Node REST API and client WebSocket contract (`x-client-websocket`).

- **Live Swagger UI:** [docs.adamant.im/schema/](https://docs.adamant.im/schema/)
- **Bundled OpenAPI JSON:** [docs.adamant.im/schema/schema.json](https://docs.adamant.im/schema/schema.json)
- **Reference Documentation:** [docs.adamant.im](https://docs.adamant.im)

## Structure

- `specification/` — modular OpenAPI 3.2 YAML source files (root: `specification/openapi.yaml`)
- `redocly.yaml` — Redocly lint ruleset applied to the bundled `dist/schema.json`
- `dist/index.html` — static Swagger UI entry point deployed alongside local `swagger-ui-dist` assets and bundled `schema.json`
- `serve.js` — zero-dependency local HTTP server for offline Swagger UI preview

## Commands

OpenAPI tooling is isolated under [`../docs/`](../docs/) so root node deployments stay lightweight.

```sh
cd docs
npm ci --ignore-scripts

# Bundle openapi/specification/openapi.yaml into openapi/dist/schema.json
npm run openapi:bundle

# Lint bundled openapi/dist/schema.json for structural regressions
npm run openapi:lint

# Bundle and serve Swagger UI locally (offline) at http://127.0.0.1:3000
npm run openapi:serve
```

## TypeScript Client Generation

For a maintained TypeScript client generated from this specification, see [`Adamant-im/adamant-api-jsclient`](https://github.com/Adamant-im/adamant-api-jsclient).

## License

The OpenAPI specification files in this directory are licensed under the [ISC License](./LICENSE).
