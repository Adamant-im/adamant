'use strict';

const { expect } = require('chai');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

const { HttpClient } = require('../../scripts/live-test/httpClient.js');
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

  it('should allow a request to override the default HTTP timeout', async () => {
    const server = http.createServer(function (request, response) {
      setTimeout(function () {
        response.setHeader('content-type', 'application/json');
        response.end(JSON.stringify({ success: true }));
      }, 25);
    });

    await new Promise(function (resolve) {
      server.listen(0, '127.0.0.1', resolve);
    });

    try {
      const address = server.address();
      const client = new HttpClient({
        baseUrl: 'http://127.0.0.1:' + address.port,
        timeoutMs: 5
      });
      const result = await client.post('/transactions', {}, {
        timeoutMs: 1000
      });

      expect(result.ok).to.equal(true);
      expect(result.status).to.equal(200);
      expect(result.body).to.deep.equal({ success: true });
    } finally {
      await new Promise(function (resolve) {
        server.close(resolve);
      });
    }
  });

  it('should use the third configured testnet peer for transaction observation', () => {
    const recipient = target.normalizeEndpoint('127.0.0.1:36667', { id: 'node-recipient' });
    const peer = target.resolveTestnetObservationPeer(testDefaultConfig, recipient, 'test/config.default.json');

    expect(peer).to.include({
      id: 'node-peer',
      host: testDefaultConfig.peers.list[2].ip,
      port: testDefaultConfig.peers.list[2].port
    });

    const explicitThirdPeer = target.normalizeEndpoint(
        testDefaultConfig.peers.list[2].ip + ':' + testDefaultConfig.peers.list[2].port,
        { id: 'node-recipient' }
    );
    const distinctPeer = target.resolveTestnetObservationPeer(
        testDefaultConfig,
        explicitThirdPeer,
        'test/config.default.json'
    );

    expect(distinctPeer.apiUrl).not.to.equal(explicitThirdPeer.apiUrl);
  });

  it('should build target inventory from every unique configured testnet node', () => {
    const recipient = target.normalizeEndpoint(
        testDefaultConfig.peers.list[0].ip + ':' + testDefaultConfig.peers.list[0].port,
        { id: 'node-recipient' }
    );
    const peer = target.resolveTestnetObservationPeer(
        testDefaultConfig,
        recipient,
        'test/config.default.json'
    );
    const configuration = target.buildNodeConfiguration(
        testDefaultConfig,
        'test/config.default.json'
    );
    const inventory = target.buildTestnetReadinessNodes(
        testDefaultConfig,
        recipient,
        peer,
        configuration
    );

    expect(inventory).to.have.length(testDefaultConfig.peers.list.length);
    expect(inventory.map((node) => node.apiUrl)).to.deep.equal(
        testDefaultConfig.peers.list.map((configuredPeer) => {
          return 'http://' + configuredPeer.ip + ':' + configuredPeer.port;
        })
    );
    expect(inventory[0].roles).to.include('node-recipient');
    expect(inventory[2].roles).to.include('node-peer');
    expect(inventory[0].configuration).to.deep.include({
      api: {
        enabled: true,
        public: true,
        limits: testDefaultConfig.api.options.limits
      },
      wsClient: {
        enabled: true,
        port: 36665
      },
      wsServer: testDefaultConfig.wsNode
    });
  });

  it('should collect detailed readiness state for one target node', async () => {
    const requestedPaths = [];
    const details = await scenarios.collectTargetNodeDetails({
      options: {
        minHeight: 1,
        readyTimeoutMs: 100,
        pollIntervalMs: 1
      },
      metrics: {
        latency: function () {}
      },
      clientFor: function () {
        return {
          get: async function (requestPath) {
            requestedPaths.push(requestPath);

            if (requestPath === '/api/node/status') {
              return {
                ok: true,
                status: 200,
                latencyMs: 1,
                body: {
                  success: true,
                  version: {
                    version: '0.9.0',
                    commit: 'abc',
                    build: ''
                  },
                  loader: {
                    loaded: true,
                    syncing: false,
                    consensus: 100,
                    blocks: 0
                  },
                  network: {
                    height: 123,
                    nethash: 'nethash',
                    broadhash: 'broadhash'
                  },
                  wsClient: {
                    enabled: true,
                    port: 36665
                  }
                }
              };
            }

            if (requestPath === '/api/delegates/count') {
              return {
                ok: true,
                status: 200,
                body: {
                  success: true,
                  count: 101
                }
              };
            }

            return {
              ok: true,
              status: 200,
              body: {
                success: true,
                confirmed: 1000,
                queued: 2,
                unconfirmed: 3,
                multisignature: 4
              }
            };
          }
        };
      }
    }, {
      id: 'node-1',
      apiUrl: 'http://127.0.0.1:36667',
      roles: ['node-recipient'],
      delegateSecretsCount: 34,
      configuration: target.buildNodeConfiguration(
          testDefaultConfig,
          'test/config.default.json'
      )
    });

    expect(requestedPaths).to.deep.equal([
      '/api/node/status',
      '/api/delegates/count',
      '/api/transactions/count'
    ]);
    expect(details).to.deep.include({
      id: 'node-1',
      ready: true,
      detailsComplete: true,
      height: 123,
      delegates: 101
    });
    expect(details.transactions).to.deep.equal({
      confirmed: 1000,
      queued: 2,
      unconfirmed: 3,
      multisignature: 4
    });
    expect(details.features).to.include('configured forging delegates: 34');
  });

  it('should accept a node with a closed public API in the target suite', async () => {
    const requestedPaths = [];
    const readinessScenario = scenarios.SCENARIOS.find((scenario) => {
      return scenario.id === 'target.readiness';
    });
    const result = await readinessScenario.run({
      target: {
        mode: 'testnet',
        readinessNodes: [
          {
            id: 'node-private',
            apiUrl: 'http://private.test',
            configuration: target.buildNodeConfiguration(
                testDefaultConfig,
                'test/config.default.json'
            )
          }
        ]
      },
      options: {
        minHeight: 1,
        readyTimeoutMs: 100,
        pollIntervalMs: 1
      },
      metrics: {
        latency: function () {}
      },
      clientFor: function () {
        return {
          get: async function (requestPath) {
            requestedPaths.push(requestPath);

            return {
              ok: true,
              status: 200,
              latencyMs: 1,
              body: {
                success: false,
                error: 'API access denied'
              }
            };
          }
        };
      }
    });

    expect(requestedPaths).to.deep.equal(['/api/node/status']);
    expect(result.passed).to.equal(true);
    expect(result.nodes[0]).to.deep.include({
      ready: false,
      publicApiClosed: true,
      detailsComplete: false,
      error: 'Node node-private cannot be inspected: API access denied'
    });
    expect(result.nodes[0].publicApi).to.include({
      observedReachable: false,
      observedDenied: true
    });
  });

  it('should collect final state from every transaction observation node', async () => {
    const nodes = [
      { id: 'node-recipient', apiUrl: 'http://recipient.test' },
      { id: 'node-peer', apiUrl: 'http://peer.test' }
    ];
    const states = await liveTest.collectFinalNodeStates({
      target: {
        nodes: [nodes[0]],
        transactionObservationNodes: nodes
      },
      clientFor: function (node) {
        return {
          get: async function (requestPath) {
            if (requestPath === '/api/node/status') {
              return {
                ok: true,
                body: {
                  success: true,
                  network: {
                    height: node.id === 'node-recipient' ? 100 : 101,
                    broadhash: node.id + '-broadhash',
                    nethash: 'testnet-nethash'
                  },
                  version: '0.9.0'
                }
              };
            }

            return {
              body: {
                blocks: [
                  {
                    id: node.id + '-block',
                    height: node.id === 'node-recipient' ? 100 : 101
                  }
                ]
              }
            };
          }
        };
      }
    });

    expect(states.map((state) => state.id)).to.deep.equal(['node-recipient', 'node-peer']);
    expect(states[1]).to.include({
      apiUrl: 'http://peer.test',
      blockId: 'node-peer-block',
      height: 101
    });
  });

  it('should select non-stress scenarios by suite unless stress is explicitly enabled', () => {
    const regular = scenarios.selectScenarios({
      suites: ['load'],
      scenarios: [],
      all: false,
      httpStress: false,
      txqueueType0Stress: false,
      txqueueType8Stress: false,
      txqueueAllStress: false,
      txburstType0Stress: false,
      txburstAllStress: false
    }, 'localnet');
    const httpStress = scenarios.selectScenarios({
      suites: ['load'],
      scenarios: [],
      all: false,
      httpStress: true,
      txqueueType0Stress: false,
      txqueueType8Stress: false,
      txqueueAllStress: false,
      txburstType0Stress: false,
      txburstAllStress: false
    }, 'localnet');
    const type0Stress = scenarios.selectScenarios({
      suites: ['load'],
      scenarios: [],
      all: false,
      httpStress: false,
      txqueueType0Stress: true,
      txqueueType8Stress: false,
      txqueueAllStress: false,
      txburstType0Stress: false,
      txburstAllStress: false
    }, 'localnet');
    const type8Stress = scenarios.selectScenarios({
      suites: ['load'],
      scenarios: [],
      all: false,
      httpStress: false,
      txqueueType0Stress: false,
      txqueueType8Stress: true,
      txqueueAllStress: false,
      txburstType0Stress: false,
      txburstAllStress: false
    }, 'localnet');
    const allTxQueueStress = scenarios.selectScenarios({
      suites: ['load'],
      scenarios: [],
      all: false,
      httpStress: false,
      txqueueType0Stress: false,
      txqueueType8Stress: false,
      txqueueAllStress: true,
      txburstType0Stress: false,
      txburstAllStress: false
    }, 'localnet');
    const type0BurstStress = scenarios.selectScenarios({
      suites: ['load'],
      scenarios: [],
      all: false,
      httpStress: false,
      txqueueType0Stress: false,
      txqueueType8Stress: false,
      txqueueAllStress: false,
      txburstType0Stress: true,
      txburstAllStress: false
    }, 'localnet');
    const allTxBurstStress = scenarios.selectScenarios({
      suites: ['load'],
      scenarios: [],
      all: false,
      httpStress: false,
      txqueueType0Stress: false,
      txqueueType8Stress: false,
      txqueueAllStress: false,
      txburstType0Stress: false,
      txburstAllStress: true
    }, 'localnet');

    expect(regular.map((scenario) => scenario.id)).to.deep.equal(['load.http']);
    expect(httpStress.map((scenario) => scenario.id)).to.deep.equal(['load.http', 'load.httpstress']);
    expect(type0Stress.map((scenario) => scenario.id)).to.deep.equal(['load.http', 'load.txqueue-type0']);
    expect(type8Stress.map((scenario) => scenario.id)).to.deep.equal(['load.http', 'load.txqueue-type8']);
    expect(allTxQueueStress.map((scenario) => scenario.id)).to.deep.equal([
      'load.http',
      'load.txqueue-type0',
      'load.txqueue-type8'
    ]);
    expect(type0BurstStress.map((scenario) => scenario.id)).to.deep.equal([
      'load.http',
      'load.txburst-type0'
    ]);
    expect(allTxBurstStress.map((scenario) => scenario.id)).to.deep.equal([
      'load.http',
      'load.txburst-type0'
    ]);
  });

  it('should query confirmed queue transactions using the scenario transaction type', async () => {
    const requestedPaths = [];
    const state = await scenarios.collectAcceptedTransactionStates(
        {
          clientFor: function () {
            return {
              get: async function (requestPath) {
                requestedPaths.push(requestPath);
                return {
                  ok: true,
                  latencyMs: 1,
                  body: {
                    success: true,
                    count: 0,
                    transactions: []
                  }
                };
              }
            };
          },
          metrics: {
            latency: function () {}
          }
        },
        {
          id: 'node-1',
          apiUrl: 'http://127.0.0.1:36667'
        },
        'U1',
        'public-key',
        new Set(['transaction-id']),
        100,
        8,
        false
    );

    expect(state.ok).to.equal(true);
    expect(requestedPaths).to.have.length(1);
    expect(requestedPaths[0]).to.include('type=8');
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
    expect(scenarios.formatObservedNodeVersion({
      version: '0.9.0',
      commit: 'abc123',
      build: ''
    })).to.equal('0.9.0, commit abc123');
  });

  it('should build transaction helpers without exposing passphrases in public fixture metadata', () => {
    const account = transactions.createAccount();
    const recipient = transactions.createAccount();
    const transaction = transactions.createSendTransaction(account, recipient.address, 100000000);
    const chat = transactions.createChatTransaction(account, recipient.address, 3);
    const longChatMessage = 'a'.repeat(1000);
    const longChat = transactions.createChatTransaction(account, recipient.address, 1, {
      message: Buffer.from(longChatMessage).toString('hex'),
      ownMessage: Buffer.from(longChatMessage).toString('hex')
    });
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
    expect(Buffer.from(longChat.asset.chat.message, 'hex').toString()).to.equal(longChatMessage);
    expect(longChat.fee).to.equal(200000);
    expect(state).to.include({
      type: 9,
      recipientId: null
    });
    expect(state.asset.state.type).to.equal(1);
    expect(transactions.getTransactionTypeName(8)).to.equal('CHAT_MESSAGE');
    expect(transactions.getChatMessageTypeName(3)).to.equal('SIGNAL_MESSAGE');
    expect(scenarios.createRandomChatMessage(1)).to.match(/^[A-Za-z0-9]$/);
    expect(scenarios.createRandomChatMessage(1000)).to.match(/^[A-Za-z0-9]{1000}$/);
    transaction.amount = 200000000;
    transactions.resignTransaction(transaction, account);
    expect(transaction.id).to.be.a('string');
    expect(transaction.id).not.to.equal(originalId);
    expect(transactions.createRandomAddress()).to.match(/^U[0-9]+$/);
    expect(fixture).to.deep.equal({
      address: account.address,
      publicKey: account.publicKey,
      code: 'test',
      amount: undefined
    });
    expect(JSON.stringify(fixture)).not.to.include('fixture secret');
  });

  it('should create valid type 8 queue transactions with bounded random payloads', () => {
    const account = transactions.createAccount();
    const details = {
      messageLengthMin: null,
      messageLengthMax: null,
      messageLengthTotal: 0,
      feeMin: null,
      feeMax: null
    };
    const transaction = scenarios.createTxQueueTransaction(account, 8, details);
    const message = Buffer.from(transaction.asset.chat.message, 'hex').toString();
    const ownMessage = Buffer.from(transaction.asset.chat.own_message, 'hex').toString();

    expect(transaction.type).to.equal(8);
    expect(transaction.asset.chat.type).to.equal(1);
    expect(transaction.recipientId).to.match(/^U[0-9]+$/);
    expect(message).to.match(/^[A-Za-z0-9]{1,1000}$/);
    expect(ownMessage).to.have.length(message.length);
    expect(transaction.fee).to.be.oneOf([100000, 200000]);
    expect(details.messageLengthMin).to.equal(message.length);
    expect(details.messageLengthMax).to.equal(message.length);
    expect(details.messageLengthTotal).to.equal(message.length);
    expect(details.feeMin).to.equal(transaction.fee);
    expect(details.feeMax).to.equal(transaction.fee);
  });

  it('should pre-generate exactly 2000 unique type 0 transactions for a burst', () => {
    const account = transactions.createAccount();
    const burst = scenarios.createTransactionBurst(
        account,
        0,
        scenarios.TXBURST_TYPE0_COUNT,
        {}
    );

    expect(scenarios.TXBURST_TYPE0_COUNT).to.equal(2000);
    expect(burst).to.have.length(2000);
    expect(new Set(burst.map((transaction) => transaction.id)).size).to.equal(2000);
    expect(burst.every((transaction) => {
      return transaction.type === 0 &&
        transaction.amount === 100000000 &&
        transaction.recipientId !== account.address;
    })).to.equal(true);
  });

  it('should start every burst submission before waiting for responses', async () => {
    const transactionsToSubmit = [
      { id: 'transaction-1' },
      { id: 'transaction-2' },
      { id: 'transaction-3' }
    ];
    const pendingResponses = [];
    const postedIds = [];
    const requestOptions = [];
    const submission = scenarios.submitTransactionBurst({
      post: function (requestPath, payload, options) {
        postedIds.push(payload.transaction.id);
        requestOptions.push(options);

        return new Promise(function (resolve) {
          pendingResponses.push(resolve);
        });
      }
    }, transactionsToSubmit, {
      timeoutMs: scenarios.TXBURST_REQUEST_TIMEOUT_MS
    });

    expect(postedIds).to.deep.equal([
      'transaction-1',
      'transaction-2',
      'transaction-3'
    ]);
    expect(pendingResponses).to.have.length(3);
    expect(scenarios.TXBURST_REQUEST_TIMEOUT_MS).to.equal(120000);
    expect(requestOptions).to.deep.equal([
      { timeoutMs: 120000 },
      { timeoutMs: 120000 },
      { timeoutMs: 120000 }
    ]);

    pendingResponses.forEach(function (resolve) {
      resolve({
        ok: true,
        status: 200,
        body: { success: true },
        latencyMs: 1
      });
    });

    const results = await submission;

    expect(results.map((result) => result.transaction.id)).to.deep.equal(postedIds);
  });

  it('should render detailed target methodology and per-node state', () => {
    const markdown = report.renderMarkdownReport({
      status: 'passed',
      target: {
        mode: 'testnet',
        nodes: []
      },
      run: {
        id: 'testnet-target',
        startedAt: '2026-06-12T00:00:00.000Z',
        finishedAt: '2026-06-12T00:00:01.000Z'
      },
      scenarios: [
        {
          id: 'target.readiness',
          suite: 'target',
          status: 'passed',
          durationMs: 1000,
          result: {
            kind: 'target readiness',
            test: {
              nodeSelection: 'Every unique node endpoint from the testnet config.',
              readinessRequirement: 'loaded=true, syncing=false, minimum height reached',
              details: [
                '/api/node/status',
                '/api/delegates/count',
                '/api/transactions/count'
              ],
              minimumHeight: 1,
              readyTimeoutMs: 120000,
              pollIntervalMs: 2000
            },
            nodes: [
              {
                id: 'node-recipient',
                apiUrl: 'http://162.55.32.80:36667',
                ready: true,
                detailsComplete: true,
                error: null,
                version: '0.9.0, commit abc',
                height: 10288000,
                delegates: 101,
                publicApi: {
                  configuredEnabled: true,
                  configuredPublic: true,
                  observedReachable: true,
                  observedDenied: false
                },
                wsClient: {
                  configuredEnabled: true,
                  configuredPort: 36665,
                  observedEnabled: true,
                  observedPort: 36665
                },
                wsServer: {
                  configuredEnabled: true,
                  maxBroadcastConnections: 15,
                  maxReceiveConnections: 25
                },
                state: {
                  loaded: true,
                  syncing: false,
                  consensus: 100,
                  blocksToSync: 0
                },
                transactions: {
                  confirmed: 15000,
                  queued: 2,
                  unconfirmed: 3,
                  multisignature: 0
                },
                features: [
                  'roles: node-recipient',
                  'nethash: testnet',
                  'config: test/config.default.json'
                ]
              }
            ],
            passed: true
          }
        }
      ],
      finalNodeStates: [],
      metrics: {}
    });

    expect(markdown).to.include('## Target Details');
    expect(markdown).to.include(
        'The target suite verifies every selected node whose public API is accessible'
    );
    expect(markdown).to.include(
        '/api/node/status, /api/delegates/count, /api/transactions/count'
    );
    expect(markdown).to.include(
        '| Node | API | ADM version | Height | Registered delegates | Public API | wsClient | wsServer / wsNode |'
    );
    expect(markdown).to.include(
        '| node-recipient | http://162.55.32.80:36667 | 0.9.0, commit abc | 10288000 | 101 |'
    );
    expect(markdown).to.include(
        'runner config enabled=true, public=true; observed reachable=true, denied=false'
    );
    expect(markdown).to.include('ready=true, loaded=true, syncing=false, consensus=100%');
    expect(markdown).to.include('| 15000 | 2 | 3 | 0 |');
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

  it('should render exact normal and stress load details', () => {
    const markdown = report.renderMarkdownReport({
      status: 'passed',
      target: {
        mode: 'localnet',
        nodes: []
      },
      run: {
        id: 'localnet-load',
        startedAt: '2026-06-06T00:00:00.000Z',
        finishedAt: '2026-06-06T00:01:00.000Z'
      },
      scenarios: [
        {
          id: 'load.http',
          suite: 'load',
          status: 'passed',
          durationMs: 120,
          result: {
            kind: 'normal bounded load',
            target: {
              nodeId: 'node-1',
              apiUrl: 'http://127.0.0.1:36670'
            },
            request: {
              method: 'GET',
              path: '/api/node/status',
              body: null
            },
            profile: {
              requestedName: 'baseline',
              appliedName: 'baseline',
              requests: 5,
              concurrency: 1
            },
            acceptance: {
              requirement: 'Every request returns HTTP 2xx with JSON success=true.',
              latencyThresholdMs: null,
              throughputThresholdRps: null
            },
            results: {
              totalRequests: 5,
              completed: 5,
              failed: 0,
              transportFailures: 0,
              httpFailures: 0,
              apiFailures: 0,
              statusCodes: {
                200: 5
              },
              elapsedMs: 100,
              throughputRps: 50,
              latencyMs: {
                count: 5,
                min: 10,
                avg: 15,
                p95: 20,
                max: 20
              },
              observedNodeState: {
                minHeight: 4500,
                maxHeight: 4501,
                nethashes: ['testnet-nethash'],
                broadhashChanges: 2,
                versions: ['0.9.0']
              },
              failureExamples: []
            },
            passed: true
          }
        },
        {
          id: 'load.httpstress',
          suite: 'load',
          status: 'passed',
          durationMs: 500,
          result: {
            kind: 'opt-in stress burst',
            target: {
              nodeId: 'node-1',
              apiUrl: 'http://127.0.0.1:36670'
            },
            request: {
              method: 'GET',
              path: '/api/node/status',
              body: null
            },
            profile: {
              requestedName: 'baseline',
              appliedName: 'overload',
              requests: 2000,
              concurrency: 20
            },
            acceptance: {
              requirement: 'Every request returns HTTP 2xx with JSON success=true.',
              latencyThresholdMs: null,
              throughputThresholdRps: null
            },
            results: {
              totalRequests: 2000,
              completed: 2000,
              failed: 0,
              transportFailures: 0,
              httpFailures: 0,
              apiFailures: 0,
              statusCodes: {
                200: 2000
              },
              elapsedMs: 480,
              throughputRps: 416.67,
              latencyMs: {
                count: 2000,
                min: 8,
                avg: 30,
                p95: 50,
                max: 60
              },
              observedNodeState: {
                minHeight: 4501,
                maxHeight: 4501,
                nethashes: ['testnet-nethash'],
                broadhashChanges: 1,
                versions: ['0.9.0']
              },
              failureExamples: []
            },
            passed: true
          }
        }
      ],
      metrics: {}
    });

    expect(markdown).to.include('## Load Details');
    expect(markdown).to.include('HTTP load is read-only');
    expect(markdown).to.include('### load.http');
    expect(markdown).to.include('Profile: requested baseline; applied baseline; requests 5; concurrency 1');
    expect(markdown).to.include('Result: 5/5 successful; 0 failed; passed true');
    expect(markdown).to.include('Latency: min 10 ms; average 15 ms; p95 20 ms; max 20 ms; samples 5');
    expect(markdown).to.include('Observed node state: height 4500..4501');
    expect(markdown).to.include('### load.httpstress');
    expect(markdown).to.include('Profile: requested baseline; applied overload; requests 2000; concurrency 20');
    expect(markdown).to.include('HTTP status codes: 200=2000');
    expect(markdown).to.include('successful throughput 416.67 requests/second');
    expect(markdown).to.include('Performance thresholds: latency not configured; throughput not configured');
  });

  it('should render type 0 transaction queue workload and snapshots', () => {
    const markdown = report.renderMarkdownReport({
      status: 'passed',
      target: {
        mode: 'localnet',
        nodes: []
      },
      run: {
        id: 'localnet-txqueue',
        startedAt: '2026-06-06T00:00:00.000Z',
        finishedAt: '2026-06-06T00:01:00.000Z'
      },
      scenarios: [
        {
          id: 'load.txqueue-type0',
          suite: 'load',
          status: 'passed',
          durationMs: 46000,
          result: {
            kind: 'type 0 transaction queue stress',
            target: {
              nodeId: 'node-1',
              apiUrl: 'http://127.0.0.1:36670'
            },
            sourceAccount: {
              address: 'U1',
              publicKey: 'public-key'
            },
            transaction: {
              type: 0,
              typeName: 'SEND',
              amountAdm: '1',
              feeAdm: '0.5',
              uniqueRecipientPerTransaction: true
            },
            workload: {
              configuredDurationMs: 16000,
              actualDurationMs: 16020,
              concurrency: 20,
              artificialDelayMs: 0,
              generated: 1200,
              accepted: 1000,
              rejected: 200,
              transportFailures: 0,
              httpFailures: 0,
              generationRatePerSecond: 74.91,
              acceptedRatePerSecond: 62.42,
              statusCodes: {
                200: 1200
              },
              rejectionReasons: {
                'Transaction pool is full': 200
              }
            },
            confirmation: {
              complete: true,
              outcome: 'confirmed',
              poolsDrained: true,
              maxPending: 0,
              maxMissing: 0,
              missingAfterSettlement: 0,
              accepted: 1000,
              waitedMs: 205000,
              timeoutMs: 260000,
              fromHeight: 101,
              nodes: [
                {
                  id: 'node-1',
                  apiUrl: 'http://127.0.0.1:36670',
                  ok: true,
                  accepted: 1000,
                  confirmed: 1000,
                  unconfirmed: 0,
                  queued: 0,
                  multisignature: 0,
                  missing: 0
                },
                {
                  id: 'node-peer',
                  apiUrl: 'http://127.0.0.1:36672',
                  ok: true,
                  accepted: 1000,
                  confirmed: 1000,
                  unconfirmed: 0,
                  queued: 0,
                  multisignature: 0,
                  missing: 0
                }
              ]
            },
            blockchainTps: {
              available: true,
              nodeId: 'node-recipient',
              firstHeight: 101,
              lastHeight: 140,
              observedSeconds: 200,
              blocks: 40,
              confirmationComplete: true,
              acceptedTransactions: 1000,
              confirmedTransactions: 1000,
              missingTransactions: 0,
              confirmationCoveragePercent: 100,
              confirmedStressTransactions: 1000,
              acceptedStressTransactions: 1000,
              blockchainTransactions: 1000,
              acceptedStressTps: 5,
              blockchainTps: 5,
              averageTransactionsPerBlock: 25,
              peakTransactionsPerBlock: 25,
              maxTransactionsPerBlock: 25,
              observedBlockCapacityPercent: 100
            },
            publicPoolCategories: ['confirmed', 'queued', 'unconfirmed', 'multisignature'],
            unavailablePoolCategories: ['bundled'],
            snapshots: [
              {
                phase: 'before',
                offsetMs: 0,
                nodes: [
                  {
                    id: 'node-1',
                    ok: true,
                    status: {
                      version: '0.9.0, commit abc',
                      loaded: true,
                      syncing: false,
                      consensus: 100,
                      height: 100,
                      nethash: 'nethash',
                      broadhash: 'before-broadhash',
                      feeAdm: '0.5',
                      rewardAdm: '0'
                    },
                    transactions: {
                      confirmed: 10,
                      queued: 0,
                      unconfirmed: 0,
                      multisignature: 0
                    },
                    progress: {
                      confirmed: 0,
                      accepted: 1000
                    }
                  }
                ]
              },
              {
                phase: 'immediate',
                offsetMs: 0,
                nodes: [
                  {
                    id: 'node-1',
                    ok: true,
                    status: {
                      version: '0.9.0, commit abc',
                      loaded: true,
                      syncing: false,
                      consensus: 100,
                      height: 101,
                      nethash: 'nethash',
                      broadhash: 'after-broadhash',
                      feeAdm: '0.5',
                      rewardAdm: '0'
                    },
                    transactions: {
                      confirmed: 35,
                      queued: 975,
                      unconfirmed: 25,
                      multisignature: 0
                    },
                    progress: {
                      confirmed: 50,
                      accepted: 1000
                    }
                  }
                ]
              },
              {
                phase: 'after-confirmed',
                offsetMs: 205000,
                nodes: [
                  {
                    id: 'node-peer',
                    ok: true,
                    status: {
                      version: '0.9.0, commit def',
                      loaded: true,
                      syncing: false,
                      consensus: 100,
                      height: 140,
                      nethash: 'nethash',
                      broadhash: 'confirmed-broadhash',
                      feeAdm: '0.5',
                      rewardAdm: '0'
                    },
                    transactions: {
                      confirmed: 1015,
                      queued: 0,
                      unconfirmed: 0,
                      multisignature: 0
                    },
                    progress: {
                      confirmed: 1000,
                      accepted: 1000
                    }
                  }
                ]
              }
            ]
          }
        }
      ],
      finalNodeStates: [
        {
          id: 'node-recipient',
          height: 140,
          blockId: 'recipient-block',
          broadhash: 'final-broadhash'
        },
        {
          id: 'node-peer',
          height: 140,
          blockId: 'peer-block',
          broadhash: 'final-broadhash'
        }
      ],
      metrics: {}
    });

    expect(markdown).to.include('### load.txqueue-type0');
    expect(markdown).to.include(
        'valid SEND (0) transactions to node-1 at http://127.0.0.1:36670 and ' +
        'confirmed on node-peer at http://127.0.0.1:36672'
    );
    expect(markdown).to.include('amount 1 ADM; fee 0.5 ADM');
    expect(markdown).to.include('configured generation window 16000 ms');
    expect(markdown).to.include('generated 1200; accepted 1000; rejected 200');
    expect(markdown).to.include('Transaction pool is full=200');
    expect(markdown).to.include('unavailable through the public count API bundled');
    expect(markdown).to.include('pool counters are node-wide and include unrelated network traffic');
    expect(markdown).to.include('complete on every observation node true');
    expect(markdown).to.include(
        'Confirmation outcome: all accepted transactions are included in blocks on every observation node'
    );
    expect(markdown).to.include(
        'Confirmation on node-peer: confirmed 1000/1000; unconfirmed 0; queued 0; multisignature 0; missing from public states 0'
    );
    expect(markdown).to.include('#### Blockchain TPS');
    expect(markdown).to.include('confirmed 1000/1000 accepted stress transactions (100%); missing 0; complete true');
    expect(markdown).to.include('confirmed stress transactions 5; all blockchain transactions in the same blocks 5');
    expect(markdown).to.include('#### Transaction Pool Snapshots');
    expect(markdown).to.include(
        '| immediate | 0 ms | node-1 | ok | 101 | 50/1000 | true | false | 100% | 35 | 975 | 25 | 0 |'
    );
    expect(markdown).to.include(
        '| after-confirmed | 205000 ms | node-peer | ok | 140 | 1000/1000 | true | false | 100% | 1015 | 0 | 0 | 0 |'
    );
    expect(markdown).to.include('immediate, node-1: version 0.9.0, commit abc');
    expect(markdown).to.include('- node-peer: height 140, block peer-block, broadhash final-broadhash');
  });

  it('should render type 8 queue payload ranges without message contents', () => {
    const markdown = report.renderMarkdownReport({
      status: 'passed',
      target: {
        mode: 'testnet',
        nodes: []
      },
      run: {
        id: 'testnet-txqueue-type8',
        startedAt: '2026-06-11T00:00:00.000Z',
        finishedAt: '2026-06-11T00:01:00.000Z'
      },
      scenarios: [
        {
          id: 'load.txqueue-type8',
          suite: 'load',
          status: 'passed',
          durationMs: 46000,
          result: {
            kind: 'transaction queue stress',
            target: {
              nodeId: 'node-recipient',
              apiUrl: 'http://127.0.0.1:36667'
            },
            sourceAccount: {
              address: 'U1',
              publicKey: 'public-key'
            },
            transaction: {
              type: 8,
              typeName: 'CHAT_MESSAGE',
              subtype: 1,
              subtypeName: 'ORDINARY_MESSAGE',
              amountAdm: '0',
              feeMinAdm: '0.001',
              feeMaxAdm: '0.002',
              uniqueRecipientPerTransaction: true,
              randomMessage: true,
              configuredMessageLengthMin: 1,
              configuredMessageLengthMax: 1000,
              observedMessageLengthMin: 2,
              observedMessageLengthMax: 999,
              observedAverageMessageLength: 501.25,
              messageEncoding: 'printable ASCII encoded as hex',
              payloadIncludedInReport: false
            },
            workload: {
              configuredDurationMs: 16000,
              actualDurationMs: 16010,
              concurrency: 20,
              artificialDelayMs: 0,
              generated: 900,
              accepted: 900,
              rejected: 0,
              transportFailures: 0,
              httpFailures: 0,
              generationRatePerSecond: 56.21,
              acceptedRatePerSecond: 56.21,
              statusCodes: { 200: 900 },
              rejectionReasons: {}
            },
            confirmation: {
              complete: true,
              outcome: 'confirmed',
              accepted: 900,
              waitedMs: 180000,
              timeoutMs: 240000,
              fromHeight: 100,
              nodes: []
            },
            blockchainTps: {
              available: false,
              error: 'test fixture omits blocks'
            },
            publicPoolCategories: ['confirmed', 'queued', 'unconfirmed', 'multisignature'],
            unavailablePoolCategories: ['bundled'],
            snapshots: []
          }
        }
      ],
      finalNodeStates: [],
      metrics: {}
    });

    expect(markdown).to.include('### load.txqueue-type8');
    expect(markdown).to.include('valid CHAT_MESSAGE (8) transactions to node-recipient');
    expect(markdown).to.include('observed fee range 0.001..0.002 ADM');
    expect(markdown).to.include('subtype ORDINARY_MESSAGE (1)');
    expect(markdown).to.include('random message length 1..1000 characters');
    expect(markdown).to.include('observed length 2..999, average 501.25');
    expect(markdown).to.include('payload contents omitted from reports');
    expect(markdown).not.to.include('own_message');
  });

  it('should render type 0 burst generation and concurrent submission details', () => {
    const markdown = report.renderMarkdownReport({
      status: 'passed',
      target: {
        mode: 'testnet',
        nodes: []
      },
      run: {
        id: 'testnet-txburst-type0',
        startedAt: '2026-06-11T00:00:00.000Z',
        finishedAt: '2026-06-11T00:01:00.000Z'
      },
      scenarios: [
        {
          id: 'load.txburst-type0',
          suite: 'load',
          status: 'passed',
          durationMs: 50000,
          result: {
            kind: 'transaction queue stress',
            target: {
              nodeId: 'node-recipient',
              apiUrl: 'http://127.0.0.1:36667'
            },
            sourceAccount: {
              address: 'U1',
              publicKey: 'public-key'
            },
            transaction: {
              type: 0,
              typeName: 'SEND',
              amountAdm: '1',
              feeAdm: '0.5',
              uniqueRecipientPerTransaction: true
            },
            workload: {
              mode: 'burst',
              configuredDurationMs: null,
              configuredTransactionCount: 2000,
              actualDurationMs: 9250,
              generationDurationMs: 1250,
              submissionDurationMs: 8000,
              concurrency: 2000,
              allGeneratedBeforeSubmission: true,
              submissionBatch: 'Promise.all',
              requestTimeoutMs: 120000,
              artificialDelayMs: 0,
              generated: 2000,
              accepted: 1900,
              rejected: 100,
              transportFailures: 0,
              httpFailures: 0,
              generationRatePerSecond: 1600,
              acceptedRatePerSecond: 237.5,
              statusCodes: { 200: 2000 },
              rejectionReasons: {
                'Transaction pool is full': 50,
                'Transaction timestamp is more than 5 seconds in the past': 50
              }
            },
            confirmation: {
              complete: true,
              outcome: 'confirmed',
              accepted: 1900,
              waitedMs: 300000,
              timeoutMs: 460000,
              fromHeight: 100,
              nodes: [
                {
                  id: 'node-peer',
                  apiUrl: 'http://127.0.0.1:36669',
                  ok: true,
                  accepted: 1900,
                  confirmed: 1900,
                  unconfirmed: 0,
                  queued: 0,
                  multisignature: 0,
                  missing: 0
                }
              ]
            },
            blockchainTps: {
              available: false,
              error: 'test fixture omits blocks'
            },
            publicPoolCategories: ['confirmed', 'queued', 'unconfirmed', 'multisignature'],
            unavailablePoolCategories: ['bundled'],
            snapshots: []
          }
        }
      ],
      finalNodeStates: [],
      metrics: {}
    });

    expect(markdown).to.include('### load.txburst-type0');
    expect(markdown).to.include(
        'pre-generate, sign, retain in memory, and concurrently submit valid SEND (0) transactions'
    );
    expect(markdown).to.include(
        'pre-generated 2000 transactions in 1250 ms; all generated before submission true'
    );
    expect(markdown).to.include(
        'submitted in one Promise.all batch with 2000 concurrent requests; submission completed in 8000 ms; ' +
        'request timeout 120000 ms'
    );
    expect(markdown).to.include('generated 2000; accepted 1900; rejected 100');
    expect(markdown).to.include(
        'Timestamp expiration: transactions were valid when signed, but the node validates freshness'
    );
  });

  it('should classify drained pools with missing accepted transactions as settled loss', () => {
    const outcome = scenarios.summarizeConfirmationOutcome({
      complete: false,
      nodes: [
        {
          ok: true,
          confirmed: 956,
          unconfirmed: 0,
          queued: 0,
          multisignature: 0,
          missing: 60
        },
        {
          ok: true,
          confirmed: 956,
          unconfirmed: 0,
          queued: 0,
          multisignature: 0,
          missing: 60
        }
      ]
    });

    expect(outcome).to.deep.equal({
      outcome: 'missing-after-settlement',
      poolsDrained: true,
      maxPending: 0,
      maxMissing: 60,
      missingAfterSettlement: 60
    });
    expect(report.formatConfirmationOutcome(outcome)).to.include(
        '60 accepted transactions are absent from both the final chain and public pools'
    );
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
      httpStress: true,
      txqueueType8Stress: true,
      txqueueAllStress: true,
      txburstType0Stress: true,
      txburstAllStress: true,
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
    expect(testnet.httpStress).to.equal(true);
    expect(testnet.txqueueType0Stress).to.equal(false);
    expect(testnet.txqueueType8Stress).to.equal(true);
    expect(testnet.txqueueAllStress).to.equal(true);
    expect(testnet.txburstType0Stress).to.equal(true);
    expect(testnet.txburstAllStress).to.equal(true);
    expect(localnet.txburstType0Stress).to.equal(false);
    expect(localnet.txburstAllStress).to.equal(false);
    expect(localnet.node).to.equal(null);
    expect(localnet.nodes).to.deep.equal(['127.0.0.1:36670', '127.0.0.1:36671']);
  });
});
