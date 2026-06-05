## Tests

To be merged, pull requests **MUST** include tests for any new features or bug fixes.

Testing in this repository has three layers:

- `unit/` tests for deterministic module and helper behavior without a running node.
- `api/` tests against a local testnet node through public HTTP APIs.
- Live scenario tests against an already running local testnet node, public testnet endpoint, or managed multi-node localnet.

Choose the smallest validation set that covers the change, then broaden it when the change touches shared logic, networking, transaction handling, consensus-sensitive behavior, SQL, or operational tooling. Always report exactly which commands were run.

### Test configuration

Most local validation uses the config file located at `test/config.json`.

Copy or prepare `test/config.json` from `test/config.default.json` before running local node or API tests. The testnet configuration is safe for experimentation and does not affect `mainnet`. For more background, see [ADAMANT Node Testnet](https://docs.adamant.im/own-node/testnet.html).

#### API tests

If you are running **API tests** (in the `test/api/` directory), you need to enable the following features in the config:

```json5
{
  "cacheEnabled": true,
  // ...
  "api": {
    "enabled": true,
    "access": {
      "public": true,
      // ...
    },
    // ...
  },
  "peers": {
    "enabled": true,
    // ...
  }
}
```

#### Unit tests

You need to specify at least some peers in `peers.list`, e.g.:

```json5
{
  // ...
  "peers": {
    "enabled": true,
    "list": [
      {
        "ip": "162.55.32.80",
        "port": 36667
      },
      {
        "ip": "81.0.247.181",
        "port": 36667
      },
      {
        "ip": "95.217.19.144",
        "port": 36667
      }
    ],
    // ...
  }
}
```

#### Configuration Overrides

Startup config can be overridden without editing `config.json` or `test/config.json`.
Overrides are applied in this order: selected config file, each `--config-overrides` file in command-line order, repeated `--config-set` values, then legacy CLI shortcuts such as `--port`, `--address`, `--peers`, `--log`, and `--snapshot`.
The final resolved config is validated against the node config schema before startup.

Use dot paths that match the config object shape:

```sh
node app.js \
  --config test/config.json \
  --genesis test/genesisBlock.json \
  --config-set consensusActivationHeights.fairSystem=4359465 \
  --config-set 'redis={ "url": "redis://127.0.0.1:6379/1", "password": null }'
```

The same flags work through npm scripts:

```sh
npm run start -- --config-set port=36667
npm run start:testnet -- --config-set api.access.public=true
```

The `--config-overrides` file type is selected by extension. Any non-`.json` file is parsed as env-style content with one `key=value` override per line:

```dotenv
consensusActivationHeights.fairSystem=4359465
redis={ "url": "redis://127.0.0.1:6379/1", "password": null }
```

Run with:

```sh
node app.js \
  --config test/config.json \
  --genesis test/genesisBlock.json \
  --config-overrides test/config.overrides.env
```

Files ending in `.json` are parsed as nested JSON partial overrides:

```json
{
  "consensusActivationHeights": {
    "fairSystem": 4359465
  },
  "redis": {
    "url": "redis://127.0.0.1:6379/1",
    "password": null
  }
}
```

Run with:

```sh
node app.js \
  --config test/config.json \
  --genesis test/genesisBlock.json \
  --config-overrides test/config.overrides.json
```

Values are parsed as JSON first, so numbers, booleans, `null`, arrays, and objects keep their types. Non-JSON values are treated as strings. Unknown paths, unsafe path segments, malformed JSON arrays or objects, and schema-invalid values fail before startup.

Be careful when overriding `consensusActivationHeights.*`: using activation heights that do not match the selected network can make a node diverge from that network.

### Test structure

The tests are located in the `test/` directory. The structure of the directory is as follows:

- `api/` - End-to-end **API tests** that require running a local test node
- `unit/` - **Unit tests** that DO NOT require running a test node
- `common/` - Contains stub objects and utilities for the tests
- `node.js` - Package for making requests to the local test node
- `config.json` - Configuration file to run a local test node; copy `config.default.json`
- `genesisBlock.json` - Genesis block data
- `genesisDelegates.json` - Genesis delegate accounts
- `genesisPasses.json` - Passphrases for the genesis accounts

All tests inside `api/` and `unit/` should mirror (as much as possible) the structure of the project. For example, unit tests for the `modules/blocks.js` module should be located in the `test/unit/modules/blocks.js` file.

### Local testnet

Use a local testnet node when running API tests or when you need a single safe node for manual validation:

> [!IMPORTANT] > **API tests** require the `testnet` local node to be running in parallel during their execution:

```sh
npm run start:testnet
```

Stop the node through the normal graceful shutdown path when finished.

### Localnet

Use localnet when you need several ADAMANT nodes on one machine without connecting to public peers:

```sh
npm run start:localnet -- --nodes 3
npm run status:localnet
npm run stop:localnet
npm run drop:localnet
```

`start:localnet` runs nodes in the background with:

- `test/config.default.json` as the base config;
- `test/genesisBlock.json` as the genesis block;
- `test/genesisPasses.json` as the genesis delegate passphrase source;
- `--config-overrides test/config.localnet.json` by default;
- one generated per-node override file under `.localnet/node-N/`.

Every node gets isolated ports, PostgreSQL database names, Redis database indexes, process output files, and ADAMANT log files. The default log layout is:

```text
logs-localnet/
  node-1/
    adamant_localnet.log
    adamant_localnet_debug.log
  node-2/
  node-3/
```

The localnet manifest is written to `.localnet/manifest.json` and includes node endpoints, PIDs, database names, Redis URLs, generated override paths, log paths, and configured delegate counts. Scenario tools can consume this manifest instead of guessing localnet ports.

Use `status:localnet` to inspect localnet without attaching to node processes:

```sh
npm run status:localnet
```

It reads the manifest, checks every managed PID, requests `/api/node/status` and `/api/peers` from every node, reports the number of configured forging delegates, and shows the last successful forging log timestamp with its age in seconds. The reported broadhash consensus is calculated live from current connected peer records; if `/api/node/status` still has an older cached consensus value, status output shows it as `cached`.

Localnet uses the testnet genesis block by default. The node derives `nethash` from `genesisBlock.payloadHash`, which is the SHA-256 payload hash verified from the genesis block transactions. It is not a random identifier. If you use a different genesis block, every localnet node must use the same genesis block and resulting nethash.

By default, genesis delegate passphrases are distributed across localnet nodes. For one to three nodes, all nodes receive delegate passphrases. For more than three nodes, the last node is non-forging and the remaining nodes receive the passphrases as evenly as possible.

By default, `start:localnet` tries to create missing per-node PostgreSQL databases and keeps them persistent across restarts:

```text
adamant_localnet_node_1
adamant_localnet_node_2
adamant_localnet_node_3
```

The created databases are owned by the configured node DB user, `adamanttest` by default. Database creation uses the current PostgreSQL user unless `--db-admin-user` is provided:

```sh
npm run start:localnet -- --nodes 3 --db-admin-user postgres
```

If the databases already exist, startup continues. If your local PostgreSQL user cannot create databases, create them manually, pass a PostgreSQL admin user, or start with `--skip-db-create` after the databases exist.

`stop:localnet` reads `.localnet/manifest.json`, sends `SIGTERM` to every managed node, and waits for the normal ADAMANT cleanup path. It does not use forced process termination.

Localnet databases are not dropped by default. To stop localnet and drop its PostgreSQL databases in one command:

```sh
npm run stop:localnet -- --drop-on-stop
```

Use `drop:localnet` when you want a full localnet database cleanup even if no nodes are currently running:

```sh
npm run drop:localnet
```

### Live scenario tests

Live scenario tests complement unit and API tests by checking an already running node or localnet through public interfaces. Scenario scripts never start or stop nodes. Use `start:testnet` or `start:localnet` separately, then stop nodes through the graceful shutdown path.

Run against a local testnet node if one is already listening, otherwise fall back to the first peer from `test/config.default.json`:

```sh
npm run scenario:testnet -- --all
```

Run against an explicit public or local testnet endpoint:

```sh
npm run scenario:testnet -- --all --node=162.55.32.80:36667
```

Run against a managed localnet manifest created by `start:localnet`:

```sh
npm run start:localnet -- --nodes 3
npm run scenario:localnet -- --all
```

Useful selection flags:

```sh
npm run scenario:testnet -- --suite api
npm run scenario:localnet -- --suite consensus
npm run scenario:localnet -- --suite load --profile high
npm run scenario:localnet -- --scenario transactions.abuse
```

Stress and overload profiles are opt-in:

```sh
npm run scenario:localnet -- --scenario load.stress --profile overload --unsafe-stress
```

Each run writes a JSON report and a Markdown report under `reports/live-test/`. Reports include target metadata, node versions, selected scenarios, final scenario status, latency and throughput measurements, activation-height metadata, localnet log references when available, and redacted config override metadata. Generated reports are ignored by git.

Transaction scenarios can use `test/genesisPasses.json` fixture accounts to fund fresh accounts and exercise sends, delegate registration, voting, unvoting, chat messages, state transactions, duplicate or invalid submissions, and malformed payloads. Fixture passphrases are test-only inputs and are redacted from reports.

### Test commands

> [!CAUTION] > **Unit tests** should NOT be run in parallel to prevent disruption of the node's state, and the `testnet` should be run at least once before.

To run a single test file, use the following command:

```sh
npm run test:single test/path/to/the/test.js
```

If you have changed any common files (e.g., files inside `test/common/`, `test/node.js` package, etc.), consider running all tests:

```sh
# run all unit tests; remember to stop testnet node before
npm run test:unit

# run only fast unit tests (excluding time-consuming ones)
npm run test:unit:fast

# run all API tests; remember to run testnet node before
npm run test:api
```

### Convention for tests

Since we use the Chai package for assertions, we have a few rules for consistency:

- **Use proper English grammar in assertions**

  ```js
  // ❌
  expect({}).to.be.a('object');
  // ✅
  expect(true).to.be.an('object');
  ```

- **Use `to.be.true` instead of `to.be.ok`**

  Boolean values should be strictly asserted:

  ```js
  // ❌
  expect(true).to.be.ok;
  // ✅
  expect(true).to.be.true;
  ```

- **Use `not.to` instead of `to.not`**

  Prefer `not.to` for convention:

  ```js
  // ❌
  expect(true).to.not.be.false;
  // ✅
  expect(true).not.to.be.false;
  ```

- **Use `.equal()` instead of `.eql()` for `===`**

  Use `.eql()` **only** for deep assertion.

  ```js
  // ❌
  expect(true).to.eql(true);
  // ✅
  expect(true).to.be.true;
  ```

- **Use parentheses for functions and methods in `describe` names**

  ```js
  // ❌
  describe(`functionName`, () => { /* ... */ })
  // ✅
  describe(`functionName()`, () => { /* ... */ })
  ```

Happy testing!
