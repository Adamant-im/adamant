# Testnet

Use the `testnet` configuration to experiment and run API tests in an isolated network without affecting mainnet.

## Installation

- **Automatic installation (from a reviewed Git checkout)**:

  ```sh
  git clone --branch dev https://github.com/Adamant-im/adamant.git
  cd adamant
  git rev-parse HEAD
  sudo bash tools/install_node.sh -b dev -n testnet -j 24
  ```

  See [Installation](./installation.md) for Node.js requirements (`22.22.2+` on 22.x, or `24.15.0+`) and installer lifecycle details.

- **Manual setup**:

  Install dependencies from the lockfile (`npm ci` for development/testing, or `npm ci --omit=dev` for runtime only) and copy the default testnet template:

  ```sh
  cp test/config.default.json test/config.json
  ```

  `test/config.default.json` sets public REST and peer HTTP `limit` and `max` to `0` so local API tests can send many requests from localhost. The node logs a startup warning for each disabled surface until you set `limit` above `0` or remove the `limits` block to inherit production defaults. Client WebSocket limits in `test/config.default.json` match production. See [Configuration — API Configuration](./configuration.md#api-configuration).

## Running an ADM Testnet Node

```sh
npm run start:testnet
```

Override individual values at startup without editing `test/config.json`:

```sh
npm run start:testnet -- --config-set api.access.public=true
```

See [Configuration Overrides](./configuration.md#configuration-overrides). Always stop the node gracefully (`Ctrl+C` and wait for `Cleaned up successfully`).

## Running Tests

See [Testing & Live Scenarios](./testing.md) for unit tests, API tests, and live testnet scenarios, and [CONTRIBUTING.md](https://github.com/Adamant-im/adamant/blob/dev/.github/CONTRIBUTING.md) for contribution rules.

## Helpful Links

- Testnet bootstrap snapshot (verify against an independent SHA-256 checksum): `https://testnet.adamant.im/db_test_backup.sql.gz`
- Testnet explorer: [testnet.adamant.im](https://testnet.adamant.im/)
- Testnet faucet (3500 ADM): [Faucet](https://adamant.im/free-adm-tokens/)
- Testnet messenger (`dev` build): [Testnet messenger](https://dev-adamant-testnet.surge.sh/)
- Default testnet peers: [`test/config.default.json`](https://github.com/Adamant-im/adamant/blob/dev/test/config.default.json)
