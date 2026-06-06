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
const testDefaultConfig = require('../config.default.json');

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
      nodes: []
    });

    expect(metadata.consensusActivationHeights).to.deep.equal({
      fairSystem: testDefaultConfig.consensusActivationHeights.fairSystem,
      spaceship: 30
    });
    expect(JSON.stringify(metadata)).not.to.include('secret value');
    expect(JSON.stringify(metadata)).not.to.include('new-password');
    expect(metadata.overrides.some((entry) => entry.value === 'XXXXXXXXXX')).to.equal(true);
  });

  it('should always use test/config.default.json as activation metadata base', () => {
    const baseConfigPath = writeTempFile('config.default.json', JSON.stringify({
      consensusActivationHeights: {
        fairSystem: 10,
        spaceship: 20
      }
    }));
    const metadata = liveTest.collectConfigMetadata({
      configOverrides: [],
      configSet: []
    }, {
      manifest: {
        baseConfig: baseConfigPath
      },
      nodes: []
    });

    expect(metadata.consensusActivationHeights).to.deep.equal({
      fairSystem: testDefaultConfig.consensusActivationHeights.fairSystem,
      spaceship: testDefaultConfig.consensusActivationHeights.spaceship
    });
  });

  it('should keep safe secret-related counters visible in reports', () => {
    const sanitized = report.redactSensitive({
      delegateSecretsCount: 34,
      delegateSecret: 'secret value'
    });

    expect(sanitized.delegateSecretsCount).to.equal(34);
    expect(sanitized.delegateSecret).to.equal('XXXXXXXXXX');
  });

  it('should calculate forging consensus and reward stage details', () => {
    const preReward = scenarios.buildRewardStage(100, {
      milestone: 0,
      reward: 0,
      supply: '9800000000000000'
    });
    const firstReward = scenarios.buildRewardStage(2000000, {
      milestone: 0,
      reward: 50000000,
      supply: '9800000050000000'
    });
    const consensus = scenarios.calculateLiveBroadhashConsensus('same', [
      { state: 2, broadhash: 'same' },
      { state: 2, broadhash: 'different' },
      { state: 1, broadhash: 'same' }
    ]);

    expect(preReward).to.include({
      name: 'pre-reward',
      active: false,
      stageIndex: null,
      startHeight: 0,
      endHeight: 1999999,
      currentRewardAdm: '0',
      nextStageHeight: 2000000,
      nextRewardAdm: '0.5',
      supplyAdm: '98000000'
    });
    expect(firstReward).to.include({
      name: 'milestone-0',
      active: true,
      stageIndex: 0,
      startHeight: 2000000,
      endHeight: 8299999,
      currentRewardAdm: '0.5'
    });
    expect(consensus).to.deep.equal({
      connectedPeers: 2,
      matchingPeers: 1,
      livePercent: 50
    });
    expect(scenarios.formatAdamantAmount('6124269306')).to.equal('61.24269306');
  });

  it('should build transaction helpers without exposing passphrases in public fixture metadata', () => {
    const account = transactions.createAccount();
    const recipient = transactions.createAccount();
    const transaction = transactions.createSendTransaction(account, recipient.address, 100000000);
    const chat = transactions.createChatTransaction(account, recipient.address, 3);
    const state = transactions.createStateTransaction(account, 'live-test-key', 'ok', 1);
    const originalId = transaction.id;
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
    expect(chat).to.include({
      type: 8,
      recipientId: recipient.address
    });
    expect(chat.asset.chat.type).to.equal(3);
    expect(state).to.include({
      type: 9,
      recipientId: null
    });
    expect(state.asset.state.type).to.equal(1);
    expect(transactions.getTransactionTypeName(8)).to.equal('CHAT_MESSAGE');
    expect(transactions.getChatMessageTypeName(3)).to.equal('SIGNAL_MESSAGE');
    transaction.amount = 200000000;
    transactions.resignTransaction(transaction, account);
    expect(transaction.id).to.be.a('string');
    expect(transaction.id).not.to.equal(originalId);
    expect(fixture).to.deep.equal({
      address: account.address,
      publicKey: account.publicKey,
      code: 'test',
      amount: undefined
    });
    expect(JSON.stringify(fixture)).not.to.include('fixture secret');
  });

  it('should render accepted and expected-failed transaction summaries in Markdown reports', () => {
    const markdown = report.renderMarkdownReport({
      status: 'passed',
      target: {
        mode: 'testnet',
        nodes: []
      },
      run: {
        id: 'testnet-example',
        startedAt: '2026-06-05T00:00:00.000Z',
        finishedAt: '2026-06-05T00:01:00.000Z'
      },
      scenarios: [
        {
          id: 'transactions.happy-path',
          status: 'passed',
          result: {
            transactions: [
              {
                label: 'chat-signal',
                type: 8,
                typeName: 'CHAT_MESSAGE',
                subtype: 3,
                subtypeName: 'SIGNAL_MESSAGE'
              }
            ],
            expectedFailures: [
              {
                label: 'dapp-in-transfer-unknown-dapp',
                type: 6,
                typeName: 'IN_TRANSFER',
                expectedFailure: true
              }
            ]
          }
        }
      ],
      metrics: {}
    });

    expect(markdown).to.include('## Transactions');
    expect(markdown).to.include('chat-signal: CHAT_MESSAGE (8, subtype SIGNAL_MESSAGE (3)) - accepted');
    expect(markdown).to.include('dapp-in-transfer-unknown-dapp: IN_TRANSFER (6) - expected failed');
    expect(markdown).not.to.include('senderId');
  });

  it('should render per-node forging, consensus, and reward details', () => {
    const markdown = report.renderMarkdownReport({
      status: 'passed',
      target: {
        mode: 'localnet',
        nodes: []
      },
      run: {
        id: 'localnet-forging',
        startedAt: '2026-06-06T00:00:00.000Z',
        finishedAt: '2026-06-06T00:01:00.000Z'
      },
      scenarios: [
        {
          id: 'delegates.forging',
          status: 'passed',
          result: {
            nodes: [
              {
                id: 'node-1',
                apiUrl: 'http://127.0.0.1:36670',
                delegateSecretsCount: 34,
                forging: {
                  enabled: true,
                  configuredDelegateCount: 2,
                  configuredDelegatePublicKeys: ['public-key-1', 'public-key-2']
                },
                delegates: {
                  returnedCount: 101,
                  totalCount: 101
                },
                nextForgers: {
                  currentBlock: 4444,
                  currentBlockSlot: 100,
                  currentSlot: 101,
                  publicKeys: ['next-public-key']
                },
                network: {
                  height: 4444,
                  nethash: 'nethash',
                  broadhash: 'broadhash'
                },
                consensus: {
                  cachedPercent: 100,
                  livePercent: 100,
                  connectedPeers: 2,
                  matchingPeers: 2,
                  switches: [
                    {
                      name: 'spaceship',
                      state: 'active',
                      activationHeight: 1,
                      distance: -4443
                    }
                  ]
                },
                rewardStage: {
                  name: 'pre-reward',
                  active: false,
                  protocolMilestone: 0,
                  startHeight: 0,
                  endHeight: 1999999,
                  currentRewardAdm: '0',
                  supplyAdm: '98000000',
                  nextStageHeight: 2000000,
                  nextRewardAdm: '0.5'
                },
                latestBlock: {
                  height: 4444,
                  id: 'block-id',
                  generatorPublicKey: 'generator-public-key',
                  generatorId: 'U123',
                  generatorNodeIds: ['node-3'],
                  confirmations: 1,
                  rewardAdm: '0',
                  totalFeeAdm: '0.5',
                  totalForgedAdm: '0.5'
                },
                latestGeneratorForged: {
                  rewardsAdm: '0',
                  feesAdm: '61.24269306',
                  forgedAdm: '61.24269306'
                }
              }
            ]
          }
        }
      ],
      metrics: {}
    });

    expect(markdown).to.include('## Forging Details');
    expect(markdown).to.include('### node-1');
    expect(markdown).to.include('API: http://127.0.0.1:36670');
    expect(markdown).to.include('Consensus: live 100% (2/2 connected peers match); cached 100%');
    expect(markdown).to.include('Reward stage: pre-reward; active false; protocol milestone 0');
    expect(markdown).to.include('Next reward stage: height 2000000; reward 0.5 ADM');
    expect(markdown).to.include(
        'Latest block: height 4444; id block-id; generator generator-public-key (U123); configured on node-3'
    );
    expect(markdown).to.include('Latest generator totals: rewards 0 ADM; fees 61.24269306 ADM');
    expect(markdown).to.include('Configured forging public keys: public-key-1, public-key-2');
  });

  it('should render security abuse rejection details and overload summary', () => {
    const markdown = report.renderMarkdownReport({
      status: 'passed',
      target: {
        mode: 'testnet',
        nodes: []
      },
      run: {
        id: 'testnet-security',
        startedAt: '2026-06-05T00:00:00.000Z',
        finishedAt: '2026-06-05T00:01:00.000Z'
      },
      scenarios: [
        {
          id: 'transactions.abuse',
          status: 'passed',
          result: {
            checks: [
              {
                id: 'chat-invalid-subtype',
                type: 8,
                typeName: 'CHAT_MESSAGE',
                subtype: 99,
                reason: 'Chat message subtype is outside the allowed range.',
                rejectedBy: 'node validation',
                howRejected: 'Invalid message type'
              },
              {
                id: 'concurrent-unconfirmed-balance-overspend',
                type: 0,
                typeName: 'SEND',
                reason: 'Three valid SEND transactions require more than the available balance.',
                rejectedBy: 'block inclusion and confirmed balance',
                howRejected: 'Admission accepted 3/3. Final chain state confirmed 2/3.',
                transactions: [
                  {
                    id: 'tx-confirmed',
                    state: 'confirmed',
                    confirmations: 2,
                    blockId: 'block-1'
                  },
                  {
                    id: 'tx-unconfirmed',
                    state: 'unconfirmed',
                    confirmations: 0
                  }
                ],
                passed: true
              }
            ],
            overload: {
              id: 'transaction-overload',
              reason: 'Concurrent malformed transaction submissions must be rejected.',
              total: 10,
              concurrency: 2,
              rejected: 10,
              failed: 0,
              throughputRps: 50
            }
          }
        }
      ],
      metrics: {}
    });

    expect(markdown).to.include('## Security Abuse Details');
    expect(markdown).to.include('chat-invalid-subtype: type CHAT_MESSAGE (8), subtype 99');
    expect(markdown).to.include('Why: Chat message subtype is outside the allowed range.');
    expect(markdown).to.include('Rejected by: node validation. How: Invalid message type');
    expect(markdown).to.include('concurrent-unconfirmed-balance-overspend: type SEND (0)');
    expect(markdown).to.include('Rejected by: block inclusion and confirmed balance.');
    expect(markdown).to.include('tx-confirmed=confirmed, confirmations 2, block block-1');
    expect(markdown).to.include('tx-unconfirmed=unconfirmed, confirmations 0');
    expect(markdown).to.include('transaction-overload: Concurrent malformed transaction submissions must be rejected. Rejected 10/10, failed 0');
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
      node: ['127.0.0.1:36667', '127.0.0.1:36668'],
      transactionOverloadCount: '60',
      transactionOverloadConcurrency: '10'
    });
    const localnet = liveTest.normalizeOptions({
      mode: 'localnet',
      node: ['127.0.0.1:36670', '127.0.0.1:36671']
    });

    expect(testnet.node).to.equal('127.0.0.1:36667');
    expect(testnet.nodes).to.deep.equal([]);
    expect(testnet.transactionOverloadCount).to.equal(60);
    expect(testnet.transactionOverloadConcurrency).to.equal(10);
    expect(localnet.node).to.equal(null);
    expect(localnet.nodes).to.deep.equal(['127.0.0.1:36670', '127.0.0.1:36671']);
  });
});
