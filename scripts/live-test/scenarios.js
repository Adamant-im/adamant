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
  buildConsensusSwitches,
  buildRewardStage,
  calculateLiveBroadhashConsensus,
  collectAcceptedPoolStates,
  collectAcceptedTransactionStates,
  collectBlockchainTps,
  collectFinalAcceptedTransactionStates,
  collectTransactionPoolSnapshot,
  createRandomChatMessage,
  createTransactionBurst,
  createTxQueueTransaction,
  formatAdamantAmount,
  formatObservedNodeVersion,
  getTransactionObservationNodes,
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
