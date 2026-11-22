# Testing and Live Scenarios

Testing in the ADAMANT Node repository has three layers:

- **Unit tests** (`test/unit/`): Deterministic module, logic, and helper checks without a running node.
- **API tests** (`test/api/`): End-to-end HTTP checks against a local testnet node running in parallel.
- **Live scenario tests** (`scripts/live-test/`): Multi-endpoint, consensus activation, security, forging, and stress scenarios against a local testnet node, public testnet endpoint, or managed multi-node [Localnet](./localnet.md).

For contribution rules and Chai assertion conventions, see [CONTRIBUTING.md](https://github.com/Adamant-im/adamant/blob/dev/.github/CONTRIBUTING.md).

## Test Configuration

Most local validation uses `test/config.json`, copied from `test/config.default.json`:

```sh
cp test/config.default.json test/config.json
```

`test/config.default.json` sets public REST and peer HTTP `limit` and `max` to `0` so the API test suite can issue many requests from localhost. Production defaults live in `config.default.json`. Client WebSocket limits in `test/config.default.json` match production defaults.

- **API tests** require `cacheEnabled: true`, `api.enabled: true`, `api.access.public: true`, and `peers.enabled: true` in `test/config.json`.
- **Unit tests** require `peers.enabled: true` and at least one peer entry in `peers.list`.

You can override individual test configuration settings at startup without editing `test/config.json` using `--config-overrides` or `--config-set`. See [Configuration Overrides](./configuration.md#configuration-overrides).

## Test Directory Structure

- `test/api/` — End-to-end API tests (require a running local testnet node)
- `test/unit/` — Unit tests (must **not** run in parallel with a running testnet node)
- `test/common/` — Shared stubs and utilities
- `test/node.js` — Helper for issuing requests to the local test node
- `test/config.default.json` — Default testnet template (copy to `test/config.json`)
- `test/genesisBlock.json`, `test/genesisDelegates.json`, `test/genesisPasses.json` — Testnet genesis fixtures

## Native PostgreSQL Driver

The database layer enables `pg-native` by default through `pg-promise`, using the system `libpq` client library and the npm `libpq` native addon. Because native addons are compiled for one Node.js ABI at a time, rebuild `libpq` whenever you switch Node.js majors.

npm 11.19+ blocks dependency install scripts unless listed in `package.json` `allowScripts`. The repository explicitly allows `libpq@1.11.0` and denies `javascript-obfuscator`. Leave `allowScripts` unchanged; `npm install-scripts ls` should report no unreviewed packages.

On macOS with Homebrew, install `libpq` (installing a PostgreSQL server formula such as `postgresql@18` is only needed if you do not already run a compatible local PostgreSQL server) and rebuild the addon for your active Node.js major:

```sh
brew install libpq

cd node_modules/libpq
PATH="/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/opt/node@24/bin:/opt/homebrew/bin:/opt/homebrew/opt/libpq/bin" \
CPPFLAGS="-I/opt/homebrew/opt/libpq/include" \
LDFLAGS="-L/opt/homebrew/opt/libpq/lib" \
PKG_CONFIG_PATH="/opt/homebrew/opt/libpq/lib/pkgconfig" \
node-gyp rebuild
```

If native bindings are unavailable during local validation unrelated to database driver behavior, fall back to the pure-JavaScript `pg` driver and report the fallback explicitly:

```sh
PG_NATIVE=false npm run test:unit:fast
```

## Running Unit and API Tests

::: warning Do not run unit tests alongside a running node
Stop the local testnet node gracefully (`Ctrl+C` and wait for `Cleaned up successfully`) before running unit tests. Run `npm run start:testnet` at least once beforehand to initialize the test database schema.
:::

```sh
# Single test file
npm run test:single -- test/path/to/test.js

# Fast unit tests (excludes slow reward/SQL suites)
npm run test:unit:fast

# Full unit suite (testnet must be stopped)
npm run test:unit

# Start local testnet in one terminal, then run API tests in another
npm run start:testnet
npm run test:api

# Full repository ESLint check
npm run eslint
```

## Dependency Quarantine Check

Both root `.npmrc` and `docs/.npmrc` set `min-release-age=7` to filter fresh resolutions. Because `npm ci` consumes the lockfile directly, CI runs `scripts/checkDependencyQuarantine.js` to verify every newly locked package version against npm registry publication timestamps, check for lockfile tampering (`resolved`, `integrity`, `hasInstallScript`), and enforce `allowScripts` review.

Run locally against a base branch:

```sh
# Node dependencies
npm run check:dependency-age -- --base-ref dev

# Documentation and OpenAPI tooling dependencies
node scripts/checkDependencyQuarantine.js --base-ref dev --lockfile docs/package-lock.json
```

Approved quarantine exceptions must be exact `package`/`version` entries in `.github/dependency-quarantine-exceptions.json` with a `reason` and linked tracking `issue` (never wildcarded).

## Live Scenario Tests

Live scenario tests validate a running node or managed localnet through public REST and WebSocket interfaces. Ordinary scenario runs never start or stop nodes (the sole exception is `scenario:localnet -- --suite consensus --live`, which manages a disposable localnet with graceful shutdown).

### Running Scenarios

```sh
# Against a running local testnet node (or fallback to the first peer in test/config.default.json)
npm run scenario:testnet -- --all

# Against an explicit testnet endpoint
npm run scenario:testnet -- --all --node=167.86.99.198:36667

# Against a managed multi-node localnet
npm run start:localnet -- --nodes 3
npm run scenario:localnet -- --all
```

Without `--all`, `--suite`, or `--scenario`, only read-only target and API checks run. Opt-in stress scenarios are excluded from `--all` and `--suite load` unless explicitly enabled:

```sh
npm run scenario:testnet -- --suite api
npm run scenario:localnet -- --suite consensus
npm run scenario:localnet -- --suite consensus --live
npm run scenario:localnet -- --suite load --profile high
npm run scenario:localnet -- --suite load --http-stress
npm run scenario:localnet -- --suite load --txqueue-type0-stress
npm run scenario:localnet -- --suite load --txqueue-type8-stress
npm run scenario:localnet -- --suite load --txqueue-all-stress
npm run scenario:localnet -- --suite load --txburst-type0-stress
npm run scenario:localnet -- --suite load --txburst-all-stress
npm run scenario:localnet -- --scenario transactions.abuse
```

### Available Scenarios

| Scenario ID | Suite | Modes | Description |
| --- | --- | --- | --- |
| `target.readiness` | `target` | `testnet`, `localnet` | Audits every unique configured testnet peer or localnet node, waits for readiness (`loaded=true`, `syncing=false`), and reports version, height, delegate count, public API/WebSocket config, loader state, and transaction pool counters. Treats `API access denied` as a valid closed-API state. |
| `api.rest` | `api` | `testnet`, `localnet` | Runs a read-only REST matrix across all documented API sections (Accounts, Transactions, Chats/Chatrooms, Blocks, Delegates, States/KVS, Node/Blockchain), Transactions Query Language combinations, pagination, sorting, validation errors (`success=false`), and unknown routes (`404`). |
| `api.websocket` | `api` | `testnet`, `localnet` | Verifies Socket.IO handshake, emits transaction-type, chat-subtype, and address subscriptions, and checks clean disconnect. |
| `consensus.activation` | `consensus` | `testnet`, `localnet` | Checks `fairSystem` (delegate `votesWeight` ranking and approval) and `spaceship` (`timestampMs` preservation and same-second constraint) on two nodes plus cross-node chain agreement (`nethash`, height drift, and same-height broadhash/head/delegate-order equality). |
| `transactions.happy-path` | `transactions` | `testnet`, `localnet` | Exercises transaction types `0..9`, including vote/unvote, chat subtypes, state subtypes, second signature, multisignature, and DApp registration/in-transfer/out-transfer. |
| `transactions.abuse` | `security` | `testnet`, `localnet` | Tests malformed/abusive transactions across types, duplicate admission, balance overspend, concurrent unconfirmed-balance accounting (e.g., 3 concurrent `0.7 ADM` spends from a `2 ADM` account where exactly 2 confirm), repeated invalid submissions, and bounded overload (`--transaction-overload-count`, `--transaction-overload-concurrency`). |
| `delegates.forging` | `forging` | `localnet` | Captures per-node forging configuration, delegate and next-forger results, live and cached consensus, activation switches, reward stage, latest block rewards, and generator totals. |
| `load.http` | `load` | `testnet`, `localnet` | Measures bounded `/api/node/status` latency and throughput for the selected normal profile. |
| `load.httpstress` | `load` | `testnet`, `localnet` | Sends 2000 `/api/node/status` requests at concurrency 20 (`--http-stress`). Requires HTTP 2xx with `success: true` and consistent `nethash`. |
| `load.txqueue-type0` | `load` | `testnet`, `localnet` | Submits valid type `0` transfers for 16s across 20 workers (`--txqueue-type0-stress`), tracks pool snapshots and confirmation of every accepted ID across all observed nodes, and computes real-block TPS. |
| `load.txqueue-type8` | `load` | `testnet`, `localnet` | Submits valid type `8` ordinary chat messages (1–1000 ASCII chars, hex-encoded) for 16s across 20 workers (`--txqueue-type8-stress`), tracking confirmation and real-block TPS without logging message contents. |
| `load.txburst-type0` | `load` | `testnet`, `localnet` | Pre-signs 2000 valid type `0` transfers (requires >= 3000 ADM on the source fixture) and dispatches all 2000 concurrently (`--txburst-type0-stress`, 120s minimum response timeout), tracking settlement and real-block TPS. |

Transaction load scenarios treat any accepted transaction ID that disappears from both pools and confirmed blocks after settlement as a failure (orphaned/dropped).

### Live Consensus Activation Run

For disposable multi-node activation testing on localnet:

```sh
npm run scenario:localnet -- --suite consensus --live
```

This resets localnet databases (`drop:localnet`), launches three nodes with `test/config.localnet.json` and `scripts/live-test/config.test-consensus-localnet.overrides` (`fairSystem` at height `203`, `spaceship` at height `405`, 20 PostgreSQL connections per node), runs through height `606`, captures four checkpoints (pre-activation, first `fairSystem` block, first `spaceship` block, end of second post-`spaceship` round) with workloads and transition transactions at each boundary, writes reports, and gracefully stops all nodes (timeout configurable via `--live-timeout-ms`).

For testnet coordination, `--live` does not start or stop nodes — it generates round-aligned activation heights (8–12 rounds apart) in `scripts/live-test/config.test-consensus-testnet.overrides` and prints the startup command:

```sh
npm run scenario:testnet -- --suite consensus --live
```

Never apply a generated testnet activation override file to an existing public testnet database where `fairSystem` has already activated.

### Reports

Every live scenario run writes redacted JSON and Markdown reports under `reports/live-test/` (git-ignored). Fixture passphrases from `test/genesisPasses.json` are test-only inputs and are redacted from reports.
