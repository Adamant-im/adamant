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
npm run scenario:localnet -- --suite load --http-stress
npm run scenario:localnet -- --suite load --txqueue-type0-stress
npm run scenario:localnet -- --suite load --txqueue-type8-stress
npm run scenario:localnet -- --suite load --txburst-type0-stress
npm run scenario:localnet -- --scenario transactions.abuse
```

Available scenarios:

| Scenario id | Suite | Modes | Description |
| --- | --- | --- | --- |
| `target.readiness` | `target` | `testnet`, `localnet` | Audits every unique node from the testnet peer config or every available localnet node, waits for readiness, and reports version, height, registered delegates, public API and WebSocket configuration, loader state, and transaction pool counters. |
| `api.rest` | `api` | `testnet`, `localnet` | Runs a read-only REST matrix covering node and loader status, block and transaction list/detail APIs, transaction pools, accounts, delegates, peers, pagination, sorting, validation rejection, and unknown-route handling. |
| `api.websocket` | `api` | `testnet`, `localnet` | Connects through Socket.IO, emits transaction type, chat subtype, and fixture-address subscriptions, and verifies a clean disconnect. |
| `consensus.activation` | `consensus` | `testnet`, `localnet` | Reports observed pre/post activation state for `fairSystem` and `spaceship`; in localnet mode, also checks basic node agreement. |
| `transactions.happy-path` | `transactions` | `testnet`, `localnet` | Exercises successful transaction types `0..9`, including vote/unvote, all chat subtypes, both state subtypes, second signature, multisignature, and the DApp registration/in-transfer/out-transfer lifecycle. |
| `transactions.abuse` | `security` | `testnet`, `localnet` | Exercises malformed and abusive transactions across transaction types, duplicate admission, balance overspend, concurrent unconfirmed-balance accounting, repeated invalid submissions, and bounded transaction overload. |
| `delegates.forging` | `forging` | `localnet` | Records per-node forging configuration, delegate and next-forger results, live and cached consensus, activation switches, reward stage, latest block rewards, and generator totals. |
| `load.http` | `load` | `testnet`, `localnet` | Measures bounded `/api/node/status` latency and throughput with the selected normal profile. |
| `load.httpstress` | `load` | `testnet`, `localnet` | Sends 2000 concurrent-scheduled `/api/node/status` requests using concurrency 20. Requires `--http-stress`. |
| `load.txqueue-type0` | `load` | `testnet`, `localnet` | Generates and submits valid type `0` transfers for 16 seconds without artificial delay, observes transaction pool state, waits for every accepted transaction to enter a block, and calculates observed blockchain TPS. Requires `--txqueue-type0-stress` or `--txqueue-all-stress`. |
| `load.txqueue-type8` | `load` | `testnet`, `localnet` | Generates and submits valid type `8` ordinary chat transactions with random 1-1000 character messages for 16 seconds without artificial delay, observes transaction pool state, waits for every accepted transaction to enter a block, and calculates observed blockchain TPS. Requires `--txqueue-type8-stress` or `--txqueue-all-stress`. |
| `load.txburst-type0` | `load` | `testnet`, `localnet` | Generates and signs exactly 2000 valid type `0` transfers in memory before network submission, then starts all 2000 requests in one concurrent batch and observes confirmation and blockchain TPS. Requires `--txburst-type0-stress` or `--txburst-all-stress`. |

Default scenario selection without `--all`, `--suite`, or `--scenario` runs only read-only target/API checks. `--all` and `--suite load` exclude opt-in stress scenarios unless their corresponding flags are passed.

Running `--suite target` checks every unique endpoint in `peers.list` from the selected testnet config. When an explicit testnet recipient is outside that list, it is included as an additional node. In localnet mode, the scenario checks every explicit `--node` or every node in the managed manifest. For each node with an accessible public API, it waits for `/api/node/status` to report `loaded=true`, `syncing=false`, and the configured minimum height, then reads `/api/delegates/count` and `/api/transactions/count`. An explicit `API access denied` response is treated as a valid closed-public-API state and does not fail the scenario; unavailable runtime fields remain `n/a`. The Markdown report contains the observed ADAMANT version, height, registered delegate count, configured and observed public API state, configured and advertised `wsClient` parameters, configured node-to-node `wsServer`/`wsNode` limits, loader and consensus state, confirmed, queued, unconfirmed, and multisignature transaction counts, roles, nethash, broadhash, config source, and local operational metadata when available. `wsServer` values are configuration metadata because `/api/node/status` currently advertises only `wsClient`.

Running `--suite api` is read-only. The REST scenario continues through the complete matrix instead of stopping at the first failure and reports the method, path, expected behavior, HTTP status, response `success` value, latency, selected returned values, and pass/fail result for every request. It discovers a current block, transaction, delegate, and connected peer through list endpoints and verifies that each resource can be retrieved through its detail endpoint. Negative cases cover missing required identifiers, malformed addresses, invalid peer ports, invalid sort fields and transaction types, and unknown routes. Validation cases pass only when the node explicitly returns `success=false`; the unknown-route case requires HTTP `404`.

The REST report includes a separate `Official API Endpoint Sections` table with three parameterized requests for every section documented at [docs.adamant.im](https://docs.adamant.im/): Accounts, Transactions, Chats and Chatrooms, Blocks, Delegates and Voting, States/KVS, and Node and Blockchain. The requests combine identity filters, height or time ranges, list paging, ordering, type filters, pool options, and resource-specific parameters. Dynamic identifiers are taken from the node under test so block, transaction, delegate, and peer detail requests remain valid on both testnet and localnet.

The dedicated `Transactions Query Language` table contains three combined-filter requests for each documented endpoint family: `/api/transactions`, `/api/chats/get`, `/api/chatrooms`, and `/api/states/get`. It exercises `and:` conditions for `/api/transactions`, the default AND behavior of chats, chatrooms, and states, multi-value filters, height and amount ranges, `limit`, `offset`, `orderBy`, `returnAsset`, `returnUnconfirmed`, and `includeDirectTransfers`. Chatroom requests use the actual address-bearing routes `/api/chatrooms/{address}` and `/api/chatrooms/{address}/{companion}`.

The WebSocket scenario verifies the Socket.IO websocket handshake, emits subscriptions for transaction types `0` and `8`, every chat subtype, and the fixture address when available, then verifies a clean client disconnect. The current client websocket protocol does not acknowledge subscription events, so the read-only scenario records emission but does not claim that `newTrans` delivery was tested.

Stress and overload profiles are opt-in:

```sh
npm run scenario:localnet -- --scenario load.httpstress --profile overload --http-stress
npm run scenario:localnet -- --scenario load.txqueue-type0 --txqueue-type0-stress
npm run scenario:localnet -- --scenario load.txqueue-type8 --txqueue-type8-stress
npm run scenario:localnet -- --suite load --txqueue-all-stress
npm run scenario:localnet -- --scenario load.txburst-type0 --txburst-type0-stress
npm run scenario:localnet -- --suite load --txburst-all-stress
```

Running `--suite load --http-stress` selects `load.http` and `load.httpstress`. With the default `baseline` option, `load.http` sends 5 sequential `GET /api/node/status` requests, while `load.httpstress` falls back to its only supported `overload` profile and sends 2000 requests with concurrency 20. The HTTP stress scenario is a bounded read-only API burst against the primary target node: it does not submit transactions, forge blocks, or directly stress consensus processing. A run passes only when every request receives an HTTP 2xx response with a JSON body containing `success: true`, and all successful responses report one nethash. There are currently no latency or throughput pass thresholds.

Running `--suite load --txqueue-type0-stress` selects `load.http` and `load.txqueue-type0`. The transaction queue scenario uses the funded transfer fixture account to continuously generate, sign, and submit valid type `0` transactions for 16 seconds. Every transaction sends `1 ADM`, pays the configured send fee, and uses a unique valid recipient. Twenty workers run without an artificial delay; each worker submits its next transaction immediately after the previous request completes. API rejection is recorded rather than treated as a malformed transaction because a valid transaction may be rejected when the pool is full or admission state changes under load.

Running `--suite load --txqueue-type8-stress` selects `load.http` and `load.txqueue-type8`. This scenario uses the same funded fixture and twenty no-delay workers to generate type `8` `ORDINARY_MESSAGE` chat transactions for 16 seconds. Every transaction uses a unique valid recipient and independently generated printable ASCII `message` and `own_message` payloads with the same random length from 1 through 1000 characters. Payloads are hex encoded before signing, and each fee is calculated from the decoded message byte length using the node's chat fee formula. Reports include configured and observed message-length ranges, average length, and observed fee range, but never include message contents.

Running `--suite load --txburst-type0-stress` selects `load.http` and `load.txburst-type0`. The burst scenario first generates and signs exactly 2000 valid type `0` transfers and retains the complete batch in memory. It does not start an HTTP request during generation. After all transactions exist, it maps the entire batch to `POST /api/transactions/process` requests in one `Promise.all` call, without a worker limit, artificial delay, or per-request pacing. Every transaction sends `1 ADM`, pays the configured send fee, and uses a unique valid recipient, so the source fixture should have at least `2000 * (1 + 0.5) = 3000 ADM` available before the run. Burst requests use a minimum 120-second response timeout because the node serializes balance-changing work and may continue processing a large admitted HTTP batch long after the regular 5-second API timeout. This timeout changes only how long the test waits for admission results; all 2000 requests still start together. API rejections are recorded, and every accepted transaction id is followed through the same pool, confirmation, and blockchain TPS checks used by transaction queue scenarios. `--txburst-all-stress` currently enables `load.txburst-type0`; it is intentionally independent from `--txqueue-all-stress`.

The transaction load scenarios capture `/api/node/status` and `/api/transactions/count` before the workload, immediately after submission finishes, 30 seconds after submission, and after every transaction accepted by the recipient node has been included in a block on every observation node. In testnet mode, the table contains `node-recipient`, which receives the submitted transactions, and `node-peer`, which defaults to the third peer in `test/config.default.json`. In localnet mode, every target node is observed.

Reports include node loaded/syncing/consensus state, height and chain identifiers, plus `confirmed`, `queued`, `unconfirmed`, and `multisignature` counters. The `confirmed` counter is the total number of transactions persisted in blocks, not the number confirmed during this scenario. The `Progress` column separately shows how many transaction IDs accepted in this run are confirmed on that node, for example `100/1016`. The scenario tracks every accepted transaction id separately and reports per-node counts for confirmed, unconfirmed, queued, multisignature, and missing-from-public-state transactions. The confirmation timeout accounts for every generated transaction because a request rejected by `node-recipient` may already have propagated to another peer and consume later block capacity. The internal `bundled` pool count is not exposed by the public transaction count API and is explicitly reported as unavailable.

Empty `queued` and `unconfirmed` counters do not by themselves mean that the scenario passed. A transaction accepted through the API must remain observable until it is included in the final chain on every observation node. If all public pools drain but accepted transaction IDs are absent from both the final chain and the pools, the report classifies them as missing after settlement, notes that they may have been orphaned or dropped, and fails the scenario.

After the confirmation wait, each transaction queue or burst scenario reads every real block in the inclusive height range containing its confirmed stress transactions. It reports confirmed-stress TPS, total blockchain TPS for all transactions in the same blocks, transaction counts, average and peak transactions per block, and observed block capacity. TPS uses actual block timestamps and includes one slot for the final block. If some accepted transactions are missing, TPS is still calculated from the confirmed subset and the report shows the confirmation coverage and missing count; the scenario remains failed. `--txqueue-all-stress` enables both `load.txqueue-type0` and `load.txqueue-type8`.

The `transactions.abuse` scenario also includes a bounded malformed-transaction overload check. Its defaults can be changed without enabling the separate `load.httpstress` scenario:

```sh
npm run scenario:testnet -- --suite security \
  --transaction-overload-count 60 \
  --transaction-overload-concurrency 10
```

One balance-accounting check funds a fresh account with `2 ADM` and submits three valid type `0` transactions concurrently. Each sends `0.2 ADM` and pays the `0.5 ADM` send fee. The three transactions require `3 * (0.2 + 0.5) = 2.1 ADM`. All three may initially be admitted to the transaction pool, so the test follows every transaction by id instead of treating admission as confirmation. After block production settles, exactly two transactions must be included with at least two confirmations, the third must remain queued/unconfirmed or disappear from the pool, and the confirmed sender balance must be `0.6 ADM`. The security report records the final state, confirmation count, block id, and height for each submitted transaction.

Each run writes a JSON report and a Markdown report under `reports/live-test/`. Reports include target metadata, node versions, selected scenarios, final scenario status, failure messages, latency and throughput measurements, activation-height metadata, localnet log references when available, and redacted config override metadata. Transaction reports list submitted transaction types and subtypes without payload details. Security reports list each abuse case, why it is invalid or abusive, which validation layer rejected it, and the returned rejection message. Forging reports include a section for every target node with its API endpoint, forging state and configured public keys, delegate and next-forger API results, chain identifiers, live and cached broadhash consensus, consensus switch state, current and next reward stage, supply, latest block reward and fees, and the latest generator's cumulative rewards, fees, and forged amount. HTTP load reports state the exact target, method and endpoint, requested and applied profiles, request and concurrency counts, pass condition, failure classes, HTTP status histogram, elapsed time, throughput, latency distribution, and node state observed in successful responses. Transaction load reports add admission and rejection totals, rejection reasons, generation and submission rates, per-node pool snapshots at every observation phase, per-node accepted-id confirmation totals, and blockchain TPS calculated from real block data. If the CLI prints `Live scenarios failed.`, open the generated report paths printed by the command and inspect the failed scenario entries. Generated reports are ignored by git.

Transaction scenarios can use `test/genesisPasses.json` fixture accounts to fund fresh accounts and exercise all supported transaction types, duplicate or invalid submissions, concurrent balance accounting, and malformed payloads. Fixture passphrases are test-only inputs and are redacted from reports.

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
