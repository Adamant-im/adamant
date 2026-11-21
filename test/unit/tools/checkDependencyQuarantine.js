'use strict';

const { expect } = require('chai');

const {
  collectLockedVersions,
  findNewLockedVersions,
  parseExceptions,
  parseMinimumReleaseAge,
  verifyReleaseAges
} = require('../../../scripts/checkDependencyQuarantine.js');

describe('dependency quarantine', () => {
  it('collects unscoped and scoped package versions from nested lock paths', () => {
    const versions = collectLockedVersions({
      packages: {
        '': { version: '1.0.0' },
        'node_modules/axios': { version: '1.21.1' },
        'node_modules/axios/node_modules/follow-redirects': { version: '1.16.3' },
        'node_modules/@typescript-eslint/utils': { version: '8.72.2' },
        'node_modules/local-package': { version: '1.0.0', link: true }
      }
    });

    expect(Array.from(versions.values())).to.deep.include.members([
      { name: 'axios', version: '1.21.1' },
      { name: 'follow-redirects', version: '1.16.3' },
      { name: '@typescript-eslint/utils', version: '8.72.2' }
    ]);
    expect(versions.size).to.equal(3);
  });

  it('returns only package versions newly added to the lockfile', () => {
    const base = {
      packages: {
        'node_modules/axios': { version: '1.18.1' },
        'node_modules/express': { version: '5.2.1' }
      }
    };
    const current = {
      packages: {
        'node_modules/axios': { version: '1.21.1' },
        'node_modules/express': { version: '5.2.1' }
      }
    };

    expect(findNewLockedVersions(base, current)).to.deep.equal([
      { name: 'axios', version: '1.21.1' }
    ]);
  });

  it('accepts releases exactly at the configured age boundary', async () => {
    const asOf = Date.parse('2026-11-21T00:00:00.000Z');
    const result = await verifyReleaseAges({
      versions: [{ name: 'safe-package', version: '1.0.0' }],
      minimumAgeDays: 7,
      asOf,
      exceptions: new Map(),
      metadataLoader: async () => ({
        time: {
          '1.0.0': '2026-11-14T00:00:00.000Z'
        }
      })
    });

    expect(result.failures).to.be.empty;
    expect(result.checked).to.equal(1);
  });

  it('rejects releases inside the quarantine window', async () => {
    const result = await verifyReleaseAges({
      versions: [{ name: 'fresh-package', version: '2.0.0' }],
      minimumAgeDays: 7,
      asOf: Date.parse('2026-11-21T00:00:00.000Z'),
      exceptions: new Map(),
      metadataLoader: async () => ({
        time: {
          '2.0.0': '2026-11-20T00:00:00.000Z'
        }
      })
    });

    expect(result.failures).to.have.length(1);
    expect(result.failures[0]).to.include('fresh-package@2.0.0');
  });

  it('allows only recorded exact package and version exceptions', async () => {
    const exceptions = parseExceptions(JSON.stringify([{
      package: 'fresh-package',
      version: '2.0.0',
      reason: 'Critical advisory fix',
      issue: 'https://github.com/Adamant-im/adamant/issues/999'
    }]));
    const metadataLoader = async () => ({
      time: {
        '2.0.0': '2026-11-20T00:00:00.000Z'
      }
    });
    const result = await verifyReleaseAges({
      versions: [{ name: 'fresh-package', version: '2.0.0' }],
      minimumAgeDays: 7,
      asOf: Date.parse('2026-11-21T00:00:00.000Z'),
      exceptions,
      metadataLoader
    });

    expect(result.failures).to.be.empty;
    expect(result.allowed).to.have.length(1);

    const mismatched = await verifyReleaseAges({
      versions: [{ name: 'fresh-package', version: '2.0.1' }],
      minimumAgeDays: 7,
      asOf: Date.parse('2026-11-21T00:00:00.000Z'),
      exceptions,
      metadataLoader: async () => ({
        time: {
          '2.0.1': '2026-11-20T00:00:00.000Z'
        }
      })
    });

    expect(mismatched.allowed).to.be.empty;
    expect(mismatched.failures).to.have.length(1);
  });

  it('reads and validates the minimum release age configuration', () => {
    expect(parseMinimumReleaseAge('# local policy\nmin-release-age=7\n')).to.equal(7);
    expect(() => parseMinimumReleaseAge('min-release-age=0')).to.throw(
        'min-release-age must be a positive integer'
    );
  });
});
