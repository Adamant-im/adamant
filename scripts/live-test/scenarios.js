'use strict';

const crypto = require('crypto');
const { io } = require('socket.io-client');

const transactionTypes = require('../../helpers/transactionTypes.js');
const tx = require('./transactions.js');

const NORMAL_LOAD_PROFILES = {
  baseline: { requests: 5, concurrency: 1 },
  sustained: { requests: 20, concurrency: 2 },
  high: { requests: 60, concurrency: 6 }
};

const STRESS_LOAD_PROFILES = {
  overload: { requests: 200, concurrency: 20 }
};

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
    id: 'load.stress',
    suite: 'load',
    modes: ['testnet', 'localnet'],
    stress: true,
    description: 'Run opt-in overload profile.',
    run: runStressScenario
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
      return !scenario.stress || options.unsafeStress;
    });
  } else if (options.scenarios && options.scenarios.length) {
    selected = selected.filter(function (scenario) {
      return options.scenarios.indexOf(scenario.id) !== -1;
    });
  } else if (options.suites && options.suites.length) {
    selected = selected.filter(function (scenario) {
      return options.suites.indexOf(scenario.suite) !== -1 && (!scenario.stress || options.unsafeStress);
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
 * Waits until every target node is loaded, not syncing, and above min height.
 * @param {object} context - Runner context.
 */
async function runReadinessScenario (context) {
  await Promise.all(context.target.nodes.map(function (node) {
    return waitForReady(context, node);
  }));

  return {
    nodes: context.target.nodes.map(function (node) {
      return {
        id: node.id,
        ready: true
      };
    })
  };
}

/**
 * Exercises public REST endpoints expected by clients and explorers.
 * @param {object} context - Runner context.
 */
async function runRestApiScenario (context) {
  const node = context.primaryNode;
  const client = context.clientFor(node);
  const fixture = context.fixtureAccounts.transfer || context.fixtureAccounts.genesis;
  const endpoints = [
    ['/api/node/status'],
    ['/api/loader/status/sync'],
    ['/api/blocks/getHeight'],
    ['/api/blocks/getStatus'],
    ['/api/blocks?limit=1&orderBy=height:desc'],
    ['/api/transactions?limit=1'],
    ['/api/delegates?limit=5'],
    ['/api/peers?limit=5']
  ];

  if (fixture && fixture.address) {
    endpoints.push(['/api/accounts/getBalance?address=' + fixture.address]);
  }

  const results = [];

  for (const endpoint of endpoints) {
    const result = await client.get(endpoint[0]);

    context.metrics.latency('rest.get', result.latencyMs);
    context.assert(result.ok, 'GET ' + endpoint[0] + ' returned HTTP ' + result.status);
    context.assert(result.body && result.body.success !== false, 'GET ' + endpoint[0] + ' returned unsuccessful body');
    results.push({
      path: endpoint[0],
      latencyMs: result.latencyMs
    });
  }

  return {
    endpoints: results
  };
}

/**
 * Verifies client WebSocket connectivity and a basic transaction type subscription.
 * @param {object} context - Runner context.
 */
async function runWebSocketScenario (context) {
  const node = context.primaryNode;

  if (!node.wsClientUrl) {
    return context.skip('Node does not advertise an enabled client WebSocket endpoint.');
  }

  const result = await checkWebSocket(node.wsClientUrl, context.options.timeoutMs);

  context.metrics.latency('ws.connect', result.latencyMs);
  context.assert(result.connected, 'WebSocket connection failed: ' + (result.error || 'unknown error'));

  return {
    wsClientUrl: node.wsClientUrl,
    latencyMs: result.latencyMs
  };
}

/**
 * Reports observed pre/post activation state for configured consensus switches.
 * @param {object} context - Runner context.
 */
async function runConsensusActivationScenario (context) {
  const status = await context.clientFor(context.primaryNode).get('/api/node/status');

  context.assert(status.ok && status.body && status.body.success, 'Unable to read /api/node/status');

  const height = status.body.network.height;
  const activationHeights = context.configMetadata.consensusActivationHeights || {};
  const switches = ['fairSystem', 'spaceship'].map(function (name) {
    const activationHeight = activationHeights[name];

    return {
      name,
      activationHeight,
      state: activationHeight === undefined ? 'unknown' :
        height >= activationHeight ? 'post-activation-observed' : 'pre-activation-observed',
      distance: activationHeight === undefined ? null : activationHeight - height
    };
  });

  context.assert(switches.some(function (item) {
    return item.activationHeight !== undefined;
  }), 'No consensusActivationHeights metadata available for activation scenario.');

  if (context.target.nodes.length > 1) {
    await assertNodeAgreement(context);
  }

  return {
    height,
    switches
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
  const transactions = [];

  const funding = tx.createSendTransaction(funded, fresh.address, context.options.fundingAmount);
  await submitTransaction(context, client, '/api/transactions/process', { transaction: funding }, 'fund fresh account');
  transactions.push(publicTransaction(funding));

  if (context.options.waitBlocks > 0) {
    await waitForBlocks(context, context.options.waitBlocks);
  }

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
    context.metrics.increment('transactions.rejected');
  }

  const delegates = await client.get('/api/delegates?limit=1');
  const voteTarget = delegates.body && delegates.body.delegates && delegates.body.delegates[0];

  if (voteTarget && voteTarget.publicKey) {
    const vote = tx.createVoteTransaction(fresh, ['+' + voteTarget.publicKey]);
    const voteResult = await client.post('/api/accounts/delegates', vote);
    context.metrics.latency('transaction.submit', voteResult.latencyMs);
    if (voteResult.body && voteResult.body.success) {
      transactions.push(publicTransaction(vote));
    } else {
      context.metrics.increment('transactions.rejected');
    }

    const unvote = tx.createVoteTransaction(fresh, ['-' + voteTarget.publicKey]);
    const unvoteResult = await client.post('/api/accounts/delegates', unvote);
    context.metrics.latency('transaction.submit', unvoteResult.latencyMs);
    if (unvoteResult.body && unvoteResult.body.success) {
      transactions.push(publicTransaction(unvote));
    } else {
      context.metrics.increment('transactions.rejected');
    }
  }

  const chat = tx.createChatTransaction(fresh, recipient.address);
  const chatResult = await client.post('/api/transactions', { transaction: chat });
  context.metrics.latency('transaction.submit', chatResult.latencyMs);
  if (chatResult.body && chatResult.body.success) {
    transactions.push(publicTransaction(chat));
  } else {
    context.metrics.increment('transactions.rejected');
  }

  const state = tx.createStateTransaction(fresh, 'live-test-' + crypto.randomBytes(4).toString('hex'), 'ok');
  const stateResult = await client.post('/api/transactions', { transaction: state });
  context.metrics.latency('transaction.submit', stateResult.latencyMs);
  if (stateResult.body && stateResult.body.success) {
    transactions.push(publicTransaction(state));
  } else {
    context.metrics.increment('transactions.rejected');
  }

  context.metrics.increment('transactions.accepted', transactions.length);

  return {
    fundedAccount: tx.publicFixtureAccount(fixture),
    freshAccount: {
      address: fresh.address,
      publicKey: fresh.publicKey
    },
    transactions
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
  const doubleSpendSender = tx.createAccount();
  const doubleSpendRecipient = tx.createAccount();
  const valid = tx.createSendTransaction(funded, recipient.address, context.options.transferAmount);
  const duplicate = tx.createSendTransaction(funded, duplicateRecipient.address, context.options.transferAmount);
  const invalidSignature = Object.assign({}, valid, {
    id: undefined,
    signature: crypto.randomBytes(64).toString('hex')
  });
  const negativeAmount = tx.createSendTransaction(funded, recipient.address, context.options.transferAmount);

  negativeAmount.amount = -1;
  negativeAmount.id = undefined;

  const checks = [
    {
      id: 'invalid-signature',
      request: function () {
        return client.post('/api/transactions/process', { transaction: invalidSignature });
      }
    },
    {
      id: 'negative-amount',
      request: function () {
        return client.post('/api/transactions/process', { transaction: negativeAmount });
      }
    },
    {
      id: 'malformed-json-shape',
      request: function () {
        return client.post('/api/transactions/process', { transaction: { type: 'bad' } });
      }
    }
  ];
  const results = [];

  for (const check of checks) {
    const result = await check.request();
    const rejected = !result.body || result.body.success === false;

    context.metrics.latency('abuse.submit', result.latencyMs);
    context.assert(rejected, 'Abuse check unexpectedly succeeded: ' + check.id);
    context.metrics.increment('abuse.rejected');
    results.push({
      id: check.id,
      rejected,
      status: result.status,
      error: result.body && (result.body.error || result.body.message)
    });
  }

  // Keep repeated invalid submissions intentionally small; public testnet safety matters.
  const repeatedInvalid = [];
  for (let index = 0; index < context.options.repeatedInvalidCount; index++) {
    const result = await client.post('/api/transactions/process', { transaction: { type: 'bad', repeat: index } });
    const rejected = !result.body || result.body.success === false;

    context.metrics.latency('abuse.submit', result.latencyMs);
    context.assert(rejected, 'Repeated invalid submission unexpectedly succeeded at index ' + index);
    context.metrics.increment('abuse.rejected');
    repeatedInvalid.push({
      rejected,
      status: result.status
    });
  }
  results.push({
    id: 'repeated-invalid-submissions',
    rejected: true,
    attempts: repeatedInvalid.length
  });

  const duplicateFirst = await client.post('/api/transactions/process', { transaction: duplicate });
  const duplicateSecond = await client.post('/api/transactions/process', { transaction: duplicate });

  context.metrics.latency('abuse.submit', duplicateFirst.latencyMs);
  context.metrics.latency('abuse.submit', duplicateSecond.latencyMs);
  context.assert(duplicateFirst.body && duplicateFirst.body.success, 'Duplicate setup transaction was rejected: ' + formatApiError(duplicateFirst.body));
  context.assert(!duplicateSecond.body || duplicateSecond.body.success === false, 'Duplicate transaction unexpectedly succeeded.');
  context.metrics.increment('abuse.rejected');
  results.push({
    id: 'duplicate-transaction',
    rejected: true,
    status: duplicateSecond.status,
    error: duplicateSecond.body && (duplicateSecond.body.error || duplicateSecond.body.message)
  });

  const funding = tx.createSendTransaction(funded, doubleSpendSender.address, 3 * 100000000);
  await submitTransaction(context, client, '/api/transactions/process', { transaction: funding }, 'double-spend funding');

  if (context.options.waitBlocks > 0) {
    await waitForBlocks(context, context.options.waitBlocks);
  }

  // Both spends are valid in isolation, but together they exceed the freshly funded unconfirmed balance.
  const firstSpend = tx.createSendTransaction(doubleSpendSender, doubleSpendRecipient.address, 250000000);
  const secondSpend = tx.createSendTransaction(doubleSpendSender, duplicateRecipient.address, 250000000);
  const firstSpendResult = await client.post('/api/transactions/process', { transaction: firstSpend });
  const secondSpendResult = await client.post('/api/transactions/process', { transaction: secondSpend });

  context.metrics.latency('abuse.submit', firstSpendResult.latencyMs);
  context.metrics.latency('abuse.submit', secondSpendResult.latencyMs);
  context.assert(firstSpendResult.body && firstSpendResult.body.success, 'Double-spend setup transaction was rejected: ' + formatApiError(firstSpendResult.body));
  context.assert(!secondSpendResult.body || secondSpendResult.body.success === false, 'Double-spend attempt unexpectedly succeeded.');
  context.metrics.increment('abuse.rejected');
  results.push({
    id: 'double-spend-unconfirmed-balance',
    rejected: true,
    status: secondSpendResult.status,
    error: secondSpendResult.body && (secondSpendResult.body.error || secondSpendResult.body.message)
  });

  return {
    checks: results
  };
}

/**
 * Checks localnet delegate and forging related public/private API state.
 * @param {object} context - Runner context.
 */
async function runDelegatesScenario (context) {
  const results = [];

  for (const node of context.target.nodes) {
    const client = context.clientFor(node);
    const status = await client.get('/api/delegates/forging/status');
    const delegates = await client.get('/api/delegates?limit=101');
    const nextForgers = await client.get('/api/delegates/getNextForgers?limit=10');

    context.metrics.latency('delegates.status', status.latencyMs);
    context.metrics.latency('delegates.list', delegates.latencyMs);
    context.assert(delegates.ok && delegates.body && delegates.body.success, 'Unable to list delegates for ' + node.id);
    context.assert(nextForgers.ok && nextForgers.body && nextForgers.body.success, 'Unable to list next forgers for ' + node.id);

    results.push({
      id: node.id,
      delegateSecretsCount: node.delegateSecretsCount,
      forgingEnabled: status.body && status.body.enabled,
      delegatesCount: delegates.body && delegates.body.delegates && delegates.body.delegates.length,
      nextForgersCount: nextForgers.body && nextForgers.body.delegates && nextForgers.body.delegates.length
    });
  }

  return {
    nodes: results
  };
}

/**
 * Runs the selected normal HTTP load profile.
 * @param {object} context - Runner context.
 */
async function runLoadScenario (context) {
  const profile = NORMAL_LOAD_PROFILES[context.options.profile] || NORMAL_LOAD_PROFILES.baseline;

  return runHttpLoad(context, profile, false);
}

/**
 * Runs the selected opt-in stress profile.
 * @param {object} context - Runner context.
 */
async function runStressScenario (context) {
  const profile = STRESS_LOAD_PROFILES[context.options.profile] || STRESS_LOAD_PROFILES.overload;

  return runHttpLoad(context, profile, true);
}

/**
 * Executes concurrent `/api/node/status` requests and reports throughput.
 * @param {object} context - Runner context.
 * @param {object} profile - Load profile.
 * @param {boolean} stress - Whether this is an opt-in stress profile.
 */
async function runHttpLoad (context, profile, stress) {
  const client = context.clientFor(context.primaryNode);
  const started = Date.now();
  let completed = 0;
  let failed = 0;
  let cursor = 0;

  /**
   * Claims and executes work items from the shared bounded cursor.
   */
  async function worker () {
    while (cursor < profile.requests) {
      // JavaScript runs this cursor mutation on one event loop, giving a simple bounded work queue.
      cursor++;
      const result = await client.get('/api/node/status');

      context.metrics.latency(stress ? 'stress.status' : 'load.status', result.latencyMs);
      if (result.ok && result.body && result.body.success) {
        completed++;
      } else {
        failed++;
      }
    }
  }

  await Promise.all(Array.from({ length: profile.concurrency }, worker));

  const elapsedSec = Math.max((Date.now() - started) / 1000, 0.001);
  const throughput = Math.round((completed / elapsedSec) * 100) / 100;

  context.assert(failed === 0, 'Load profile had ' + failed + ' failed requests.');

  return {
    profile,
    completed,
    failed,
    throughputRps: throughput
  };
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

  throw Error('Node ' + node.id + ' was not ready before timeout. Last response: ' + JSON.stringify(lastResult && lastResult.body));
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
 * Checks basic localnet chain agreement across target nodes.
 * @param {object} context - Runner context.
 */
async function assertNodeAgreement (context) {
  const statuses = [];

  for (const node of context.target.nodes) {
    const status = await context.clientFor(node).get('/api/node/status');

    context.assert(status.ok && status.body && status.body.success, 'Unable to read status from ' + node.id);
    statuses.push({
      id: node.id,
      height: status.body.network.height,
      broadhash: status.body.network.broadhash,
      nethash: status.body.network.nethash
    });
  }

  const minHeight = Math.min.apply(null, statuses.map(function (status) {
    return status.height;
  }));
  const maxHeight = Math.max.apply(null, statuses.map(function (status) {
    return status.height;
  }));
  const nethashes = new Set(statuses.map(function (status) {
    return status.nethash;
  }));

  context.assert(nethashes.size === 1, 'Localnet nodes disagree on nethash.');
  context.assert(maxHeight - minHeight <= context.options.maxHeightDrift, 'Localnet nodes exceed allowed height drift.');
}

/**
 * Opens and closes a client WebSocket connection.
 * @param {string} wsClientUrl - WebSocket URL.
 * @param {number} timeoutMs - Connection timeout.
 */
function checkWebSocket (wsClientUrl, timeoutMs) {
  const started = Date.now();

  return new Promise(function (resolve) {
    const socket = io(wsClientUrl, {
      timeout: timeoutMs,
      reconnection: false,
      transports: ['websocket']
    });
    const timer = setTimeout(function () {
      socket.close();
      resolve({
        connected: false,
        error: 'timeout',
        latencyMs: Date.now() - started
      });
    }, timeoutMs);

    socket.on('connect', function () {
      socket.emit('types', transactionTypes.SEND);
      clearTimeout(timer);
      socket.close();
      resolve({
        connected: true,
        latencyMs: Date.now() - started
      });
    });

    socket.on('connect_error', function (error) {
      clearTimeout(timer);
      socket.close();
      resolve({
        connected: false,
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
 */
function publicTransaction (transaction) {
  return {
    id: transaction.id,
    type: transaction.type,
    senderId: transaction.senderId,
    recipientId: transaction.recipientId,
    amount: transaction.amount,
    fee: transaction.fee
  };
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
  selectScenarios
};
