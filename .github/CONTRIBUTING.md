# Contributing to ADAMANT Node

Pull requests must be written in English, target `dev` (unless preparing an urgent documentation-only hotfix for `master`), and include tests for any new feature or bug fix.

## Full Testing and Environment Guides

Detailed setup and operational guides live in the consolidated documentation ([`docs/`](../docs/), published at [docs.adamant.im](https://docs.adamant.im)):

- [Testing & Live Scenarios](../docs/own-node/testing.md) — test configuration, native PostgreSQL driver (`libpq`) rebuilds, dependency quarantine checks, and live scenario suites
- [Testnet](../docs/own-node/testnet.md) — running a local testnet node
- [Localnet](../docs/own-node/localnet.md) — running an isolated multi-node localnet
- [Configuration Overrides](../docs/own-node/configuration.md#configuration-overrides) — `--config-overrides` and `--config-set` flags
- [Installation](../docs/own-node/installation.md) — Node.js (`^22.22.2 || >=24.15.0`) and npm lockfile requirements

## Quick Validation Commands

Always report the exact commands executed and their results in your PR description.

> [!CAUTION]
> Stop any running testnet node gracefully (`Ctrl+C`, wait for `Cleaned up successfully`) before running unit tests. Run `npm run start:testnet` at least once beforehand to initialize the test database.

```sh
# Single test file
npm run test:single -- test/path/to/the/test.js

# Fast unit tests
npm run test:unit:fast

# Full unit suite (testnet stopped)
npm run test:unit

# API tests (requires `npm run start:testnet` running in parallel)
npm run test:api

# Repository lint
npm run eslint

# Dependency release-age quarantine check
npm run check:dependency-age -- --base-ref dev
```

## Documentation and OpenAPI Changes

Node documentation (`docs/`) and the OpenAPI 3.2 specification (`openapi/`) live in this repository so code, schema, and docs stay synchronized in a single PR. Tooling dependencies (`vitepress`, `@redocly/cli`) are intentionally isolated in `docs/package.json` — do **not** add them to root `package.json`.

When modifying `docs/` or `openapi/`, validate the combined site build:

```sh
cd docs
npm ci --ignore-scripts
npm run site:build
```

If you update `docs/package-lock.json`, also run the dependency quarantine check:

```sh
node scripts/checkDependencyQuarantine.js --base-ref dev --lockfile docs/package-lock.json
```

## Test Conventions (Chai)

Mirror the repository directory structure inside `test/unit/` and `test/api/` (for example `modules/blocks.js` → `test/unit/modules/blocks.js`), and follow these Chai assertion rules:

- **Use proper English grammar in assertions:**

  ```js
  // ❌
  expect({}).to.be.a('object');
  // ✅
  expect({}).to.be.an('object');
  ```

- **Use `to.be.true` instead of `to.be.ok` for booleans:**

  ```js
  // ❌
  expect(true).to.be.ok;
  // ✅
  expect(true).to.be.true;
  ```

- **Use `not.to` instead of `to.not`:**

  ```js
  // ❌
  expect(true).to.not.be.false;
  // ✅
  expect(true).not.to.be.false;
  ```

- **Use `.equal()` for strict equality (`===`), and `.eql()` only for deep comparison:**

  ```js
  // ❌
  expect(true).to.eql(true);
  // ✅
  expect(true).to.be.true;
  ```

- **Use parentheses for functions and methods in `describe` names:**

  ```js
  // ❌
  describe('functionName', () => { /* ... */ });
  // ✅
  describe('functionName()', () => { /* ... */ });
  ```

Happy testing!
