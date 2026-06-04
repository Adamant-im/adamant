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
Overrides are applied in this order: selected config file, `--config-overrides` file, repeated `--config-set` values, then legacy CLI shortcuts such as `--port`, `--address`, `--peers`, `--log`, and `--snapshot`.
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
