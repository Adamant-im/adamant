'use strict';

var async = require('async');
var bignum = require('../helpers/bignum.js');
var BlockReward = require('../logic/blockReward.js');
var constants = require('../helpers/constants.js');
var jobsQueue = require('../helpers/jobsQueue.js');
var crypto = require('crypto');
var Delegate = require('../logic/delegate.js');
var accounts = require('../helpers/accounts.js');
var forgingControl = require('../helpers/forgingControl.js');
var forgingSecret = require('../helpers/forgingSecret.js');
var promptSecret = require('../helpers/promptSecret.js');
var extend = require('extend');
var OrderBy = require('../helpers/orderBy.js');
var sandboxHelper = require('../helpers/sandbox.js');
var schema = require('../schema/delegates.js');
var slots = require('../helpers/slots.js');
var sql = require('../sql/delegates.js');
var transactionTypes = require('../helpers/transactionTypes.js');

// Private fields
var modules, library, self, __private = {}, shared = {};

__private.assetTypes = {};
__private.loaded = false;
__private.blockReward = new BlockReward();
__private.keypairs = {};
__private.forgingSummaryLogged = false;
__private.encryptedEntries = [];
__private.encryptedKeypairsLoaded = {};
__private.encryptedOwnedKeypairs = {};
__private.plaintextKeypairsLoaded = {};
__private.plaintextDelegateCount = 0;
__private.invalidEncryptedDelegateCount = 0;
__private.forgingInitialized = false;
__private.forgingMutation = false;
__private.shuttingDown = false;
__private.controlServer = null;

/**
 * Initializes library with scope content and generates a Delegate instance.
 * Calls logic.transaction.attachAssetType().
 * @memberof module:delegates
 * @constructor
 * @classdesc Main delegates methods.
 * @param {function} cb - Callback function.
 * @param {scope} scope - App instance.
 * @return {setImmediateCallback} Callback function with `self` as data.
 */
// Constructor
function Delegates (cb, scope) {
  library = {
    logger: scope.logger,
    sequence: scope.sequence,
    ed: scope.ed,
    db: scope.db,
    network: scope.network,
    schema: scope.schema,
    balancesSequence: scope.balancesSequence,
    logic: {
      transaction: scope.logic.transaction,
      consensus: scope.logic.consensus || scope.consensus
    },
    config: {
      port: scope.config.port,
      forging: {
        secret: scope.config.forging.secret,
        controlSocket: scope.config.forging.controlSocket || ''
      }
    }
  };
  __private.loaded = false;
  __private.keypairs = {};
  __private.forgingSummaryLogged = false;
  __private.encryptedEntries = [];
  __private.encryptedKeypairsLoaded = {};
  __private.encryptedOwnedKeypairs = {};
  __private.plaintextKeypairsLoaded = {};
  __private.plaintextDelegateCount = 0;
  __private.invalidEncryptedDelegateCount = 0;
  __private.forgingInitialized = false;
  __private.forgingMutation = false;
  __private.shuttingDown = false;
  __private.controlServer = null;
  self = this;

  __private.assetTypes[transactionTypes.DELEGATE] = library.logic.transaction.attachAssetType(
      transactionTypes.DELEGATE,
      new Delegate(
          scope.schema
      )
  );

  setImmediate(cb, null, self);
}

// Private methods
__private.isFairSystemActivated = function (height) {
  return library.logic.consensus.isActivated('fairSystem', height);
};

/**
 * Gets delegate public keys sorted by vote descending.
 * @private
 * @param {function} cb - Callback function.
 * @return {setImmediateCallback}
 */
__private.getKeysSortByVote = function (cb) {
  modules.accounts.getAccounts({
    isDelegate: 1,
    sort: { 'vote': -1, 'publicKey': 1 },
    limit: slots.delegates
  }, ['publicKey'], function (err, rows) {
    if (err) {
      return setImmediate(cb, err);
    }
    return setImmediate(cb, null, rows.map(function (el) {
      return el.publicKey;
    }));
  });
};

/**
 * Gets delegate public keys sorted by votesWeight descending.
 * @private
 * @param {function} cb - Callback function.
 * @return {setImmediateCallback}
 */
__private.getKeysSortByVotesWeight = function (cb) {
  modules.accounts.getAccounts({
    isDelegate: 1,
    sort: { 'votesWeight': -1, 'publicKey': 1 },
    limit: slots.delegates
  }, ['publicKey'], function (err, rows) {
    if (err) {
      return setImmediate(cb, err);
    }
    return setImmediate(cb, null, rows.map(function (el) {
      return el.publicKey;
    }));
  });
};

/**
 * Gets slot time and keypair.
 * @private
 * @param {number} slot
 * @param {number} height
 * @param {function} cb - Callback function.
 * @return {setImmediateCallback} error | cb | object {time, keypair}.
 */
__private.getBlockSlotData = function (slot, height, cb) {
  self.generateDelegateList(height, function (err, activeDelegates) {
    if (err) {
      return setImmediate(cb, err);
    }

    var currentSlot = slot;
    var lastSlot = slots.getLastSlot(currentSlot);

    for (; currentSlot < lastSlot; currentSlot += 1) {
      var delegate_pos = currentSlot % slots.delegates;
      var delegate_id = activeDelegates[delegate_pos];

      if (delegate_id && __private.keypairs[delegate_id]) {
        return setImmediate(cb, null, { time: slots.getSlotTime(currentSlot), keypair: __private.keypairs[delegate_id] });
      }
    }

    return setImmediate(cb, null, null);
  });
};

/**
 * Gets peers, checks consensus and generates new block, once delegates
 * are enabled, client is ready to forge and is the correct slot.
 * Logs readiness flags and slot context when forging is skipped.
 * @private
 * @param {Function} cb - Callback function.
 * @return {setImmediateCallback}
 */
__private.forge = function (cb) {
  if (__private.forgingMutation || __private.shuttingDown) {
    return setImmediate(cb);
  }

  if (!Object.keys(__private.keypairs).length) {
    library.logger.debug('delegates', 'No delegates enabled');
    return __private.loadDelegates(cb);
  }

  // When client is not loaded, is syncing or round is ticking
  // Do not try to forge new blocks as client is not ready
  const syncPending = !modules.loader.isReadyToSync() || modules.loader.syncing();
  if (!__private.loaded || syncPending || !modules.rounds.loaded() || modules.rounds.ticking()) {
    library.logger.debug('delegates', 'Client not ready to forge', {
      loaded: __private.loaded,
      syncPending: syncPending,
      roundsLoaded: modules.rounds.loaded(),
      roundsTicking: modules.rounds.ticking()
    });
    return setImmediate(cb);
  }

  var currentSlot = slots.getSlotNumber();
  var lastBlock = modules.blocks.lastBlock.get();

  if (currentSlot === slots.getSlotNumber(lastBlock.timestamp)) {
    library.logger.debug('delegates', 'Waiting for next delegate slot', {
      currentSlot: currentSlot,
      lastBlockId: lastBlock.id,
      lastBlockHeight: lastBlock.height,
      lastBlockTimestamp: lastBlock.timestamp
    });
    return setImmediate(cb);
  }

  __private.getBlockSlotData(currentSlot, lastBlock.height + 1, function (err, currentBlockData) {
    if (err || currentBlockData === null) {
      library.logger.warn('delegates', 'Skipping delegate slot', err);
      return setImmediate(cb);
    }

    if (slots.getSlotNumber(currentBlockData.time) !== slots.getSlotNumber()) {
      library.logger.debug('delegates', 'Delegate slot', slots.getSlotNumber());
      return setImmediate(cb);
    }

    var keypair = currentBlockData.keypair;
    var publicKey = keypair.publicKey.toString('hex');

    if (__private.forgingMutation || __private.shuttingDown) {
      return setImmediate(cb);
    }

    library.sequence.add(function (sequenceCb) {
      if (
        __private.forgingMutation ||
        __private.shuttingDown ||
        __private.keypairs[publicKey] !== keypair
      ) {
        return setImmediate(sequenceCb, null, { forged: false });
      }

      async.series({
        getPeers: function (seriesCb) {
          return modules.transport.getPeers({ limit: constants.maxPeers }, seriesCb);
        },
        checkBroadhash: function (seriesCb) {
          if (modules.transport.poorConsensus()) {
            return setImmediate(seriesCb, ['Inadequate broadhash consensus', modules.transport.consensus(), '%'].join(' '));
          } else {
            return setImmediate(seriesCb);
          }
        }
      }, function (err) {
        if (err) {
          library.logger.warn('delegates', err);
          return setImmediate(sequenceCb, err);
        }

        if (
          __private.forgingMutation ||
          __private.shuttingDown ||
          __private.keypairs[publicKey] !== keypair ||
          slots.getSlotNumber(currentBlockData.time) !== slots.getSlotNumber()
        ) {
          return setImmediate(sequenceCb, null, { forged: false });
        }

        return modules.blocks.process.generateBlock(keypair, currentBlockData.time, function (generateErr) {
          return setImmediate(sequenceCb, generateErr, { forged: !generateErr });
        });
      });
    }, function (err, result) {
      if (err) {
        library.logger.error('delegates', 'Failed to generate block within delegate slot', err);
      } else if (result && result.forged) {
        var forgedBlock = modules.blocks.lastBlock.get();
        modules.blocks.lastReceipt.update();

        library.logger.info('delegates', [
          'Forged new block id:', forgedBlock.id,
          'height:', forgedBlock.height,
          'round:', modules.rounds.calc(forgedBlock.height),
          'slot:', slots.getSlotNumber(currentBlockData.time),
          'reward:' + forgedBlock.reward
        ].join(' '));
      }

      return setImmediate(cb);
    });
  });
};

/**
 * Checks each vote integrity and controls total votes don't exceed active delegates.
 * Calls modules.accounts.getAccount() to validate delegate account and votes accounts.
 * @private
 * @implements module:accounts#Account#getAccount
 * @param {publicKey} publicKey
 * @param {Array} votes
 * @param {string} state - 'confirmed' to delegates, otherwise u_delegates.
 * @param {function} cb - Callback function.
 * @return {setImmediateCallback} cb | error messages
 */
__private.checkDelegates = function (publicKey, votes, state, cb) {
  if (!Array.isArray(votes)) {
    return setImmediate(cb, 'Votes must be an array');
  }

  modules.accounts.getAccount({ publicKey: publicKey }, function (err, account) {
    if (err) {
      return setImmediate(cb, err);
    }

    if (!account) {
      return setImmediate(cb, 'Account not found');
    }

    var delegates = (state === 'confirmed') ? account.delegates : account.u_delegates;
    var existing_votes = Array.isArray(delegates) ? delegates.length : 0;
    var additions = 0, removals = 0;

    async.eachSeries(votes, function (action, cb) {
      var math = action[0];

      if (math === '+') {
        additions += 1;
      } else if (math === '-') {
        removals += 1;
      } else {
        return setImmediate(cb, 'Invalid math operator');
      }

      var publicKey = action.slice(1);

      try {
        Buffer.from(publicKey, 'hex');
      } catch (e) {
        library.logger.error('delegates', `Invalid public key: ${publicKey}`, e.stack);
        return setImmediate(cb, 'Invalid public key');
      }

      if (math === '+' && (delegates != null && delegates.indexOf(publicKey) !== -1)) {
        return setImmediate(cb, 'Failed to add vote, account has already voted for this delegate');
      }

      if (math === '-' && (delegates === null || delegates.indexOf(publicKey) === -1)) {
        return setImmediate(cb, 'Failed to remove vote, account has not voted for this delegate');
      }

      modules.accounts.getAccount({ publicKey: publicKey, isDelegate: 1 }, function (err, account) {
        if (err) {
          return setImmediate(cb, err);
        }

        if (!account) {
          return setImmediate(cb, 'Delegate not found');
        }

        return setImmediate(cb);
      });
    }, function (err) {
      if (err) {
        return setImmediate(cb, err);
      }

      var total_votes = (existing_votes + additions) - removals;

      if (total_votes > constants.activeDelegates) {
        var exceeded = total_votes - constants.activeDelegates;

        return setImmediate(cb, 'Maximum number of ' + constants.activeDelegates + ' votes exceeded (' + exceeded + ' too many)');
      } else {
        return setImmediate(cb);
      }
    });
  });
};

/**
 * Returns an unlock error whose text is safe to log and send to the CLI.
 * Library errors can embed the passphrase, so unknown messages are replaced.
 * @param {Error|string} err - Original failure.
 * @return {Error} Safe error.
 */
function publicUnlockError (err) {
  var message = err && err.message ? String(err.message) : (typeof err === 'string' ? err : '');
  var safe = /^(Wrong operator password|Decrypted passphrase|Operator password|Encrypted passphrase|Value is not|Failed to derive|Delegate account was not found)/.test(message);

  if (safe) {
    return err instanceof Error ? err : new Error(message);
  }

  return new Error('Failed to unlock delegate passphrases.');
}

/**
 * Wipes a signing key after forging is locked or an unlock is rolled back.
 * @param {object} keypair - Keypair to wipe.
 */
function wipeKeypair (keypair) {
  if (keypair && Buffer.isBuffer(keypair.privateKey)) {
    keypair.privateKey.fill(0);
  }
}

/**
 * Counts plaintext forging secrets that can still enable forging.
 * @param {Array} secrets - Plaintext config entries.
 * @return {number} Count of non-empty string secrets.
 */
function countPlaintextSecrets (secrets) {
  return secrets.filter(function (secret) {
    return typeof secret === 'string' && secret.length > 0;
  }).length;
}

/**
 * Builds a secret-free snapshot of forging lock state.
 * @return {object} Status safe to print and return over the control socket.
 */
__private.forgingStatusSnapshot = function () {
  var encryptedLoaded = 0;
  var delegates = [];
  var loadedKeys = Object.keys(__private.keypairs);

  __private.encryptedEntries.forEach(function (entry) {
    var loaded = !!__private.keypairs[entry.publicKey] && !!__private.encryptedKeypairsLoaded[entry.publicKey];

    if (loaded) {
      encryptedLoaded += 1;
    }

    delegates.push({
      publicKey: entry.publicKey,
      address: entry.address,
      source: 'encrypted',
      loaded: loaded
    });
  });

  loadedKeys.forEach(function (publicKey) {
    if (__private.encryptedKeypairsLoaded[publicKey]) {
      return;
    }

    delegates.push({
      publicKey: publicKey,
      address: accounts.getAddressByPublicKey(publicKey),
      source: 'plaintext',
      loaded: true
    });
  });

  return {
    forging: __private.forgingLockState(encryptedLoaded),
    encryptedDelegates: __private.encryptedEntries.length,
    invalidEncryptedDelegates: __private.invalidEncryptedDelegateCount,
    plaintextDelegates: __private.plaintextDelegateCount,
    loadedKeypairs: loadedKeys.length,
    delegates: delegates
  };
};

/**
 * Describes whether encrypted delegates are locked.
 * Plaintext delegates can still be loaded while encrypted ones stay locked.
 * @param {number} encryptedLoaded - Encrypted delegates currently in memory.
 * @return {string} `disabled`, `locked`, `partial`, or `unlocked`.
 */
__private.forgingLockState = function (encryptedLoaded) {
  if (!__private.encryptedEntries.length) {
    return Object.keys(__private.keypairs).length ? 'unlocked' : 'disabled';
  }

  if (!encryptedLoaded) {
    return Object.keys(__private.keypairs).length ? 'partial' : 'locked';
  }

  if (encryptedLoaded === __private.encryptedEntries.length) {
    return 'unlocked';
  }

  return 'partial';
};

/**
 * Starts the local forging control socket. A socket failure does not stop the node.
 * @param {function} cb - Callback after the attempt.
 */
__private.startForgingControl = function (cb) {
  forgingControl.start({
    port: library.config.port,
    controlSocket: library.config.forging.controlSocket
  }, {
    status: function () {
      return __private.forgingStatusSnapshot();
    },
    unlock: function (password, done) {
      __private.unlockWithPassword(password, done);
    },
    lock: function (done) {
      __private.lockEncryptedDelegates(done);
    }
  }, library.logger, function (err, server) {
    if (err) {
      library.logger.error(
          'delegates',
          'Forging control socket is unavailable: ' + err.message
      );
    } else {
      __private.controlServer = server;
    }

    return setImmediate(cb);
  });
};

/**
 * Decrypts every encrypted delegate passphrase with one operator password.
 * Only keypairs are kept. The password and passphrases are dropped after use.
 * A failed entry rolls back keypairs loaded by this attempt.
 * @param {string} password - Operator password.
 * @param {function} cb - Callback `(err, result)`.
 */
__private.unlockWithPassword = function (password, cb) {
  if (__private.shuttingDown) {
    return setImmediate(cb, new Error('Node is shutting down.'));
  }

  if (!__private.encryptedEntries.length) {
    return setImmediate(cb, new Error('No encrypted delegate passphrases are configured.'));
  }

  if (__private.forgingMutation) {
    return setImmediate(cb, new Error('An unlock is already in progress.'));
  }

  var pending = __private.encryptedEntries.filter(function (entry) {
    return !__private.encryptedKeypairsLoaded[entry.publicKey];
  });

  if (!pending.length) {
    return setImmediate(cb, new Error('Forging is already unlocked.'));
  }

  __private.forgingMutation = true;

  var unlocked = [];

  async.eachSeries(pending, function (entry, next) {
    var decrypted;
    var passphrase;
    var hash;
    var keypair;

    try {
      decrypted = forgingSecret.decrypt(entry.blob, password);
      passphrase = decrypted.passphrase;
      decrypted.passphrase = null;
      hash = library.ed.createPassPhraseHash(passphrase);
      passphrase = null;
      keypair = library.ed.makeKeypair(hash);
    } catch (err) {
      if (hash && Buffer.isBuffer(hash)) {
        hash.fill(0);
      }
      wipeKeypair(keypair);
      return setImmediate(next, publicUnlockError(err));
    } finally {
      if (hash && Buffer.isBuffer(hash)) {
        hash.fill(0);
      }
    }

    if (keypair.publicKey.toString('hex') !== entry.publicKey) {
      wipeKeypair(keypair);
      return setImmediate(next, new Error('Decrypted passphrase does not match the embedded public key.'));
    }

    modules.accounts.getAccount({
      publicKey: entry.publicKey
    }, function (err, account) {
      if (__private.shuttingDown) {
        wipeKeypair(keypair);
        return setImmediate(next, new Error('Node is shutting down.'));
      }

      if (err) {
        wipeKeypair(keypair);
        return setImmediate(next, publicUnlockError(err));
      }

      if (!account) {
        wipeKeypair(keypair);
        return setImmediate(next, new Error('Delegate account was not found for ' + entry.address));
      }

      if (!account.isDelegate) {
        wipeKeypair(keypair);
        library.logger.warn('delegates', 'Encrypted account is not a delegate: ' + account.address);
        return setImmediate(next);
      }

      unlocked.push({
        publicKey: entry.publicKey,
        keypair: keypair,
        address: account.address
      });
      return setImmediate(next);
    });
  }, function (err) {
    if (err) {
      unlocked.forEach(function (change) {
        wipeKeypair(change.keypair);
      });
    } else {
      unlocked.forEach(function (change) {
        var owned = !__private.keypairs[change.publicKey];

        if (owned) {
          __private.keypairs[change.publicKey] = change.keypair;
        } else {
          wipeKeypair(change.keypair);
        }

        __private.encryptedKeypairsLoaded[change.publicKey] = true;
        __private.encryptedOwnedKeypairs[change.publicKey] = owned;
        library.logger.info('delegates', 'Forging unlocked on account: ' + change.address);
      });
    }

    __private.forgingMutation = false;
    password = null;

    if (err) {
      return setImmediate(cb, err);
    }

    return setImmediate(cb, null, { unlocked: unlocked.length });
  });
};

/**
 * Clears keypair ownership acquired through encrypted config entries.
 * A keypair is retained when plaintext config independently loaded the same delegate.
 * @return {number} Number of encrypted keypair entries cleared.
 */
__private.clearEncryptedKeypairs = function () {
  var publicKeys = Object.keys(__private.encryptedKeypairsLoaded);

  publicKeys.forEach(function (publicKey) {
    var owned = __private.encryptedOwnedKeypairs[publicKey];

    delete __private.encryptedKeypairsLoaded[publicKey];
    delete __private.encryptedOwnedKeypairs[publicKey];

    if (owned && !__private.plaintextKeypairsLoaded[publicKey]) {
      wipeKeypair(__private.keypairs[publicKey]);
      delete __private.keypairs[publicKey];
    }
  });

  return publicKeys.length;
};

/**
 * Clears keypairs that were unlocked from encrypted config entries.
 * Plaintext and API-enabled keypairs stay loaded.
 * @param {function} cb - Callback `(err)`.
 */
__private.lockEncryptedDelegates = function (cb) {
  if (__private.shuttingDown) {
    return setImmediate(cb, new Error('Node is shutting down.'));
  }

  if (!__private.encryptedEntries.length) {
    return setImmediate(cb, new Error('No encrypted delegate passphrases are configured.'));
  }

  if (__private.forgingMutation) {
    return setImmediate(cb, new Error('An unlock is already in progress.'));
  }

  __private.forgingMutation = true;

  library.sequence.add(function (sequenceCb) {
    __private.clearEncryptedKeypairs();
    return setImmediate(sequenceCb);
  }, function () {
    __private.forgingMutation = false;
    library.logger.info('delegates', 'Forging locked. Encrypted delegate keypairs cleared from memory.');
    return setImmediate(cb);
  });
};

/**
 * Optionally prompts for an operator password after the node is otherwise ready.
 * Service processes without a TTY stay locked and remain fully operational.
 * @param {function} cb - Callback after the attempt.
 */
__private.maybeUnlockAtStartup = function (cb) {
  if (!__private.encryptedEntries.length) {
    return setImmediate(cb);
  }

  function unlockAndContinue (operatorPassword) {
    __private.unlockWithPassword(operatorPassword, function (err) {
      operatorPassword = null;

      if (err) {
        library.logger.error('delegates', 'Failed to unlock encrypted delegate passphrases');
        if (err.message) {
          library.logger.error('delegates', err.message);
        }
      }

      return setImmediate(cb);
    });
  }

  if (process.stdin.isTTY) {
    library.logger.info('delegates', 'Enter the operator password to unlock forging, or press Enter to stay locked.');
    return promptSecret.promptHidden('Operator password: ', { cancelSignal: true }, function (err, value) {
      if (err || !value) {
        library.logger.info('delegates', 'Forging stays locked. Unlock later with: npm run adm-node -- forging unlock');
        return setImmediate(cb);
      }

      return unlockAndContinue(value);
    });
  }

  library.logger.info('delegates', 'Forging stays locked until unlock. Run: npm run adm-node -- forging unlock');
  return setImmediate(cb);
};

/**
 * Parses encrypted secrets once, warns about plaintext, and opens the control socket.
 * @param {function} cb - Callback after preparation.
 */
__private.prepareForging = function (cb) {
  var partitioned = forgingSecret.partitionForgingSecrets(library.config.forging.secret);
  var ignored = 0;
  var seenPublicKeys = {};

  __private.plaintextDelegateCount = countPlaintextSecrets(partitioned.plaintext);
  __private.encryptedEntries = [];

  partitioned.encrypted.forEach(function (blob) {
    try {
      var header = forgingSecret.parseHeader(blob);

      if (seenPublicKeys[header.publicKey]) {
        ignored += 1;
        return;
      }

      seenPublicKeys[header.publicKey] = true;
      __private.encryptedEntries.push({
        blob: blob,
        publicKey: header.publicKey,
        address: header.address
      });
    } catch (err) {
      ignored += 1;
    }
  });

  __private.invalidEncryptedDelegateCount = ignored;

  if (__private.plaintextDelegateCount > 0) {
    library.logger.warn(
        'delegates',
        'Config contains ' + __private.plaintextDelegateCount +
        ' plaintext delegate passphrase(s). Plaintext still forges. Run `npm run adm-node -- forging encrypt` to encrypt them at rest.'
    );
  }

  if (ignored > 0) {
    library.logger.error(
        'delegates',
        'Ignoring ' + ignored + ' malformed or duplicate encrypted delegate passphrase entry(s).'
    );
  }

  if (__private.encryptedEntries.length > 0) {
    library.logger.info(
        'delegates',
        'Found ' + __private.encryptedEntries.length +
        ' encrypted delegate passphrase(s). Forging for those delegates stays locked until the operator password is provided.'
    );
  }

  __private.startForgingControl(cb);
};

/**
 * Loads plaintext delegates from config and stores their keypairs.
 * Encrypted entries are skipped here so a locked node can sync without a password.
 * @private
 * @param {function} cb - Callback function.
 * @return {setImmediateCallback}
 */
__private.loadPlaintextDelegates = function (cb) {
  var partitioned = forgingSecret.partitionForgingSecrets(library.config.forging.secret);
  var secrets = partitioned.plaintext.filter(function (secret) {
    return typeof secret === 'string' && secret.length > 0;
  });
  var enabledAddresses = [];

  if (!secrets.length) {
    return setImmediate(cb);
  }

  library.logger.info('delegates', ['Loading', secrets.length, 'delegates from config…'].join(' '));

  async.eachSeries(secrets, function (secret, next) {
    var hash;
    var keypair;

    try {
      hash = library.ed.createPassPhraseHash(secret);
      keypair = library.ed.makeKeypair(hash);
    } catch (err) {
      if (hash && Buffer.isBuffer(hash)) {
        hash.fill(0);
      }
      wipeKeypair(keypair);
      library.logger.warn('delegates', 'Ignoring invalid plaintext delegate passphrase in config.');
      return setImmediate(next);
    } finally {
      if (hash && Buffer.isBuffer(hash)) {
        hash.fill(0);
      }
    }

    modules.accounts.getAccount({
      publicKey: keypair.publicKey.toString('hex')
    }, function (err, account) {
      if (err) {
        wipeKeypair(keypair);
        return setImmediate(next, err);
      }

      if (!account) {
        wipeKeypair(keypair);
        library.logger.warn(
            'delegates',
            ['Account with public key:', keypair.publicKey.toString('hex'), 'not found'].join(' ')
        );
        return setImmediate(next);
      }

      if (account.isDelegate) {
        var publicKey = keypair.publicKey.toString('hex');

        if (__private.keypairs[publicKey]) {
          wipeKeypair(keypair);
        } else {
          __private.keypairs[publicKey] = keypair;
        }

        __private.plaintextKeypairsLoaded[publicKey] = true;
        if (enabledAddresses.indexOf(account.address) === -1) {
          enabledAddresses.push(account.address);
        }
      } else {
        wipeKeypair(keypair);
        library.logger.warn('delegates', ['Account with public key:', keypair.publicKey.toString('hex'), 'is not a delegate'].join(' '));
      }

      return setImmediate(next);
    });
  }, function (err) {
    if (!__private.forgingSummaryLogged) {
      var count = enabledAddresses.length;
      var label = count === 1 ? 'delegate' : 'delegates';
      var addresses = count ? ': ' + enabledAddresses.join(', ') : '';

      library.logger.info(
          'delegates',
          'Forging enabled for ' + count + ' ' + label + addresses
      );
      __private.forgingSummaryLogged = true;
    }

    return setImmediate(cb, err);
  });
};

/**
 * Loads delegates from config and stores plaintext keypairs.
 * The first call also prepares encrypted entries and the control socket.
 * @private
 * @param {function} cb - Callback function.
 * @return {setImmediateCallback}
 */
__private.loadDelegates = function (cb) {
  if (!__private.forgingInitialized) {
    __private.forgingInitialized = true;
    return __private.prepareForging(function () {
      __private.loadPlaintextDelegates(function (err) {
        __private.maybeUnlockAtStartup(function () {
          // The prompt result must not gate node jobs. Failure or cancellation
          // only leaves encrypted delegates locked.
        });

        return setImmediate(cb, err);
      });
    });
  }

  if (__private.plaintextDelegateCount > 0) {
    return __private.loadPlaintextDelegates(cb);
  }

  return setImmediate(cb);
};

// Public methods
/**
 * Gets delegate list by vote and changes order.
 * @param {number} height
 * @param {function} cb - Callback function.
 * @return {setImmediateCallback} err | truncated delegate list.
 * @todo explain seed.
 */
Delegates.prototype.generateDelegateList = function (height, cb) {
  if (__private.isFairSystemActivated(height)) {
    __private.getKeysSortByVotesWeight(function (err, truncDelegateList) {
      if (err) {
        return setImmediate(cb, err);
      }

      var seedSource = modules.rounds.calc(height).toString();
      var currentSeed = crypto.createHash('sha256').update(seedSource, 'utf8').digest();

      for (var i = 0, delCount = truncDelegateList.length; i < delCount; i++) {
        for (var x = 0; x < 4 && i < delCount; i++, x++) {
          var newIndex = currentSeed[x] % delCount;
          var b = truncDelegateList[newIndex];
          truncDelegateList[newIndex] = truncDelegateList[i];
          truncDelegateList[i] = b;
        }
        currentSeed = crypto.createHash('sha256').update(currentSeed).digest();
      }

      return setImmediate(cb, null, truncDelegateList);
    });
  } else {
    __private.getKeysSortByVote(function (err, truncDelegateList) {
      if (err) {
        return setImmediate(cb, err);
      }

      var seedSource = modules.rounds.calc(height).toString();
      var currentSeed = crypto.createHash('sha256').update(seedSource, 'utf8').digest();

      for (var i = 0, delCount = truncDelegateList.length; i < delCount; i++) {
        for (var x = 0; x < 4 && i < delCount; i++, x++) {
          var newIndex = currentSeed[x] % delCount;
          var b = truncDelegateList[newIndex];
          truncDelegateList[newIndex] = truncDelegateList[i];
          truncDelegateList[i] = b;
        }
        currentSeed = crypto.createHash('sha256').update(currentSeed).digest();
      }

      return setImmediate(cb, null, truncDelegateList);
    });
  }
};

/**
 * Gets delegates and for each one calculates rate, rank, approval, productivity.
 * Orders delegates as per criteria.
 * @param {object} query
 * @param {object} filter - account specific filters, e.g. `username`, `publicKey` or `address`
 * @param {function} cb - Callback function.
 * @return {setImmediateCallback} error| object with delegates ordered, offset, count, limit.
 * @todo OrderBy does not affects data? What is the impact?.
 */
Delegates.prototype.getDelegates = function (query, filter, cb) {
  if (!query) {
    throw 'Missing query argument';
  }

  var sortFilter = { 'vote': -1, 'publicKey': 1 };
  if (__private.isFairSystemActivated(modules.blocks.lastBlock.get().height)) {
    sortFilter = { 'votesWeight': -1, 'publicKey': 1 };
  }
  modules.accounts.getAccounts({
    ...filter,
    isDelegate: 1,
    sort: sortFilter
  }, ['username', 'address', 'publicKey', 'votesWeight', 'vote', 'missedblocks', 'producedblocks', 'fees', 'rewards'], function (err, delegates) {
    if (err) {
      return setImmediate(cb, err);
    }

    var limit = query.limit || constants.activeDelegates;
    var offset = query.offset || 0;
    var active = query.active;

    limit = limit > constants.activeDelegates ? constants.activeDelegates : limit;

    var count = delegates.length;
    var length = Math.min(limit, count);
    var realLimit = Math.min(offset + limit, count);

    var lastBlock = modules.blocks.lastBlock.get(),
      totalSupply = __private.blockReward.calcSupply(lastBlock.height);

    for (var i = 0; i < delegates.length; i++) {
      delegates[i].forged = new bignum(delegates[i].fees).plus(new bignum(delegates[i].rewards)).toString();
      delete delegates[i].fees;
      delete delegates[i].rewards;

      // TODO: 'rate' property is deprecated and need to be removed after transitional period
      delegates[i].rate = i + 1;
      delegates[i].rank = i + 1;
      if (__private.isFairSystemActivated(modules.blocks.lastBlock.get().height)) {
        delegates[i].approval = (delegates[i].votesWeight / totalSupply) * 100;
      } else {
        delegates[i].approval = (delegates[i].vote / totalSupply) * 100;
      }
      delegates[i].approval = Math.round(delegates[i].approval * 1e2) / 1e2;

      var percent = 100 - (delegates[i].missedblocks / ((delegates[i].producedblocks + delegates[i].missedblocks) / 100));
      percent = Math.abs(percent) || 0;

      var outsider = i + 1 > slots.delegates;
      delegates[i].productivity = (!outsider) ? Math.round(percent * 1e2) / 1e2 : 0;
    }

    var orderBy = OrderBy(query.orderBy, { quoteField: false });

    if (orderBy.error) {
      return setImmediate(cb, orderBy.error);
    }

    return setImmediate(cb, null, {
      delegates: delegates,
      sortField: orderBy.sortField,
      sortMethod: orderBy.sortMethod,
      count: count,
      offset: offset,
      limit: realLimit
    });
  });
};

/**
 * @param {publicKey} publicKey
 * @param {Array} votes
 * @param {function} cb
 * @return {function} Calls checkDelegates() with 'confirmed' state.
 */
Delegates.prototype.checkConfirmedDelegates = function (publicKey, votes, cb) {
  return __private.checkDelegates(publicKey, votes, 'confirmed', cb);
};

/**
 * @param {publicKey} publicKey
 * @param {Array} votes
 * @param {function} cb
 * @return {function} Calls checkDelegates() with 'unconfirmed' state.
 */
Delegates.prototype.checkUnconfirmedDelegates = function (publicKey, votes, cb) {
  return __private.checkDelegates(publicKey, votes, 'unconfirmed', cb);
};

/**
 * Inserts a fork into 'forks_stat' table and emits a 'delegates/fork' socket signal
 * with fork data: cause + block.
 * @param {block} block
 * @param {string} cause
 */
Delegates.prototype.fork = function (block, cause) {
  library.logger.info('delegates', 'Fork', {
    delegate: block.generatorPublicKey,
    block: { id: block.id, timestamp: block.timestamp, height: block.height, previousBlock: block.previousBlock },
    cause: cause
  });

  var fork = {
    delegatePublicKey: block.generatorPublicKey,
    blockTimestamp: block.timestamp,
    blockId: block.id,
    blockHeight: block.height,
    previousBlock: block.previousBlock,
    cause: cause
  };

  library.db.none(sql.insertFork, fork).then(function () {
    library.network.wsServer.emit('delegates/fork', fork);
  });
};

/**
 * Generates delegate list and checks if block generator public Key
 * matches delegate id.
 * @param {block} block
 * @param {function} cb - Callback function.
 * @return {setImmediateCallback} error message | cb
 */
Delegates.prototype.validateBlockSlot = function (block, cb) {
  self.generateDelegateList(block.height, function (err, activeDelegates) {
    if (err) {
      return setImmediate(cb, err);
    }

    var currentSlot = slots.getSlotNumber(block.timestamp);
    var delegate_id = activeDelegates[currentSlot % slots.delegates];

    if (delegate_id && block.generatorPublicKey === delegate_id) {
      return setImmediate(cb);
    } else {
      library.logger.error('delegates', 'Expected generator: ' + delegate_id + ' Received generator: ' + block.generatorPublicKey);
      return setImmediate(cb, 'Failed to verify slot: ' + currentSlot);
    }
  });
};

/**
 * Calls helpers.sandbox.callMethod().
 * @implements module:helpers#callMethod
 * @param {function} call - Method to call.
 * @param {*} args - List of arguments.
 * @param {function} cb - Callback function.
 */
Delegates.prototype.sandboxApi = function (call, args, cb) {
  sandboxHelper.callMethod(shared, call, args, cb);
};

// Events
/**
 * Calls Delegate.bind() with scope.
 * @implements module:delegates#Delegate~bind
 * @param {modules} scope - Loaded modules.
 */
Delegates.prototype.onBind = function (scope) {
  modules = {
    loader: scope.loader,
    rounds: scope.rounds,
    accounts: scope.accounts,
    blocks: scope.blocks,
    transport: scope.transport,
    transactions: scope.transactions,
    delegates: scope.delegates
  };

  __private.assetTypes[transactionTypes.DELEGATE].bind(
      scope.accounts
  );
};

/**
 * Loads delegates.
 * @implements module:transactions#Transactions~fillPool
 */
Delegates.prototype.onBlockchainReady = function () {
  __private.loaded = true;

  __private.loadDelegates(function (err) {
    if (err) {
      library.logger.error('delegates', 'Failed to load delegates', err);
    }

    function nextForge (cb) {
      async.series([
        function (seriesCb) {
          __private.forge(function (forgeErr) {
            if (forgeErr) {
              library.logger.error('delegates', 'Failed to prepare forging delegates', forgeErr);
            }

            return setImmediate(seriesCb);
          });
        },
        modules.transactions.fillPool
      ], function () {
        return setImmediate(cb);
      });
    }

    jobsQueue.register('delegatesNextForge', nextForge, 1000);
  });
};

/**
 * Sets loaded to false.
 * @param {function} cb - Callback function.
 * @return {setImmediateCallback} Returns cb.
 */
Delegates.prototype.cleanup = function (cb) {
  __private.loaded = false;
  __private.shuttingDown = true;

  function clearAndFinish () {
    library.sequence.add(function (sequenceCb) {
      __private.clearEncryptedKeypairs();
      return setImmediate(sequenceCb);
    }, function () {
      __private.forgingMutation = false;
      return setImmediate(cb);
    });
  }

  if (!__private.controlServer) {
    return clearAndFinish();
  }

  __private.controlServer.close(function () {
    __private.controlServer = null;
    return clearAndFinish();
  });
};

/**
 * Checks if `modules` is loaded.
 * @return {boolean} True if `modules` is loaded.
 */
Delegates.prototype.isLoaded = function () {
  return !!modules;
};

// Shared API
/**
 * @todo implement API comments with apidoc.
 * @see {@link http://apidocjs.com/}
 */
Delegates.prototype.shared = {
  getDelegate: function (req, cb) {
    library.schema.validate(req.body, schema.getDelegate, function (err) {
      if (err) {
        return setImmediate(cb, err[0].message);
      }

      const filter = {};

      if (req.body.publicKey) {
        filter.address = modules.accounts.generateAddressByPublicKey(
            req.body.publicKey
        );
      } else if (req.body.username) {
        filter.username = req.body.username;
      } else if (req.body.address) {
        filter.address = req.body.address;
      } else {
        return setImmediate(cb, 'Delegate not found');
      }

      if (req.body.address && req.body.publicKey && filter.address !== req.body.address) {
        return setImmediate(cb, 'Delegate publicKey does not match address');
      }

      // `rank` and `rate` are derived from the full, ordered delegate list, so
      // ranking must be computed over all delegates. We request the ranked list
      // (empty filter) and then select the requested delegate, instead of
      // pushing `filter` into the accounts query: a single-row result is always
      // ranked first and would report `rank`/`rate` (and outsider productivity)
      // as 1 for every delegate.
      modules.delegates.getDelegates(req.body, {}, function (err, data) {
        if (err) {
          return setImmediate(cb, err);
        }

        var delegate = data.delegates.find(function (delegate) {
          if (filter.address) {
            return delegate.address.toUpperCase() === filter.address.toUpperCase();
          }
          return delegate.username === filter.username;
        });

        if (delegate) {
          return setImmediate(cb, null, { delegate: delegate });
        } else {
          return setImmediate(cb, 'Delegate not found');
        }
      });
    });
  },

  getNextForgers: function (req, cb) {
    library.schema.validate(req.body, schema.getNextForgers, function (err) {
      if (err) {
        return setImmediate(cb, err[0].message);
      }

      var currentBlock = modules.blocks.lastBlock.get();
      var limit = req.body.limit || 10;

      if (!Number.isFinite(currentBlock.height)) {
        return setImmediate(cb, 'Blockchain is loading');
      }

      // This response is a snapshot for the current chain tip. Height advances
      // only after a block is accepted, so every projected slot must use the
      // delegate list for the next block. Clients should refresh the snapshot
      // after accepting a block instead of inferring future height transitions.
      var nextBlockHeight = currentBlock.height + 1;
      modules.delegates.generateDelegateList(nextBlockHeight, function (err, activeDelegates) {
        if (err) {
          return setImmediate(cb, err);
        }

        var currentBlockSlot = slots.getSlotNumber(currentBlock.timestamp);
        var currentSlot = slots.getSlotNumber();
        var nextForgers = [];

        for (var i = 1; i <= slots.delegates && i <= limit; i++) {
          if (activeDelegates[(currentSlot + i) % slots.delegates]) {
            nextForgers.push(activeDelegates[(currentSlot + i) % slots.delegates]);
          }
        }

        return setImmediate(cb, null, { currentBlock: currentBlock.height, currentBlockSlot: currentBlockSlot, currentSlot: currentSlot, delegates: nextForgers });
      });
    });
  },

  search: function (req, cb) {
    library.schema.validate(req.body, schema.search, function (err) {
      if (err) {
        return setImmediate(cb, err[0].message);
      }

      var orderBy = OrderBy(
          req.body.orderBy, {
            sortFields: sql.sortFields,
            sortField: 'username'
          }
      );

      if (orderBy.error) {
        return setImmediate(cb, orderBy.error);
      }

      library.db.query(sql.search({
        q: req.body.q,
        limit: req.body.limit || 101,
        sortField: orderBy.sortField,
        sortMethod: orderBy.sortMethod
      })).then(function (rows) {
        return setImmediate(cb, null, { delegates: rows });
      }).catch(function (err) {
        library.logger.error('api-delegates', `An error occurred while trying to find a delegate "${req.body.q}": ${err?.message || err}`, err.stack);
        return setImmediate(cb, 'Database search failed');
      });
    });
  },

  count: function (req, cb) {
    library.db.one(sql.count).then(function (row) {
      return setImmediate(cb, null, { count: row.count });
    }).catch(function (err) {
      library.logger.error('api-delegates', `An error occurred while trying to count delegates: ${err?.message || err}`, err.stack);
      return setImmediate(cb, 'Failed to count delegates');
    });
  },

  getVoters: function (req, cb) {
    library.schema.validate(req.body, schema.getVoters, function (err) {
      if (err) {
        return setImmediate(cb, err[0].message);
      }

      library.db.one(sql.getVoters, { publicKey: req.body.publicKey }).then(function (row) {
        var addresses = (row.accountIds) ? row.accountIds : [];

        modules.accounts.getAccounts({
          address: { $in: addresses },
          sort: { balance: -1 }
        }, ['address', 'balance', 'username', 'publicKey'], function (err, rows) {
          if (err) {
            return setImmediate(cb, err);
          } else {
            return setImmediate(cb, null, { accounts: rows });
          }
        });
      }).catch(function (err) {
        library.logger.error('api-delegates', `An error occurred while trying to get a delegate's voters ${req.body.publicKey}: ${err?.message || err}`, err.stack);
        return setImmediate(cb, 'Failed to get voters for delegate: ' + req.body.publicKey);
      });
    });
  },

  getDelegates: function (req, cb) {
    library.schema.validate(req.body, schema.getDelegates, function (err) {
      if (err) {
        return setImmediate(cb, err[0].message);
      }

      modules.delegates.getDelegates(req.body, {}, function (err, data) {
        if (err) {
          return setImmediate(cb, err);
        }

        function compareNumber (a, b) {
          var sorta = parseFloat(a[data.sortField]);
          var sortb = parseFloat(b[data.sortField]);
          if (data.sortMethod === 'ASC') {
            return sorta - sortb;
          } else {
            return sortb - sorta;
          }
        }

        function compareString (a, b) {
          var sorta = a[data.sortField];
          var sortb = b[data.sortField];
          if (data.sortMethod === 'ASC') {
            return sorta.localeCompare(sortb);
          } else {
            return sortb.localeCompare(sorta);
          }
        }

        if (data.sortField) {
          // TODO: 'rate' property is deprecated and need to be removed after transitional period
          if (['approval', 'productivity', 'rate', 'rank', 'vote'].indexOf(data.sortField) > -1) {
            data.delegates = data.delegates.sort(compareNumber);
          } else if (['username', 'address', 'publicKey'].indexOf(data.sortField) > -1) {
            data.delegates = data.delegates.sort(compareString);
          } else {
            return setImmediate(cb, 'Invalid sort field');
          }
        }

        var delegates = data.delegates.slice(data.offset, data.limit);

        return setImmediate(cb, null, { delegates: delegates, totalCount: data.count });
      });
    });
  },

  getForgedByAccount: function (req, cb) {
    library.schema.validate(req.body, schema.getForgedByAccount, function (err) {
      if (err) {
        return setImmediate(cb, err[0].message);
      }

      if (req.body.start !== undefined || req.body.end !== undefined) {
        modules.blocks.utils.aggregateBlocksReward({ generatorPublicKey: req.body.generatorPublicKey, start: req.body.start, end: req.body.end }, function (err, reward) {
          if (err) {
            return setImmediate(cb, err);
          }

          var forged = new bignum(reward.fees).plus(new bignum(reward.rewards)).toString();
          return setImmediate(cb, null, { fees: reward.fees, rewards: reward.rewards, forged: forged, count: reward.count });
        });
      } else {
        modules.accounts.getAccount({ publicKey: req.body.generatorPublicKey }, ['fees', 'rewards'], function (err, account) {
          if (err || !account) {
            return setImmediate(cb, err || 'Account not found');
          }

          var forged = new bignum(account.fees).plus(new bignum(account.rewards)).toString();
          return setImmediate(cb, null, { fees: account.fees, rewards: account.rewards, forged: forged });
        });
      }
    });
  },
  registerDelegate: function (req, cb) {
    library.schema.validate(req.body, schema.registerDelegate, function (err) {
      if (err) {
        return setImmediate(cb, err[0].message);
      }
      var keypair = { publicKey: req.body.senderPublicKey };
      library.balancesSequence.add(function (cb) {
        if (req.body.multisigAccountPublicKey && req.body.multisigAccountPublicKey !== keypair.publicKey.toString('hex')) {
          modules.accounts.getAccount({ publicKey: req.body.multisigAccountPublicKey }, function (err, account) {
            if (err) {
              return setImmediate(cb, err);
            }

            if (!account || !account.publicKey) {
              return setImmediate(cb, 'Multisignature account not found');
            }

            if (!account.multisignatures || !account.multisignatures) {
              return setImmediate(cb, 'Account does not have multisignatures enabled');
            }

            if (account.multisignatures.indexOf(keypair.publicKey.toString('hex')) < 0) {
              return setImmediate(cb, 'Account does not belong to multisignature group');
            }

            modules.accounts.getAccount({ publicKey: keypair.publicKey }, function (err, requester) {
              if (err) {
                return setImmediate(cb, err);
              }

              if (!requester || !requester.publicKey) {
                return setImmediate(cb, 'Requester not found');
              }

              if (requester.secondSignature && !req.body.secondSecret) {
                return setImmediate(cb, 'Missing requester second passphrase');
              }

              if (requester.publicKey === account.publicKey) {
                return setImmediate(cb, 'Invalid requester public key');
              }

              var secondKeypair = null;

              if (requester.secondSignature) {
                var secondHash = library.ed.createPassPhraseHash(req.body.secondSecret);
                secondKeypair = library.ed.makeKeypair(secondHash);
              }

              var transaction;

              try {
                transaction = library.logic.transaction.create({
                  type: transactionTypes.DELEGATE,
                  username: req.body.username,
                  sender: account,
                  keypair: keypair,
                  secondKeypair: secondKeypair,
                  requester: keypair
                });
              } catch (e) {
                return setImmediate(cb, e.toString());
              }
              modules.transactions.receiveTransactions([transaction], true, cb);
            });
          });
        } else {
          modules.accounts.setAccountAndGet({ publicKey: keypair.publicKey.toString('hex') }, function (err, account) {
            if (err) {
              return setImmediate(cb, err);
            }

            if (!account || !account.publicKey) {
              return setImmediate(cb, 'Account not found');
            }

            if (account.secondSignature && !req.body.secondSecret) {
              return setImmediate(cb, 'Invalid second passphrase');
            }

            var secondKeypair = null;

            if (account.secondSignature) {
              var secondHash = library.ed.createPassPhraseHash(req.body.secondSecret);
              secondKeypair = library.ed.makeKeypair(secondHash);
            }

            var transaction = req.body;

            try {
              transaction = library.logic.transaction.publish(transaction);
            } catch (e) {
              return setImmediate(cb, e.toString());
            }
            modules.transactions.receiveTransactions([transaction], true, cb);
          });
        }
      }, function (err, transaction) {
        if (err) {
          return setImmediate(cb, err);
        } else {
          return setImmediate(cb, null, { transaction: transaction[0] });
        }
      });
    });
  }
};

// Export
module.exports = Delegates;
