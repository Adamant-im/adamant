# ADAMANT Node OpenAPI Specification

OpenAPI 3.2 specification for the ADAMANT Node REST API and client WebSocket contract (`x-client-websocket`).

- **Live Swagger UI:** [docs.adamant.im/schema/](https://docs.adamant.im/schema/)
- **Bundled OpenAPI JSON:** [docs.adamant.im/schema/schema.json](https://docs.adamant.im/schema/schema.json)
- **Reference Documentation:** [docs.adamant.im](https://docs.adamant.im)

## Structure

- `specification/` — modular OpenAPI 3.2 YAML source files (root: `specification/openapi.yaml`)
- `dist/index.html` — static Swagger UI entry point deployed alongside the bundled `schema.json`
- `serve.js` — zero-dependency local HTTP server for previewing Swagger UI
- `examples/axios/` — example TypeScript client generation from the bundled schema

## Commands

OpenAPI tooling is installed under [`../docs/`](../docs/) so root node deployments stay lightweight.

```sh
cd docs
npm ci --ignore-scripts

# Bundle openapi/specification/openapi.yaml into openapi/dist/schema.json
npm run openapi:bundle

# Bundle and serve Swagger UI locally at http://127.0.0.1:3000
npm run openapi:serve
```

## Example: Generate TypeScript Types

```sh
cd openapi/examples/axios
npm install
npm run openapi:generate  # output: openapi/examples/axios/client/
```

## License

The OpenAPI specification files in this directory are licensed under the [ISC License](./LICENSE).
