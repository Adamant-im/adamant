# ADAMANT

ADAMANT is a **decentralized, blockchain-based messaging platform**. Applications use ADAMANT as an anonymous, encrypted relay and storage layer for secure communication. Examples include the [Messenger app](https://github.com/Adamant-im/adamant-im), [Blockchain 2FA](https://github.com/Adamant-im/adamant-2fa), and [Exchange bot](https://github.com/Adamant-im/adamant-exchangebot).

Additional information:

- ADAMANT website: https://adamant.im
- Tor website: http://adamantim24okpwfr4wxjgsh6vtw4odoiabhsfaqaktnfqzrjrspjuid.onion
- [How decentralized blockchain messenger works](https://news.adamant.im/how-decentralized-blockchain-messenger-works-b9932834a639)
- [Encryption overview in ADAMANT Messenger](https://news.adamant.im/encryption-overview-in-adamant-messenger-878ecec1ff78)

[![License: GPL v3](https://img.shields.io/badge/License-GPL%20v3-blue.svg)](http://www.gnu.org/licenses/gpl-3.0)

> Developed and maintained by the ADAMANT developer community and **cryptofoundry** as part of an open-source blockchain ecosystem developed since 2016.
> We build custom crypto software, trading bots, payment systems and blockchain infrastructure. [Tell us what to build](https://adamant.business#contact).
>

![ADAMANT nodes](./img/adm-nodes.jpeg)

## Node and API Documentation

Full node and API documentation is maintained in [`docs/`](./docs/) and published at **[docs.adamant.im](https://docs.adamant.im)**:

- **Operators**: [Installation](https://docs.adamant.im/own-node/installation.html), [Configuration](https://docs.adamant.im/own-node/configuration.html), [Security Recommendations](https://docs.adamant.im/own-node/security.html), [Monitoring (Zabbix)](https://docs.adamant.im/own-node/monitoring.html), and [Upgrading to v0.11.0](https://docs.adamant.im/own-node/upgrading.html)
- **API & Protocol**: [Making Requests](https://docs.adamant.im/api/making-requests.html), [Transactions Query Language](https://docs.adamant.im/api/transactions-query-language.html), [WebSocket API](https://docs.adamant.im/api/websocket.html), [Interactive OpenAPI Schema (Swagger UI)](https://docs.adamant.im/schema/) ([`openapi/`](./openapi/)), and [ADAMANT Improvement Proposals (AIPs)](https://aips.adamant.im)
- **Testing**: [Testnet](https://docs.adamant.im/own-node/testnet.html), [Localnet](https://docs.adamant.im/own-node/localnet.html), and [Testing & Live Scenarios](https://docs.adamant.im/own-node/testing.html)

## Quick Start

ADAMANT Node requires **Node.js `22.22.2+`** (on the `22.x` line) or **`24.15.0+`**. The bundled Linux installers support Ubuntu 20.04–26.04 LTS (`tools/install_node.sh`) and RHEL-compatible releases 8–10 (`tools/install_node_centos.sh`), defaulting to Node.js `24`.

Clone the repository, record the reviewed commit, and run the installer:

```sh
git clone --branch master https://github.com/Adamant-im/adamant.git
cd adamant
git rev-parse HEAD
sudo bash tools/install_node.sh -b master -n mainnet -j 24
```

For manual installation, verified snapshot bootstrapping, database repair (`tools/fix_node.sh`), anti-abuse rate limits, encrypted delegate passphrases (`npm run adm-node -- forging encrypt|unlock|lock|status`), and v0.11.0 breaking API changes (removal of legacy forging and DApp runtime control routes), see the guides in [`docs/own-node/`](./docs/own-node/).

> [!WARNING]
> **Graceful Shutdown Required:** Always stop a running node with a catchable termination signal (`Ctrl+C` / `SIGINT` / `SIGTERM`) and wait until the log prints `Cleaned up successfully`. Never use `kill -9` or short PM2 timeouts — forced termination can leave derived `mem_*` mirror tables inconsistent with the blockchain and trigger a rebuild. See [Installation — Graceful Shutdown](https://docs.adamant.im/own-node/installation.html#graceful-shutdown-and-database-maintenance).

## Development and Tests

See [CONTRIBUTING.md](./.github/CONTRIBUTING.md) for contribution rules and [Testing & Live Scenarios](./docs/own-node/testing.md) for full test, localnet, and live-scenario instructions.

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

Copyright © 2025–2026 ADAMANT community developers

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
