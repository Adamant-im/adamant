## Tests

To be merged, pull requests **MUST** include tests for any new features or bug fixes.

### Structure

The tests are located in the `test/` directory. The structure of the directory is as follows:

- `api/` - End-to-end tests that require running a local test node
- `unit/` - Unit tests that DO NOT require running a test node
- `common/` - Contains stub objects and utilities for the tests
- `node.js` - Package for making requests to the local test node
- `config.json` - Configuration file to run a local test node; copy `config.default.json`
- `genesisBlock.json` - Genesis block data
- `genesisDelegates.json` - Genesis delegate accounts
- `genesisPasses.json` - Passphrases for the genesis accounts

All tests inside `api/` and `unit/` should mirror (as much as possible) the structure of the project. For example, unit tests for the `modules/blocks.js` module should be located in the `test/unit/modules/blocks.js` file.

### Commands

[!IMPORTANT]

**API tests** require the `testnet` local node to be running in parallel during their execution:

```sh
npm run start:testnet
```

See [Test Environment](../README.md#Test-Environment) for reference.

[!CAUTION]

**Unit tests** should NOT be run in parallel to prevent disruption of the node's state, and the `testnet` should be run at least once before.

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
