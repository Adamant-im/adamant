'use strict';

const { expect } = require('chai');
const fs = require('fs');
const os = require('os');
const path = require('path');

const liveTest = require('../../scripts/live-test/liveTest.js');
const report = require('../../scripts/live-test/report.js');
const scenarios = require('../../scripts/live-test/scenarios.js');
const target = require('../../scripts/live-test/target.js');
const transactions = require('../../scripts/live-test/transactions.js');

describe('live scenario runner utilities', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'adamant-live-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  /**
   * Writes a temporary test fixture file.
   * @param {string} fileName - Fixture file name.
   * @param {string} content - Fixture file content.
   */
  function writeTempFile (fileName, content) {
    const filePath = path.join(tempDir, fileName);

    fs.writeFileSync(filePath, content);

    return filePath;
  }

  it('should normalize explicit node endpoints', () => {
    const hostPort = target.normalizeEndpoint('127.0.0.1:36667', { id: 'local' });
    const url = target.normalizeEndpoint('https://example.test:36667', { id: 'remote' });

    expect(hostPort).to.include({
      id: 'local',
      host: '127.0.0.1',
      port: 36667,
      apiUrl: 'http://127.0.0.1:36667'
    });
    expect(url).to.include({
      id: 'remote',
      host: 'example.test',
      port: 36667,
      apiUrl: 'https://example.test:36667'
    });
    expect(() => target.normalizeEndpoint('127.0.0.1')).to.throw(/expected host:port/);
  });

  it('should select non-stress scenarios by suite unless stress is explicitly enabled', () => {
    const regular = scenarios.selectScenarios({
      suites: ['load'],
      scenarios: [],
      all: false,
      unsafeStress: false
    }, 'localnet');
    const stress = scenarios.selectScenarios({
      suites: ['load'],
      scenarios: [],
      all: false,
      unsafeStress: true
    }, 'localnet');

    expect(regular.map((scenario) => scenario.id)).to.deep.equal(['load.http']);
    expect(stress.map((scenario) => scenario.id)).to.deep.equal(['load.http', 'load.stress']);
  });

  it('should redact secrets in reports recursively', () => {
    const sanitized = report.redactSensitive({
      db: {
        password: 'database-password'
      },
      forging: {
        secret: ['delegate secret']
      },
      nested: [
        {
          apiToken: 'token-value'
        }
      ]
    });

    expect(sanitized.db.password).to.equal('XXXXXXXXXX');
    expect(sanitized.forging.secret).to.equal('XXXXXXXXXX');
    expect(sanitized.nested[0].apiToken).to.equal('XXXXXXXXXX');
    expect(JSON.stringify(sanitized)).not.to.include('database-password');
    expect(JSON.stringify(sanitized)).not.to.include('delegate secret');
    expect(JSON.stringify(sanitized)).not.to.include('token-value');
  });

  it('should collect activation heights and redact config override metadata', () => {
    const baseConfigPath = writeTempFile('config.json', JSON.stringify({
      consensusActivationHeights: {
        fairSystem: 10,
        spaceship: 20
      }
    }));
    const overridePath = writeTempFile('override.json', JSON.stringify({
      consensusActivationHeights: {
        spaceship: 30
      },
      forging: {
        secret: ['secret value']
      }
    }));
    const metadata = liveTest.collectConfigMetadata({
      configOverrides: [overridePath],
      configSet: ['db.password="new-password"']
    }, {
      configPath: baseConfigPath,
      nodes: []
    });

    expect(metadata.consensusActivationHeights).to.deep.equal({
      fairSystem: 10,
      spaceship: 30
    });
    expect(JSON.stringify(metadata)).not.to.include('secret value');
    expect(JSON.stringify(metadata)).not.to.include('new-password');
    expect(metadata.overrides.some((entry) => entry.value === 'XXXXXXXXXX')).to.equal(true);
  });

  it('should build transaction helpers without exposing passphrases in public fixture metadata', () => {
    const account = transactions.createAccount();
    const recipient = transactions.createAccount();
    const transaction = transactions.createSendTransaction(account, recipient.address, 100000000);
    const fixture = transactions.publicFixtureAccount({
      secret: 'fixture secret',
      address: account.address,
      publicKey: account.publicKey,
      code: 'test'
    });

    expect(transaction).to.include({
      type: 0,
      recipientId: recipient.address,
      amount: 100000000
    });
    expect(transaction.id).to.be.a('string');
    expect(transaction.signature).to.be.a('string');
    expect(fixture).to.deep.equal({
      address: account.address,
      publicKey: account.publicKey,
      code: 'test',
      amount: undefined
    });
    expect(JSON.stringify(fixture)).not.to.include('fixture secret');
  });

  it('should normalize transfer fixture arrays for transaction scenarios', () => {
    const genesisPassesPath = writeTempFile('genesisPasses.json', JSON.stringify({
      genesis: {
        secret: 'genesis secret',
        address: 'U1',
        publicKey: 'a'
      },
      transfer: [
        {
          secret: 'transfer secret',
          address: 'U2',
          publicKey: 'b',
          amount: 100
        }
      ],
      delegates: []
    }));
    const context = liveTest.buildContext(liveTest.normalizeOptions({
      mode: 'testnet',
      genesisPasses: genesisPassesPath
    }), {
      mode: 'testnet',
      nodes: [
        {
          id: 'node-1',
          apiUrl: 'http://127.0.0.1:36667'
        }
      ]
    }, {
      latency: function () {},
      increment: function () {}
    });

    expect(context.fixtureAccounts.transfer).to.include({
      address: 'U2',
      publicKey: 'b',
      amount: 100
    });
    expect(context.fixtureAccounts.transfers).to.have.length(1);
  });

  it('should normalize CLI options for testnet and localnet node modes', () => {
    const testnet = liveTest.normalizeOptions({
      mode: 'testnet',
      node: ['127.0.0.1:36667', '127.0.0.1:36668']
    });
    const localnet = liveTest.normalizeOptions({
      mode: 'localnet',
      node: ['127.0.0.1:36670', '127.0.0.1:36671']
    });

    expect(testnet.node).to.equal('127.0.0.1:36667');
    expect(testnet.nodes).to.deep.equal([]);
    expect(localnet.node).to.equal(null);
    expect(localnet.nodes).to.deep.equal(['127.0.0.1:36670', '127.0.0.1:36671']);
  });
});
