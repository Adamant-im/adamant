## Tests

To be merged, pull requests **MUST** include tests for any new features or bug fixes.

The tests are located in the test/ directory. The structure of the directory is as follows:
- `api/` - End-to-end tests that require running a local test node.
- `unit/` - Unit tests that DO NOT require running a test node.
- `common/` - Contains stub objects and utilities for the tests.
- `node.js` - Package for making requests to the local test node.
- `config.json` - Configuration file to run a local test node; copy `config.default.json`
- `genesisBlock.json` - Genesis block data.
- `genesisDelegates.json` - Genesis delegate accounts.
- `genesisPasses.json` - Passphrases for the genesis accounts.

All tests inside `api/` and `unit/` should mirror (as much as possible) the structure of the project. For example, unit tests for the `modules/blocks.js` module should be located in the `test/unit/modules/blocks.js` file.

### Commands

To run a single test file, use the following command:

```
npm run test:single test/path/to/the/test.js
```

If you have changed any common files (e.g., files inside `test/common/`, `test/node.js` package, etc.), consider running all tests:

```
npm run test:all
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

- **Use `to.not` instead of `not.to`**

  Prefer `not.to` for convention:

  ```js
  // ❌
  expect(true).to.not.equal(false);
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
