# docs.adamant.im

> Documentation site and OpenAPI tooling for [ADAMANT Node](https://github.com/Adamant-im/adamant)

Published at [https://docs.adamant.im](https://docs.adamant.im), with the interactive OpenAPI Swagger UI served at [https://docs.adamant.im/schema/](https://docs.adamant.im/schema/) (`schema.json` at [https://docs.adamant.im/schema/schema.json](https://docs.adamant.im/schema/schema.json)).

## Isolated Tooling

Documentation and OpenAPI dependencies (`vitepress` and `@redocly/cli`) live exclusively in `docs/package.json` so root node installations (`npm ci --omit=dev` or `npm ci`) remain lightweight.

## Local Development and Build

Run commands from the `docs/` directory (Node.js `22.22.2+` on 22.x or `24.15.0+` required):

```sh
cd docs
npm ci --ignore-scripts

npm run dev             # VitePress dev server with hot reload
npm run docs:build      # Build VitePress site into docs/.vitepress/dist
npm run docs:preview    # Preview built site locally
npm run openapi:bundle  # Bundle ../openapi/specification/openapi.yaml into ../openapi/dist/schema.json
npm run openapi:serve   # Bundle and preview Swagger UI at http://127.0.0.1:3000
npm run site:build      # Build VitePress + bundle OpenAPI + assemble combined Pages output
```

## Links

- [ADAMANT Website](https://adamant.im)
- [ADAMANT Node repository](https://github.com/Adamant-im/adamant)
- [ADAMANT Improvement Proposals (AIPs)](https://aips.adamant.im)
- [API Schema (Swagger UI)](https://docs.adamant.im/schema/)
- [OpenAPI specification source](https://github.com/Adamant-im/adamant/tree/dev/openapi)
