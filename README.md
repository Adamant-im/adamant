# ADAMANT

ADAMANT is a **decentralized blockchain-based messaging platform**. Applications use ADAMANT as an anonymous and encrypted relay and storage layer to enable secure messaging features. Examples include the [Messenger app](https://github.com/Adamant-im/adamant-im), [Blockchain 2FA](https://github.com/Adamant-im/adamant-2fa), and [Exchange bot](https://github.com/Adamant-im/adamant-exchangebot).

For more information, refer to the ADAMANT website:

- Clear web: https://adamant.im
- Tor: http://adamantim24okpwfr4wxjgsh6vtw4odoiabhsfaqaktnfqzrjrspjuid.onion

![ADAMANT nodes](./img/adm-nodes.jpeg)

Additional information:

- [How decentralized blockchain messenger works](https://news.adamant.im/how-decentralized-blockchain-messenger-works-b9932834a639)
- [Encryption overview in ADAMANT Messenger](https://news.adamant.im/encryption-overview-in-adamant-messenger-878ecec1ff78)

[![License: GPL v3](https://img.shields.io/badge/License-GPL%20v3-blue.svg)](http://www.gnu.org/licenses/gpl-3.0)

## Node and API Documentation

Comprehensive [Node specification](https://docs.adamant.im) is available.

It covers the Fair dPoS consensus algorithm, decentralization principles, node installation and configuration, and other core concepts. The documentation also details API endpoints for managing accounts, transactions, chats, and key-value storage (KVS). Additionally, it provides guidance on creating new accounts and encrypting or decrypting messages, and data types.

See also:

- [ADAMANT Improvement Proposals (AIPs)](https://aips.adamant.im)

## Installation, Configuration and Running ADM node

Refer to [ADAMANT Node documentation](https://docs.adamant.im/own-node/installation.html) for complete installation instructions. It includes hardware requirements, installation scripts, and step-by-step guides for setting up an ADM blockchain node on various operating systems, including Linux, macOS, and Windows.

### Critical Shutdown Notice

Stop the node with graceful shutdown. When running in the foreground, press `Ctrl+C` and wait until cleanup finishes. Do not use `kill -9`, forced terminal termination, or any other uncatchable process kill unless the process is already unrecoverably stuck.

The node stores derived consensus state in memory mirror tables such as `mem_accounts` and `mem_round`. A forced kill can interrupt block, transaction, or round writes and leave those tables inconsistent with the persisted blockchain. On the next startup this may force a full memory-state rebuild from the beginning of the chain:

```text
[WRN] loader Detected unapplied rounds in mem_round
[WRN] loader Recreating memory tables
[inf] loader Rebuilding blockchain, current block height: 1
```

If this happens, do not try to repair `mem_*` tables with manual SQL edits. The reliable recovery options are restoring a trusted database snapshot or letting the node rebuild/replay derived state from the blockchain.

### Test Environment

You may want to test the node in a safe environment before running a `mainnet` node. The `testnet` configuration allows to experiment and run tests without affecting the `mainnet`.

Refer to [ADAMANT Node Testnet](https://docs.adamant.im/own-node/testnet.html) section of documentation.

### Configuration Overrides

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

## Tests

Refer to [CONTRIBUTING.md](./.github/CONTRIBUTING.md)

## Authors

- ADAMANT community developers <devs@adamant.im>
- ADAMANT Foundation <devs@adamant.im>
- ADAMANT TECH LABS LP <devs@adamant.im>
- Boris Povod <boris@crypti.me>
- Pavel Nekrasov <landgraf.paul@gmail.com>
- Sebastian Stupurac <stupurac.sebastian@gmail.com>
- Oliver Beddows <oliver@lightcurve.io>
- Isabella Dell <isabella@lightcurve.io>
- Marius Serek <mariusz@serek.net>
- Maciej Baj <maciej@lightcurve.io>

## License

Copyright © 2025 ADAMANT community developers

Copyright © 2020-2025 ADAMANT Foundation

Copyright © 2017-2020 ADAMANT TECH LABS LP

Copyright © 2016-2017 Lisk Foundation

This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.

This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.

You should have received a copy of the [GNU General Public License](https://github.com/LiskHQ/lisk/tree/master/LICENSE) along with this program. If not, see <http://www.gnu.org/licenses/>.

---

This program also incorporates work previously released with lisk `0.7.0` (and earlier) versions under the [MIT License](https://opensource.org/licenses/MIT). To comply with the requirements of that license, the following permission notice, applicable to those parts of the code only, is included below:

Copyright © 2016-2017 Lisk Foundation

Copyright © 2015 Crypti

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
