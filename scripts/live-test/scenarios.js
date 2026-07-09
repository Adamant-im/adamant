'use strict';

const crypto = require('crypto');
const { io } = require('socket.io-client');

const constants = require('../../helpers/constants.js');
const slots = require('../../helpers/slots.js');
const transactionTypes = require('../../helpers/transactionTypes.js');
const { summarizeNumbers } = require('./metrics.js');
const tx = require('./transactions.js');

const NORMAL_LOAD_PROFILES = {
  baseline: { requests: 5, concurrency: 1 },
  sustained: { requests: 20, concurrency: 2 },
  high: { requests: 60, concurrency: 6 }
};

const STRESS_LOAD_PROFILES = {
  overload: { requests: 2000, concurrency: 20 }
};
const SIDE_ACCOUNT_FUNDING_AMOUNT = 50 * 100000000;
const CONCURRENT_SPEND_BALANCE = 2 * 100000000;
const CONCURRENT_SPEND_AMOUNT = 0.2 * 100000000;
const CONCURRENT_SPEND_COUNT = 3;
const TXQUEUE_TYPE0_AMOUNT = 1 * 100000000;
const TXQUEUE_DURATION_MS = 16000;
const TXQUEUE_CONCURRENCY = 20;
const TXBURST_TYPE0_COUNT = 2000;
const TXBURST_REQUEST_TIMEOUT_MS = 120000;
const TXQUEUE_TYPE8_MIN_MESSAGE_LENGTH = 1;
const TXQUEUE_TYPE8_MAX_MESSAGE_LENGTH = 1000;
const TXQUEUE_TYPE8_MESSAGE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const TXQUEUE_AFTER_LOAD_DELAY_MS = 30000;
const TXQUEUE_CONFIRMATION_GRACE_MS = 60000;
const TXQUEUE_CONFIRMATION_PAGE_SIZE = 1000;
const TXQUEUE_BLOCK_QUERY_CONCURRENCY = 10;
const LIVE_CONSENSUS_TRANSITION_TRANSACTION_COUNT = 20;
const LIVE_CONSENSUS_HEIGHT_LOG_INTERVAL = 5;

const SCENARIOS = [
  {
    id: 'target.readiness',
    suite: 'target',
    modes: ['testnet', 'localnet'],
    description: 'Wait for node readiness and collect initial status.',
    run: runReadinessScenario
  },
  {
    id: 'api.rest',
    suite: 'api',
    modes: ['testnet', 'localnet'],
    description: 'Exercise public REST endpoints used by clients and explorers.',
    run: runRestApiScenario
  },
  {
    id: 'api.websocket',
    suite: 'api',
    modes: ['testnet', 'localnet'],
    description: 'Connect to client WebSocket API and verify subscription flow.',
    run: runWebSocketScenario
  },
  {
    id: 'consensus.activation',
    suite: 'consensus',
    modes: ['testnet', 'localnet'],
    description: 'Report activation-height state for configured consensus switches.',
    run: runConsensusActivationScenario
  },
  {
    id: 'transactions.happy-path',
    suite: 'transactions',
    modes: ['testnet', 'localnet'],
    description: 'Submit live happy-path transactions using test genesis fixtures.',
    run: runTransactionHappyPathScenario
  },
  {
    id: 'transactions.abuse',
    suite: 'security',
    modes: ['testnet', 'localnet'],
    description: 'Submit bounded invalid transaction and malformed payload checks.',
    run: runTransactionAbuseScenario
  },
  {
    id: 'delegates.forging',
    suite: 'forging',
    modes: ['localnet'],
    description: 'Validate localnet delegate, forging, and reward API state.',
    run: runDelegatesScenario
  },
  {
    id: 'load.http',
    suite: 'load',
    modes: ['testnet', 'localnet'],
    description: 'Measure bounded REST latency and throughput.',
    run: runLoadScenario
  },
  {
    id: 'load.httpstress',
    suite: 'load',
    modes: ['testnet', 'localnet'],
    stressFlag: '--http-stress',
    description: 'Run the opt-in HTTP overload profile.',
    run: runHttpStressScenario
  },
  {
    id: 'load.txqueue-type0',
    suite: 'load',
    modes: ['testnet', 'localnet'],
    stressFlag: '--txqueue-type0-stress',
    description: 'Continuously submit valid type 0 transactions and observe transaction pool state.',
    run: runType0TxQueueStressScenario
  },
  {
    id: 'load.txqueue-type8',
    suite: 'load',
    modes: ['testnet', 'localnet'],
    stressFlag: '--txqueue-type8-stress',
    description: 'Continuously submit valid type 8 chat transactions and observe transaction pool state.',
    run: runType8TxQueueStressScenario
  },
  {
    id: 'load.txburst-type0',
    suite: 'load',
    modes: ['testnet', 'localnet'],
    stressFlag: '--txburst-type0-stress',
    description: 'Pre-generate 2000 valid type 0 transactions and submit them as one concurrent burst.',
    run: runType0TxBurstStressScenario
  }
];

/**
 * Selects scenarios by CLI options.
 * @param {object} options - Runner options.
 * @param {string} mode - Target mode.
 */
function selectScenarios (options, mode) {
  let selected = SCENARIOS.filter(function (scenario) {
    return scenario.modes.indexOf(mode) !== -1;
  });

  if (options.all) {
    selected = selected.filter(function (scenario) {
      return isScenarioEnabledByOptions(scenario, options);
    });
  } else if (options.scenarios && options.scenarios.length) {
    selected = selected.filter(function (scenario) {
      return options.scenarios.indexOf(scenario.id) !== -1;
    });
  } else if (options.suites && options.suites.length) {
    selected = selected.filter(function (scenario) {
      return options.suites.indexOf(scenario.suite) !== -1 && isScenarioEnabledByOptions(scenario, options);
    });
  } else {
    // Default to read-only checks so an accidental bare command does not publish transactions.
    selected = selected.filter(function (scenario) {
      return ['target', 'api'].indexOf(scenario.suite) !== -1;
    });
  }

  if (!selected.length) {
    throw Error('No scenarios selected for mode "' + mode + '".');
  }

  return selected;
}

/**
 * Checks whether an opt-in scenario is enabled for suite or all selection.
 * Explicit scenario selection is validated separately to produce a useful error.
 * @param {object} scenario - Scenario definition.
 * @param {object} options - Normalized CLI options.
 */
function isScenarioEnabledByOptions (scenario, options) {
  if (!scenario.stressFlag) {
    return true;
  }

  if (scenario.stressFlag === '--http-stress') {
    return options.httpStress;
  }

  if (scenario.stressFlag === '--txqueue-type0-stress') {
    return options.txqueueType0Stress || options.txqueueAllStress;
  }

  if (scenario.stressFlag === '--txqueue-type8-stress') {
    return options.txqueueType8Stress || options.txqueueAllStress;
  }

  if (scenario.stressFlag === '--txburst-type0-stress') {
    return options.txburstType0Stress || options.txburstAllStress;
  }

  return false;
}

/**
 * Verifies every inspectable target node is ready and accepts closed public APIs.
 * @param {object} context - Runner context.
 */
async function runReadinessScenario (context) {
  const inventory = context.target.readinessNodes || context.target.nodes;
  const nodes = await Promise.all(inventory.map(function (node) {
    return collectTargetNodeDetails(context, node);
  }));
  const passed = nodes.every(function (node) {
    return node.publicApiClosed || node.ready && node.detailsComplete;
  });
  const result = {
    kind: 'target readiness',
    test: {
      nodeSelection: context.target.mode === 'testnet' ?
        'Every unique node endpoint from the testnet config, plus an explicit recipient when outside that config.' :
        'Every node supplied explicitly or listed in the managed localnet manifest.',
      readinessRequirement: 'An accessible node reports loaded=true, syncing=false, and the configured minimum height; API access denied is an accepted closed-public-API state.',
      details: [
        '/api/node/status',
        '/api/delegates/count',
        '/api/transactions/count'
      ],
      minimumHeight: context.options.minHeight,
      readyTimeoutMs: context.options.readyTimeoutMs,
      pollIntervalMs: context.options.pollIntervalMs
    },
    nodes,
    passed
  };

  if (!passed) {
    const failedNodes = nodes.filter(function (node) {
      return !node.publicApiClosed && (!node.ready || !node.detailsComplete);
    }).map(function (node) {
      return node.id + ': ' + (node.error || 'target detail request failed');
    });
    const error = Error('Target readiness failed: ' + failedNodes.join('; ') + '.');

    error.result = result;
    throw error;
  }

  return result;
}

/**
 * Waits for one target node and collects its public status, delegate, and pool data.
 * @param {object} context - Runner context.
 * @param {object} node - Target inventory node.
 */
async function collectTargetNodeDetails (context, node) {
  const client = context.clientFor(node);
  let readyResponse;
  let readinessError = null;

  try {
    readyResponse = await waitForReady(context, node);
  } catch (error) {
    readinessError = error.message;
    readyResponse = error.lastResult;
  }

  // A denied public API cannot expose the remaining details, so avoid two
  // redundant requests and keep the report focused on the original failure.
  const publicApiClosed = isPermanentReadinessFailure(readyResponse);
  const detailResponses = publicApiClosed ?
    [
      { ok: false, error: readinessError },
      { ok: false, error: readinessError }
    ] :
    await Promise.all([
      client.get('/api/delegates/count'),
      client.get('/api/transactions/count')
    ]);
  const delegates = detailResponses[0];
  const transactions = detailResponses[1];
  const statusBody = readyResponse && readyResponse.body || {};
  const loader = statusBody.loader || {};
  const network = statusBody.network || {};
  const configured = node.configuration || {};
  const configuredApi = configured.api || {};
  const configuredWsClient = configured.wsClient || {};
  const configuredWsServer = configured.wsServer || {};
  const observedWsClient = statusBody.wsClient || {};
  const statusOk = !!(
    readyResponse &&
    readyResponse.ok &&
    statusBody.success !== false &&
    statusBody.loader &&
    statusBody.network
  );
  const delegatesOk = !!(delegates.ok && delegates.body && delegates.body.success !== false);
  const transactionsOk = !!(
    transactions.ok &&
    transactions.body &&
    transactions.body.success !== false
  );
  const ready = !!(
    statusOk &&
    loader.loaded &&
    !loader.syncing &&
    network.height >= context.options.minHeight
  );
  const features = [];

  if (Array.isArray(node.roles) && node.roles.length) {
    features.push('roles: ' + node.roles.join(', '));
  }
  if (node.delegateSecretsCount !== undefined) {
    features.push('configured forging delegates: ' + node.delegateSecretsCount);
  }
  if (node.pid) {
    features.push('pid: ' + node.pid);
  }
  if (node.generalLogFile) {
    features.push('log: ' + node.generalLogFile);
  }
  if (network.nethash) {
    features.push('nethash: ' + network.nethash);
  }
  if (network.broadhash) {
    features.push('broadhash: ' + network.broadhash);
  }
  if (configured.source) {
    features.push('config: ' + configured.source);
  }

  const errors = uniqueTargetErrors([
    readinessError,
    delegatesOk ? null : delegates.error || delegates.body && delegates.body.error || 'delegate count unavailable',
    transactionsOk ?
      null :
      transactions.error || transactions.body && transactions.body.error || 'transaction counts unavailable'
  ]);

  return {
    id: node.id,
    apiUrl: node.apiUrl,
    ready,
    publicApiClosed,
    detailsComplete: statusOk && delegatesOk && transactionsOk,
    error: errors.length ? errors.join('; ') : null,
    version: formatObservedNodeVersion(statusBody.version),
    height: network.height,
    delegates: delegatesOk ? delegates.body.count : null,
    publicApi: {
      configuredEnabled: configuredApi.enabled,
      configuredPublic: configuredApi.public,
      observedReachable: statusOk,
      observedDenied: publicApiClosed,
      limits: configuredApi.limits || null
    },
    wsClient: {
      configuredEnabled: configuredWsClient.enabled,
      configuredPort: configuredWsClient.port,
      observedEnabled: observedWsClient.enabled,
      observedPort: observedWsClient.port
    },
    wsServer: {
      configuredEnabled: configuredWsServer.enabled,
      maxBroadcastConnections: configuredWsServer.maxBroadcastConnections,
      maxReceiveConnections: configuredWsServer.maxReceiveConnections
    },
    state: {
      loaded: loader.loaded,
      syncing: loader.syncing,
      consensus: loader.consensus,
      blocksToSync: loader.blocks,
      height: network.height,
      nethash: network.nethash,
      broadhash: network.broadhash
    },
    transactions: {
      confirmed: transactionsOk ? transactions.body.confirmed : null,
      queued: transactionsOk ? transactions.body.queued : null,
      unconfirmed: transactionsOk ? transactions.body.unconfirmed : null,
      multisignature: transactionsOk ? transactions.body.multisignature : null
    },
    features
  };
}

/**
 * Removes empty and duplicate node inspection errors while preserving their order.
 * @param {Array<string|null|undefined>} errors - Errors returned by target API requests.
 */
function uniqueTargetErrors (errors) {
  return errors.filter(function (error, index) {
    return error && errors.indexOf(error) === index;
  });
}

/**
 * Exercises public REST endpoints expected by clients and explorers.
 * @param {object} context - Runner context.
 */
async function runRestApiScenario (context) {
  const node = context.primaryNode;
  const client = context.clientFor(node);
  const fixture = context.fixtureAccounts.transfer || context.fixtureAccounts.genesis;
  const definitions = buildRestApiChecks(fixture);
  const checks = [];
  const responseBodies = {};

  for (const definition of definitions) {
    const execution = await executeRestApiCheck(context, client, definition);

    checks.push(execution.check);
    responseBodies[definition.id] = execution.body;
  }

  const dynamicDefinitions = buildDynamicRestApiChecks(responseBodies, fixture);

  for (const definition of dynamicDefinitions) {
    const execution = await executeRestApiCheck(context, client, definition);

    checks.push(execution.check);
  }

  const result = {
    kind: 'api rest',
    test: {
      nodeId: node.id,
      apiUrl: node.apiUrl,
      safety: 'Read-only requests only; no transactions, votes, forging changes, or state mutations.',
      coverage: 'Success responses, pagination and sorting, resource lookup, pool inspection, validation rejection, and unknown-route handling.'
    },
    checks,
    passed: checks.every(function (check) {
      return check.passed;
    })
  };

  if (!result.passed) {
    const failedChecks = checks.filter(function (check) {
      return !check.passed;
    }).map(function (check) {
      return check.id + ': ' + check.failure;
    });
    const error = Error('REST API checks failed: ' + failedChecks.join('; ') + '.');

    error.result = result;
    throw error;
  }

  return result;
}

/**
 * Builds the read-only REST API coverage matrix.
 * @param {?object} fixture - Optional fixture account metadata.
 */
function buildRestApiChecks (fixture) {
  const checks = [
    apiSuccessCheck('node.status', 'Node', '/api/node/status', 'Node exposes loader, network, version, and wsClient state.', function (body) {
      return body.loader && body.network ? null : 'loader or network state is missing';
    }),
    apiSuccessCheck('loader.status', 'Loader', '/api/loader/status', 'Loader exposes loaded state and blockchain height.'),
    apiSuccessCheck('loader.sync', 'Loader', '/api/loader/status/sync', 'Loader exposes synchronization state and height.'),
    apiSuccessCheck('loader.ping', 'Loader', '/api/loader/status/ping', 'Loader health ping succeeds.'),
    apiSuccessCheck('blocks.height', 'Blocks', '/api/blocks/getHeight', 'Current blockchain height is a positive number.', function (body) {
      return Number(body.height) > 0 ? null : 'height is not positive';
    }),
    apiSuccessCheck('blocks.status', 'Blocks', '/api/blocks/getStatus', 'Block status exposes chain identifiers, reward stage, supply, and fee.'),
    apiSuccessCheck('blocks.fees', 'Blocks', '/api/blocks/getFees', 'Fee schedule is available.', function (body) {
      return body.fees && typeof body.fees === 'object' ? null : 'fee schedule is missing';
    }),
    apiSuccessCheck('blocks.list', 'Blocks', '/api/blocks?limit=2&orderBy=height:desc', 'Two latest blocks are returned in descending height order.', validateDescendingBlocks),
    apiSuccessCheck('transactions.count', 'Transactions', '/api/transactions/count', 'Confirmed and transaction-pool counters are available.'),
    apiSuccessCheck('transactions.list', 'Transactions', '/api/transactions?limit=2&orderBy=timestamp:desc', 'Latest transactions support bounded sorting and pagination.', function (body) {
      return Array.isArray(body.transactions) ? null : 'transactions array is missing';
    }),
    apiSuccessCheck('transactions.queued', 'Transactions', '/api/transactions/queued', 'Queued transaction pool is readable.', function (body) {
      return Array.isArray(body.transactions) ? null : 'queued transactions array is missing';
    }),
    apiSuccessCheck('transactions.unconfirmed', 'Transactions', '/api/transactions/unconfirmed', 'Unconfirmed transaction pool is readable.', function (body) {
      return Array.isArray(body.transactions) ? null : 'unconfirmed transactions array is missing';
    }),
    apiSuccessCheck('accounts.top', 'Accounts', '/api/accounts/top?limit=3&offset=0', 'Top accounts expose bounded pagination metadata and stable balance ordering.', validateTopAccounts(3, 0)),
    apiSuccessCheck('accounts.top-delegates', 'Accounts', '/api/accounts/top?limit=3&isDelegate=1', 'Top accounts can be filtered to delegate accounts.', validateTopAccounts(3, 0, 1)),
    apiSuccessCheck('accounts.top-count', 'Accounts', '/api/accounts/top?limit=0', 'Top accounts support count-only pagination metadata.', validateTopAccounts(0, 0)),
    apiSuccessCheck('delegates.count', 'Delegates', '/api/delegates/count', 'Registered delegate count is available.'),
    apiSuccessCheck('delegates.list', 'Delegates', '/api/delegates?limit=3&orderBy=rank:asc', 'Delegate list supports bounded rank sorting.', function (body) {
      return Array.isArray(body.delegates) ? null : 'delegates array is missing';
    }),
    apiSuccessCheck('delegates.next-forgers', 'Delegates', '/api/delegates/getNextForgers?limit=3', 'Next-forger projection returns up to three public keys.', function (body) {
      return Array.isArray(body.delegates) && body.delegates.length <= 3 ?
        null :
        'next-forger list is missing or exceeds the requested limit';
    }),
    apiSuccessCheck('peers.version', 'Peers', '/api/peers/version', 'Node version metadata is available through the peers API.'),
    apiSuccessCheck('peers.count', 'Peers', '/api/peers/count', 'Connected, disconnected, and banned peer counters are available.'),
    apiSuccessCheck('peers.list', 'Peers', '/api/peers?limit=3&state=2', 'Connected peer list supports state filtering and pagination.', function (body) {
      return Array.isArray(body.peers) && body.peers.length <= 3 ?
        null :
        'peer list is missing or exceeds the requested limit';
    }),
    apiRejectionCheck('validation.block-id-required', 'Validation', '/api/blocks/get', 'Missing block id is rejected.'),
    apiRejectionCheck('validation.transaction-id-required', 'Validation', '/api/transactions/get', 'Missing transaction id is rejected.'),
    apiRejectionCheck('validation.account-address', 'Validation', '/api/accounts/getBalance?address=not-an-adamant-address', 'Malformed account address is rejected.'),
    apiRejectionCheck('validation.accounts-top-delegate-filter', 'Validation', '/api/accounts/top?isDelegate=2', 'Out-of-range top-account delegate filter is rejected.'),
    apiRejectionCheck('validation.delegate-search', 'Validation', '/api/delegates/search', 'Delegate search without q is rejected.'),
    apiRejectionCheck('validation.peer-port', 'Validation', '/api/peers?port=0', 'Peer port below the valid range is rejected.'),
    apiRejectionCheck('validation.block-sort', 'Validation', '/api/blocks?orderBy=unknown:asc', 'Unknown block sort field is rejected.'),
    apiRejectionCheck('validation.transaction-type', 'Validation', '/api/transactions?type=999', 'Out-of-range transaction type is rejected.'),
    apiRejectionCheck(
        'routing.unknown-endpoint',
        'Routing',
        '/api/live-test-endpoint-does-not-exist',
        'Unknown API endpoint returns HTTP 404.',
        404
    )
  ];

  if (fixture && fixture.address) {
    const address = encodeURIComponent(fixture.address);

    checks.splice(18, 0,
        apiSuccessCheck('accounts.balance', 'Accounts', '/api/accounts/getBalance?address=' + address, 'Known fixture balance and unconfirmed balance are available.'),
        apiSuccessCheck('accounts.details', 'Accounts', '/api/accounts?address=' + address, 'Known fixture account details are available.')
    );
  }

  return checks;
}

/**
 * Builds resource-detail checks from objects discovered by list endpoints.
 * @param {object} responseBodies - Successful list response bodies keyed by check id.
 * @param {?object} fixture - Optional fixture account metadata.
 */
function buildDynamicRestApiChecks (responseBodies, fixture) {
  const checks = [];
  const block = responseBodies['blocks.list'] && responseBodies['blocks.list'].blocks &&
    responseBodies['blocks.list'].blocks[0];
  const transaction = responseBodies['transactions.list'] && responseBodies['transactions.list'].transactions &&
    responseBodies['transactions.list'].transactions[0];
  const delegate = responseBodies['delegates.list'] && responseBodies['delegates.list'].delegates &&
    responseBodies['delegates.list'].delegates[0];
  const peer = responseBodies['peers.list'] && responseBodies['peers.list'].peers &&
    responseBodies['peers.list'].peers[0];

  if (block && block.id) {
    checks.push(apiSuccessCheck(
        'blocks.get',
        'Blocks',
        '/api/blocks/get?id=' + encodeURIComponent(block.id),
        'A block discovered in the list can be retrieved by id.'
    ));
  }
  if (transaction && transaction.id) {
    checks.push(apiSuccessCheck(
        'transactions.get',
        'Transactions',
        '/api/transactions/get?id=' + encodeURIComponent(transaction.id),
        'A transaction discovered in the list can be retrieved by id.'
    ));
  }
  if (delegate && delegate.publicKey) {
    checks.push(apiSuccessCheck(
        'delegates.get',
        'Delegates',
        '/api/delegates/get?publicKey=' + encodeURIComponent(delegate.publicKey),
        'A delegate discovered in the list can be retrieved by public key.'
    ));
  }
  if (peer && peer.ip && peer.port) {
    checks.push(apiSuccessCheck(
        'peers.get',
        'Peers',
        '/api/peers/get?ip=' + encodeURIComponent(peer.ip) + '&port=' + encodeURIComponent(peer.port),
        'A connected peer discovered in the list can be retrieved by ip and port.'
    ));
  }

  return checks.concat(
      buildDocumentedComplexApiChecks(responseBodies, fixture),
      buildQueryLanguageApiChecks(responseBodies, fixture)
  );
}

/**
 * Builds parameterized read-only checks for every API endpoint section in the docs.
 * @param {object} responseBodies - Discovery response bodies keyed by check id.
 * @param {?object} fixture - Optional fixture account metadata.
 */
function buildDocumentedComplexApiChecks (responseBodies, fixture) {
  const discovery = buildApiDiscovery(responseBodies, fixture);
  const checks = [];
  const address = encodeURIComponent(discovery.primaryAddress);
  const secondAddress = encodeURIComponent(discovery.secondaryAddress);
  const publicKey = encodeURIComponent(discovery.primaryPublicKey);
  const block = discovery.block;
  const transaction = discovery.transaction;
  const delegate = discovery.delegate;
  const peer = discovery.peer;

  checks.push(
      documentedApiCheck(
          apiSuccessCheck(
              'docs.accounts.address-and-public-key',
              'Accounts',
              '/api/accounts?address=' + address + '&publicKey=' + publicKey,
              'Account lookup accepts matching address and public key parameters.',
              validateAccount(discovery.primaryAddress, discovery.primaryPublicKey)
          ),
          'Accounts'
      ),
      documentedApiCheck(
          apiSuccessCheck(
              'docs.accounts.public-key',
              'Accounts',
              '/api/accounts/getPublicKey?address=' + address,
              'Public-key lookup resolves the parameterized account address.',
              validateFieldEquals('publicKey', discovery.primaryPublicKey)
          ),
          'Accounts'
      ),
      documentedApiCheck(
          apiSuccessCheck(
              'docs.accounts.votes',
              'Accounts',
              '/api/accounts/delegates?address=' + address,
              'Vote lookup returns the delegate choices for the parameterized account.',
              validateArrayField('delegates', 101)
          ),
          'Accounts'
      )
  );

  checks.push(
      documentedApiCheck(
          apiSuccessCheck(
              'docs.transactions.block-type-asset',
              'Transactions',
              '/api/transactions?blockId=' +
                encodeURIComponent(transaction.blockId) +
                '&and:type=' +
                transaction.type +
                '&limit=3&orderBy=timestamp:desc&returnAsset=1',
              'Transaction list combines block, type, sorting, limit, and asset options.',
              validateArrayField('transactions', 3)
          ),
          'Transactions'
      ),
      documentedApiCheck(
          apiSuccessCheck(
              'docs.transactions.sender-height-fee',
              'Transactions',
              '/api/transactions?senderPublicKey=' +
                encodeURIComponent(transaction.senderPublicKey) +
                '&and:fromHeight=' +
                discovery.fromHeight +
                '&and:maxFee=' +
                Math.max(1, Number(transaction.fee)) +
                '&limit=3&orderBy=height:desc&returnUnconfirmed=1',
              'Transaction list combines sender, height, fee, ordering, paging, and unconfirmed options.',
              validateArrayField('transactions', 3)
          ),
          'Transactions'
      ),
      documentedApiCheck(
          apiSuccessCheck(
              'docs.transactions.detail-with-asset',
              'Transactions',
              '/api/transactions/get?id=' +
                encodeURIComponent(transaction.id) +
                '&returnAsset=1',
              'Transaction detail returns the discovered transaction with its asset.',
              validateNestedFieldEquals('transaction', 'id', transaction.id)
          ),
          'Transactions'
      )
  );

  checks.push(
      documentedApiCheck(
          apiSuccessCheck(
              'docs.chats.account-messages',
              'Chats and Chatrooms',
              '/api/chats/get?inId=' +
                address +
                '&type=1&includeDirectTransfers=1&returnUnconfirmed=1&limit=3&orderBy=timestamp:desc',
              'Chat transaction lookup combines participant, subtype, transfer, unconfirmed, paging, and ordering options.',
              validateArrayField('transactions', 3)
          ),
          'Chats and Chatrooms'
      ),
      documentedApiCheck(
          apiSuccessCheck(
              'docs.chatrooms.account-list',
              'Chats and Chatrooms',
              '/api/chatrooms/' +
                address +
                '?type=1&includeDirectTransfers=0&returnUnconfirmed=1&limit=3&offset=0&orderBy=timestamp:desc',
              'Chatroom list combines message subtype, direct-transfer exclusion, unconfirmed data, paging, and ordering.',
              validateArrayField('chats', 3)
          ),
          'Chats and Chatrooms'
      ),
      documentedApiCheck(
          apiSuccessCheck(
              'docs.chatrooms.pair-messages',
              'Chats and Chatrooms',
              '/api/chatrooms/' +
                address +
                '/' +
                secondAddress +
                '?type=1&includeDirectTransfers=1&returnUnconfirmed=1&limit=3&offset=0&orderBy=timestamp:asc',
              'Two-party chat lookup combines both path participants with subtype, transfer, unconfirmed, paging, and ordering options.',
              validateArrayField('messages', 3)
          ),
          'Chats and Chatrooms'
      )
  );

  checks.push(
      documentedApiCheck(
          apiSuccessCheck(
              'docs.blocks.height-generator',
              'Blocks',
              '/api/blocks?height=' +
                block.height +
                '&generatorPublicKey=' +
                encodeURIComponent(block.generatorPublicKey) +
                '&limit=2&orderBy=height:desc',
              'Block list combines exact height, generator, limit, and ordering parameters.',
              validateArrayField('blocks', 2)
          ),
          'Blocks'
      ),
      documentedApiCheck(
          apiSuccessCheck(
              'docs.blocks.generator-page',
              'Blocks',
              '/api/blocks?generatorPublicKey=' +
                encodeURIComponent(block.generatorPublicKey) +
                '&limit=3&offset=0&orderBy=height:desc',
              'Block list pages recent blocks forged by the discovered generator.',
              validateArrayField('blocks', 3)
          ),
          'Blocks'
      ),
      documentedApiCheck(
          apiSuccessCheck(
              'docs.blocks.previous-block',
              'Blocks',
              '/api/blocks?previousBlock=' +
                encodeURIComponent(block.previousBlock) +
                '&reward=' +
                block.reward +
                '&limit=2&orderBy=height:asc',
              'Block list combines previous-block linkage, reward, limit, and ordering parameters.',
              validateArrayField('blocks', 2)
          ),
          'Blocks'
      )
  );

  checks.push(
      documentedApiCheck(
          apiSuccessCheck(
              'docs.delegates.rank-page',
              'Delegates',
              '/api/delegates?offset=1&limit=3&orderBy=productivity:desc',
              'Delegate list combines offset, limit, and productivity ordering.',
              validateArrayField('delegates', 3)
          ),
          'Delegates'
      ),
      documentedApiCheck(
          apiSuccessCheck(
              'docs.delegates.identity',
              'Delegates',
              '/api/delegates/get?publicKey=' +
                encodeURIComponent(delegate.publicKey) +
                '&address=' +
                encodeURIComponent(delegate.address),
              'Delegate lookup verifies matching public-key and address parameters.',
              validateNestedFieldEquals('delegate', 'publicKey', delegate.publicKey)
          ),
          'Delegates'
      ),
      documentedApiCheck(
          apiSuccessCheck(
              'docs.delegates.forged-range',
              'Delegates',
              '/api/delegates/forging/getForgedByAccount?generatorPublicKey=' +
                encodeURIComponent(delegate.publicKey) +
                '&start=0&end=' +
                Math.floor(Date.now() / 1000),
              'Forging statistics combine delegate public key with an explicit time range.',
              validateRequiredFields(['fees', 'rewards', 'forged'])
          ),
          'Delegates'
      )
  );

  checks.push(
      documentedApiCheck(
          apiSuccessCheck(
              'docs.states.single-key',
              'States: Key-Value Storage',
              '/api/states/get?senderId=' +
                address +
                '&key=contact_list&fromHeight=' +
                discovery.fromHeight +
                '&type=0&returnUnconfirmed=1&limit=3&orderBy=timestamp:desc',
              'KVS lookup combines sender, key, height, state subtype, unconfirmed, limit, and ordering parameters.',
              validateArrayField('transactions', 3)
          ),
          'States: Key-Value Storage'
      ),
      documentedApiCheck(
          apiSuccessCheck(
              'docs.states.multiple-keys',
              'States: Key-Value Storage',
              '/api/states/get?senderIds=' +
                address +
                ',' +
                secondAddress +
                '&keyIds=eth%3Aaddress,btc%3Aaddress,doge%3Aaddress&type=0&limit=3&offset=0&orderBy=timestamp:desc',
              'KVS lookup combines multiple senders and keys with subtype, paging, and ordering parameters.',
              validateArrayField('transactions', 3)
          ),
          'States: Key-Value Storage'
      ),
      documentedApiCheck(
          apiSuccessCheck(
              'docs.states.height-window',
              'States: Key-Value Storage',
              '/api/states/get?fromHeight=' +
                discovery.fromHeight +
                '&toHeight=' +
                discovery.height +
                '&senderId=' +
                address +
                '&type=1&limit=3&orderBy=timestamp:asc',
              'KVS lookup combines a bounded height window, sender, incremental subtype, limit, and ordering.',
              validateArrayField('transactions', 3)
          ),
          'States: Key-Value Storage'
      )
  );

  checks.push(
      documentedApiCheck(
          apiSuccessCheck(
              'docs.node.connected-version-page',
              'Node and Blockchain',
              '/api/peers?state=2&version=' +
                encodeURIComponent(peer.version) +
                '&limit=3&offset=0&orderBy=height:desc',
              'Peer list combines connected state, version, paging, and height ordering.',
              validateArrayField('peers', 3)
          ),
          'Node and Blockchain'
      ),
      documentedApiCheck(
          apiSuccessCheck(
              'docs.node.peer-identity',
              'Node and Blockchain',
              '/api/peers/get?ip=' +
                encodeURIComponent(peer.ip) +
                '&port=' +
                peer.port,
              'Peer detail resolves the discovered IP and port pair.',
              validatePeer(peer.ip, peer.port)
          ),
          'Node and Blockchain'
      ),
      documentedApiCheck(
          apiSuccessCheck(
              'docs.node.peer-filter',
              'Node and Blockchain',
              '/api/peers?ip=' +
                encodeURIComponent(peer.ip) +
                '&port=' +
                peer.port +
                '&state=2&limit=2&orderBy=updated:desc',
              'Peer list combines identity, connected state, limit, and update-time ordering.',
              validateArrayField('peers', 2)
          ),
          'Node and Blockchain'
      )
  );

  return checks;
}

/**
 * Builds three combined-filter query-language checks for each documented endpoint family.
 * @param {object} responseBodies - Discovery response bodies keyed by check id.
 * @param {?object} fixture - Optional fixture account metadata.
 */
function buildQueryLanguageApiChecks (responseBodies, fixture) {
  const discovery = buildApiDiscovery(responseBodies, fixture);
  const address = encodeURIComponent(discovery.primaryAddress);
  const secondAddress = encodeURIComponent(discovery.secondaryAddress);
  const senderPublicKey = encodeURIComponent(discovery.transaction.senderPublicKey);
  const checks = [
    queryLanguageApiCheck(
        apiSuccessCheck(
            'query.transactions.height-types',
            'Transactions Query Language',
            '/api/transactions?fromHeight=' +
              discovery.fromHeight +
              '&and:types=0,8&limit=3&offset=0&orderBy=timestamp:desc&returnAsset=1&returnUnconfirmed=1',
            'AND-combine height and transaction types with paging, ordering, assets, and unconfirmed results.',
            validateArrayField('transactions', 3)
        ),
        '/api/transactions'
    ),
    queryLanguageApiCheck(
        apiSuccessCheck(
            'query.transactions.participants',
            'Transactions Query Language',
            '/api/transactions?senderIds=' +
              address +
              ',' +
              secondAddress +
              '&and:recipientIds=' +
              address +
              ',' +
              secondAddress +
              '&limit=3&orderBy=height:desc&returnAsset=1',
            'Combine sender and recipient sets with explicit AND, paging, ordering, and assets.',
            validateArrayField('transactions', 3)
        ),
        '/api/transactions'
    ),
    queryLanguageApiCheck(
        apiSuccessCheck(
            'query.transactions.amount-fee',
            'Transactions Query Language',
            '/api/transactions?senderPublicKey=' +
              senderPublicKey +
              '&and:minAmount=0&and:maxAmount=' +
              Math.max(1, Number(discovery.transaction.amount)) +
              '&and:minFee=1&and:maxFee=' +
              Math.max(1, Number(discovery.transaction.fee)) +
              '&limit=3&orderBy=timestamp:asc',
            'Combine sender public key, amount range, fee range, limit, and ascending timestamp order.',
            validateArrayField('transactions', 3)
        ),
        '/api/transactions'
    ),
    queryLanguageApiCheck(
        apiSuccessCheck(
            'query.chats.participant-type',
            'Transactions Query Language',
            '/api/chats/get?inId=' +
              address +
              '&type=1&fromHeight=' +
              discovery.fromHeight +
              '&includeDirectTransfers=1&returnUnconfirmed=1&limit=3&orderBy=timestamp:desc',
            'Combine chat participant, subtype, height, direct transfers, unconfirmed results, limit, and ordering.',
            validateArrayField('transactions', 3)
        ),
        '/api/chats/get'
    ),
    queryLanguageApiCheck(
        apiSuccessCheck(
            'query.chats.direction-window',
            'Transactions Query Language',
            '/api/chats/get?senderId=' +
              address +
              '&recipientId=' +
              secondAddress +
              '&fromHeight=' +
              discovery.fromHeight +
              '&toHeight=' +
              discovery.height +
              '&includeDirectTransfers=0&limit=3&orderBy=timestamp:asc',
            'Combine sender, recipient, height window, transfer exclusion, limit, and ascending height order.',
            validateArrayField('transactions', 3)
        ),
        '/api/chats/get'
    ),
    queryLanguageApiCheck(
        apiSuccessCheck(
            'query.chats.signal-page',
            'Transactions Query Language',
            '/api/chats/get?inId=' +
              secondAddress +
              '&type=3&includeDirectTransfers=0&returnUnconfirmed=1&limit=2&offset=0&orderBy=timestamp:desc',
            'Combine participant, signal subtype, transfer exclusion, unconfirmed results, paging, and ordering.',
            validateArrayField('transactions', 2)
        ),
        '/api/chats/get'
    ),
    queryLanguageApiCheck(
        apiSuccessCheck(
            'query.chatrooms.ordinary',
            'Transactions Query Language',
            '/api/chatrooms/' +
              address +
              '?type=1&includeDirectTransfers=0&returnUnconfirmed=1&limit=3&offset=0&orderBy=timestamp:desc',
            'Combine account chatrooms with ordinary subtype, transfer exclusion, unconfirmed results, paging, and ordering.',
            validateArrayField('chats', 3)
        ),
        '/api/chatrooms'
    ),
    queryLanguageApiCheck(
        apiSuccessCheck(
            'query.chatrooms.rich',
            'Transactions Query Language',
            '/api/chatrooms/' +
              address +
              '?type=2&includeDirectTransfers=1&limit=3&offset=1&orderBy=timestamp:asc',
            'Combine account chatrooms with rich subtype, direct transfers, nonzero offset, limit, and ascending order.',
            validateArrayField('chats', 3)
        ),
        '/api/chatrooms'
    ),
    queryLanguageApiCheck(
        apiSuccessCheck(
            'query.chatrooms.pair',
            'Transactions Query Language',
            '/api/chatrooms/' +
              address +
              '/' +
              secondAddress +
              '?type=1&includeDirectTransfers=1&returnUnconfirmed=1&limit=3&offset=0&orderBy=timestamp:desc',
            'Combine a two-party room with subtype, transfers, unconfirmed results, paging, and ordering.',
            validateArrayField('messages', 3)
        ),
        '/api/chatrooms'
    ),
    queryLanguageApiCheck(
        apiSuccessCheck(
            'query.states.sender-key',
            'Transactions Query Language',
            '/api/states/get?senderId=' +
              address +
              '&key=contact_list&fromHeight=' +
              discovery.fromHeight +
              '&type=0&returnUnconfirmed=1&limit=3&orderBy=timestamp:desc',
            'Combine KVS sender, key, height, full-rewrite subtype, unconfirmed results, limit, and ordering.',
            validateArrayField('transactions', 3)
        ),
        '/api/states/get'
    ),
    queryLanguageApiCheck(
        apiSuccessCheck(
            'query.states.sender-key-sets',
            'Transactions Query Language',
            '/api/states/get?senderIds=' +
              address +
              ',' +
              secondAddress +
              '&keyIds=eth%3Aaddress,btc%3Aaddress,doge%3Aaddress&type=0&limit=3&offset=0&orderBy=timestamp:desc',
            'Combine sender and KVS-key sets with subtype, paging, and descending timestamp order.',
            validateArrayField('transactions', 3)
        ),
        '/api/states/get'
    ),
    queryLanguageApiCheck(
        apiSuccessCheck(
            'query.states.height-window',
            'Transactions Query Language',
            '/api/states/get?fromHeight=' +
              discovery.fromHeight +
              '&toHeight=' +
              discovery.height +
              '&senderId=' +
              address +
              '&type=1&returnUnconfirmed=0&limit=3&orderBy=timestamp:asc',
            'Combine KVS height window, sender, incremental subtype, confirmed-only option, limit, and ordering.',
            validateArrayField('transactions', 3)
        ),
        '/api/states/get'
    )
  ];

  return checks;
}

/**
 * Extracts stable identifiers used to build parameterized API requests.
 * @param {object} responseBodies - Discovery response bodies keyed by check id.
 * @param {?object} fixture - Optional fixture account metadata.
 */
function buildApiDiscovery (responseBodies, fixture) {
  const transactions = responseBodies['transactions.list'] && responseBodies['transactions.list'].transactions || [];
  const blocks = responseBodies['blocks.list'] && responseBodies['blocks.list'].blocks || [];
  const delegates = responseBodies['delegates.list'] && responseBodies['delegates.list'].delegates || [];
  const peers = responseBodies['peers.list'] && responseBodies['peers.list'].peers || [];
  const transaction = transactions[0] || {};
  const block = blocks[0] || {};
  const delegate = delegates[0] || {};
  const peer = peers[0] || {};
  const fixtureAddress = fixture && fixture.address;
  const fixturePublicKey = fixture && fixture.publicKey;
  const addresses = uniqueDefinedValues([
    fixtureAddress,
    transaction.senderId,
    transaction.recipientId
  ]);
  const publicKeys = uniqueDefinedValues([
    fixturePublicKey,
    transaction.senderPublicKey,
    transaction.recipientPublicKey
  ]);
  const height = Number(block.height || transaction.height || 1);

  return {
    primaryAddress: addresses[0] || 'U1',
    secondaryAddress: addresses[1] || addresses[0] || 'U1',
    primaryPublicKey: publicKeys[0] || transaction.senderPublicKey,
    height,
    fromHeight: Math.max(1, height - 100000),
    block,
    transaction,
    delegate,
    peer
  };
}

/**
 * Adds the official documentation section to a REST API check.
 * @param {object} check - REST API check definition.
 * @param {string} docsSection - Official API endpoint section.
 */
function documentedApiCheck (check, docsSection) {
  return Object.assign(check, {
    complex: true,
    docsSection
  });
}

/**
 * Marks a REST check for the dedicated transactions-query-language table.
 * @param {object} check - REST API check definition.
 * @param {string} endpoint - Documented query-language endpoint family.
 */
function queryLanguageApiCheck (check, endpoint) {
  return Object.assign(check, {
    complex: true,
    queryLanguageEndpoint: endpoint
  });
}

/**
 * Creates a validator for an array response field and requested maximum length.
 * @param {string} field - Array response field.
 * @param {number} maximum - Maximum expected item count.
 */
function validateArrayField (field, maximum) {
  return function (body) {
    return Array.isArray(body[field]) && body[field].length <= maximum ?
      null :
      field + ' array is missing or exceeds the requested limit';
  };
}

/**
 * Creates a validator for a top-level scalar field.
 * @param {string} field - Response field.
 * @param {*} expected - Expected value.
 */
function validateFieldEquals (field, expected) {
  return function (body) {
    return body[field] === expected ?
      null :
      field + ' does not match the requested value';
  };
}

/**
 * Creates a validator for a nested response object field.
 * @param {string} objectField - Parent object field.
 * @param {string} field - Nested field.
 * @param {*} expected - Expected value.
 */
function validateNestedFieldEquals (objectField, field, expected) {
  return function (body) {
    return body[objectField] && body[objectField][field] === expected ?
      null :
      objectField + '.' + field + ' does not match the requested value';
  };
}

/**
 * Validates that an account response matches both supplied identity parameters.
 * @param {string} address - Expected account address.
 * @param {string} publicKey - Expected account public key.
 */
function validateAccount (address, publicKey) {
  return function (body) {
    return body.account &&
      body.account.address === address &&
      body.account.publicKey === publicKey ?
      null :
      'account identity does not match the supplied address and public key';
  };
}

/**
 * Creates a validator requiring every named top-level response field.
 * @param {Array<string>} fields - Required response fields.
 */
function validateRequiredFields (fields) {
  return function (body) {
    const missing = fields.filter(function (field) {
      return body[field] === undefined;
    });

    return missing.length ? 'missing response fields: ' + missing.join(', ') : null;
  };
}

/**
 * Validates a peer detail response against its requested identity.
 * @param {string} ip - Expected peer IP.
 * @param {number} port - Expected peer port.
 */
function validatePeer (ip, port) {
  return function (body) {
    return body.peer && body.peer.ip === ip && Number(body.peer.port) === Number(port) ?
      null :
      'peer identity does not match the supplied ip and port';
  };
}

/**
 * Returns defined values without duplicates while preserving order.
 * @param {Array<*>} values - Candidate values.
 */
function uniqueDefinedValues (values) {
  return values.filter(function (value, index) {
    return value !== undefined && value !== null && value !== '' && values.indexOf(value) === index;
  });
}

/**
 * Creates one expected-success REST API check definition.
 * @param {string} id - Stable check id.
 * @param {string} category - API area.
 * @param {string} path - Request path.
 * @param {string} expectation - Human-readable expected behavior.
 * @param {Function} [validate] - Optional response validator returning an error string.
 */
function apiSuccessCheck (id, category, path, expectation, validate) {
  return {
    id,
    category,
    method: 'GET',
    path,
    expectation,
    expectedSuccess: true,
    validate
  };
}

/**
 * Creates one expected-rejection REST API check definition.
 * @param {string} id - Stable check id.
 * @param {string} category - API area.
 * @param {string} path - Request path.
 * @param {string} expectation - Human-readable expected behavior.
 * @param {number} [expectedStatus] - Optional expected HTTP status instead of a JSON rejection.
 */
function apiRejectionCheck (id, category, path, expectation, expectedStatus) {
  return {
    id,
    category,
    method: 'GET',
    path,
    expectation,
    expectedSuccess: false,
    expectedStatus
  };
}

/**
 * Executes and classifies one REST API check without stopping the remaining matrix.
 * @param {object} context - Runner context.
 * @param {object} client - Target HTTP client.
 * @param {object} definition - Check definition.
 */
async function executeRestApiCheck (context, client, definition) {
  const response = await client.get(definition.path);
  const bodySuccess = response.body && response.body.success;
  const validationError = definition.expectedSuccess && !definition.validate ?
    null :
    definition.expectedSuccess && definition.validate ?
      definition.validate(response.body || {}) :
      null;
  const responseReceived = response.status > 0;
  const passed = definition.expectedSuccess ?
    response.ok && response.body && bodySuccess !== false && !validationError :
    responseReceived && (
      definition.expectedStatus !== undefined ?
        response.status === definition.expectedStatus :
        response.body && bodySuccess === false
    );
  let failure = null;

  context.metrics.latency('rest.get', response.latencyMs);

  if (!passed) {
    failure = validationError ||
      response.error ||
      'expected success=' + definition.expectedSuccess +
      ', received HTTP ' + response.status +
      ' and body success=' + formatApiScalar(bodySuccess);
  }

  return {
    body: response.body,
    check: {
      id: definition.id,
      category: definition.category,
      method: definition.method,
      path: definition.path,
      expectation: definition.expectation,
      expectedSuccess: definition.expectedSuccess,
      complex: !!definition.complex,
      docsSection: definition.docsSection || null,
      queryLanguageEndpoint: definition.queryLanguageEndpoint || null,
      status: response.status,
      httpOk: response.ok,
      bodySuccess,
      latencyMs: response.latencyMs,
      observed: summarizeApiResponse(response.body, response.error),
      passed,
      failure
    }
  };
}

/**
 * Validates that a block list is bounded and ordered by descending height.
 * @param {object} body - REST response body.
 */
function validateDescendingBlocks (body) {
  if (!Array.isArray(body.blocks) || body.blocks.length > 2) {
    return 'block list is missing or exceeds the requested limit';
  }

  for (let index = 1; index < body.blocks.length; index++) {
    if (body.blocks[index - 1].height < body.blocks[index].height) {
      return 'blocks are not sorted by descending height';
    }
  }

  return null;
}

/**
 * Creates a validator for the `/api/accounts/top` response shape, filters, and ordering.
 * @param {number} limit - Expected normalized response limit.
 * @param {number} offset - Expected normalized response offset.
 * @param {number} [isDelegate] - Optional delegate flag expected for every returned account.
 * @return {Function} Response validator.
 */
function validateTopAccounts (limit, offset, isDelegate) {
  return function (body) {
    if (!Array.isArray(body.accounts)) {
      return 'accounts array is missing';
    }
    if (body.limit !== limit) {
      return 'limit metadata does not match the requested value';
    }
    if (body.offset !== offset) {
      return 'offset metadata does not match the requested value';
    }
    if (typeof body.count !== 'number') {
      return 'count metadata is missing';
    }
    if (body.accounts.length > limit) {
      return 'accounts array exceeds the requested limit';
    }
    if (body.count < body.accounts.length) {
      return 'count metadata is smaller than the returned account page';
    }

    for (let index = 0; index < body.accounts.length; index++) {
      const account = body.accounts[index];

      if (typeof account.address !== 'string' || typeof account.balance !== 'string' || typeof account.isDelegate !== 'number') {
        return 'top account fields are incomplete';
      }
      if (isDelegate !== undefined && account.isDelegate !== isDelegate) {
        return 'top account delegate filter returned an unexpected account';
      }
      if (index > 0) {
        const previous = body.accounts[index - 1];
        const previousBalance = parseTopAccountBalance(previous.balance);
        const currentBalance = parseTopAccountBalance(account.balance);

        if (previousBalance.error || currentBalance.error) {
          return 'top account balance is not an integer string';
        }

        if (previousBalance.value < currentBalance.value) {
          return 'top accounts are not sorted by descending balance';
        }
        if (previousBalance.value === currentBalance.value && previous.address > account.address) {
          return 'top accounts with equal balances are not sorted by ascending address';
        }
      }
    }

    return null;
  };
}

/**
 * Parses a top-account balance without throwing from the live-test validator.
 * @param {string} balance - Balance returned by `/api/accounts/top`.
 * @return {object} Parsed BigInt value or an error marker.
 */
function parseTopAccountBalance (balance) {
  try {
    return { value: BigInt(balance) };
  } catch (err) {
    return { error: true };
  }
}

/**
 * Produces a report-safe summary of an API response body.
 * @param {?object} body - Parsed response body.
 * @param {string} [transportError] - Transport error when no body was received.
 */
function summarizeApiResponse (body, transportError) {
  if (!body || typeof body !== 'object') {
    return transportError || 'no JSON body';
  }

  const summary = {
    success: body.success
  };

  if (body.error) {
    summary.error = body.error;
  }
  if (body.height !== undefined) {
    summary.height = body.height;
  }
  if (body.loaded !== undefined) {
    summary.loaded = body.loaded;
  }
  if (body.syncing !== undefined) {
    summary.syncing = body.syncing;
  }
  if (body.loader && typeof body.loader === 'object') {
    summary.loaded = body.loader.loaded;
    summary.syncing = body.loader.syncing;
    summary.consensus = body.loader.consensus;
    summary.blocksToSync = body.loader.blocks;
  }
  if (body.network && typeof body.network === 'object') {
    summary.height = body.network.height;
    summary.nethash = body.network.nethash;
    summary.broadhash = body.network.broadhash;
  }
  if (body.version !== undefined) {
    summary.version = typeof body.version === 'object' ? body.version.version : body.version;
  }
  if (body.milestone !== undefined) {
    summary.milestone = body.milestone;
    summary.reward = body.reward;
    summary.supply = body.supply;
    summary.fee = body.fee;
  }
  if (body.balance !== undefined) {
    summary.balance = body.balance;
    summary.unconfirmedBalance = body.unconfirmedBalance;
  }
  if (body.publicKey !== undefined) {
    summary.publicKey = body.publicKey;
  }
  if (body.confirmed !== undefined) {
    summary.confirmed = body.confirmed;
    summary.queued = body.queued;
    summary.unconfirmed = body.unconfirmed;
    summary.multisignature = body.multisignature;
  }
  summarizeApiCollection(summary, body, 'blocks', 'height');
  summarizeApiCollection(summary, body, 'transactions', 'id');
  summarizeApiCollection(summary, body, 'delegates', 'publicKey');
  summarizeApiCollection(summary, body, 'peers', 'ip');
  summarizeApiCollection(summary, body, 'chats', 'lastTransaction');
  summarizeApiCollection(summary, body, 'messages', 'id');

  if (body.count !== undefined) {
    summary.count = body.count;
  }
  if (body.totalCount !== undefined) {
    summary.totalCount = body.totalCount;
  }
  if (body.account && body.account.address) {
    summary.account = body.account.address;
  }
  if (body.block && body.block.id) {
    summary.block = body.block.id;
  }
  if (body.transaction && body.transaction.id) {
    summary.transaction = body.transaction.id;
  }
  if (body.delegate && body.delegate.publicKey) {
    summary.delegate = body.delegate.publicKey;
  }
  if (body.peer) {
    summary.peer = body.peer.ip + ':' + body.peer.port;
  }
  if (body.fees && typeof body.fees === 'object') {
    summary.feeTypes = Object.keys(body.fees).sort();
  }
  if (body.connected !== undefined) {
    summary.connected = body.connected;
    summary.disconnected = body.disconnected;
    summary.banned = body.banned;
  }
  if (body.forged !== undefined) {
    summary.fees = body.fees;
    summary.rewards = body.rewards;
    summary.forged = body.forged;
  }

  return summary;
}

/**
 * Adds collection size and a stable first-item field to an API response summary.
 * @param {object} summary - Mutable response summary.
 * @param {object} body - REST response body.
 * @param {string} key - Collection property.
 * @param {string} firstField - First-item field to expose.
 */
function summarizeApiCollection (summary, body, key, firstField) {
  if (!Array.isArray(body[key])) {
    return;
  }

  summary[key] = body[key].length;
  const firstValue = body[key][0] && body[key][0][firstField];

  if (firstValue !== undefined && (typeof firstValue !== 'object' || firstValue === null)) {
    summary['first' + key.charAt(0).toUpperCase() + key.slice(1)] = firstValue;
  }
}

/**
 * Formats a scalar for internal API check failure messages.
 * @param {*} value - Scalar value.
 */
function formatApiScalar (value) {
  return value === undefined ? 'undefined' : String(value);
}

/**
 * Verifies client WebSocket connectivity and supported subscription messages.
 * @param {object} context - Runner context.
 */
async function runWebSocketScenario (context) {
  const node = context.primaryNode;

  if (!node.wsClientUrl) {
    return context.skip('Node does not advertise an enabled client WebSocket endpoint.');
  }

  const fixture = context.fixtureAccounts.transfer || context.fixtureAccounts.genesis;
  const subscriptions = [
    {
      event: 'types',
      value: [transactionTypes.SEND, transactionTypes.CHAT_MESSAGE],
      purpose: 'Subscribe to SEND (0) and CHAT_MESSAGE (8) transactions.'
    },
    {
      event: 'assetChatTypes',
      value: Object.values(transactionTypes.CHAT_MESSAGE_TYPES),
      purpose: 'Subscribe to all chat message subtypes.'
    }
  ];

  if (fixture && fixture.address) {
    subscriptions.push({
      event: 'address',
      value: fixture.address,
      purpose: 'Subscribe to transactions involving the fixture account address.'
    });
  }

  const connection = await checkWebSocket(
      node.wsClientUrl,
      context.options.timeoutMs,
      subscriptions
  );

  context.metrics.latency('ws.connect', connection.latencyMs);

  const result = {
    kind: 'api websocket',
    test: {
      nodeId: node.id,
      wsClientUrl: node.wsClientUrl,
      coverage: 'Socket.IO websocket handshake, SEND and CHAT_MESSAGE type subscriptions, all chat subtype subscriptions, optional address subscription, and clean client disconnect.',
      limitation: 'Subscription events have no acknowledgement in the current protocol, so this read-only scenario verifies emission but not newTrans delivery.'
    },
    wsClientUrl: node.wsClientUrl,
    connected: connection.connected,
    disconnected: connection.disconnected,
    latencyMs: connection.latencyMs,
    subscriptions: connection.subscriptions,
    error: connection.error || null,
    passed: connection.connected && connection.disconnected
  };

  if (!result.passed) {
    const error = Error('WebSocket API check failed: ' + (result.error || 'connection did not close cleanly') + '.');

    error.result = result;
    throw error;
  }

  return result;
}

/**
 * Verifies configured consensus activations on the recipient and peer nodes.
 * @param {object} context - Runner context.
 */
async function runConsensusActivationScenario (context) {
  if (context.options.live) {
    return runLiveConsensusActivationScenario(context);
  }

  const definitions = buildConsensusActivationDefinitions();
  const nodes = getConsensusObservationNodes(context);
  const activationHeights = context.configMetadata.consensusActivationHeights || {};

  context.assert(definitions.every(function (definition) {
    return Number.isFinite(Number(activationHeights[definition.name]));
  }), 'Consensus activation metadata is missing fairSystem or spaceship.');

  const observations = await Promise.all(nodes.map(function (node) {
    return collectConsensusNodeObservation(context, node, definitions, activationHeights);
  }));
  const agreement = buildConsensusAgreement(observations, context.options.maxHeightDrift);
  const result = {
    kind: 'consensus activation',
    test: {
      nodeSelection: context.target.mode === 'testnet' ?
        'node-recipient and node-peer, where node-peer defaults to the third peer in the testnet config.' :
        'node-recipient and node-peer, using the first two available localnet nodes.',
      requests: [
        'GET /api/node/status',
        'GET /api/blocks/getStatus',
        'GET /api/blocks?limit=1&orderBy=height:desc',
        'GET /api/delegates?limit=101',
        'GET /api/transactions with a bounded activation-aware range',
        'GET /api/peers?state=2&limit=100'
      ],
      agreement: 'Compare nethash and height drift; at equal heights also compare broadhash, latest block, delegate order, and activation state.',
      maxHeightDrift: context.options.maxHeightDrift
    },
    definitions,
    nodes: observations,
    agreement,
    passed: agreement.passed && observations.every(function (observation) {
      return observation.ready && observation.activations.every(function (activation) {
        return activation.passed !== false;
      });
    })
  };

  if (!result.passed) {
    const failures = agreement.failures.concat(observations.reduce(function (items, observation) {
      if (!observation.ready) {
        items.push(observation.role + ' is not loaded or is still syncing');
      }
      observation.activations.forEach(function (activation) {
        if (activation.passed === false) {
          items.push(observation.role + ' ' + activation.name + ': ' + activation.evidence.summary);
        }
      });

      return items;
    }, []));
    const error = Error('Consensus activation checks failed: ' + failures.join('; ') + '.');

    error.result = result;
    throw error;
  }

  return result;
}

/**
 * Runs a six-round localnet activation test with workloads and transition blocks.
 * @param {object} context - Runner context.
 */
async function runLiveConsensusActivationScenario (context) {
  context.assert(context.target.mode === 'localnet', '--live consensus execution is supported only in localnet mode.');

  const definitions = buildConsensusActivationDefinitions();
  const activationHeights = context.configMetadata.consensusActivationHeights || {};
  const plan = buildLiveConsensusPlan(activationHeights);
  const checkpoints = [];
  const transitions = [];
  const startedAt = Date.now();
  context.liveConsensusPlan = plan;
  context.liveConsensusProgress = {
    lastLoggedHeight: null
  };
  const result = {
    kind: 'consensus live activation',
    test: {
      nodeSelection: 'Every managed localnet node is captured; node-recipient and node-peer are compared explicitly.',
      lifecycle: 'Drop localnet databases, start three nodes with the consensus override, run six full rounds, then stop every node gracefully.',
      workload: 'Run transactions, security, and forging at every checkpoint; submit an additional SEND batch into each last pre-activation block.',
      requests: [
        'Complete node, block, delegate, peer, transaction-pool, and forging state from every localnet node.',
        'transactions.happy-path, transactions.abuse, and delegates.forging at every checkpoint.',
        'Twenty valid SEND transactions before each activation boundary.'
      ],
      agreement: 'Compare recipient and peer nethash and height drift; at equal heights compare broadhash, latest block, delegate order, and activation state.',
      maxHeightDrift: context.options.maxHeightDrift
    },
    definitions,
    live: {
      plan,
      startedAt: new Date(startedAt).toISOString(),
      checkpoints,
      transitions
    },
    nodes: [],
    agreement: null,
    passed: false
  };

  try {
    logLiveConsensusProgress(
        context,
        'Starting six-round activation run: fairSystem at 203, spaceship at 405, final height 606.',
        0
    );
    await waitForLiveConsensusReady(context);

    logLiveConsensusProgress(context, 'Running baseline checkpoint before any activation.', 1);
    checkpoints.push(await runLiveConsensusCheckpoint(context, definitions, activationHeights, plan.checkpoints[0]));

    logLiveConsensusProgress(context, 'Forging two complete pre-fairSystem rounds.', 1);
    await waitForLiveConsensusHeight(context, plan.fairSystem - 2);
    transitions.push(await runLiveConsensusTransitionLoad(context, 'fairSystem', plan.fairSystem));
    logLiveConsensusProgress(context, 'fairSystem activation height reached; running activation checkpoint.', plan.fairSystem);
    checkpoints.push(await runLiveConsensusCheckpoint(context, definitions, activationHeights, plan.checkpoints[1]));

    logLiveConsensusProgress(context, 'Forging two complete fairSystem rounds before spaceship.', plan.fairSystem);
    await waitForLiveConsensusHeight(context, plan.spaceship - 2);
    transitions.push(await runLiveConsensusTransitionLoad(context, 'spaceship', plan.spaceship));
    logLiveConsensusProgress(context, 'spaceship activation height reached; running activation checkpoint.', plan.spaceship);
    checkpoints.push(await runLiveConsensusCheckpoint(context, definitions, activationHeights, plan.checkpoints[2]));

    logLiveConsensusProgress(context, 'Forging two complete post-spaceship rounds.', plan.spaceship);
    checkpoints.push(await runLiveConsensusCheckpoint(context, definitions, activationHeights, plan.checkpoints[3]));

    const finalCheckpoint = checkpoints[checkpoints.length - 1];
    const finalRecipientPeer = finalCheckpoint.after.nodes.slice(0, 2);

    result.nodes = finalRecipientPeer;
    result.agreement = buildConsensusAgreement(finalRecipientPeer, context.options.maxHeightDrift);
    result.live.finishedAt = new Date().toISOString();
    result.live.durationMs = Date.now() - startedAt;
    result.passed = result.agreement.passed &&
      checkpoints.every(function (checkpoint) {
        return checkpoint.passed;
      }) &&
      transitions.every(function (transition) {
        return transition.passed;
      });

    if (!result.passed) {
      throw Error('One or more live consensus checkpoints or transition blocks failed.');
    }

    logLiveConsensusProgress(context, 'All checkpoints, workloads, transitions, and node agreements passed.', plan.finalHeight);
    return result;
  } catch (error) {
    if (error.checkpoint && checkpoints.indexOf(error.checkpoint) === -1) {
      checkpoints.push(error.checkpoint);
    }
    result.live.finishedAt = new Date().toISOString();
    result.live.durationMs = Date.now() - startedAt;
    logLiveConsensusProgress(context, 'FAILED: ' + error.message, null);
    error.result = result;
    throw error;
  }
}

/**
 * Prints one progress line for the long-running live consensus scenario.
 * @param {object} context - Runner context with a live console logger.
 * @param {string} message - Current operation or observed result.
 * @param {?number} height - Current or relevant blockchain height.
 */
function logLiveConsensusProgress (context, message, height) {
  const plan = context.liveConsensusPlan || {};
  const finalHeight = Number(plan.finalHeight) || 0;
  const numericHeight = Number(height);
  const hasHeight = Number.isFinite(numericHeight);
  const percent = hasHeight && finalHeight ?
    Math.max(0, Math.min(100, numericHeight / finalHeight * 100)) :
    null;
  const prefix = percent === null ?
    '[progress n/a] ' :
    '[progress ' + percent.toFixed(1) + '%][height ' + numericHeight + '/' + finalHeight + '] ';

  context.liveLog(prefix + message);
}

/**
 * Builds the round-aligned six-round execution plan.
 * @param {object} activationHeights - Effective consensus activation heights.
 */
function buildLiveConsensusPlan (activationHeights) {
  const fairSystem = Number(activationHeights.fairSystem);
  const spaceship = Number(activationHeights.spaceship);
  const delegates = constants.activeDelegates;

  if (!Number.isInteger(fairSystem) || !Number.isInteger(spaceship)) {
    throw Error('Live consensus activation heights must be integers.');
  }
  if ((fairSystem - 1) % delegates !== 0 || (spaceship - 1) % delegates !== 0) {
    throw Error('Live consensus activations must start at the first block of a 101-delegate round.');
  }
  if (fairSystem !== delegates * 2 + 1 || spaceship !== delegates * 4 + 1) {
    throw Error('Localnet live consensus plan requires fairSystem=203 and spaceship=405.');
  }

  return {
    delegatesPerRound: delegates,
    totalRounds: 6,
    fairSystem,
    spaceship,
    finalHeight: delegates * 6,
    checkpoints: [
      {
        id: 'baseline',
        targetHeight: 1,
        description: 'Initial pre-activation network state.'
      },
      {
        id: 'fairSystem-active',
        targetHeight: fairSystem,
        description: 'First block with fairSystem active.'
      },
      {
        id: 'spaceship-active',
        targetHeight: spaceship,
        description: 'First block with spaceship active after two fairSystem rounds.'
      },
      {
        id: 'post-spaceship-two-rounds',
        targetHeight: delegates * 6,
        description: 'End of the second complete round after spaceship activation.'
      }
    ]
  };
}

/**
 * Waits until every managed node exposes a loaded, non-syncing API.
 * @param {object} context - Runner context.
 */
async function waitForLiveConsensusReady (context) {
  const deadline = Date.now() + context.options.readyTimeoutMs;
  let lastStates = [];
  let attempt = 0;

  while (Date.now() < deadline) {
    attempt++;
    lastStates = await Promise.all(context.target.nodes.map(async function (node) {
      const response = await context.clientFor(node).get('/api/node/status');
      const body = response.body || {};

      return {
        id: node.id,
        ready: Boolean(response.ok && body.success && body.loader && body.loader.loaded && !body.loader.syncing),
        height: body.network && body.network.height,
        error: response.error || body.error
      };
    }));

    if (lastStates.every(function (state) {
      return state.ready;
    })) {
      logLiveConsensusProgress(
          context,
          'All nodes are ready: ' + formatLiveNodeStates(lastStates) + '.',
          Math.min.apply(null, lastStates.map(function (state) {
            return Number(state.height) || 0;
          }))
      );
      return lastStates;
    }

    if (attempt === 1 || attempt % 5 === 0) {
      logLiveConsensusProgress(
          context,
          'Waiting for node readiness, genesis application, and peer startup: ' + formatLiveNodeStates(lastStates) + '.',
          Math.min.apply(null, lastStates.map(function (state) {
            return Number(state.height) || 0;
          }))
      );
    }

    await sleep(context.options.pollIntervalMs);
  }

  throw Error('Live consensus localnet was not ready: ' + JSON.stringify(lastStates));
}

/**
 * Waits for the primary node to reach a specific live-test height.
 * @param {object} context - Runner context.
 * @param {number} targetHeight - Required blockchain height.
 */
async function waitForLiveConsensusHeight (context, targetHeight) {
  const deadline = Date.now() + context.options.liveTimeoutMs;
  let lastHeight = null;
  const progress = context.liveConsensusProgress || {
    lastLoggedHeight: null
  };

  logLiveConsensusProgress(context, 'Waiting for target height ' + targetHeight + '.', lastHeight);

  while (Date.now() < deadline) {
    const response = await context.clientFor(context.primaryNode).get('/api/blocks/getHeight');

    context.metrics.latency('consensus.live.height', response.latencyMs);
    lastHeight = response.body && Number(response.body.height);
    if (Number.isFinite(lastHeight) && (
      progress.lastLoggedHeight === null ||
      lastHeight >= progress.lastLoggedHeight + LIVE_CONSENSUS_HEIGHT_LOG_INTERVAL ||
      lastHeight >= targetHeight
    )) {
      progress.lastLoggedHeight = lastHeight;
      context.liveConsensusProgress = progress;
      logLiveConsensusProgress(
          context,
          lastHeight >= targetHeight ?
            'Reached target height ' + targetHeight + '.' :
            'Forging blocks; next target height is ' + targetHeight + '.',
          lastHeight
      );
    }
    if (Number.isFinite(lastHeight) && lastHeight >= targetHeight) {
      return lastHeight;
    }

    await sleep(context.options.pollIntervalMs);
  }

  throw Error('Timed out waiting for live consensus height ' + targetHeight + '; last height ' + lastHeight + '.');
}

/**
 * Runs all workload suites and captures network state before and after one checkpoint.
 * @param {object} context - Runner context.
 * @param {Array<object>} definitions - Consensus activation definitions.
 * @param {object} activationHeights - Effective activation heights.
 * @param {object} checkpoint - Planned checkpoint metadata.
 */
async function runLiveConsensusCheckpoint (context, definitions, activationHeights, checkpoint) {
  await waitForLiveConsensusHeight(context, checkpoint.targetHeight);

  const startedAt = Date.now();
  logLiveConsensusProgress(
      context,
      'Checkpoint "' + checkpoint.id + '": capturing complete network state before workloads.',
      checkpoint.targetHeight
  );
  const result = {
    id: checkpoint.id,
    description: checkpoint.description,
    targetHeight: checkpoint.targetHeight,
    startedAt: new Date(startedAt).toISOString(),
    before: await collectLiveConsensusNetworkState(context, definitions, activationHeights),
    workloads: [],
    after: null,
    passed: false
  };
  logLiveConsensusNetworkSummary(context, checkpoint.id + ' before workloads', result.before);

  for (const workloadId of ['transactions.happy-path', 'transactions.abuse', 'delegates.forging']) {
    logLiveConsensusProgress(
        context,
        'Checkpoint "' + checkpoint.id + '": starting workload ' + workloadId + '.',
        minimumLiveStateHeight(result.before)
    );
    const workload = await runLiveConsensusWorkload(context, workloadId);

    result.workloads.push(workload);
    logLiveConsensusProgress(
        context,
        'Checkpoint "' +
        checkpoint.id +
        '": workload ' +
        workloadId +
        ' finished with status ' +
        workload.status +
        ' in ' +
        workload.durationMs +
        ' ms.',
        minimumLiveStateHeight(result.before)
    );
    if (!workload.passed) {
      logLiveConsensusProgress(
          context,
          'Checkpoint "' + checkpoint.id + '": collecting failure state after ' + workloadId + '.',
          minimumLiveStateHeight(result.before)
      );
      result.after = await collectLiveConsensusNetworkState(context, definitions, activationHeights);
      logLiveConsensusNetworkSummary(context, checkpoint.id + ' failure state', result.after);
      result.finishedAt = new Date().toISOString();
      result.durationMs = Date.now() - startedAt;
      const error = Error('Live consensus workload failed at ' + checkpoint.id + ': ' + workloadId + '.');

      error.checkpoint = result;
      throw error;
    }
  }

  logLiveConsensusProgress(
      context,
      'Checkpoint "' + checkpoint.id + '": capturing complete network state after workloads.',
      minimumLiveStateHeight(result.before)
  );
  result.after = await collectLiveConsensusNetworkState(context, definitions, activationHeights);
  logLiveConsensusNetworkSummary(context, checkpoint.id + ' after workloads', result.after);
  result.finishedAt = new Date().toISOString();
  result.durationMs = Date.now() - startedAt;
  result.passed = result.before.passed &&
    result.after.passed &&
    hasConclusiveActiveConsensusEvidence(result.after) &&
    result.workloads.every(function (workload) {
      return workload.passed;
    });
  logLiveConsensusProgress(
      context,
      'Checkpoint "' + checkpoint.id + '" ' + (result.passed ? 'passed' : 'failed') + '.',
      minimumLiveStateHeight(result.after)
  );

  return result;
}

/**
 * Requires every active consensus switch to have live behavioral evidence after workloads.
 * @param {object} state - Captured all-node network state.
 */
function hasConclusiveActiveConsensusEvidence (state) {
  return (state.nodes || []).every(function (node) {
    return (node.activations || []).every(function (activation) {
      return activation.state !== 'active' ||
        !activation.evidence ||
        activation.evidence.conclusive !== false;
    });
  });
}

/**
 * Executes one existing scenario as a named live-consensus workload.
 * @param {object} context - Runner context.
 * @param {string} scenarioId - Existing scenario id.
 */
async function runLiveConsensusWorkload (context, scenarioId) {
  const scenario = SCENARIOS.find(function (candidate) {
    return candidate.id === scenarioId;
  });
  const startedAt = Date.now();

  if (!scenario) {
    throw Error('Unknown live consensus workload scenario: ' + scenarioId);
  }

  try {
    const result = await scenario.run(context);

    return {
      id: scenario.id,
      suite: scenario.suite,
      status: result && result.__skipped ? 'skipped' : 'passed',
      durationMs: Date.now() - startedAt,
      result: result && result.__skipped ? { reason: result.reason } : result,
      passed: !(result && result.__skipped)
    };
  } catch (error) {
    return {
      id: scenario.id,
      suite: scenario.suite,
      status: 'failed',
      durationMs: Date.now() - startedAt,
      error: error.message,
      result: error.result,
      passed: false
    };
  }
}

/**
 * Captures status, pools, forging, activation evidence, and agreement for all localnet nodes.
 * @param {object} context - Runner context.
 * @param {Array<object>} definitions - Consensus activation definitions.
 * @param {object} activationHeights - Effective activation heights.
 */
async function collectLiveConsensusNetworkState (context, definitions, activationHeights) {
  const nodes = await Promise.all(context.target.nodes.map(async function (node, index) {
    const observedNode = Object.assign({}, node, {
      consensusRole: index === 0 ? 'node-recipient' : index === 1 ? 'node-peer' : 'node-observer'
    });
    const observation = await collectConsensusNodeObservation(
        context,
        observedNode,
        definitions,
        activationHeights
    );
    const client = context.clientFor(node);
    const details = await Promise.all([
      client.get('/api/transactions/count'),
      client.get('/api/delegates/forging/status')
    ]);

    assertSuccessfulConsensusResponse(context, details[0], observedNode, '/api/transactions/count');
    assertSuccessfulConsensusResponse(context, details[1], observedNode, '/api/delegates/forging/status');

    observation.transactionPools = {
      confirmed: details[0].body.confirmed,
      queued: details[0].body.queued,
      unconfirmed: details[0].body.unconfirmed,
      multisignature: details[0].body.multisignature
    };
    observation.forging = {
      enabled: details[1].body.enabled,
      configuredDelegates: (details[1].body.delegates || []).length
    };

    return observation;
  }));
  const agreements = nodes.slice(1).map(function (node) {
    return buildConsensusAgreement([nodes[0], node], context.options.maxHeightDrift);
  });
  const agreement = agreements[0];

  return {
    capturedAt: new Date().toISOString(),
    nodes,
    agreement,
    agreements,
    passed: agreements.every(function (candidate) {
      return candidate.passed;
    }) && nodes.every(function (node) {
      return node.ready && node.activations.every(function (activation) {
        return activation.passed;
      });
    })
  };
}

/**
 * Prints a compact all-node summary after one full network-state capture.
 * @param {object} context - Runner context.
 * @param {string} label - Capture phase label.
 * @param {object} state - Captured network state.
 */
function logLiveConsensusNetworkSummary (context, label, state) {
  const nodeSummary = (state.nodes || []).map(function (node) {
    const pools = node.transactionPools || {};
    const activations = (node.activations || []).map(function (activation) {
      return activation.name + '=' + activation.state;
    }).join(',');

    return node.id +
      ':h=' +
      node.height +
      ',ready=' +
      node.ready +
      ',pools=' +
      [pools.queued, pools.unconfirmed, pools.multisignature].join('/') +
      ',activations=' +
      activations;
  }).join(' | ');

  logLiveConsensusProgress(
      context,
      'Network state "' +
      label +
      '": ' +
      nodeSummary +
      '; all-node agreement=' +
      state.passed +
      '.',
      minimumLiveStateHeight(state)
  );
}

/**
 * Returns the minimum reported height from a captured live network state.
 * @param {?object} state - Captured network state.
 */
function minimumLiveStateHeight (state) {
  const heights = state && state.nodes ? state.nodes.map(function (node) {
    return Number(node.height);
  }).filter(Number.isFinite) : [];

  return heights.length ? Math.min.apply(null, heights) : null;
}

/**
 * Formats readiness polling state for console progress output.
 * @param {Array<object>} states - Per-node readiness observations.
 */
function formatLiveNodeStates (states) {
  return states.map(function (state) {
    return state.id +
      '(ready=' +
      state.ready +
      ', height=' +
      (state.height === undefined ? 'n/a' : state.height) +
      (state.error ? ', error=' + state.error : '') +
      ')';
  }).join(', ');
}

/**
 * Loads valid SEND transactions into the final block before one activation.
 * @param {object} context - Runner context.
 * @param {string} activationName - Activation reached by the next block.
 * @param {number} activationHeight - First active block height.
 */
async function runLiveConsensusTransitionLoad (context, activationName, activationHeight) {
  const fixture = context.fixtureAccounts.transfer;

  context.assert(fixture && fixture.secret, 'No funded transfer fixture account found for transition load.');

  const observedHeight = await waitForLiveConsensusHeight(context, activationHeight - 2);

  context.assert(
      observedHeight === activationHeight - 2,
      'Missed pre-activation transaction window for ' + activationName + '.'
  );

  const client = context.clientFor(context.primaryNode);
  const sender = accountFromFixture(fixture);
  logLiveConsensusProgress(
      context,
      'Transition "' +
      activationName +
      '": generating and signing ' +
      LIVE_CONSENSUS_TRANSITION_TRANSACTION_COUNT +
      ' SEND transactions for pre-activation block ' +
      (activationHeight - 1) +
      '.',
      observedHeight
  );
  const transactions = Array.from({ length: LIVE_CONSENSUS_TRANSITION_TRANSACTION_COUNT }, function () {
    const recipient = tx.createAccount();

    return tx.createSendTransaction(sender, recipient.address, context.options.transferAmount);
  });
  const submissions = await Promise.all(transactions.map(function (transaction) {
    return client.post('/api/transactions/process', { transaction });
  }));
  const acceptedIds = transactions.filter(function (transaction, index) {
    return submissions[index].ok && submissions[index].body && submissions[index].body.success;
  }).map(function (transaction) {
    return transaction.id;
  });
  logLiveConsensusProgress(
      context,
      'Transition "' +
      activationName +
      '": node-recipient accepted ' +
      acceptedIds.length +
      '/' +
      transactions.length +
      ' transactions; waiting for activation height ' +
      activationHeight +
      '.',
      observedHeight
  );

  context.assert(acceptedIds.length > 0, 'No transition transactions were accepted before ' + activationName + '.');

  await waitForLiveConsensusHeight(context, activationHeight);

  const confirmations = await Promise.all(acceptedIds.map(async function (transactionId) {
    const response = await client.get('/api/transactions/get?id=' + encodeURIComponent(transactionId));
    const transaction = response.body && response.body.transaction;

    return {
      id: transactionId,
      confirmed: Boolean(response.ok && response.body && response.body.success && transaction),
      height: transaction && Number(transaction.height),
      confirmations: transaction && Number(transaction.confirmations || 0)
    };
  }));
  const preActivationBlockHeight = activationHeight - 1;
  const inPreActivationBlock = confirmations.filter(function (confirmation) {
    return confirmation.height === preActivationBlockHeight;
  }).length;
  logLiveConsensusProgress(
      context,
      'Transition "' +
      activationName +
      '": confirmed ' +
      confirmations.filter(function (confirmation) {
        return confirmation.confirmed;
      }).length +
      '/' +
      acceptedIds.length +
      '; included in required block ' +
      preActivationBlockHeight +
      ': ' +
      inPreActivationBlock +
      '.',
      activationHeight
  );

  return {
    activation: activationName,
    activationHeight,
    preActivationBlockHeight,
    generated: transactions.length,
    accepted: acceptedIds.length,
    confirmed: confirmations.filter(function (confirmation) {
      return confirmation.confirmed;
    }).length,
    inPreActivationBlock,
    confirmations,
    passed: inPreActivationBlock > 0
  };
}

/**
 * Selects the two nodes used by the consensus scenario and assigns stable roles.
 * @param {object} context - Runner context.
 */
function getConsensusObservationNodes (context) {
  const candidates = context.target.mode === 'testnet' ?
    context.target.transactionObservationNodes :
    context.target.nodes;

  context.assert(
      candidates && candidates.length >= 2,
      'Consensus suite requires both node-recipient and node-peer.'
  );

  return candidates.slice(0, 2).map(function (node, index) {
    return Object.assign({}, node, {
      consensusRole: index === 0 ? 'node-recipient' : 'node-peer'
    });
  });
}

/**
 * Describes the behavior and purpose of every consensus activation covered by the scenario.
 */
function buildConsensusActivationDefinitions () {
  return [
    {
      name: 'fairSystem',
      title: 'Fair System',
      purpose: 'Make delegate ranking reflect distributed voter weight and delegate productivity while preserving deterministic ordering.',
      before: [
        'Rank delegates and select the active forging set by raw vote balance descending.',
        'Calculate delegate approval from raw vote balance divided by total supply.'
      ],
      changes: [
        'Rank delegates and select the active forging set by votesWeight descending, with publicKey ascending as the tie-breaker.',
        'Split each voter balance across selected delegates and adjust delegate votesWeight by productivity.',
        'Calculate delegate approval from votesWeight divided by total supply.'
      ],
      probe: 'Verify the delegate API ranking field, deterministic public-key tie-breaker, and approval formula selected for the observed height.'
    },
    {
      name: 'spaceship',
      title: 'Spaceship',
      purpose: 'Add millisecond transaction ordering precision without changing transaction signatures, hashes, IDs, or pre-activation history.',
      before: [
        'Remove timestampMs during transaction normalization so historical transactions remain compatible.',
        'Use the second-resolution ADAMANT timestamp field.'
      ],
      changes: [
        'Preserve timestampMs in normalized transactions at and after the activation height.',
        'Require timestampMs to remain in the same ADAMANT second as timestamp, with a delta from 0 through 999 milliseconds.',
        'Derive timestamp from timestampMs with Math.floor(timestampMs / 1000); timestampMs remains outside signed and hashed transaction bytes.'
      ],
      probe: 'Inspect bounded transaction samples at the relevant heights for timestampMs presence and same-second validity.'
    }
  ];
}

/**
 * Collects consensus and activation evidence from one node.
 * @param {object} context - Runner context.
 * @param {object} node - Node endpoint and assigned consensus role.
 * @param {Array<object>} definitions - Consensus activation definitions.
 * @param {object} activationHeights - Configured activation heights.
 */
async function collectConsensusNodeObservation (context, node, definitions, activationHeights) {
  const client = context.clientFor(node);
  const statusResult = await client.get('/api/node/status');

  assertSuccessfulConsensusResponse(context, statusResult, node, '/api/node/status');

  const status = statusResult.body;
  const network = status.network || {};
  const height = Number(network.height);

  context.assert(Number.isFinite(height), 'Invalid network height from ' + node.consensusRole + '.');

  const switches = buildConsensusSwitches(height, activationHeights);
  const spaceship = switches.find(function (item) {
    return item.name === 'spaceship';
  });
  const transactionPath = spaceship && spaceship.state === 'active' ?
    '/api/transactions?fromHeight=' + spaceship.activationHeight + '&limit=100&orderBy=timestamp:desc' :
    '/api/transactions?limit=100&orderBy=timestamp:desc';
  const results = await Promise.all([
    client.get('/api/blocks/getStatus'),
    client.get('/api/blocks?limit=1&orderBy=height:desc'),
    client.get('/api/delegates?limit=101'),
    client.get(transactionPath),
    client.get('/api/peers?state=2&limit=100')
  ]);
  const paths = [
    '/api/blocks/getStatus',
    '/api/blocks?limit=1&orderBy=height:desc',
    '/api/delegates?limit=101',
    transactionPath,
    '/api/peers?state=2&limit=100'
  ];

  results.forEach(function (result, index) {
    assertSuccessfulConsensusResponse(context, result, node, paths[index]);
  });

  const blockStatus = results[0].body;
  const latestBlock = results[1].body.blocks && results[1].body.blocks[0] || {};
  const delegates = results[2].body.delegates || [];
  const transactions = results[3].body.transactions || [];
  const peers = results[4].body.peers || [];
  const supply = blockStatus.supply === undefined ? network.supply : blockStatus.supply;

  return {
    id: node.id,
    role: node.consensusRole,
    apiUrl: node.apiUrl,
    version: formatObservedNodeVersion(status.version),
    height,
    loaded: status.loader && status.loader.loaded,
    syncing: status.loader && status.loader.syncing,
    ready: Boolean(status.loader && status.loader.loaded && !status.loader.syncing),
    cachedConsensus: status.loader && status.loader.consensus,
    nethash: network.nethash,
    broadhash: network.broadhash,
    latestBlock: {
      id: latestBlock.id,
      height: latestBlock.height,
      generatorPublicKey: latestBlock.generatorPublicKey
    },
    liveConsensus: calculateLiveBroadhashConsensus(network.broadhash, peers),
    delegates: summarizeConsensusDelegates(delegates),
    transactions: summarizeConsensusTransactions(transactions, transactionPath),
    activations: definitions.map(function (definition) {
      const consensusSwitch = switches.find(function (item) {
        return item.name === definition.name;
      });

      return buildConsensusActivationObservation(
          definition,
          consensusSwitch,
          delegates,
          transactions,
          supply
      );
    })
  };
}

/**
 * Requires a successful JSON response for one consensus probe.
 * @param {object} context - Runner context.
 * @param {object} result - HTTP client result.
 * @param {object} node - Node being inspected.
 * @param {string} path - Requested API path.
 */
function assertSuccessfulConsensusResponse (context, result, node, path) {
  context.assert(
      result.ok && result.body && result.body.success,
      'Unable to read ' + path + ' from ' + node.consensusRole + ' at ' + node.apiUrl +
      ': ' + formatApiError(result.body)
  );
}

/**
 * Builds height state and behavioral evidence for one activation.
 * @param {object} definition - Activation behavior definition.
 * @param {?object} consensusSwitch - Height-derived activation state.
 * @param {Array<object>} delegates - Delegates returned by the node.
 * @param {Array<object>} transactions - Transactions returned by the node.
 * @param {string|number} supply - Current token supply in atomic units.
 */
function buildConsensusActivationObservation (
    definition,
    consensusSwitch,
    delegates,
    transactions,
    supply
) {
  const activation = consensusSwitch || {
    name: definition.name,
    activationHeight: null,
    state: 'unknown',
    distance: null
  };
  let evidence;

  if (definition.name === 'fairSystem') {
    const rankingField = activation.state === 'active' ? 'votesWeight' : 'vote';
    const sorted = isDelegateListSorted(delegates, rankingField);
    const approval = validateDelegateApproval(delegates, rankingField, supply);

    evidence = {
      kind: 'delegate ranking and approval',
      rankingField,
      delegateCount: delegates.length,
      sorted,
      approvalChecked: approval.checked,
      approvalMismatches: approval.mismatches,
      summary: delegates.length +
        ' delegates; order by ' +
        rankingField +
        ' descending with publicKey tie-breaker=' +
        sorted +
        '; approval matches ' +
        rankingField +
        '/supply for ' +
        (approval.checked - approval.mismatches) +
        '/' +
        approval.checked +
        ' delegates.'
    };

    return Object.assign({}, activation, {
      purpose: definition.purpose,
      evidence,
      passed: delegates.length > 0 &&
        sorted &&
        approval.checked === delegates.length &&
        approval.mismatches === 0
    });
  }

  const timestampEvidence = inspectTimestampMs(transactions);
  const expectedPresence = activation.state === 'active';
  const contradictory = expectedPresence ?
    timestampEvidence.sampled > 0 && timestampEvidence.present !== timestampEvidence.sampled :
    timestampEvidence.present > 0;

  evidence = {
    kind: 'transaction timestamp precision',
    transactionCount: timestampEvidence.sampled,
    timestampMsPresent: timestampEvidence.present,
    timestampMsMissing: timestampEvidence.missing,
    invalidTimestampMs: timestampEvidence.invalid,
    expectedPresence,
    conclusive: !expectedPresence || timestampEvidence.sampled > 0,
    summary: timestampEvidence.sampled +
      ' transactions sampled; timestampMs present=' +
      timestampEvidence.present +
      ', missing=' +
      timestampEvidence.missing +
      ', outside the timestamp second=' +
      timestampEvidence.invalid +
      '; expected presence=' +
      expectedPresence +
      '; conclusive=' +
      (!expectedPresence || timestampEvidence.sampled > 0) +
      '.'
  };

  return Object.assign({}, activation, {
    purpose: definition.purpose,
    evidence,
    passed: !contradictory && timestampEvidence.invalid === 0
  });
}

/**
 * Summarizes delegate data needed for cross-node agreement.
 * @param {Array<object>} delegates - Delegate API rows.
 */
function summarizeConsensusDelegates (delegates) {
  const publicKeys = delegates.map(function (delegate) {
    return delegate.publicKey;
  });

  return {
    count: delegates.length,
    firstPublicKey: publicKeys[0] || null,
    orderChecksum: crypto.createHash('sha256').update(publicKeys.join(',')).digest('hex')
  };
}

/**
 * Summarizes the bounded transaction sample used for spaceship evidence.
 * @param {Array<object>} transactions - Transaction API rows.
 * @param {string} path - Exact API path used for the sample.
 */
function summarizeConsensusTransactions (transactions, path) {
  const timestampMs = inspectTimestampMs(transactions);

  return Object.assign({
    path
  }, timestampMs);
}

/**
 * Checks deterministic descending numeric order with public-key tie-breaking.
 * @param {Array<object>} delegates - Delegate API rows.
 * @param {string} rankingField - Numeric delegate ranking field.
 */
function isDelegateListSorted (delegates, rankingField) {
  return delegates.every(function (delegate, index) {
    if (index === 0) {
      return true;
    }

    const previous = delegates[index - 1];
    const previousValue = Number(previous[rankingField] || 0);
    const value = Number(delegate[rankingField] || 0);

    if (previousValue !== value) {
      return previousValue > value;
    }

    return String(previous.publicKey) <= String(delegate.publicKey);
  });
}

/**
 * Validates delegate approval percentages against the activation-selected balance field.
 * @param {Array<object>} delegates - Delegate API rows.
 * @param {string} rankingField - `vote` or `votesWeight`.
 * @param {string|number} supply - Current token supply in atomic units.
 */
function validateDelegateApproval (delegates, rankingField, supply) {
  const numericSupply = Number(supply);
  let checked = 0;
  let mismatches = 0;

  delegates.forEach(function (delegate) {
    if (!Number.isFinite(numericSupply) || numericSupply <= 0 || !Number.isFinite(Number(delegate.approval))) {
      return;
    }

    const expected = Math.round(Number(delegate[rankingField]) / numericSupply * 100 * 1e2) / 1e2;

    checked++;
    if (expected !== Number(delegate.approval)) {
      mismatches++;
    }
  });

  return {
    checked,
    mismatches
  };
}

/**
 * Counts present, missing, and invalid millisecond timestamps in transaction rows.
 * @param {Array<object>} transactions - Transaction API rows.
 */
function inspectTimestampMs (transactions) {
  return transactions.reduce(function (summary, transaction) {
    const timestampMs = transaction.timestampMs;

    summary.sampled++;
    if (typeof timestampMs !== 'number') {
      summary.missing++;
      return summary;
    }

    summary.present++;
    if (timestampMs - Number(transaction.timestamp) * 1000 < 0 ||
        timestampMs - Number(transaction.timestamp) * 1000 >= constants.maxTimestampMsDelta) {
      summary.invalid++;
    }

    return summary;
  }, {
    sampled: 0,
    present: 0,
    missing: 0,
    invalid: 0
  });
}

/**
 * Compares the recipient and peer observations without treating normal height drift as a fork.
 * @param {Array<object>} nodes - Recipient and peer consensus observations.
 * @param {number} maxHeightDrift - Maximum accepted height difference.
 */
function buildConsensusAgreement (nodes, maxHeightDrift) {
  const recipient = nodes[0];
  const peer = nodes[1];
  const heightDrift = Math.abs(recipient.height - peer.height);
  const sameHeight = heightDrift === 0;
  const checks = {
    nethash: recipient.nethash === peer.nethash,
    heightDrift: heightDrift <= maxHeightDrift,
    broadhash: sameHeight ? recipient.broadhash === peer.broadhash : null,
    latestBlock: sameHeight ? recipient.latestBlock.id === peer.latestBlock.id : null,
    delegateOrder: sameHeight ?
      recipient.delegates.orderChecksum === peer.delegates.orderChecksum :
      null,
    activationState: sameHeight ?
      recipient.activations.every(function (activation, index) {
        return activation.state === peer.activations[index].state;
      }) :
      null
  };
  const failures = [];

  if (!checks.nethash) {
    failures.push('node-recipient and node-peer report different nethashes');
  }
  if (!checks.heightDrift) {
    failures.push('height drift ' + heightDrift + ' exceeds allowed drift ' + maxHeightDrift);
  }
  if (checks.broadhash === false) {
    failures.push('equal-height nodes report different broadhashes');
  }
  if (checks.latestBlock === false) {
    failures.push('equal-height nodes report different latest blocks');
  }
  if (checks.delegateOrder === false) {
    failures.push('equal-height nodes report different delegate ordering');
  }
  if (checks.activationState === false) {
    failures.push('equal-height nodes report different activation states');
  }

  return {
    recipient: recipient.role,
    peer: peer.role,
    heightDrift,
    maxHeightDrift,
    sameHeight,
    checks,
    failures,
    passed: failures.length === 0
  };
}

/**
 * Publishes a bounded happy-path transaction flow from test fixture funds.
 * @param {object} context - Runner context.
 */
async function runTransactionHappyPathScenario (context) {
  const fixture = context.fixtureAccounts.transfer;

  if (!fixture || !fixture.secret) {
    return context.skip('No funded transfer fixture account found in genesis passes.');
  }

  const node = context.primaryNode;
  const client = context.clientFor(node);
  const funded = accountFromFixture(fixture);
  const fresh = tx.createAccount();
  const recipient = tx.createAccount();
  const signatureAccount = tx.createAccount();
  const secondSignatureKey = tx.createAccount();
  const multisignatureAccount = tx.createAccount();
  const multisignatureMember = tx.createAccount();
  const transactions = [];
  const rejections = [];
  const expectedFailures = [];

  await submitAcceptedTransaction(
      context,
      client,
      transactions,
      tx.createSendTransaction(funded, fresh.address, context.options.fundingAmount),
      'fund fresh account'
  );
  await submitAcceptedTransaction(
      context,
      client,
      transactions,
      tx.createSendTransaction(funded, signatureAccount.address, SIDE_ACCOUNT_FUNDING_AMOUNT),
      'fund signature account'
  );
  await submitAcceptedTransaction(
      context,
      client,
      transactions,
      tx.createSendTransaction(funded, multisignatureAccount.address, SIDE_ACCOUNT_FUNDING_AMOUNT),
      'fund multisignature account'
  );

  if (context.options.waitBlocks > 0) {
    await waitForBlocks(context, context.options.waitBlocks);
  }
  await waitForAccountBalance(context, client, fresh.address, context.options.fundingAmount, 'fresh account funding');
  await waitForAccountBalance(context, client, signatureAccount.address, SIDE_ACCOUNT_FUNDING_AMOUNT, 'signature account funding');
  await waitForAccountBalance(context, client, multisignatureAccount.address, SIDE_ACCOUNT_FUNDING_AMOUNT, 'multisignature account funding');

  const send = tx.createSendTransaction(fresh, recipient.address, context.options.transferAmount);
  await submitTransaction(context, client, '/api/transactions/process', { transaction: send }, 'fresh account send');
  transactions.push(publicTransaction(send));

  const delegateName = 'live' + crypto.randomBytes(5).toString('hex');
  const delegate = tx.createDelegateTransaction(fresh, delegateName);
  const delegateResult = await client.post('/api/delegates', delegate);
  context.metrics.latency('transaction.submit', delegateResult.latencyMs);
  // Some live targets may not accept every follow-up transaction before the next block; keep those visible as rejections.
  if (delegateResult.body && delegateResult.body.success) {
    transactions.push(publicTransaction(delegate));
  } else {
    recordTransactionRejection(context, rejections, 'delegate-registration', delegateResult);
  }

  const delegates = await client.get('/api/delegates?limit=1');
  const voteTarget = delegates.body && delegates.body.delegates && delegates.body.delegates[0];

  if (voteTarget && voteTarget.publicKey) {
    const vote = tx.createVoteTransaction(fresh, ['+' + voteTarget.publicKey]);
    const voteResult = await client.post('/api/accounts/delegates', vote);
    context.metrics.latency('transaction.submit', voteResult.latencyMs);
    if (voteResult.body && voteResult.body.success) {
      transactions.push(publicTransaction(vote));
      await waitForAccountDelegate(context, client, fresh.address, voteTarget.publicKey, true, 'vote confirmation');
    } else {
      recordTransactionRejection(context, rejections, 'vote', voteResult);
    }

    const unvote = tx.createVoteTransaction(fresh, ['-' + voteTarget.publicKey]);
    const unvoteResult = await client.post('/api/accounts/delegates', unvote);
    context.metrics.latency('transaction.submit', unvoteResult.latencyMs);
    if (unvoteResult.body && unvoteResult.body.success) {
      transactions.push(publicTransaction(unvote));
    } else {
      recordTransactionRejection(context, rejections, 'unvote', unvoteResult);
    }
  }

  for (const chatType of Object.values(transactionTypes.CHAT_MESSAGE_TYPES)) {
    const chat = tx.createChatTransaction(fresh, recipient.address, chatType);
    const chatResult = await client.post('/api/transactions', { transaction: chat });

    context.metrics.latency('transaction.submit', chatResult.latencyMs);
    if (chatResult.body && chatResult.body.success) {
      transactions.push(publicTransaction(chat, 'chat-' + tx.getChatMessageTypeName(chatType).toLowerCase()));
    } else {
      recordTransactionRejection(context, rejections, 'chat-' + tx.getChatMessageTypeName(chatType).toLowerCase(), chatResult);
    }
  }

  for (const stateType of [0, 1]) {
    const state = tx.createStateTransaction(fresh, 'live-test-' + crypto.randomBytes(4).toString('hex'), 'ok', stateType);
    const stateResult = await client.post('/api/transactions', { transaction: state });

    context.metrics.latency('transaction.submit', stateResult.latencyMs);
    if (stateResult.body && stateResult.body.success) {
      transactions.push(publicTransaction(state, 'state-type-' + stateType));
    } else {
      recordTransactionRejection(context, rejections, 'state-type-' + stateType, stateResult);
    }
  }

  await submitAcceptedTransaction(
      context,
      client,
      transactions,
      tx.createSignatureTransaction(signatureAccount, secondSignatureKey),
      'second-signature registration'
  );
  await submitAcceptedTransaction(
      context,
      client,
      transactions,
      tx.createMultisignatureTransaction(multisignatureAccount, [multisignatureMember]),
      'multisignature registration'
  );

  const dappName = 'live' + crypto.randomBytes(5).toString('hex');
  const dappLink = 'https://example.com/' + dappName + '.zip';
  const dapp = await submitAcceptedApiTransaction(
      context,
      client,
      transactions,
      'put',
      '/api/dapps',
      {
        secret: fresh.secret,
        category: 0,
        name: dappName,
        description: 'ADAMANT live test dapp',
        tags: 'live-test',
        type: 1,
        link: dappLink
      },
      'dapp-registration',
      transactionTypes.DAPP
  );

  if (context.options.waitBlocks > 0) {
    await waitForBlocks(context, context.options.waitBlocks);
  }
  await waitForDapp(context, client, dapp.id, 'dapp registration');

  await submitAcceptedApiTransaction(
      context,
      client,
      transactions,
      'put',
      '/api/dapps/transaction',
      {
        secret: fresh.secret,
        amount: context.options.transferAmount,
        dappId: dapp.id
      },
      'dapp-in-transfer',
      transactionTypes.IN_TRANSFER
  );
  await submitAcceptedApiTransaction(
      context,
      client,
      transactions,
      'put',
      '/api/dapps/withdrawal',
      {
        secret: fresh.secret,
        recipientId: recipient.address,
        amount: context.options.transferAmount,
        dappId: dapp.id,
        transactionId: String(Date.now()).slice(0, 13)
      },
      'dapp-out-transfer',
      transactionTypes.OUT_TRANSFER
  );

  context.metrics.increment('transactions.accepted', transactions.length);

  return {
    fundedAccount: tx.publicFixtureAccount(fixture),
    freshAccount: {
      address: fresh.address,
      publicKey: fresh.publicKey
    },
    transactions,
    rejections,
    expectedFailures
  };
}

/**
 * Publishes bounded invalid, duplicate, and double-spend attempts.
 * @param {object} context - Runner context.
 */
async function runTransactionAbuseScenario (context) {
  const fixture = context.fixtureAccounts.transfer;

  if (!fixture || !fixture.secret) {
    return context.skip('No funded transfer fixture account found in genesis passes.');
  }

  const client = context.clientFor(context.primaryNode);
  const funded = accountFromFixture(fixture);
  const recipient = tx.createAccount();
  const duplicateRecipient = tx.createAccount();
  const overspendSender = tx.createAccount();
  const overspendRecipient = tx.createAccount();
  const concurrentSpendSender = tx.createAccount();
  const secondSignatureKey = tx.createAccount();
  const multisignatureMember = tx.createAccount();
  const valid = tx.createSendTransaction(funded, recipient.address, context.options.transferAmount);
  const invalidSignature = cloneTransaction(valid);

  Object.assign(invalidSignature, {
    id: undefined,
    signature: crypto.randomBytes(64).toString('hex')
  });

  const negativeAmount = tx.createSendTransaction(funded, recipient.address, context.options.transferAmount);
  negativeAmount.amount = -1;
  tx.resignTransaction(negativeAmount, funded);

  const invalidDelegate = tx.createDelegateTransaction(funded, '');
  tx.resignTransaction(invalidDelegate, funded);

  const invalidVote = tx.createVoteTransaction(funded, ['+' + crypto.randomBytes(8).toString('hex')]);

  const invalidSignatureRegistration = tx.createSignatureTransaction(funded, secondSignatureKey);
  invalidSignatureRegistration.asset.signature.publicKey = crypto.randomBytes(8).toString('hex');
  tx.resignTransaction(invalidSignatureRegistration, funded);

  const invalidMultisignature = tx.createMultisignatureTransaction(funded, [multisignatureMember]);
  invalidMultisignature.asset.multisignature.min = 2;
  tx.resignTransaction(invalidMultisignature, funded);

  const invalidChat = tx.createChatTransaction(funded, recipient.address, transactionTypes.CHAT_MESSAGE_TYPES.ORDINARY_MESSAGE);
  invalidChat.asset.chat.type = 99;
  tx.resignTransaction(invalidChat, funded);

  const invalidState = tx.createStateTransaction(funded, 'bad-state', 'ok', 2);

  const invalidDapp = tx.createDappTransaction(funded, {
    category: 0,
    name: 'bad' + crypto.randomBytes(5).toString('hex'),
    description: 'Expected abuse rejection',
    tags: 'live-test',
    type: 1,
    link: 'https://example.com/not-a-zip.txt'
  });

  const unknownDappId = '8713095156789756398';
  const invalidInTransfer = tx.createInTransferTransaction(funded, unknownDappId, context.options.transferAmount);
  const invalidOutTransfer = tx.createOutTransferTransaction(
      funded,
      recipient.address,
      unknownDappId,
      String(Date.now()).slice(0, 13),
      context.options.transferAmount
  );

  const checks = [
    {
      id: 'invalid-signature',
      type: valid.type,
      reason: 'Primary signature is random bytes and must not verify against signed transaction bytes.',
      request: function () {
        return client.post('/api/transactions/process', { transaction: invalidSignature });
      }
    },
    {
      id: 'negative-amount',
      type: negativeAmount.type,
      reason: 'SEND amount is negative even though the transaction is correctly signed after mutation.',
      request: function () {
        return client.post('/api/transactions/process', { transaction: negativeAmount });
      }
    },
    {
      id: 'malformed-json-shape',
      type: null,
      reason: 'Payload is not a valid transaction object and should be rejected by schema or transaction normalization.',
      request: function () {
        return client.post('/api/transactions/process', { transaction: { type: 'bad' } });
      }
    },
    {
      id: 'unknown-transaction-type',
      type: 999,
      reason: 'Transaction type is outside the registered ADM transaction type range.',
      request: function () {
        return client.post('/api/transactions/process', { transaction: { type: 999, timestamp: 1, asset: {} } });
      }
    },
    {
      id: 'delegate-empty-username',
      type: invalidDelegate.type,
      reason: 'Delegate registration uses an empty username.',
      request: function () {
        return client.post('/api/transactions/process', { transaction: invalidDelegate });
      }
    },
    {
      id: 'vote-invalid-public-key',
      type: invalidVote.type,
      reason: 'Vote operation references a malformed delegate public key.',
      request: function () {
        return client.post('/api/transactions/process', { transaction: invalidVote });
      }
    },
    {
      id: 'signature-invalid-public-key',
      type: invalidSignatureRegistration.type,
      reason: 'Second-signature registration carries a public key with invalid length.',
      request: function () {
        return client.post('/api/transactions/process', { transaction: invalidSignatureRegistration });
      }
    },
    {
      id: 'multisignature-min-exceeds-keygroup',
      type: invalidMultisignature.type,
      reason: 'Multisignature minimum exceeds keysgroup size.',
      request: function () {
        return client.post('/api/transactions/process', { transaction: invalidMultisignature });
      }
    },
    {
      id: 'chat-invalid-subtype',
      type: invalidChat.type,
      subtype: invalidChat.asset.chat.type,
      reason: 'Chat message subtype is outside the allowed 0..3 range.',
      request: function () {
        return client.post('/api/transactions/process', { transaction: invalidChat });
      }
    },
    {
      id: 'state-invalid-subtype',
      type: invalidState.type,
      subtype: invalidState.asset.state.type,
      reason: 'State subtype is outside the allowed 0..1 range.',
      request: function () {
        return client.post('/api/transactions/process', { transaction: invalidState });
      }
    },
    {
      id: 'dapp-invalid-link-extension',
      type: invalidDapp.type,
      reason: 'DApp link is syntactically valid but does not point to a .zip file.',
      request: function () {
        return client.post('/api/transactions/process', { transaction: invalidDapp });
      }
    },
    {
      id: 'in-transfer-unknown-dapp',
      type: invalidInTransfer.type,
      reason: 'DApp in-transfer references a DApp id that is not registered on chain.',
      request: function () {
        return client.post('/api/transactions/process', { transaction: invalidInTransfer });
      }
    },
    {
      id: 'out-transfer-unknown-dapp',
      type: invalidOutTransfer.type,
      reason: 'DApp out-transfer references a DApp id that is not registered on chain.',
      request: function () {
        return client.post('/api/transactions/process', { transaction: invalidOutTransfer });
      }
    }
  ];
  const results = [];

  for (const check of checks) {
    results.push(await submitAbuseCheck(context, check));
  }

  // Keep repeated invalid submissions intentionally small; public testnet safety matters.
  const repeatedInvalid = [];
  for (let index = 0; index < context.options.repeatedInvalidCount; index++) {
    repeatedInvalid.push(await submitAbuseCheck(context, {
      id: 'repeated-invalid-' + index,
      type: null,
      reason: 'Repeated malformed payload must remain rejected without poisoning transaction state.',
      request: function () {
        return client.post('/api/transactions/process', { transaction: { type: 'bad', repeat: index } });
      }
    }));
  }
  results.push({
    id: 'repeated-invalid-submissions',
    reason: 'Small repeated malformed burst verifies stable rejection over multiple attempts.',
    rejected: true,
    rejectedBy: 'node validation',
    attempts: repeatedInvalid.length
  });

  const duplicate = tx.createSendTransaction(funded, duplicateRecipient.address, context.options.transferAmount);
  const duplicateFirst = await client.post('/api/transactions/process', { transaction: duplicate });
  const duplicateSecond = await client.post('/api/transactions/process', { transaction: duplicate });

  context.metrics.latency('abuse.submit', duplicateFirst.latencyMs);
  context.metrics.latency('abuse.submit', duplicateSecond.latencyMs);
  context.assert(duplicateFirst.body && duplicateFirst.body.success, 'Duplicate setup transaction was rejected: ' + formatApiError(duplicateFirst.body));
  context.assert(!duplicateSecond.body || duplicateSecond.body.success === false, 'Duplicate transaction unexpectedly succeeded.');
  context.metrics.increment('abuse.rejected');
  results.push({
    id: 'duplicate-transaction',
    type: duplicate.type,
    typeName: tx.getTransactionTypeName(duplicate.type),
    reason: 'Exact same transaction id is submitted twice; second admission must be rejected as duplicate.',
    rejected: true,
    rejectedBy: classifyRejection(duplicateSecond).rejectedBy,
    howRejected: classifyRejection(duplicateSecond).howRejected,
    status: duplicateSecond.status,
    error: duplicateSecond.body && (duplicateSecond.body.error || duplicateSecond.body.message)
  });

  const funding = tx.createSendTransaction(funded, overspendSender.address, 3 * 100000000);
  await submitTransaction(context, client, '/api/transactions/process', { transaction: funding }, 'overspend funding');

  if (context.options.waitBlocks > 0) {
    await waitForBlocks(context, context.options.waitBlocks);
  }
  await waitForAccountBalance(context, client, overspendSender.address, 3 * 100000000, 'overspend funding');

  const overspend = tx.createSendTransaction(overspendSender, overspendRecipient.address, 350000000);
  const overspendResult = await client.post('/api/transactions/process', { transaction: overspend });

  context.metrics.latency('abuse.submit', overspendResult.latencyMs);
  context.assert(!overspendResult.body || overspendResult.body.success === false, 'Confirmed-balance overspend unexpectedly succeeded.');
  context.metrics.increment('abuse.rejected');
  results.push({
    id: 'confirmed-balance-overspend',
    type: overspend.type,
    typeName: tx.getTransactionTypeName(overspend.type),
    reason: 'A single signed SEND spends more than the sender confirmed balance plus fee.',
    rejected: true,
    rejectedBy: classifyRejection(overspendResult).rejectedBy,
    howRejected: classifyRejection(overspendResult).howRejected,
    status: overspendResult.status,
    error: overspendResult.body && (overspendResult.body.error || overspendResult.body.message)
  });

  const concurrentOverspend = await runConcurrentBalanceOverspend(
      context,
      client,
      funded,
      concurrentSpendSender
  );
  results.push(concurrentOverspend);

  const overload = await runTransactionOverload(context, client);
  const scenarioResult = {
    checks: results,
    repeatedInvalid,
    overload
  };

  if (!concurrentOverspend.passed) {
    const error = Error(
        'Concurrent balance overspend expected 2 confirmed and 1 not confirmed, got ' +
        concurrentOverspend.confirmedCount +
        ' confirmed and ' +
        concurrentOverspend.notConfirmedCount +
        ' not confirmed.'
    );

    error.result = scenarioResult;
    throw error;
  }

  return scenarioResult;
}

/**
 * Checks localnet delegate and forging related public/private API state.
 * @param {object} context - Runner context.
 */
async function runDelegatesScenario (context) {
  const results = [];

  for (const node of context.target.nodes) {
    const client = context.clientFor(node);
    const forgingStatus = await client.get('/api/delegates/forging/status');
    const delegates = await client.get('/api/delegates?limit=101');
    const nextForgers = await client.get('/api/delegates/getNextForgers?limit=10');
    const nodeStatus = await client.get('/api/node/status');
    const peers = await client.get('/api/peers?limit=100');
    const blocks = await client.get('/api/blocks?limit=1&orderBy=height:desc');

    context.metrics.latency('delegates.status', forgingStatus.latencyMs);
    context.metrics.latency('delegates.list', delegates.latencyMs);
    context.metrics.latency('delegates.next-forgers', nextForgers.latencyMs);
    context.metrics.latency('delegates.node-status', nodeStatus.latencyMs);
    context.metrics.latency('delegates.peers', peers.latencyMs);
    context.metrics.latency('delegates.latest-block', blocks.latencyMs);
    context.assert(
        forgingStatus.ok && forgingStatus.body && forgingStatus.body.success,
        'Unable to read forging status for ' + node.id
    );
    context.assert(delegates.ok && delegates.body && delegates.body.success, 'Unable to list delegates for ' + node.id);
    context.assert(nextForgers.ok && nextForgers.body && nextForgers.body.success, 'Unable to list next forgers for ' + node.id);
    context.assert(nodeStatus.ok && nodeStatus.body && nodeStatus.body.success, 'Unable to read node status for ' + node.id);
    context.assert(peers.ok && peers.body && peers.body.success, 'Unable to list peers for ' + node.id);
    context.assert(blocks.ok && blocks.body && blocks.body.success, 'Unable to read latest block for ' + node.id);

    const network = nodeStatus.body.network || {};
    const loader = nodeStatus.body.loader || {};
    const latestBlock = blocks.body.blocks && blocks.body.blocks[0];

    context.assert(latestBlock, 'Latest block is missing for ' + node.id);

    const forged = await client.get(
        '/api/delegates/forging/getForgedByAccount?generatorPublicKey=' +
        encodeURIComponent(latestBlock.generatorPublicKey)
    );

    context.metrics.latency('delegates.generator-forged', forged.latencyMs);
    context.assert(
        forged.ok && forged.body && forged.body.success,
        'Unable to read forged totals for latest block generator on ' + node.id
    );

    results.push({
      id: node.id,
      apiUrl: node.apiUrl,
      delegateSecretsCount: node.delegateSecretsCount,
      forging: {
        enabled: forgingStatus.body.enabled,
        configuredDelegateCount: (forgingStatus.body.delegates || []).length,
        configuredDelegatePublicKeys: forgingStatus.body.delegates || []
      },
      delegates: {
        returnedCount: (delegates.body.delegates || []).length,
        totalCount: delegates.body.totalCount
      },
      nextForgers: {
        currentBlock: nextForgers.body.currentBlock,
        currentBlockSlot: nextForgers.body.currentBlockSlot,
        currentSlot: nextForgers.body.currentSlot,
        publicKeys: nextForgers.body.delegates || []
      },
      network: {
        height: network.height,
        nethash: network.nethash,
        broadhash: network.broadhash
      },
      consensus: Object.assign(
          {
            cachedPercent: Number.isFinite(loader.consensus) ? loader.consensus : null,
            switches: buildConsensusSwitches(
                network.height,
                context.configMetadata.consensusActivationHeights || {}
            )
          },
          calculateLiveBroadhashConsensus(network.broadhash, peers.body.peers)
      ),
      rewardStage: buildRewardStage(network.height, network),
      latestBlock: publicBlockForgingResult(latestBlock),
      latestGeneratorForged: {
        publicKey: latestBlock.generatorPublicKey,
        fees: String(forged.body.fees),
        feesAdm: formatAdamantAmount(forged.body.fees),
        rewards: String(forged.body.rewards),
        rewardsAdm: formatAdamantAmount(forged.body.rewards),
        forged: String(forged.body.forged),
        forgedAdm: formatAdamantAmount(forged.body.forged)
      }
    });
  }

  // Attribute the latest generator only after every node's configured forging keys are known.
  results.forEach(function (result) {
    result.latestBlock.generatorNodeIds = results.filter(function (candidate) {
      return candidate.forging.configuredDelegatePublicKeys.indexOf(result.latestBlock.generatorPublicKey) !== -1;
    }).map(function (candidate) {
      return candidate.id;
    });
  });

  return {
    nodes: results
  };
}

/**
 * Calculates live broadhash agreement from connected peer records.
 * @param {string} broadhash - Local node broadhash.
 * @param {Array<object>} peers - Peer records returned by `/api/peers`.
 */
function calculateLiveBroadhashConsensus (broadhash, peers) {
  const connectedPeers = (peers || []).filter(function (peer) {
    return peer.state === 2;
  });
  const matchingPeers = connectedPeers.filter(function (peer) {
    return peer.broadhash === broadhash;
  });

  return {
    connectedPeers: connectedPeers.length,
    matchingPeers: matchingPeers.length,
    livePercent: broadhash && connectedPeers.length ?
      Math.round(matchingPeers.length / connectedPeers.length * 100 * 1e2) / 1e2 :
      null
  };
}

/**
 * Builds observed activation state for each configured consensus switch.
 * @param {number} height - Current node height.
 * @param {object} activationHeights - Consensus switch activation heights.
 */
function buildConsensusSwitches (height, activationHeights) {
  return Object.keys(activationHeights).sort().map(function (name) {
    const activationHeight = activationHeights[name];

    return {
      name,
      activationHeight,
      state: height >= activationHeight ? 'active' : 'inactive',
      distance: activationHeight - height
    };
  });
}

/**
 * Describes the configured block reward stage observed at a node height.
 * @param {number} height - Current node height.
 * @param {object} network - Network status payload.
 */
function buildRewardStage (height, network) {
  const rewards = constants.rewards;
  const lastStageIndex = rewards.milestones.length - 1;
  const preReward = height < rewards.offset;
  const stageIndex = preReward ?
    null :
    Math.min(Math.floor((height - rewards.offset) / rewards.distance), lastStageIndex);
  const stageStartHeight = preReward ? 0 : rewards.offset + stageIndex * rewards.distance;
  const stageEndHeight = preReward ?
    rewards.offset - 1 :
    stageIndex === lastStageIndex ? null : stageStartHeight + rewards.distance - 1;
  const nextStageHeight = preReward ?
    rewards.offset :
    stageIndex === lastStageIndex ? null : stageEndHeight + 1;
  const nextReward = preReward ?
    rewards.milestones[0] :
    stageIndex === lastStageIndex ? null : rewards.milestones[stageIndex + 1];
  const configuredReward = preReward ? 0 : rewards.milestones[stageIndex];

  return {
    name: preReward ? 'pre-reward' : 'milestone-' + stageIndex,
    active: !preReward,
    stageIndex,
    protocolMilestone: network.milestone,
    startHeight: stageStartHeight,
    endHeight: stageEndHeight,
    currentReward: String(network.reward === undefined ? configuredReward : network.reward),
    currentRewardAdm: formatAdamantAmount(
        network.reward === undefined ? configuredReward : network.reward
    ),
    configuredReward: String(configuredReward),
    configuredRewardAdm: formatAdamantAmount(configuredReward),
    nextStageHeight,
    nextReward: nextReward === null ? null : String(nextReward),
    nextRewardAdm: nextReward === null ? null : formatAdamantAmount(nextReward),
    supply: String(network.supply),
    supplyAdm: formatAdamantAmount(network.supply)
  };
}

/**
 * Selects report-safe forging fields from the latest block.
 * @param {object} block - Latest block returned by the blocks API.
 */
function publicBlockForgingResult (block) {
  return {
    id: block.id,
    height: block.height,
    generatorPublicKey: block.generatorPublicKey,
    generatorId: block.generatorId,
    reward: String(block.reward),
    rewardAdm: formatAdamantAmount(block.reward),
    totalFee: String(block.totalFee),
    totalFeeAdm: formatAdamantAmount(block.totalFee),
    totalForged: String(block.totalForged),
    totalForgedAdm: formatAdamantAmount(block.totalForged),
    confirmations: block.confirmations
  };
}

/**
 * Formats an integer amount in ADAMANT atomic units as ADM without precision loss.
 * @param {string|number} amount - Integer amount in atomic units.
 */
function formatAdamantAmount (amount) {
  const rawAmount = String(amount === undefined || amount === null ? 0 : amount);
  const negative = rawAmount.charAt(0) === '-';
  const digits = negative ? rawAmount.slice(1) : rawAmount;
  // Keep this string-based because total supply is larger than Number.MAX_SAFE_INTEGER.
  const padded = digits.padStart(9, '0');
  const whole = padded.slice(0, -8) || '0';
  const fraction = padded.slice(-8).replace(/0+$/, '');

  return (negative ? '-' : '') + whole + (fraction ? '.' + fraction : '');
}

/**
 * Runs the selected normal HTTP load profile.
 * @param {object} context - Runner context.
 */
async function runLoadScenario (context) {
  const profileName = NORMAL_LOAD_PROFILES[context.options.profile] ? context.options.profile : 'baseline';
  const profile = NORMAL_LOAD_PROFILES[profileName];

  return runHttpLoad(context, profileName, profile, false);
}

/**
 * Runs the selected opt-in stress profile.
 * @param {object} context - Runner context.
 */
async function runHttpStressScenario (context) {
  const profileName = STRESS_LOAD_PROFILES[context.options.profile] ? context.options.profile : 'overload';
  const profile = STRESS_LOAD_PROFILES[profileName];

  return runHttpLoad(context, profileName, profile, true);
}

/**
 * Continuously submits valid type 0 transfers and observes pool propagation and draining.
 * @param {object} context - Runner context.
 */
async function runType0TxQueueStressScenario (context) {
  return runTxQueueStressScenario(context, transactionTypes.SEND);
}

/**
 * Continuously submits valid type 8 chat messages and observes pool propagation and draining.
 * @param {object} context - Runner context.
 */
async function runType8TxQueueStressScenario (context) {
  return runTxQueueStressScenario(context, transactionTypes.CHAT_MESSAGE);
}

/**
 * Pre-generates type 0 transfers and submits the complete in-memory batch concurrently.
 * @param {object} context - Runner context.
 */
async function runType0TxBurstStressScenario (context) {
  return runTxQueueStressScenario(context, transactionTypes.SEND, {
    mode: 'burst',
    transactionCount: TXBURST_TYPE0_COUNT
  });
}

/**
 * Runs a bounded transaction load workload for one transaction type.
 * @param {object} context - Runner context.
 * @param {number} transactionType - Transaction type generated by the workload.
 * @param {object} [workloadOptions] - Optional workload mode and limits.
 */
async function runTxQueueStressScenario (context, transactionType, workloadOptions) {
  const fixture = context.fixtureAccounts.transfer;

  if (!fixture || !fixture.secret) {
    return context.skip('No funded transfer fixture account found in genesis passes.');
  }

  const node = context.primaryNode;
  const client = context.clientFor(node);
  const sender = accountFromFixture(fixture);
  const snapshots = [];
  const statusCodes = {};
  const rejectionReasons = {};
  const acceptedTransactionIds = [];
  const workloadDetails = {
    messageLengthMin: null,
    messageLengthMax: null,
    messageLengthTotal: 0,
    feeMin: null,
    feeMax: null
  };
  const startedAt = Date.now();
  const workloadMode = workloadOptions && workloadOptions.mode === 'burst' ? 'burst' : 'continuous';
  const configuredTransactionCount = workloadMode === 'burst' ?
    workloadOptions.transactionCount :
    null;
  const requestTimeoutMs = workloadMode === 'burst' ?
    Math.max(context.options.timeoutMs, TXBURST_REQUEST_TIMEOUT_MS) :
    context.options.timeoutMs;
  let generated = 0;
  let accepted = 0;
  let rejected = 0;
  let transportFailures = 0;
  let httpFailures = 0;

  const beforeSnapshot = await collectTransactionPoolSnapshot(context, 'before', 0);
  const recipientBefore = beforeSnapshot.nodes.find(function (snapshotNode) {
    return snapshotNode.id === node.id;
  });
  const confirmationFromHeight = recipientBefore && recipientBefore.status.height ?
    recipientBefore.status.height + 1 :
    1;

  snapshots.push(beforeSnapshot);

  const workloadStartedAt = Date.now();
  let generationFinishedAt = workloadStartedAt;
  let submissionStartedAt = workloadStartedAt;

  /**
   * Records one completed transaction submission without exposing its payload.
   * @param {object} transaction - Submitted signed transaction.
   * @param {object} result - HTTP client result.
   */
  function recordSubmissionResult (transaction, result) {
    const statusCode = String(result.status);
    const metricPrefix = workloadMode === 'burst' ? 'txburst' : 'txqueue';

    context.metrics.latency(metricPrefix + '.type' + transactionType + '.submit', result.latencyMs);
    statusCodes[statusCode] = (statusCodes[statusCode] || 0) + 1;

    if (result.ok && result.body && result.body.success) {
      accepted++;
      acceptedTransactionIds.push(transaction.id);
    } else if (result.status === 0) {
      transportFailures++;
      recordReason(rejectionReasons, result.error || 'transport failure');
    } else {
      rejected++;
      if (!result.ok) {
        httpFailures++;
      }
      recordReason(rejectionReasons, formatApiError(result.body));
    }
  }

  if (workloadMode === 'burst') {
    // The first request starts only after the complete signed batch exists in memory.
    const transactions = createTransactionBurst(
        sender,
        transactionType,
        configuredTransactionCount,
        workloadDetails
    );

    generated = transactions.length;
    generationFinishedAt = Date.now();
    submissionStartedAt = generationFinishedAt;

    const submissions = await submitTransactionBurst(client, transactions, {
      timeoutMs: requestTimeoutMs
    });

    submissions.forEach(function (submission) {
      recordSubmissionResult(submission.transaction, submission.result);
    });
  } else {
    const deadline = workloadStartedAt + TXQUEUE_DURATION_MS;

    /**
     * Generates, signs, and submits transactions without an artificial delay.
     */
    async function worker () {
      while (Date.now() < deadline) {
        const transaction = createTxQueueTransaction(sender, transactionType, workloadDetails);

        generated++;

        const result = await client.post('/api/transactions/process', { transaction });

        recordSubmissionResult(transaction, result);
      }
    }

    await Promise.all(Array.from({ length: TXQUEUE_CONCURRENCY }, worker));
    generationFinishedAt = Date.now();
  }

  const workloadFinishedAt = Date.now();
  const acceptedIds = new Set(acceptedTransactionIds);

  setSnapshotAcceptedProgress(beforeSnapshot, acceptedIds.size);

  snapshots.push(await collectTransactionPoolSnapshot(
      context,
      'immediate',
      0,
      {
        senderId: sender.address,
        senderPublicKey: sender.publicKey,
        acceptedIds,
        fromHeight: confirmationFromHeight,
        transactionType
      }
  ));

  await sleep(TXQUEUE_AFTER_LOAD_DELAY_MS);
  snapshots.push(await collectTransactionPoolSnapshot(
      context,
      'after-30s',
      Date.now() - workloadFinishedAt,
      {
        senderId: sender.address,
        senderPublicKey: sender.publicKey,
        acceptedIds,
        fromHeight: confirmationFromHeight,
        transactionType
      }
  ));

  const confirmation = await waitForAcceptedTransactionsConfirmed(
      context,
      sender.address,
      sender.publicKey,
      acceptedTransactionIds,
      generated,
      transactionType,
      confirmationFromHeight,
      workloadFinishedAt
  );
  const confirmationOutcome = summarizeConfirmationOutcome(confirmation);

  snapshots.push(await collectTransactionPoolSnapshot(
      context,
      confirmation.complete ?
        'after-confirmed' :
        confirmationOutcome.poolsDrained ? 'after-settled-missing' : 'confirmation-timeout',
      Date.now() - workloadFinishedAt,
      {
        senderId: sender.address,
        senderPublicKey: sender.publicKey,
        acceptedIds,
        fromHeight: confirmationFromHeight,
        transactionType
      }
  ));

  const recipientConfirmation = confirmation.nodes.find(function (confirmationNode) {
    return confirmationNode.id === node.id;
  });
  const confirmedTransactions = recipientConfirmation ? recipientConfirmation.transactions : [];
  const blockchainTps = await collectBlockchainTps(context, node, confirmedTransactions);
  const confirmedCount = confirmedTransactions.length;

  Object.assign(blockchainTps, {
    confirmationComplete: confirmation.complete,
    acceptedTransactions: acceptedTransactionIds.length,
    confirmedTransactions: confirmedCount,
    missingTransactions: Math.max(acceptedTransactionIds.length - confirmedCount, 0),
    confirmationCoveragePercent: acceptedTransactionIds.length ?
      Math.round(confirmedCount / acceptedTransactionIds.length * 10000) / 100 :
      0
  });

  const confirmationReport = Object.assign(
      publicConfirmationResult(confirmation),
      confirmationOutcome
  );

  const snapshotFailures = snapshots.reduce(function (count, snapshot) {
    return count + snapshot.nodes.filter(function (snapshotNode) {
      return !snapshotNode.ok;
    }).length;
  }, 0);
  const confirmationStateFailures = confirmation.nodes.filter(function (confirmationNode) {
    return !confirmationNode.ok;
  }).length;
  const workloadElapsedMs = workloadFinishedAt - workloadStartedAt;
  const generationElapsedMs = generationFinishedAt - workloadStartedAt;
  const submissionElapsedMs = workloadFinishedAt - submissionStartedAt;
  const rateElapsedMs = workloadMode === 'burst' ? submissionElapsedMs : workloadElapsedMs;
  const scenarioResult = {
    kind: 'transaction queue stress',
    target: {
      nodeId: node.id,
      apiUrl: node.apiUrl
    },
    sourceAccount: {
      address: sender.address,
      publicKey: sender.publicKey
    },
    transaction: buildTxQueueTransactionReport(transactionType, workloadDetails, generated),
    workload: {
      mode: workloadMode,
      configuredDurationMs: workloadMode === 'continuous' ? TXQUEUE_DURATION_MS : null,
      configuredTransactionCount,
      actualDurationMs: workloadElapsedMs,
      generationDurationMs: generationElapsedMs,
      submissionDurationMs: submissionElapsedMs,
      concurrency: workloadMode === 'burst' ? configuredTransactionCount : TXQUEUE_CONCURRENCY,
      allGeneratedBeforeSubmission: workloadMode === 'burst',
      submissionBatch: workloadMode === 'burst' ? 'Promise.all' : null,
      requestTimeoutMs,
      artificialDelayMs: 0,
      generated,
      accepted,
      rejected,
      transportFailures,
      httpFailures,
      completedResponses: accepted + rejected + transportFailures,
      generationRatePerSecond: roundRate(generated, generationElapsedMs),
      acceptedRatePerSecond: roundRate(accepted, rateElapsedMs),
      statusCodes,
      rejectionReasons,
      acceptedTransactionIdSamples: acceptedTransactionIds.slice(0, 10)
    },
    snapshots,
    confirmation: confirmationReport,
    blockchainTps,
    publicPoolCategories: ['confirmed', 'queued', 'unconfirmed', 'multisignature'],
    unavailablePoolCategories: ['bundled'],
    elapsedMs: Date.now() - startedAt,
    passed: generated > 0 &&
      transportFailures === 0 &&
      snapshotFailures === 0 &&
      confirmation.complete &&
      confirmationStateFailures === 0 &&
      blockchainTps.available
  };

  if (!scenarioResult.passed) {
    const error = Error(
        'Type ' +
        transactionType +
        ' transaction ' +
        workloadMode +
        ' stress failed: generated ' +
        generated +
        ', transport failures ' +
        transportFailures +
        ', snapshot failures ' +
        snapshotFailures +
        ', all accepted confirmed ' +
        confirmation.complete +
        ', confirmation outcome ' +
        confirmationOutcome.outcome +
        ', missing after settlement ' +
        confirmationOutcome.missingAfterSettlement +
        ', confirmation state failures ' +
        confirmationStateFailures +
        '.'
    );

    error.result = scenarioResult;
    throw error;
  }

  return scenarioResult;
}

/**
 * Creates a complete signed transaction batch before any submission begins.
 * @param {object} sender - Funded signing account.
 * @param {number} transactionType - Transaction type to create.
 * @param {number} transactionCount - Exact batch size.
 * @param {object} workloadDetails - Mutable aggregate payload and fee statistics.
 */
function createTransactionBurst (sender, transactionType, transactionCount, workloadDetails) {
  return Array.from({ length: transactionCount }, function () {
    return createTxQueueTransaction(sender, transactionType, workloadDetails);
  });
}

/**
 * Starts every transaction request in one synchronous mapping pass and waits for all responses.
 * @param {object} client - Live-test HTTP client.
 * @param {Array<object>} transactions - Complete signed transaction batch.
 * @param {object} [requestOptions] - Per-request HTTP options.
 */
function submitTransactionBurst (client, transactions, requestOptions) {
  return Promise.all(transactions.map(async function (transaction) {
    const result = await client.post(
        '/api/transactions/process',
        { transaction },
        requestOptions
    );

    return {
      transaction,
      result
    };
  }));
}

/**
 * Creates one valid transaction for a transaction queue workload.
 * @param {object} sender - Funded signing account.
 * @param {number} transactionType - Transaction type to create.
 * @param {object} workloadDetails - Mutable aggregate payload and fee statistics.
 */
function createTxQueueTransaction (sender, transactionType, workloadDetails) {
  if (transactionType === transactionTypes.SEND) {
    return tx.createSendTransaction(
        sender,
        tx.createRandomAddress(),
        TXQUEUE_TYPE0_AMOUNT
    );
  }

  if (transactionType === transactionTypes.CHAT_MESSAGE) {
    const messageLength = crypto.randomInt(
        TXQUEUE_TYPE8_MIN_MESSAGE_LENGTH,
        TXQUEUE_TYPE8_MAX_MESSAGE_LENGTH + 1
    );
    const message = createRandomChatMessage(messageLength);
    const ownMessage = createRandomChatMessage(messageLength);
    const transaction = tx.createChatTransaction(
        sender,
        tx.createRandomAddress(),
        transactionTypes.CHAT_MESSAGE_TYPES.ORDINARY_MESSAGE,
        {
          message: Buffer.from(message, 'utf8').toString('hex'),
          ownMessage: Buffer.from(ownMessage, 'utf8').toString('hex')
        }
    );

    workloadDetails.messageLengthMin = workloadDetails.messageLengthMin === null ?
      messageLength :
      Math.min(workloadDetails.messageLengthMin, messageLength);
    workloadDetails.messageLengthMax = workloadDetails.messageLengthMax === null ?
      messageLength :
      Math.max(workloadDetails.messageLengthMax, messageLength);
    workloadDetails.messageLengthTotal += messageLength;
    workloadDetails.feeMin = workloadDetails.feeMin === null ?
      transaction.fee :
      Math.min(workloadDetails.feeMin, transaction.fee);
    workloadDetails.feeMax = workloadDetails.feeMax === null ?
      transaction.fee :
      Math.max(workloadDetails.feeMax, transaction.fee);

    return transaction;
  }

  throw Error('Unsupported transaction queue stress type: ' + transactionType);
}

/**
 * Generates printable random ASCII content with an exact character length.
 * @param {number} length - Requested character count.
 */
function createRandomChatMessage (length) {
  const random = crypto.randomBytes(length);
  let message = '';

  for (const byte of random) {
    message += TXQUEUE_TYPE8_MESSAGE_ALPHABET[byte % TXQUEUE_TYPE8_MESSAGE_ALPHABET.length];
  }

  return message;
}

/**
 * Builds report-safe transaction metadata for one queue workload.
 * @param {number} transactionType - Transaction type generated by the workload.
 * @param {object} workloadDetails - Aggregate payload and fee statistics.
 * @param {number} generated - Number of generated transactions.
 */
function buildTxQueueTransactionReport (transactionType, workloadDetails, generated) {
  if (transactionType === transactionTypes.SEND) {
    return {
      type: transactionTypes.SEND,
      typeName: tx.getTransactionTypeName(transactionTypes.SEND),
      amount: TXQUEUE_TYPE0_AMOUNT,
      amountAdm: formatAdamantAmount(TXQUEUE_TYPE0_AMOUNT),
      fee: constants.fees.send,
      feeAdm: formatAdamantAmount(constants.fees.send),
      uniqueRecipientPerTransaction: true
    };
  }

  return {
    type: transactionTypes.CHAT_MESSAGE,
    typeName: tx.getTransactionTypeName(transactionTypes.CHAT_MESSAGE),
    subtype: transactionTypes.CHAT_MESSAGE_TYPES.ORDINARY_MESSAGE,
    subtypeName: tx.getChatMessageTypeName(transactionTypes.CHAT_MESSAGE_TYPES.ORDINARY_MESSAGE),
    amount: 0,
    amountAdm: '0',
    feeMin: workloadDetails.feeMin,
    feeMinAdm: formatAdamantAmount(workloadDetails.feeMin),
    feeMax: workloadDetails.feeMax,
    feeMaxAdm: formatAdamantAmount(workloadDetails.feeMax),
    uniqueRecipientPerTransaction: true,
    randomMessage: true,
    configuredMessageLengthMin: TXQUEUE_TYPE8_MIN_MESSAGE_LENGTH,
    configuredMessageLengthMax: TXQUEUE_TYPE8_MAX_MESSAGE_LENGTH,
    observedMessageLengthMin: workloadDetails.messageLengthMin,
    observedMessageLengthMax: workloadDetails.messageLengthMax,
    observedAverageMessageLength: generated ?
      Math.round(workloadDetails.messageLengthTotal / generated * 100) / 100 :
      null,
    messageEncoding: 'printable ASCII encoded as hex',
    payloadIncludedInReport: false
  };
}

/**
 * Collects node status and public transaction pool counters from every target node.
 * @param {object} context - Runner context.
 * @param {string} phase - Snapshot phase label.
 * @param {number} offsetMs - Milliseconds since workload completion.
 * @param {?object} progressOptions - Accepted transaction IDs used to calculate scenario progress.
 */
async function collectTransactionPoolSnapshot (context, phase, offsetMs, progressOptions) {
  const nodes = await Promise.all(getTransactionObservationNodes(context).map(async function (node) {
    const client = context.clientFor(node);
    const responses = await Promise.all([
      client.get('/api/node/status'),
      client.get('/api/transactions/count'),
      progressOptions ?
        collectAcceptedTransactionStates(
            context,
            node,
            progressOptions.senderId,
            progressOptions.senderPublicKey,
            progressOptions.acceptedIds,
            progressOptions.fromHeight,
            progressOptions.transactionType,
            false
        ) :
        null
    ]);
    const status = responses[0];
    const counts = responses[1];
    const progressState = responses[2];
    const statusBody = status.body || {};
    const countBody = counts.body || {};
    const network = statusBody.network || {};
    const loader = statusBody.loader || {};
    const ok = status.ok &&
      statusBody.success &&
      counts.ok &&
      countBody.success &&
      (!progressState || progressState.ok);

    context.metrics.latency('txqueue.snapshot.status', status.latencyMs);
    context.metrics.latency('txqueue.snapshot.count', counts.latencyMs);

    return {
      id: node.id,
      apiUrl: node.apiUrl,
      ok: !!ok,
      error: ok ? null : [
        status.error || statusBody.error,
        counts.error || countBody.error,
        progressState && progressState.error
      ].filter(Boolean).join('; ') || 'snapshot request failed',
      status: {
        version: formatObservedNodeVersion(statusBody.version),
        loaded: loader.loaded,
        syncing: loader.syncing,
        consensus: loader.consensus,
        height: network.height,
        nethash: network.nethash,
        broadhash: network.broadhash,
        fee: network.fee,
        feeAdm: formatAdamantAmount(network.fee),
        reward: network.reward,
        rewardAdm: formatAdamantAmount(network.reward)
      },
      transactions: {
        confirmed: countBody.confirmed,
        queued: countBody.queued,
        unconfirmed: countBody.unconfirmed,
        multisignature: countBody.multisignature
      },
      progress: progressState ? {
        confirmed: progressState.confirmed,
        accepted: progressState.accepted
      } : {
        confirmed: null,
        accepted: null
      }
    };
  }));

  return {
    phase,
    capturedAt: new Date().toISOString(),
    offsetMs,
    nodes
  };
}

/**
 * Marks a pre-workload snapshot as having confirmed none of the later accepted IDs.
 * @param {object} snapshot - Snapshot captured before transaction generation.
 * @param {number} accepted - Number of transactions eventually accepted by the recipient.
 */
function setSnapshotAcceptedProgress (snapshot, accepted) {
  (snapshot.nodes || []).forEach(function (node) {
    node.progress = {
      confirmed: 0,
      accepted
    };
  });
}

/**
 * Returns nodes used to observe transaction propagation and confirmation.
 * Testnet uses the recipient plus the configured peer; localnet uses every node.
 * @param {object} context - Runner context.
 */
function getTransactionObservationNodes (context) {
  return context.target.transactionObservationNodes || context.target.nodes;
}

/**
 * Waits until every accepted transaction is included in a block on every observation node.
 * @param {object} context - Runner context.
 * @param {string} senderId - Stress transaction sender address.
 * @param {string} senderPublicKey - Stress transaction sender public key.
 * @param {Array<string>} acceptedTransactionIds - IDs accepted by the recipient node.
 * @param {number} generatedCount - Total generated candidates that may propagate through peers.
 * @param {number} transactionType - Transaction type to query in confirmed history.
 * @param {number} fromHeight - First height that can contain a stress transaction.
 * @param {number} workloadFinishedAt - Workload completion time in Unix milliseconds.
 */
async function waitForAcceptedTransactionsConfirmed (
    context,
    senderId,
    senderPublicKey,
    acceptedTransactionIds,
    generatedCount,
    transactionType,
    fromHeight,
    workloadFinishedAt
) {
  const acceptedIds = new Set(acceptedTransactionIds);
  // A request rejected by the recipient can already have propagated to a peer and consume block capacity.
  const expectedBlocks = Math.ceil(generatedCount / constants.maxTxsPerBlock);
  const expectedConfirmationMs = expectedBlocks * slots.interval * 1000 + TXQUEUE_CONFIRMATION_GRACE_MS;
  const timeoutMs = Math.max(context.options.blockWaitTimeoutMs, expectedConfirmationMs);
  const deadline = Date.now() + timeoutMs;
  let latestNodes = [];

  while (Date.now() <= deadline) {
    latestNodes = await Promise.all(getTransactionObservationNodes(context).map(function (node) {
      return collectAcceptedTransactionStates(
          context,
          node,
          senderId,
          senderPublicKey,
          acceptedIds,
          fromHeight,
          transactionType,
          false
      );
    }));

    const complete = latestNodes.every(function (node) {
      return node.ok && node.confirmed === acceptedIds.size;
    });

    if (complete) {
      latestNodes = await collectFinalAcceptedTransactionStates(
          context,
          senderId,
          senderPublicKey,
          acceptedIds,
          fromHeight,
          transactionType
      );

      return {
        complete: true,
        accepted: acceptedIds.size,
        waitedMs: Date.now() - workloadFinishedAt,
        timeoutMs,
        fromHeight,
        nodes: latestNodes
      };
    }

    await sleep(context.options.pollIntervalMs);
  }

  latestNodes = await collectFinalAcceptedTransactionStates(
      context,
      senderId,
      senderPublicKey,
      acceptedIds,
      fromHeight,
      transactionType
  );

  return {
    complete: false,
    accepted: acceptedIds.size,
    waitedMs: Date.now() - workloadFinishedAt,
    timeoutMs,
    fromHeight,
    nodes: latestNodes
  };
}

/**
 * Reads confirmed stress transactions from one node using paginated sender queries.
 * @param {object} context - Runner context.
 * @param {object} node - Observation node.
 * @param {string} senderId - Stress transaction sender address.
 * @param {string} senderPublicKey - Stress transaction sender public key.
 * @param {Set<string>} acceptedIds - IDs accepted by the recipient node.
 * @param {number} fromHeight - First possible confirmation height.
 * @param {number} transactionType - Transaction type to query in confirmed history.
 * @param {boolean} includePools - Whether to classify IDs in public pool categories.
 */
async function collectAcceptedTransactionStates (
    context,
    node,
    senderId,
    senderPublicKey,
    acceptedIds,
    fromHeight,
    transactionType,
    includePools
) {
  const client = context.clientFor(node);
  const transactions = new Map();
  let offset = 0;
  let total = 0;

  do {
    const query = [
      'senderId=' + encodeURIComponent(senderId),
      'fromHeight=' + encodeURIComponent(fromHeight),
      'type=' + transactionType,
      'limit=' + TXQUEUE_CONFIRMATION_PAGE_SIZE,
      'offset=' + offset,
      'orderBy=height%3Aasc'
    ].join('&');
    const result = await client.get('/api/transactions?' + query);
    const body = result.body || {};

    context.metrics.latency('txqueue.confirmation.list', result.latencyMs);

    if (!result.ok || !body.success || !Array.isArray(body.transactions)) {
      return {
        id: node.id,
        apiUrl: node.apiUrl,
        ok: false,
        error: result.error || body.error || 'confirmed transaction query failed',
        accepted: acceptedIds.size,
        confirmed: transactions.size,
        unconfirmed: 0,
        queued: 0,
        multisignature: 0,
        missing: acceptedIds.size - transactions.size,
        transactions: Array.from(transactions.values())
      };
    }

    body.transactions.forEach(function (transaction) {
      if (acceptedIds.has(transaction.id)) {
        transactions.set(transaction.id, {
          id: transaction.id,
          blockId: transaction.blockId,
          height: transaction.height,
          blockTimestamp: transaction.block_timestamp,
          confirmations: transaction.confirmations
        });
      }
    });

    total = Number(body.count || 0);
    offset += body.transactions.length;
  } while (offset < total && offset > 0);

  const poolStates = includePools ?
    await collectAcceptedPoolStates(context, client, senderPublicKey, acceptedIds) :
    {
      ok: true,
      error: null,
      unconfirmedIds: new Set(),
      queuedIds: new Set(),
      multisignatureIds: new Set()
    };
  const observedIds = new Set(transactions.keys());

  ['unconfirmedIds', 'queuedIds', 'multisignatureIds'].forEach(function (key) {
    poolStates[key].forEach(function (id) {
      observedIds.add(id);
    });
  });

  return {
    id: node.id,
    apiUrl: node.apiUrl,
    ok: poolStates.ok,
    error: poolStates.error,
    accepted: acceptedIds.size,
    confirmed: transactions.size,
    unconfirmed: poolStates.unconfirmedIds.size,
    queued: poolStates.queuedIds.size,
    multisignature: poolStates.multisignatureIds.size,
    missing: acceptedIds.size - observedIds.size,
    transactions: Array.from(transactions.values())
  };
}

/**
 * Collects final confirmed and public-pool states from every observation node.
 * @param {object} context - Runner context.
 * @param {string} senderId - Stress transaction sender address.
 * @param {string} senderPublicKey - Stress transaction sender public key.
 * @param {Set<string>} acceptedIds - IDs accepted by the recipient node.
 * @param {number} fromHeight - First possible confirmation height.
 * @param {number} transactionType - Transaction type to query in confirmed history.
 */
function collectFinalAcceptedTransactionStates (
    context,
    senderId,
    senderPublicKey,
    acceptedIds,
    fromHeight,
    transactionType
) {
  return Promise.all(getTransactionObservationNodes(context).map(function (node) {
    return collectAcceptedTransactionStates(
        context,
        node,
        senderId,
        senderPublicKey,
        acceptedIds,
        fromHeight,
        transactionType,
        true
    );
  }));
}

/**
 * Collects accepted IDs currently visible in each public transaction pool category.
 * @param {object} context - Runner context.
 * @param {HttpClient} client - Observation node client.
 * @param {string} senderPublicKey - Stress transaction sender public key.
 * @param {Set<string>} acceptedIds - IDs accepted by the recipient node.
 */
async function collectAcceptedPoolStates (context, client, senderPublicKey, acceptedIds) {
  const encodedPublicKey = encodeURIComponent(senderPublicKey);
  const endpoints = [
    ['unconfirmedIds', '/api/transactions/unconfirmed?senderPublicKey=' + encodedPublicKey],
    ['queuedIds', '/api/transactions/queued?senderPublicKey=' + encodedPublicKey]
  ];
  const responses = await Promise.all(endpoints.map(function (entry) {
    return client.get(entry[1]);
  }));
  const result = {
    ok: true,
    error: null,
    unconfirmedIds: new Set(),
    queuedIds: new Set(),
    multisignatureIds: new Set()
  };
  const errors = [];

  // These fully signed stress transactions cannot enter the multisignature pool; its legacy list route is disabled.
  responses.forEach(function (response, index) {
    const body = response.body || {};
    const key = endpoints[index][0];

    context.metrics.latency('txqueue.confirmation.pool', response.latencyMs);

    if (!response.ok || !body.success || !Array.isArray(body.transactions)) {
      result.ok = false;
      errors.push(response.error || body.error || endpoints[index][1] + ' failed');
      return;
    }

    body.transactions.forEach(function (transaction) {
      if (acceptedIds.has(transaction.id)) {
        result[key].add(transaction.id);
      }
    });
  });

  result.error = errors.length ? errors.join('; ') : null;

  return result;
}

/**
 * Removes per-transaction confirmation records while preserving aggregate report metrics.
 * @param {object} confirmation - Internal confirmation result.
 */
function publicConfirmationResult (confirmation) {
  return Object.assign({}, confirmation, {
    nodes: (confirmation.nodes || []).map(function (node) {
      return {
        id: node.id,
        apiUrl: node.apiUrl,
        ok: node.ok,
        error: node.error,
        accepted: node.accepted,
        confirmed: node.confirmed,
        unconfirmed: node.unconfirmed,
        queued: node.queued,
        multisignature: node.multisignature,
        missing: node.missing
      };
    })
  });
}

/**
 * Classifies whether incomplete confirmation is still pending or settled with missing IDs.
 * @param {object} confirmation - Internal confirmation result with final public-pool states.
 */
function summarizeConfirmationOutcome (confirmation) {
  const nodes = confirmation.nodes || [];
  const poolsDrained = nodes.length > 0 && nodes.every(function (node) {
    return node.ok &&
      Number(node.unconfirmed || 0) === 0 &&
      Number(node.queued || 0) === 0 &&
      Number(node.multisignature || 0) === 0;
  });
  const maxPending = nodes.reduce(function (maximum, node) {
    return Math.max(
        maximum,
        Number(node.unconfirmed || 0) +
          Number(node.queued || 0) +
          Number(node.multisignature || 0)
    );
  }, 0);
  const maxMissing = nodes.reduce(function (maximum, node) {
    return Math.max(maximum, Number(node.missing || 0));
  }, 0);
  const missingAfterSettlement = poolsDrained ? maxMissing : 0;
  let outcome = 'timed-out-pending';

  if (confirmation.complete) {
    outcome = 'confirmed';
  } else if (missingAfterSettlement > 0) {
    outcome = 'missing-after-settlement';
  }

  return {
    outcome,
    poolsDrained,
    maxPending,
    maxMissing,
    missingAfterSettlement
  };
}

/**
 * Calculates observed blockchain TPS across the real blocks containing stress transactions.
 * @param {object} context - Runner context.
 * @param {object} node - Recipient node.
 * @param {Array<object>} transactions - Confirmed accepted stress transactions.
 */
async function collectBlockchainTps (context, node, transactions) {
  if (!transactions || !transactions.length) {
    return {
      available: false,
      error: 'No confirmed accepted transactions were available for TPS calculation.'
    };
  }

  const heights = transactions.map(function (transaction) {
    return Number(transaction.height);
  }).filter(Number.isFinite);
  const firstHeight = Math.min.apply(Math, heights);
  const lastHeight = Math.max.apply(Math, heights);
  const blockHeights = [];

  for (let height = firstHeight; height <= lastHeight; height++) {
    blockHeights.push(height);
  }

  const blocks = [];

  for (let index = 0; index < blockHeights.length; index += TXQUEUE_BLOCK_QUERY_CONCURRENCY) {
    const batch = blockHeights.slice(index, index + TXQUEUE_BLOCK_QUERY_CONCURRENCY);
    const batchBlocks = await Promise.all(batch.map(async function (height) {
      const result = await context.clientFor(node).get('/api/blocks?height=' + height);
      const block = result.body && result.body.blocks && result.body.blocks[0];

      context.metrics.latency('txqueue.tps.block', result.latencyMs);

      return result.ok && result.body && result.body.success && block ? block : null;
    }));

    blocks.push.apply(blocks, batchBlocks);
  }

  if (blocks.some(function (block) { return !block; })) {
    return {
      available: false,
      error: 'Unable to read every block in the stress transaction confirmation range.'
    };
  }

  const firstTimestamp = Number(blocks[0].timestamp);
  const lastTimestamp = Number(blocks[blocks.length - 1].timestamp);
  // Include one slot for the final block; subtracting timestamps alone gives zero for a one-block window.
  const observedSeconds = Math.max(slots.interval, lastTimestamp - firstTimestamp + slots.interval);
  const blockchainTransactions = blocks.reduce(function (sum, block) {
    return sum + Number(block.numberOfTransactions || 0);
  }, 0);
  const peakTransactionsPerBlock = blocks.reduce(function (peak, block) {
    return Math.max(peak, Number(block.numberOfTransactions || 0));
  }, 0);

  return {
    available: true,
    nodeId: node.id,
    apiUrl: node.apiUrl,
    firstHeight,
    lastHeight,
    firstTimestamp,
    lastTimestamp,
    observedSeconds,
    blocks: blocks.length,
    confirmedStressTransactions: transactions.length,
    // Retained for JSON report compatibility with earlier live-test runs.
    acceptedStressTransactions: transactions.length,
    blockchainTransactions,
    acceptedStressTps: roundRate(transactions.length, observedSeconds * 1000),
    blockchainTps: roundRate(blockchainTransactions, observedSeconds * 1000),
    averageTransactionsPerBlock: Math.round(blockchainTransactions / blocks.length * 100) / 100,
    peakTransactionsPerBlock,
    maxTransactionsPerBlock: constants.maxTxsPerBlock,
    observedBlockCapacityPercent: Math.round(
        blockchainTransactions / (blocks.length * constants.maxTxsPerBlock) * 10000
    ) / 100
  };
}

/**
 * Increments an aggregate reason counter using a bounded report-safe label.
 * @param {object} reasons - Reason histogram.
 * @param {string} reason - Rejection or transport reason.
 */
function recordReason (reasons, reason) {
  const label = String(reason || 'unknown').slice(0, 240);

  reasons[label] = (reasons[label] || 0) + 1;
}

/**
 * Calculates a rounded per-second rate.
 * @param {number} count - Completed item count.
 * @param {number} elapsedMs - Elapsed milliseconds.
 */
function roundRate (count, elapsedMs) {
  return Math.round(count / Math.max(elapsedMs / 1000, 0.001) * 100) / 100;
}

/**
 * Executes concurrent `/api/node/status` requests and reports throughput.
 * @param {object} context - Runner context.
 * @param {string} profileName - Applied load profile name.
 * @param {object} profile - Load profile.
 * @param {boolean} stress - Whether this is an opt-in stress profile.
 */
async function runHttpLoad (context, profileName, profile, stress) {
  const node = context.primaryNode;
  const client = context.clientFor(node);
  const started = Date.now();
  const latencySamples = [];
  const statusCodes = {};
  const failureExamples = [];
  const observedHeights = [];
  const observedNethashes = new Set();
  const observedBroadhashes = new Set();
  const observedVersions = new Set();
  let completed = 0;
  let transportFailures = 0;
  let httpFailures = 0;
  let apiFailures = 0;
  let cursor = 0;

  /**
   * Claims and executes work items from the shared bounded cursor.
   */
  async function worker () {
    while (cursor < profile.requests) {
      // JavaScript runs this cursor mutation on one event loop, giving a simple bounded work queue.
      cursor++;
      const result = await client.get('/api/node/status');
      const body = result.body || {};
      const network = body.network || {};
      const statusCode = String(result.status);

      context.metrics.latency(stress ? 'stress.status' : 'load.status', result.latencyMs);
      latencySamples.push(result.latencyMs);
      statusCodes[statusCode] = (statusCodes[statusCode] || 0) + 1;

      if (result.ok && result.body && result.body.success) {
        completed++;
        if (Number.isFinite(network.height)) {
          observedHeights.push(network.height);
        }
        if (network.nethash) {
          observedNethashes.add(network.nethash);
        }
        if (network.broadhash) {
          observedBroadhashes.add(network.broadhash);
        }
        if (body.version) {
          observedVersions.add(formatObservedNodeVersion(body.version));
        }
      } else {
        if (result.status === 0) {
          transportFailures++;
        } else if (!result.ok) {
          httpFailures++;
        } else {
          apiFailures++;
        }

        if (failureExamples.length < 10) {
          failureExamples.push({
            status: result.status,
            transportError: result.error,
            apiError: body.error || body.message,
            success: body.success
          });
        }
      }
    }
  }

  await Promise.all(Array.from({ length: profile.concurrency }, worker));

  const elapsedSec = Math.max((Date.now() - started) / 1000, 0.001);
  const throughput = Math.round((completed / elapsedSec) * 100) / 100;
  const failed = transportFailures + httpFailures + apiFailures;
  const consistentNethash = observedNethashes.size <= 1;
  const scenarioResult = {
    kind: stress ? 'opt-in stress burst' : 'normal bounded load',
    target: {
      nodeId: node.id,
      apiUrl: node.apiUrl
    },
    request: {
      method: 'GET',
      path: '/api/node/status',
      body: null
    },
    profile: {
      requestedName: context.options.profile,
      appliedName: profileName,
      requests: profile.requests,
      concurrency: profile.concurrency
    },
    acceptance: {
      requirement: 'Every request returns HTTP 2xx with JSON success=true.',
      latencyThresholdMs: null,
      throughputThresholdRps: null
    },
    results: {
      totalRequests: profile.requests,
      completed,
      failed,
      transportFailures,
      httpFailures,
      apiFailures,
      statusCodes,
      elapsedMs: Math.round(elapsedSec * 1000),
      throughputRps: throughput,
      latencyMs: summarizeNumbers(latencySamples),
      observedNodeState: {
        minHeight: observedHeights.length ? Math.min.apply(null, observedHeights) : null,
        maxHeight: observedHeights.length ? Math.max.apply(null, observedHeights) : null,
        nethashes: Array.from(observedNethashes),
        broadhashChanges: observedBroadhashes.size,
        versions: Array.from(observedVersions)
      },
      failureExamples
    },
    passed: failed === 0 && consistentNethash
  };

  if (!scenarioResult.passed) {
    const reasons = [];

    if (failed > 0) {
      reasons.push(failed + ' failed requests');
    }
    if (!consistentNethash) {
      reasons.push('responses reported different nethashes');
    }

    const error = Error('Load profile failed: ' + reasons.join('; ') + '.');

    error.result = scenarioResult;
    throw error;
  }

  return scenarioResult;
}

/**
 * Normalizes a node status version value into a stable report string.
 * @param {string|object} version - Version returned by `/api/node/status`.
 */
function formatObservedNodeVersion (version) {
  if (version === undefined || version === null) {
    return null;
  }

  if (!version || typeof version !== 'object') {
    return String(version);
  }

  return [
    version.version || 'unknown',
    version.commit ? 'commit ' + version.commit : null,
    version.build ? 'build ' + version.build : null
  ].filter(Boolean).join(', ');
}

/**
 * Submits a transaction-like request and asserts successful admission.
 * @param {object} context - Runner context.
 * @param {HttpClient} client - Target REST client.
 * @param {string} path - API path.
 * @param {object} body - Request body.
 * @param {string} label - Human-readable action label.
 */
async function submitTransaction (context, client, path, body, label) {
  const result = await client.post(path, body);

  context.metrics.latency('transaction.submit', result.latencyMs);
  context.assert(result.ok, 'HTTP failed while submitting ' + label + ': ' + result.status);
  context.assert(result.body && result.body.success, 'Node rejected ' + label + ': ' + formatApiError(result.body));

  return result;
}

/**
 * Submits one transaction through the standard process endpoint and records it as accepted.
 * @param {object} context - Runner context.
 * @param {HttpClient} client - Target REST client.
 * @param {Array<object>} transactions - Accepted transaction metadata sink.
 * @param {object} transaction - Transaction object.
 * @param {string} label - Human-readable action label.
 */
async function submitAcceptedTransaction (context, client, transactions, transaction, label) {
  await submitTransaction(context, client, '/api/transactions/process', { transaction }, label);
  transactions.push(publicTransaction(transaction, label));
}

/**
 * Submits an API-created transaction and records its returned transaction metadata.
 * @param {object} context - Runner context.
 * @param {HttpClient} client - Target REST client.
 * @param {Array<object>} transactions - Accepted transaction metadata sink.
 * @param {string} method - HTTP client method.
 * @param {string} path - API path.
 * @param {object} body - Request body.
 * @param {string} label - Human-readable action label.
 * @param {number} type - Expected transaction type.
 */
async function submitAcceptedApiTransaction (context, client, transactions, method, path, body, label, type) {
  const result = await client[method](path, body);

  context.metrics.latency('transaction.submit', result.latencyMs);
  context.assert(result.ok, 'HTTP failed while submitting ' + label + ': ' + result.status);
  context.assert(result.body && result.body.success, 'Node rejected ' + label + ': ' + formatApiError(result.body));

  const transaction = result.body.transaction || {
    id: result.body.transactionId,
    type
  };
  const metadata = publicTransaction(Object.assign({}, transaction, {
    type: transaction.type === undefined ? type : transaction.type
  }), label);

  transactions.push(metadata);

  return metadata;
}

/**
 * Runs one expected abuse rejection and records why/how it was rejected.
 * @param {object} context - Runner context.
 * @param {object} check - Abuse check definition.
 */
async function submitAbuseCheck (context, check) {
  const result = await check.request();
  const rejected = !result.body || result.body.success === false;
  const rejection = classifyRejection(result);

  context.metrics.latency('abuse.submit', result.latencyMs);
  context.assert(rejected, 'Abuse check unexpectedly succeeded: ' + check.id);
  context.metrics.increment('abuse.rejected');

  return {
    id: check.id,
    type: check.type,
    typeName: check.type === null || check.type === undefined ? null : tx.getTransactionTypeName(check.type),
    subtype: check.subtype,
    reason: check.reason,
    rejected,
    rejectedBy: rejection.rejectedBy,
    howRejected: rejection.howRejected,
    status: result.status,
    error: result.body && (result.body.error || result.body.message)
  };
}

/**
 * Submits three valid SEND transactions concurrently whose combined amount and fees exceed balance.
 * @param {object} context - Runner context.
 * @param {HttpClient} client - Target REST client.
 * @param {object} funded - Funded fixture account.
 * @param {object} sender - Fresh account used for concurrent spends.
 */
async function runConcurrentBalanceOverspend (context, client, funded, sender) {
  const funding = tx.createSendTransaction(funded, sender.address, CONCURRENT_SPEND_BALANCE);

  await submitTransaction(context, client, '/api/transactions/process', { transaction: funding }, 'concurrent overspend funding');

  if (context.options.waitBlocks > 0) {
    await waitForBlocks(context, context.options.waitBlocks);
  }
  await waitForAccountBalance(
      context,
      client,
      sender.address,
      CONCURRENT_SPEND_BALANCE,
      'concurrent overspend funding'
  );

  const transactions = Array.from({ length: CONCURRENT_SPEND_COUNT }, function () {
    return tx.createSendTransaction(sender, tx.createAccount().address, CONCURRENT_SPEND_AMOUNT);
  });
  const responses = await Promise.all(transactions.map(function (transaction) {
    return client.post('/api/transactions/process', { transaction });
  }));
  const admitted = responses.filter(function (result) {
    return result.ok && result.body && result.body.success;
  });
  const admissionRejected = responses.filter(function (result) {
    return result.ok && result.body && result.body.success === false;
  });
  const transportFailures = responses.filter(function (result) {
    return !result.ok;
  });
  const requiredTotal = CONCURRENT_SPEND_COUNT * (CONCURRENT_SPEND_AMOUNT + constants.fees.send);
  const admissionRejectionErrors = admissionRejected.map(function (result) {
    return result.body.error || result.body.message || 'success=false';
  });

  responses.forEach(function (result) {
    context.metrics.latency('abuse.concurrent_spend', result.latencyMs);
  });
  context.metrics.increment('abuse.concurrent_spend_admitted', admitted.length);
  context.metrics.increment('abuse.concurrent_spend_admission_rejected', admissionRejected.length);

  context.assert(
      transportFailures.length === 0,
      'Concurrent balance overspend had ' + transportFailures.length + ' HTTP/transport failures.'
  );

  const confirmationResult = await waitForConcurrentSpendConfirmations(
      context,
      client,
      transactions
  );
  const finalBalanceResult = await client.get(
      '/api/accounts/getBalance?address=' + encodeURIComponent(sender.address)
  );
  const expectedFinalBalance = CONCURRENT_SPEND_BALANCE -
    2 * (CONCURRENT_SPEND_AMOUNT + constants.fees.send);
  const finalBalance = finalBalanceResult.body && finalBalanceResult.body.balance;
  const passed = confirmationResult.confirmedCount === 2 &&
    confirmationResult.minimumConfirmations >= 2 &&
    confirmationResult.notConfirmedCount === 1 &&
    String(finalBalance) === String(expectedFinalBalance);

  context.metrics.latency('accounts.balance', finalBalanceResult.latencyMs);
  context.metrics.increment('abuse.concurrent_spend_confirmed', confirmationResult.confirmedCount);
  context.metrics.increment(
      'abuse.concurrent_spend_not_confirmed',
      confirmationResult.notConfirmedCount
  );

  return {
    id: 'concurrent-unconfirmed-balance-overspend',
    type: transactionTypes.SEND,
    typeName: tx.getTransactionTypeName(transactionTypes.SEND),
    reason: 'Three valid SEND transactions of 0.2 ADM are submitted concurrently from a 2 ADM balance; with a 0.5 ADM fee each they require 2.1 ADM.',
    rejected: confirmationResult.notConfirmedCount === 1,
    rejectedBy: 'block inclusion and confirmed balance',
    howRejected: 'Admission accepted ' +
      admitted.length +
      '/3 and rejected ' +
      admissionRejected.length +
      '/3. Final chain state confirmed ' +
      confirmationResult.confirmedCount +
      '/3; ' +
      confirmationResult.notConfirmedCount +
      '/3 remained queued, unconfirmed, or missing. Minimum confirmations: ' +
      confirmationResult.minimumConfirmations +
      '. Final balance: ' +
      finalBalance +
      ', expected: ' +
      expectedFinalBalance +
      '.' +
      (admissionRejectionErrors.length ? ' Admission errors: ' + admissionRejectionErrors.join('; ') : ''),
    balance: CONCURRENT_SPEND_BALANCE,
    amountEach: CONCURRENT_SPEND_AMOUNT,
    feeEach: constants.fees.send,
    requiredTotal,
    admittedCount: admitted.length,
    admissionRejectedCount: admissionRejected.length,
    confirmedCount: confirmationResult.confirmedCount,
    minimumConfirmations: confirmationResult.minimumConfirmations,
    notConfirmedCount: confirmationResult.notConfirmedCount,
    transactions: confirmationResult.transactions,
    expectedFinalBalance,
    finalBalance,
    passed
  };
}

/**
 * Waits for concurrent spends to settle and verifies each transaction by id and confirmations.
 * @param {object} context - Runner context.
 * @param {HttpClient} client - Target REST client.
 * @param {Array<object>} transactions - Submitted transactions.
 */
async function waitForConcurrentSpendConfirmations (context, client, transactions) {
  const deadline = Date.now() + context.options.blockWaitTimeoutMs;
  let settlementHeight = null;
  let latest = [];

  while (Date.now() < deadline) {
    const heightResult = await client.get('/api/blocks/getHeight');
    const height = heightResult.body && heightResult.body.height;

    context.metrics.latency('blocks.height', heightResult.latencyMs);
    latest = await Promise.all(transactions.map(function (transaction) {
      return getTransactionConfirmationState(context, client, transaction.id);
    }));

    const confirmedCount = latest.filter(function (state) {
      return state.confirmations > 0;
    }).length;

    if (confirmedCount > 2) {
      return summarizeConcurrentSpendStates(latest);
    }

    if (confirmedCount === 2 && settlementHeight === null) {
      settlementHeight = height;
    }

    // Recheck after another block so confirmations and exclusion of the third transaction are observable.
    if (settlementHeight !== null && height > settlementHeight) {
      return summarizeConcurrentSpendStates(latest);
    }

    await sleep(context.options.pollIntervalMs);
  }

  return summarizeConcurrentSpendStates(latest);
}

/**
 * Reads one transaction as confirmed, unconfirmed, or missing.
 * @param {object} context - Runner context.
 * @param {HttpClient} client - Target REST client.
 * @param {string} transactionId - Transaction id.
 */
async function getTransactionConfirmationState (context, client, transactionId) {
  const encodedId = encodeURIComponent(transactionId);
  const confirmedResult = await client.get('/api/transactions/get?id=' + encodedId);
  const confirmedTransaction = confirmedResult.body && confirmedResult.body.transaction;

  context.metrics.latency('transactions.confirmation', confirmedResult.latencyMs);

  if (confirmedTransaction) {
    return {
      id: transactionId,
      state: 'confirmed',
      confirmations: Number(confirmedTransaction.confirmations || 0),
      blockId: confirmedTransaction.blockId,
      height: confirmedTransaction.height,
      error: null
    };
  }

  const unconfirmedResult = await client.get('/api/transactions/unconfirmed/get?id=' + encodedId);
  const unconfirmedTransaction = unconfirmedResult.body && unconfirmedResult.body.transaction;

  context.metrics.latency('transactions.confirmation', unconfirmedResult.latencyMs);

  if (unconfirmedTransaction) {
    return {
      id: transactionId,
      state: 'unconfirmed',
      confirmations: 0,
      blockId: null,
      height: null,
      error: null
    };
  }

  const queuedResult = await client.get('/api/transactions/queued/get?id=' + encodedId);
  const queuedTransaction = queuedResult.body && queuedResult.body.transaction;

  context.metrics.latency('transactions.confirmation', queuedResult.latencyMs);

  return {
    id: transactionId,
    state: queuedTransaction ? 'queued' : 'missing',
    confirmations: 0,
    blockId: null,
    height: null,
    error: queuedTransaction ? null : (
      queuedResult.body && queuedResult.body.error
    )
  };
}

/**
 * Summarizes final confirmation states for concurrent spends.
 * @param {Array<object>} states - Per-transaction confirmation states.
 */
function summarizeConcurrentSpendStates (states) {
  const confirmed = states.filter(function (state) {
    return state.confirmations > 0;
  });

  return {
    confirmedCount: confirmed.length,
    minimumConfirmations: confirmed.length ?
      Math.min.apply(null, confirmed.map(function (state) {
        return state.confirmations;
      })) :
      0,
    notConfirmedCount: states.length - confirmed.length,
    transactions: states
  };
}

/**
 * Runs a bounded concurrent malformed-transaction overload check.
 * @param {object} context - Runner context.
 * @param {HttpClient} client - Target REST client.
 */
async function runTransactionOverload (context, client) {
  const started = Date.now();
  const total = context.options.transactionOverloadCount;
  const concurrency = Math.max(1, context.options.transactionOverloadConcurrency);
  let cursor = 0;
  let rejected = 0;
  let failed = 0;
  const samples = [];

  /**
   * Claims overload submissions from a shared bounded cursor.
   */
  async function worker () {
    while (cursor < total) {
      const index = cursor++;
      const result = await client.post('/api/transactions/process', {
        transaction: buildMalformedOverloadTransaction(index)
      });
      const didReject = !result.body || result.body.success === false;

      context.metrics.latency('abuse.overload_submit', result.latencyMs);
      if (didReject && result.status >= 200 && result.status < 500) {
        rejected++;
      } else {
        failed++;
      }

      if (samples.length < 5) {
        samples.push({
          index,
          status: result.status,
          rejected: didReject,
          error: result.body && (result.body.error || result.body.message)
        });
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(total, 1)) }, worker));

  context.assert(failed === 0, 'Transaction overload had ' + failed + ' non-rejected submissions.');
  context.metrics.increment('abuse.overload_rejected', rejected);

  const elapsedSec = Math.max((Date.now() - started) / 1000, 0.001);

  return {
    id: 'transaction-overload',
    reason: 'Concurrent malformed transaction submissions must be rejected without HTTP 5xx or accepted payloads.',
    total,
    concurrency,
    rejected,
    failed,
    throughputRps: Math.round((rejected / elapsedSec) * 100) / 100,
    samples
  };
}

/**
 * Builds one malformed payload for overload checks.
 * @param {number} index - Submission index.
 */
function buildMalformedOverloadTransaction (index) {
  const variants = [
    { type: 'bad', repeat: index },
    { type: 999, timestamp: index, asset: {} },
    { type: transactionTypes.SEND, amount: -index - 1, asset: {} },
    { type: transactionTypes.CHAT_MESSAGE, asset: { chat: { type: 99 } } }
  ];

  return variants[index % variants.length];
}

/**
 * Polls node status until readiness criteria are met.
 * @param {object} context - Runner context.
 * @param {object} node - Target node metadata.
 */
async function waitForReady (context, node) {
  const client = context.clientFor(node);
  const deadline = Date.now() + context.options.readyTimeoutMs;
  let lastResult;

  while (Date.now() < deadline) {
    lastResult = await client.get('/api/node/status');
    context.metrics.latency('readiness.status', lastResult.latencyMs);

    if (isPermanentReadinessFailure(lastResult)) {
      const error = Error(
          'Node ' +
          node.id +
          ' cannot be inspected: ' +
          (lastResult.body && lastResult.body.error || lastResult.error)
      );

      error.lastResult = lastResult;
      throw error;
    }

    if (
      lastResult.ok &&
      lastResult.body &&
      lastResult.body.success &&
      lastResult.body.loader &&
      lastResult.body.loader.loaded &&
      !lastResult.body.loader.syncing &&
      lastResult.body.network &&
      lastResult.body.network.height >= context.options.minHeight
    ) {
      return lastResult;
    }

    await sleep(context.options.pollIntervalMs);
  }

  const error = Error(
      'Node ' +
      node.id +
      ' was not ready before timeout. Last response: ' +
      JSON.stringify(lastResult && lastResult.body)
  );

  error.lastResult = lastResult;
  throw error;
}

/**
 * Detects readiness responses that cannot become successful through polling.
 * @param {object} result - HTTP client result.
 */
function isPermanentReadinessFailure (result) {
  const error = result && (
    result.error ||
    result.body && result.body.error
  );

  return typeof error === 'string' && /api access denied/i.test(error);
}

/**
 * Waits until the primary node reaches a target height.
 * @param {object} context - Runner context.
 * @param {number} blocks - Number of blocks to wait.
 */
async function waitForBlocks (context, blocks) {
  const client = context.clientFor(context.primaryNode);
  const start = await client.get('/api/blocks/getHeight');
  const startHeight = start.body && start.body.height;

  if (!startHeight) {
    throw Error('Unable to read start height before waiting for blocks.');
  }

  const target = startHeight + blocks;
  const deadline = Date.now() + context.options.blockWaitTimeoutMs;

  while (Date.now() < deadline) {
    const current = await client.get('/api/blocks/getHeight');

    context.metrics.latency('blocks.height', current.latencyMs);
    if (current.body && current.body.height >= target) {
      return current.body.height;
    }

    await sleep(context.options.pollIntervalMs);
  }

  throw Error('Timed out waiting for height ' + target + '.');
}

/**
 * Waits until an account has at least the expected confirmed balance.
 * @param {object} context - Runner context.
 * @param {HttpClient} client - Target REST client.
 * @param {string} address - Account address.
 * @param {number|string} minimumBalance - Required confirmed balance.
 * @param {string} label - Human-readable wait label.
 */
async function waitForAccountBalance (context, client, address, minimumBalance, label) {
  const deadline = Date.now() + context.options.blockWaitTimeoutMs;
  const expected = BigInt(String(minimumBalance));
  let lastBody;

  while (Date.now() < deadline) {
    const result = await client.get('/api/accounts/getBalance?address=' + encodeURIComponent(address));

    context.metrics.latency('accounts.balance', result.latencyMs);
    lastBody = result.body;

    if (result.ok && result.body && result.body.success) {
      const balance = BigInt(result.body.balance || '0');

      if (balance >= expected) {
        return balance.toString();
      }
    }

    await sleep(context.options.pollIntervalMs);
  }

  throw Error(
      'Timed out waiting for ' +
      label +
      ' balance >= ' +
      expected.toString() +
      ' on ' +
      address +
      '. Last response: ' +
      JSON.stringify(lastBody)
  );
}

/**
 * Waits until an account delegate relationship reaches the expected state.
 * @param {object} context - Runner context.
 * @param {HttpClient} client - Target REST client.
 * @param {string} address - Account address.
 * @param {string} delegatePublicKey - Delegate public key.
 * @param {boolean} expectedPresent - Whether the delegate should be present.
 * @param {string} label - Human-readable wait label.
 */
async function waitForAccountDelegate (context, client, address, delegatePublicKey, expectedPresent, label) {
  const deadline = Date.now() + context.options.blockWaitTimeoutMs;
  let lastBody;

  while (Date.now() < deadline) {
    const result = await client.get('/api/accounts/delegates?address=' + encodeURIComponent(address));

    context.metrics.latency('accounts.delegates', result.latencyMs);
    lastBody = result.body;

    if (result.ok && result.body && result.body.success) {
      const delegates = result.body.delegates || [];
      const present = delegates.some(function (delegate) {
        return delegate.publicKey === delegatePublicKey;
      });

      if (present === expectedPresent) {
        return {
          present,
          delegatesCount: delegates.length
        };
      }
    }

    await sleep(context.options.pollIntervalMs);
  }

  throw Error(
      'Timed out waiting for ' +
      label +
      ' delegate ' +
      delegatePublicKey +
      ' expectedPresent=' +
      expectedPresent +
      ' on ' +
      address +
      '. Last response: ' +
      JSON.stringify(lastBody)
  );
}

/**
 * Waits until a registered DApp is visible through the public API.
 * @param {object} context - Runner context.
 * @param {HttpClient} client - Target REST client.
 * @param {string} dappId - DApp transaction id.
 * @param {string} label - Human-readable wait label.
 */
async function waitForDapp (context, client, dappId, label) {
  const deadline = Date.now() + context.options.blockWaitTimeoutMs;
  let lastBody;

  while (Date.now() < deadline) {
    const result = await client.get('/api/dapps/get?id=' + encodeURIComponent(dappId));

    context.metrics.latency('dapps.get', result.latencyMs);
    lastBody = result.body;

    if (result.ok && result.body && result.body.success && result.body.dapp && result.body.dapp.transactionId === dappId) {
      return result.body.dapp;
    }

    await sleep(context.options.pollIntervalMs);
  }

  throw Error(
      'Timed out waiting for ' +
      label +
      ' dapp ' +
      dappId +
      '. Last response: ' +
      JSON.stringify(lastBody)
  );
}

/**
 * Records a non-fatal transaction rejection in metrics and scenario result data.
 * @param {object} context - Runner context.
 * @param {Array<object>} rejections - Scenario rejection sink.
 * @param {string} label - Rejected transaction label.
 * @param {object} result - HTTP client result.
 */
function recordTransactionRejection (context, rejections, label, result) {
  context.metrics.increment('transactions.rejected');
  rejections.push({
    label,
    status: result.status,
    error: result.body && (result.body.error || result.body.message),
    body: result.body
  });
}

/**
 * Classifies a rejected HTTP/API response for human-readable security reports.
 * @param {object} result - HTTP client result.
 */
function classifyRejection (result) {
  if (!result.ok) {
    return {
      rejectedBy: result.status === 0 ? 'transport' : 'http',
      howRejected: result.error || ('HTTP status ' + result.status)
    };
  }

  if (result.body && result.body.success === false) {
    return {
      rejectedBy: 'node validation',
      howRejected: result.body.error || result.body.message || 'success=false'
    };
  }

  return {
    rejectedBy: 'unknown',
    howRejected: 'empty or non-success response'
  };
}

/**
 * Clones a transaction-like JSON object for mutation in abuse checks.
 * @param {object} transaction - Transaction object.
 */
function cloneTransaction (transaction) {
  return JSON.parse(JSON.stringify(transaction));
}

/**
 * Opens a client WebSocket, emits subscription messages, and closes it.
 * @param {string} wsClientUrl - WebSocket URL.
 * @param {number} timeoutMs - Connection timeout.
 * @param {Array<object>} subscriptions - Subscription events to emit after connecting.
 */
function checkWebSocket (wsClientUrl, timeoutMs, subscriptions) {
  const started = Date.now();

  return new Promise(function (resolve) {
    let settled = false;
    const socket = io(wsClientUrl, {
      timeout: timeoutMs,
      reconnection: false,
      transports: ['websocket']
    });
    const timer = setTimeout(function () {
      if (settled) {
        return;
      }

      settled = true;
      socket.close();
      resolve({
        connected: false,
        disconnected: true,
        subscriptions: [],
        error: 'timeout',
        latencyMs: Date.now() - started
      });
    }, timeoutMs);

    socket.on('connect', function () {
      const emitted = subscriptions.map(function (subscription) {
        socket.emit(subscription.event, subscription.value);
        return subscription;
      });

      socket.once('disconnect', function () {
        if (settled) {
          return;
        }

        settled = true;
        clearTimeout(timer);
        resolve({
          connected: true,
          disconnected: true,
          subscriptions: emitted,
          latencyMs: Date.now() - started
        });
      });
      socket.close();
    });

    socket.on('connect_error', function (error) {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timer);
      socket.close();
      resolve({
        connected: false,
        disconnected: true,
        subscriptions: [],
        error: error.message,
        latencyMs: Date.now() - started
      });
    });
  });
}

/**
 * Converts a fixture account into a transaction-signing account object.
 * @param {object} fixture - Fixture account with secret and public metadata.
 */
function accountFromFixture (fixture) {
  return {
    address: fixture.address,
    publicKey: fixture.publicKey,
    secret: fixture.secret,
    keypair: tx.keypairFromSecret(fixture.secret)
  };
}

/**
 * Builds report-safe transaction metadata.
 * @param {object} transaction - Full transaction object.
 * @param {string} [label] - Human-readable transaction label.
 */
function publicTransaction (transaction, label) {
  const metadata = {
    id: transaction.id,
    label,
    type: transaction.type,
    typeName: tx.getTransactionTypeName(transaction.type),
    senderId: transaction.senderId,
    recipientId: transaction.recipientId,
    amount: transaction.amount,
    fee: transaction.fee
  };

  if (transaction.type === transactionTypes.CHAT_MESSAGE && transaction.asset && transaction.asset.chat) {
    metadata.subtype = transaction.asset.chat.type;
    metadata.subtypeName = tx.getChatMessageTypeName(transaction.asset.chat.type);
  } else if (transaction.type === transactionTypes.STATE && transaction.asset && transaction.asset.state) {
    metadata.subtype = transaction.asset.state.type;
    metadata.subtypeName = 'STATE_TYPE_' + transaction.asset.state.type;
  }

  return metadata;
}

/**
 * Formats a node API error for assertions.
 * @param {?object} body - Response body.
 */
function formatApiError (body) {
  if (!body) {
    return 'empty response body';
  }

  return body.error || body.message || JSON.stringify(body);
}

/**
 * Sleeps for the requested duration.
 * @param {number} ms - Milliseconds to wait.
 */
function sleep (ms) {
  return new Promise(function (resolve) {
    setTimeout(resolve, ms);
  });
}

module.exports = {
  NORMAL_LOAD_PROFILES,
  SCENARIOS,
  STRESS_LOAD_PROFILES,
  TXBURST_TYPE0_COUNT,
  TXBURST_REQUEST_TIMEOUT_MS,
  buildApiDiscovery,
  buildConsensusActivationDefinitions,
  buildConsensusActivationObservation,
  buildConsensusAgreement,
  buildLiveConsensusPlan,
  buildDynamicRestApiChecks,
  buildConsensusSwitches,
  buildDocumentedComplexApiChecks,
  buildQueryLanguageApiChecks,
  buildRestApiChecks,
  buildRewardStage,
  calculateLiveBroadhashConsensus,
  collectAcceptedPoolStates,
  collectAcceptedTransactionStates,
  collectBlockchainTps,
  collectConsensusNodeObservation,
  collectLiveConsensusNetworkState,
  collectFinalAcceptedTransactionStates,
  collectTargetNodeDetails,
  collectTransactionPoolSnapshot,
  createRandomChatMessage,
  createTransactionBurst,
  createTxQueueTransaction,
  executeRestApiCheck,
  formatAdamantAmount,
  formatObservedNodeVersion,
  getConsensusObservationNodes,
  getTransactionObservationNodes,
  inspectTimestampMs,
  isDelegateListSorted,
  logLiveConsensusProgress,
  runLiveConsensusTransitionLoad,
  runLiveConsensusWorkload,
  isScenarioEnabledByOptions,
  publicBlockForgingResult,
  publicConfirmationResult,
  recordReason,
  roundRate,
  selectScenarios,
  setSnapshotAcceptedProgress,
  submitTransactionBurst,
  summarizeConfirmationOutcome,
  waitForAcceptedTransactionsConfirmed
};
