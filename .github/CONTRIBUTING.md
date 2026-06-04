## Tests

To be merged, pull requests **MUST** include tests for any new features or bug fixes.

## Config

For testing all features, you need to meet some criteria in the config file located at `test/config.json`.

### API tests

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

### Unit tests

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

### Structure

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

### Commands

> [!IMPORTANT] > **API tests** require the `testnet` local node to be running in parallel during their execution:

```sh
npm run start:testnet
```

See [Test Environment](../README.md#Test-Environment) for reference.

For multi-node local testing, use the localnet scripts:

```sh
npm run start:localnet -- --nodes 3
npm run status:localnet
npm run stop:localnet
npm run drop:localnet
```

Localnet nodes write per-node `adamant_localnet.log` and `adamant_localnet_debug.log` files under `logs-localnet/node-N/` and runtime metadata under `.localnet/`. Use `npm run status:localnet` to check managed PIDs, `/api/node/status`, configured delegate counts, and the last successful forging timestamp. Always stop localnet with `npm run stop:localnet` so every node follows the graceful shutdown path. Localnet databases persist across normal stops; use `npm run stop:localnet -- --drop-on-stop` or `npm run drop:localnet` for a full localnet database cleanup.

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
