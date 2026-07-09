'use strict';

var async = require('async');
var constants = require('../helpers/constants.js');
var createSyncWatchdog = require('../helpers/syncWatchdog.js');
var jobsQueue = require('../helpers/jobsQueue.js');
var ip = require('neoip');
var sandboxHelper = require('../helpers/sandbox.js');
var schema = require('../schema/loader.js');
var sql = require('../sql/loader.js');

require('colors');

// Private fields
var modules, library, self, __private = {}, shared = {};

__private.loaded = false;
__private.ready = false;
__private.isActive = false;
__private.lastBlock = null;
__private.genesisBlock = null;
__private.total = 0;
__private.blocksToSync = 0;
__private.syncIntervalId = null;
__private.syncInterval = 10000;
__private.retries = 5;
__private.stopRequested = false;
__private.shutdownRequested = false;
__private.rebuildInProgress = false;
// Maximum time a single sync run may go without block progress before it is
// considered stalled and aborted so the loader can recover.
__private.syncTimeout = constants.syncStallTimeout;

/**
 * Initializes library with scope content.
 * Calls private function initialize.
 * @param {Function} cb - Callback function.
 * @param {scope} scope - App instance.
 * @memberof module:loader
 * @constructor
 * @classdesc Main Loader methods.
 * @return {setImmediateCallback} Callback function with `self` as data.
 */
// Constructor
function Loader (cb, scope) {
  library = {
    logger: scope.logger,
    db: scope.db,
    network: scope.network,
    schema: scope.schema,
    sequence: scope.sequence,
    bus: scope.bus,
    genesisblock: scope.genesisblock,
    balancesSequence: scope.balancesSequence,
    logic: {
      transaction: scope.logic.transaction,
      account: scope.logic.account,
      peers: scope.logic.peers
    },
    config: {
      loading: {
        snapshot: scope.config.loading.snapshot
      }
    }
  };
  self = this;

  __private.initialize();
  __private.genesisBlock = __private.lastBlock = library.genesisblock;

  setImmediate(cb, null, self);
}

// Private methods
/**
 * Sets private network object with height 0 and peers empty array.
 * @private
 */
__private.initialize = function () {
  __private.network = {
    height: 0, // Network height
    peers: [] // "Good" peers and with height close to network height
  };
};

/**
 * Cancels timers based on input parameter and private variable syncIntervalId
 * or Sync trigger by sending a socket signal with 'loader/sync' and setting
 * next sync with 1000 milliseconds.
 * @param {boolean} turnOn
 *
 * @private
 * @implements {library.network.wsServer.emit}
 * @implements {modules.blocks.lastBlock.get}
 * @emits loader/sync
 */
__private.syncTrigger = function (turnOn) {
  if (turnOn === false && __private.syncIntervalId) {
    library.logger.trace('loader', 'Clearing sync interval');
    clearTimeout(__private.syncIntervalId);
    __private.syncIntervalId = null;
  }
  if (turnOn === true && !__private.syncIntervalId) {
    library.logger.trace('loader', 'Setting sync interval');
    setImmediate(function nextSyncTrigger () {
      library.logger.trace('loader', 'Sync trigger');
      library.network.wsServer.emit('loader/sync', {
        blocks: __private.blocksToSync,
        height: modules.blocks.lastBlock.get().height
      });
      __private.syncIntervalId = setTimeout(nextSyncTrigger, 1000);
    });
  }
};

/**
 * Requests active loader work to stop at the next safe boundary.
 * @private
 */
__private.requestStop = function () {
  __private.shutdownRequested = true;
  __private.stopRequested = true;
  __private.syncTrigger(false);
};

/**
 * Checks if shutdown was requested.
 * @private
 * @return {boolean}
 */
__private.isStopRequested = function () {
  return __private.stopRequested;
};

/**
 * Syncs timer trigger.
 * @private
 * @implements {modules.blocks.lastReceipt.get}
 * @implements {modules.blocks.lastReceipt.isStale}
 * @implements {Loader.syncing}
 * @implements {library.sequence.add}
 * @implements {async.retry}
 * @implements {__private.initialize}
 */
__private.syncTimer = function () {
  library.logger.trace('loader', 'Setting sync timer');

  function nextSync (cb) {
    library.logger.trace('loader', 'Sync timer trigger', { loaded: __private.loaded, syncing: self.syncing(), last_receipt: modules.blocks.lastReceipt.get() });

    if (__private.loaded && !self.syncing() && modules.blocks.lastReceipt.isStale()) {
      library.sequence.add(function (sequenceCb) {
        async.retry(__private.retries, __private.sync, sequenceCb);
      }, function (err) {
        if (err) {
          library.logger.error('loader', 'Sync timer error:', err);
          __private.initialize();
        }
        return setImmediate(cb);
      });
    } else {
      return setImmediate(cb);
    }
  }

  jobsQueue.register('loaderSyncTimer', nextSync, __private.syncInterval);
};

/**
 * Gets a random peer and loads signatures calling the api.
 * Processes each signature from peer.
 * @param {Function} cb
 * @private
 * @implements {Loader.getNetwork}
 * @implements {modules.transport.getFromPeer}
 * @implements {library.schema.validate}
 * @implements {library.sequence.add}
 * @implements {async.eachSeries}
 * @implements {modules.multisignatures.processSignature}
 * @return {setImmediateCallback} cb, err
 */
__private.loadSignatures = function (cb) {
  async.waterfall([
    function (waterCb) {
      self.getNetwork(function (err, network) {
        if (err) {
          return setImmediate(waterCb, err);
        } else {
          var peer = network.peers[Math.floor(Math.random() * network.peers.length)];
          return setImmediate(waterCb, null, peer);
        }
      });
    },
    function (peer, waterCb) {
      library.logger.log('loader', 'Loading signatures from: ' + peer.string);

      modules.transport.getFromPeer(peer, {
        api: '/signatures',
        method: 'GET'
      }, function (err, res) {
        if (err) {
          return setImmediate(waterCb, err);
        } else {
          library.schema.validate(res.body, schema.loadSignatures, function (err) {
            return setImmediate(waterCb, err, res.body.signatures);
          });
        }
      });
    },
    function (signatures, waterCb) {
      library.sequence.add(function (cb) {
        async.eachSeries(signatures, function (signature, eachSeriesCb) {
          async.eachSeries(signature.signatures, function (s, eachSeriesCb) {
            modules.multisignatures.processSignature({
              signature: s,
              transaction: signature.transaction
            }, function (err) {
              return setImmediate(eachSeriesCb);
            });
          }, eachSeriesCb);
        }, cb);
      }, waterCb);
    }
  ], function (err) {
    return setImmediate(cb, err);
  });
};

/**
 * Gets a random peer and loads transactions calling the api.
 * Validates each transaction from peer and remove peer if invalid.
 * Calls processUnconfirmedTransaction for each transaction.
 * @param {Function} cb
 * @todo missed error propagation when balancesSequence.add
 * @private
 * @implements {Loader.getNetwork}
 * @implements {modules.transport.getFromPeer}
 * @implements {library.schema.validate}
 * @implements {async.eachSeries}
 * @implements {library.logic.transaction.objectNormalize}
 * @implements {modules.peers.remove}
 * @implements {library.balancesSequence.add}
 * @implements {modules.transactions.processUnconfirmedTransaction}
 * @return {setImmediateCallback} cb, err
 */
__private.loadTransactions = function (cb) {
  async.waterfall([
    function (waterCb) {
      self.getNetwork(function (err, network) {
        if (err) {
          return setImmediate(waterCb, err);
        } else {
          var peer = network.peers[Math.floor(Math.random() * network.peers.length)];
          return setImmediate(waterCb, null, peer);
        }
      });
    },
    function (peer, waterCb) {
      library.logger.log('loader', 'Loading transactions from: ' + peer.string);

      modules.transport.getFromPeer(peer, {
        api: '/transactions',
        method: 'GET'
      }, function (err, res) {
        if (err) {
          return setImmediate(waterCb, err);
        }

        library.schema.validate(res.body, schema.loadTransactions, function (err) {
          if (err) {
            return setImmediate(waterCb, err[0].message);
          } else {
            return setImmediate(waterCb, null, peer, res.body.transactions);
          }
        });
      });
    },
    function (peer, transactions, waterCb) {
      async.eachSeries(transactions, function (transaction, eachSeriesCb) {
        var id = (transaction ? transactions.id : 'null');

        try {
          transaction = library.logic.transaction.objectNormalize(transaction);
        } catch (e) {
          library.logger.debug('loader', 'Transaction normalization failed', { id: id, err: e.toString(), module: 'loader', tx: transaction });

          library.logger.warn('peers', ['Transaction', id, 'is not valid, peer removed'].join(' '), peer.string);
          modules.peers.remove(peer.ip, peer.port);

          return setImmediate(eachSeriesCb, e);
        }

        return setImmediate(eachSeriesCb);
      }, function (err) {
        return setImmediate(waterCb, err, transactions);
      });
    },
    function (transactions, waterCb) {
      async.eachSeries(transactions, function (transaction, eachSeriesCb) {
        library.balancesSequence.add(function (cb) {
          transaction.bundled = true;
          modules.transactions.processUnconfirmedTransaction(transaction, false, cb);
        }, function (err) {
          if (err) {
            // TODO: Validate if must include error propagation.
            library.logger.debug('loader', `Failed to process transaction ${transaction.id}. Error: ${err?.message || err}`);
          }
          return setImmediate(eachSeriesCb);
        });
      }, waterCb);
    }
  ], function (err) {
    return setImmediate(cb, err);
  });
};

/**
 * Checks mem tables:
 * - count blocks from `blocks` table
 * - get genesis block from `blocks` table
 * - count accounts from `mem_accounts` table by block id
 * - get rounds from `mem_round`
 * Matches genesis block with database.
 * Verifies Snapshot mode.
 * Recreates memory tables when necessary:
 * - Calls logic.account to removeTables and createTables
 * - Calls block to load block. When blockchain ready emits a bus message.
 * Detects orphaned blocks in `mem_accounts` and gets delegates.
 * Loads last block and emits a bus message blockchain is ready.
 *
 * Note: Originally, `verifyOnLoading` from config was intended to drop
 * the “accounts” database and fully recalculate balances from genesis.
 * Now, full verification only occurs when missing blocks are detected.
 * The `loading.verifyOnLoading` config option is no longer used.
 * Verification now relies on the `verifySnapshot(count, round)` function,
 * which uses `library.config.loading.snapshot`. The snapshot feature
 * allows partial verification of the blockchain up to a given round.
 * @throws {string} When fails to match genesis block with database
 * @private
 * @implements {library.db.task}
 * @implements {modules.rounds.calc}
 * @implements {library.bus.message}
 * @implements {library.logic.account.removeTables}
 * @implements {library.logic.account.createTables}
 * @implements {async.until}
 * @implements {modules.blocks.loadBlocksOffset}
 * @implements {modules.blocks.deleteAfterBlock}
 * @implements {modules.blocks.loadLastBlock}
 * @emits exit
 */
__private.loadBlockChain = function () {
  var offset = 0, limit = Number(library.config.loading.loadPerIteration) || 1000;
  var verify = false;

  __private.stopRequested = false;
  __private.shutdownRequested = false;
  __private.isActive = true;

  function finishLoading (ready) {
    __private.isActive = false;
    if (ready && !__private.shutdownRequested) {
      library.bus.message('blockchainReady');
    }
  }

  function finishForShutdown () {
    library.logger.info('loader', 'Blockchain loading stopped for shutdown');
    finishLoading(false);
  }

  function finishRebuild (err, count) {
    __private.rebuildInProgress = false;

    if (err) {
      library.logger.error('loader', err);
      if (err.block) {
        library.logger.error('loader', 'Blockchain failed at: ' + err.block.height);
        modules.blocks.chain.deleteAfterBlock(err.block.id, function (err, res) {
          if (err) {
            library.logger.error('loader', 'Failed to clip blockchain', err);
          }
          library.logger.error('loader', 'Blockchain clipped');
          finishLoading(true);
        });
      } else {
        finishLoading(false);
      }
    } else if (__private.stopRequested) {
      library.logger.warn('loader', 'Blockchain rebuild stopped for shutdown; mem_* tables may be inconsistent and are not boot-ready');
      library.logger.info('loader', 'Blockchain rebuild stopped for shutdown');
      finishLoading(false);
    } else {
      library.logger.info('loader', 'Blockchain ready');
      finishLoading(true);
    }
  }

  function load (count, options) {
    var startOffset = (options && options.startOffset) || 0;
    var skipTableReset = Boolean(options && options.skipTableReset);

    verify = true;
    __private.total = count;
    __private.rebuildInProgress = true;
    offset = startOffset;

    var steps = {};

    if (!skipTableReset) {
      steps.removeTables = function (seriesCb) {
        library.logic.account.removeTables(function (err) {
          if (err) {
            throw err;
          } else {
            return setImmediate(seriesCb);
          }
        });
      };
      steps.createTables = function (seriesCb) {
        library.logic.account.createTables(function (err) {
          if (err) {
            throw err;
          } else {
            return setImmediate(seriesCb);
          }
        });
      };
    }

    steps.loadBlocksOffset = function (seriesCb) {
      async.until(
          function (testCb) {
            return testCb(null, __private.stopRequested || count < offset);
          }, function (cb) {
            if (__private.stopRequested) {
              return setImmediate(cb);
            }

            if (count > 1) {
              library.logger.info('loader', 'Rebuilding blockchain, current block height: ' + (offset + 1));
            }
            modules.blocks.process.loadBlocksOffset(limit, offset, verify, function (err, lastBlock) {
              if (err) {
                return setImmediate(cb, err);
              }

              offset = offset + limit;
              __private.lastBlock = lastBlock;

              return setImmediate(cb);
            }, __private.isStopRequested);
          }, function (err) {
            return setImmediate(seriesCb, err);
          }
      );
    };

    async.series(steps, function (err) {
      return finishRebuild(err, count);
    });
  }

  function reload (count, message, round) {
    if (__private.stopRequested) {
      return finishForShutdown();
    }

    if (message) {
      library.logger.warn('loader', message);
    }

    if (!modules.memCheckpoints || !modules.memCheckpoints.isEnabled()) {
      library.logger.warn('loader', 'Recreating memory tables');
      return load(count);
    }

    modules.memCheckpoints.tryRecover(count, round, function (err, checkpoint) {
      if (checkpoint) {
        library.logger.info('loader', 'Recovering from mem-table checkpoint at height ' + checkpoint.height);
        return load(count, {
          startOffset: checkpoint.height + 1,
          skipTableReset: true
        });
      }

      library.logger.warn('loader', 'Recreating memory tables');
      return load(count);
    });
  }

  function checkMemTables (t) {
    var promises = [
      t.one(sql.countBlocks),
      t.query(sql.getGenesisBlock),
      t.one(sql.countMemAccounts),
      t.query(sql.getMemRounds),
      t.query(sql.countDuplicatedDelegates)
    ];

    return t.batch(promises);
  }

  function matchGenesisBlock (row) {
    if (row) {
      var matched = (
        row.id === __private.genesisBlock.block.id &&
        row.payloadHash.toString('hex') === __private.genesisBlock.block.payloadHash &&
        row.blockSignature.toString('hex') === __private.genesisBlock.block.blockSignature
      );
      if (matched) {
        library.logger.info('loader', 'Genesis block matched with database');
      } else {
        throw 'Failed to match genesis block with database';
      }
    }
  }

  function verifySnapshot (count, round) {
    if (library.config.loading.snapshot !== undefined || library.config.loading.snapshot > 0) {
      library.logger.info('loader', 'Snapshot mode enabled');

      if (isNaN(library.config.loading.snapshot) || library.config.loading.snapshot >= round) {
        library.config.loading.snapshot = round;

        if ((count === 1) || (count % constants.activeDelegates > 0)) {
          library.config.loading.snapshot = (round > 1) ? (round - 1) : 1;
        }

        modules.rounds.setSnapshotRounds(library.config.loading.snapshot);
      }

      library.logger.info('loader', 'Snapshotting to end of round: ' + library.config.loading.snapshot);
      return true;
    } else {
      return false;
    }
  }

  library.db.task(checkMemTables).then(function (results) {
    var count = results[0].count;

    library.logger.info('loader', 'Blocks count in database: ' + count);

    if (__private.stopRequested) {
      return finishForShutdown();
    }

    var round = modules.rounds.calc(count);

    if (count === 1) {
      return reload(count, null, round);
    }

    matchGenesisBlock(results[1][0]);

    verify = verifySnapshot(count, round);

    if (verify) {
      return reload(count, 'Blocks verification enabled', round);
    }

    var missed = !(results[2].count);

    if (missed) {
      return reload(count, 'Detected missed blocks in mem_accounts', round);
    }

    var unapplied = results[3].filter(function (row) {
      return (row.round !== String(round));
    });

    if (unapplied.length > 0) {
      return reload(count, 'Detected unapplied rounds in mem_round', round);
    }

    var duplicatedDelegates = +results[4][0].count;

    if (duplicatedDelegates > 0) {
      library.logger.error('loader', 'Delegates table corrupted with duplicated entries');
      finishLoading(false);
      return process.emit('cleanup');
    }

    function updateMemAccounts (t) {
      var promises = [
        t.none(sql.updateMemAccounts),
        t.query(sql.getOrphanedMemAccounts),
        t.query(sql.getDelegates)
      ];

      return t.batch(promises);
    }

    // Returned so a rejection propagates to the outer .catch below instead of
    // being swallowed (which would silently stall blockchain loading).
    return library.db.task(updateMemAccounts).then(function (results) {
      if (__private.stopRequested) {
        return finishForShutdown();
      }

      if (results[1].length > 0) {
        return reload(count, 'Detected orphaned blocks in mem_accounts', round);
      }

      if (results[2].length === 0) {
        return reload(count, 'No delegates found', round);
      }

      modules.blocks.utils.loadLastBlock(function (err, block) {
        if (err) {
          return reload(count, err || 'Failed to load last block', round);
        } else {
          __private.lastBlock = block;
          library.logger.info('loader', 'Blockchain ready');
          finishLoading(true);
        }
      });
    });
  }).catch(function (err) {
    library.logger.error('loader', `Failed to load blockchain: ${err?.message || err}`, err.stack);
    finishLoading(false);
    return process.emit('cleanup');
  });
};

/**
 * Loads blocks from network.
 * @param {Function} cb
 * @private
 * @implements {Loader.getNetwork}
 * @implements {async.whilst}
 * @implements {modules.blocks.lastBlock.get}
 * @implements {modules.blocks.loadBlocksFromPeer}
 * @implements {modules.blocks.getCommonBlock}
 * @return {setImmediateCallback} cb, err
 */
__private.loadBlocksFromNetwork = function (cb, shouldStop) {
  var errorCount = 0;
  var loaded = false;

  // Per-run stop predicate. Defaults to the shutdown signal; the sync watchdog
  // passes a run-scoped predicate so an aborted run keeps its own stop signal
  // and a fresh run cannot accidentally clear it.
  shouldStop = shouldStop || __private.isStopRequested;

  self.getNetwork(function (err, network) {
    if (err) {
      return setImmediate(cb, err);
    } else {
      async.whilst(
          function (testCb) {
            return testCb(null, !shouldStop() && !loaded && errorCount < 5);
          },
          function (next) {
            var peer = network.peers[Math.floor(Math.random() * network.peers.length)];
            var lastBlock = modules.blocks.lastBlock.get();

            function loadBlocks () {
              __private.blocksToSync = peer.height;

              modules.blocks.process.loadBlocksFromPeer(peer, function (err, lastValidBlock) {
                if (err) {
                  library.logger.error('loader', `Failed to load blocks from ${peer.string}: ${err?.message || err}`, err.stack);
                  errorCount += 1;
                }
                loaded = lastValidBlock.id === lastBlock.id;
                lastValidBlock = lastBlock = null;
                next();
              }, shouldStop);
            }

            function getCommonBlock (cb) {
              library.logger.info('loader', 'Looking for common block with: ' + peer.string);
              modules.blocks.process.getCommonBlock(peer, lastBlock.height, function (err, commonBlock) {
                if (!commonBlock) {
                  if (err) { library.logger.error('loader', err.toString()); }
                  library.logger.error('loader', 'Failed to find common block with: ' + peer.string);
                  errorCount += 1;
                  return next();
                } else {
                  library.logger.info('loader', ['Found common block:', commonBlock.id, 'with:', peer.string].join(' '));
                  return setImmediate(cb);
                }
              });
            }

            if (lastBlock.height === 1) {
              loadBlocks();
            } else {
              getCommonBlock(loadBlocks);
            }
          },
          function (err) {
            if (err) {
              library.logger.error('loader', 'Failed to load blocks from network', err);
              return setImmediate(cb, err);
            } else {
              return setImmediate(cb);
            }
          }
      );
    }
  });
};

/**
 * - Undoes unconfirmed transactions.
 * - Establish broadhash consensus
 * - Syncs: loadBlocksFromNetwork, updateSystem
 * - Establish broadhash consensus
 * - Applies unconfirmed transactions
 * Logs current chain height before and after sync phases.
 * @param {Function} cb - Callback function.
 * @todo check err actions
 * @private
 * @implements {async.series}
 * @implements {modules.transactions.undoUnconfirmedList}
 * @implements {modules.transport.getPeers}
 * @implements {__private.loadBlocksFromNetwork}
 * @implements {modules.system.update}
 * @implements {modules.transactions.applyUnconfirmedList}
 */
__private.sync = function (cb) {
  if (__private.stopRequested) {
    return setImmediate(cb);
  }

  library.logger.info('loader', 'Starting sync', {
    height: modules.blocks.lastBlock.get().height,
    blocksToSync: __private.blocksToSync
  });
  library.bus.message('syncStarted');

  __private.isActive = true;
  __private.syncTrigger(true);

  // Run-scoped abort flag. Kept local (not on `__private`) so a fresh sync run
  // can never clear the stop signal of an earlier, still-alive run, and so it
  // stays distinct from the shutdown-only `stopRequested`.
  var aborted = false;
  // Completion is funnelled through finishSync() and guarded by `settled` so the
  // watchdog and the natural async.series completion are mutually exclusive: the
  // sync state is released exactly once, and a later (abandoned) completion of
  // the series becomes a harmless no-op.
  var settled = false;
  // True while a sync phase that mutates unconfirmed account/pool state is in
  // flight. Block application is tracked separately by `modules.blocks.isActive`.
  // The watchdog must not tear the run down while either is set, otherwise it
  // could advance `library.sequence` while an abandoned mutation is still alive.
  var mutatingState = false;

  // Shutdown or this run's watchdog abort both stop the in-flight series at its
  // next safe checkpoint.
  function shouldStop () {
    return __private.stopRequested || aborted;
  }

  // Wraps a state-mutating sync phase so the watchdog defers teardown until the
  // phase's callback has actually returned.
  function mutating (run) {
    return function (next) {
      mutatingState = true;
      return run(function (err) {
        mutatingState = false;
        return next(err);
      });
    };
  }

  var watchdog = createSyncWatchdog({
    timeoutMs: __private.syncTimeout,
    getHeight: function () {
      return modules.blocks.lastBlock.get().height;
    },
    onStall: function (height) {
      library.logger.error('loader', 'Sync watchdog: no block progress, aborting stalled sync to allow recovery', {
        height: height,
        blocksToSync: __private.blocksToSync,
        timeoutMs: __private.syncTimeout
      });
      // Set the run's abort flag, then release the sync state once any mutation
      // that was already in progress has drained.
      aborted = true;
      finishStalled();
    }
  });

  // Recovery rests on one invariant: once `aborted` is set, this run can never
  // begin a new state mutation.
  //   - New block apply is blocked because `shouldStop()` is threaded into
  //     `processBlock()` and checked right before `applyBlock()`, so a block
  //     parked anywhere in verification bails before mutating when it resumes.
  //   - New unconfirmed undo/apply phases are blocked by `skipOnStop()`.
  // That makes it safe to release `loader.syncing()` even while an abandoned
  // flow is still parked. The only thing left to guard is a mutation that had
  // *already started* before the abort: `applyBlock()` and the unconfirmed
  // phases write mem/account/round/pool state outside `library.sequence`, so we
  // wait for `modules.blocks.isActive` and the run-local `mutatingState` to
  // clear before tearing down. If the in-flight series reaches a checkpoint
  // first, it finishes the run itself and this becomes a no-op via `settled`.
  function finishStalled () {
    if (settled) {
      return;
    }

    if (mutatingState || modules.blocks.isActive.get()) {
      library.logger.warn('loader', 'Sync watchdog: waiting for in-flight state mutation to finish before recovery', {
        height: modules.blocks.lastBlock.get().height,
        unconfirmedMutation: mutatingState,
        blockApplication: modules.blocks.isActive.get()
      });
      return setTimeout(finishStalled, 1000);
    }

    // Terminal for this attempt: report no error so the async.retry wrapper does
    // not immediately restart the sync; the sync timer starts a fresh attempt.
    return finishSync(null);
  }

  function finishSync (err) {
    if (settled) {
      return;
    }
    settled = true;
    watchdog.stop();

    __private.isActive = false;
    __private.syncTrigger(false);
    __private.blocksToSync = 0;

    // After an abort, drop the cached network so the next attempt re-selects peers.
    if (aborted) {
      __private.initialize();
    }

    library.logger.info('loader', __private.stopRequested ? 'Sync stopped for shutdown' : 'Finished sync', {
      height: modules.blocks.lastBlock.get().height,
      stopped: __private.stopRequested,
      aborted: aborted,
      error: err ? err.message || err : null
    });
    library.bus.message('syncFinished');
    return setImmediate(cb, err);
  }

  function skipOnStop (seriesCb, next) {
    if (shouldStop()) {
      return setImmediate(seriesCb);
    }

    return next(seriesCb);
  }

  watchdog.start();

  async.series({
    undoUnconfirmedList: function (seriesCb) {
      return skipOnStop(seriesCb, mutating(function (next) {
        library.logger.debug('loader', 'Undoing unconfirmed transactions before sync', {
          height: modules.blocks.lastBlock.get().height
        });
        return modules.transactions.undoUnconfirmedList(next);
      }));
    },
    getPeersBefore: function (seriesCb) {
      return skipOnStop(seriesCb, function (next) {
        library.logger.debug('loader', 'Establishing broadhash consensus before sync', {
          height: modules.blocks.lastBlock.get().height,
          limit: constants.maxPeers
        });
        return modules.transport.getPeers({ limit: constants.maxPeers }, next);
      });
    },
    loadBlocksFromNetwork: function (seriesCb) {
      return skipOnStop(seriesCb, function (next) {
        return __private.loadBlocksFromNetwork(next, shouldStop);
      });
    },
    updateSystem: function (seriesCb) {
      return skipOnStop(seriesCb, function (next) {
        return modules.system.update(next);
      });
    },
    getPeersAfter: function (seriesCb) {
      return skipOnStop(seriesCb, function (next) {
        library.logger.debug('loader', 'Establishing broadhash consensus after sync', {
          height: modules.blocks.lastBlock.get().height,
          limit: constants.maxPeers
        });
        return modules.transport.getPeers({ limit: constants.maxPeers }, next);
      });
    },
    applyUnconfirmedList: function (seriesCb) {
      return skipOnStop(seriesCb, mutating(function (next) {
        library.logger.debug('loader', 'Applying unconfirmed transactions after sync', {
          height: modules.blocks.lastBlock.get().height
        });
        return modules.transactions.applyUnconfirmedList(next);
      }));
    }
  }, function (err) {
    return finishSync(err);
  });
};

/*
 * Given a list of peers (with associated blockchain height), we find a list
 * of good peers (likely to sync with), then perform a histogram cut, removing
 * peers far from the most common observed height. This is not as easy as it
 * sounds, since the histogram has likely been made across several blocks,
 * therefore need to aggregate).
 */
/**
 * Gets the list of good peers.
 * @param {number} heights
 *
 * @private
 * @implements {modules.blocks.lastBlock.get}
 * @implements {library.logic.peers.create}
 * @return {object} {height number, peers array}
 */
__private.findGoodPeers = function (heights) {
  var lastBlockHeight = modules.blocks.lastBlock.get().height;
  library.logger.trace('loader', 'Good peers - received', { count: heights.length });

  heights = heights.filter(function (item) {
    // Removing unreachable peers or heights below last block height
    return item != null && item.height >= lastBlockHeight;
  });

  library.logger.trace('loader', 'Good peers - filtered', { count: heights.length });

  // No peers found
  if (heights.length === 0) {
    return { height: 0, peers: [] };
  } else {
    // Ordering the peers with descending height
    heights = heights.sort(function (a, b) {
      return b.height - a.height;
    });

    var histogram = {};
    var max = 0;
    var height;

    // Aggregating height by 2. TODO: To be changed if node latency increases?
    var aggregation = 2;

    // Histogram calculation, together with histogram maximum
    for (var i in heights) {
      var val = parseInt(heights[i].height / aggregation) * aggregation;
      histogram[val] = (histogram[val] ? histogram[val] : 0) + 1;

      if (histogram[val] > max) {
        max = histogram[val];
        height = val;
      }
    }

    // Performing histogram cut of peers too far from histogram maximum
    var peers = heights.filter(function (item) {
      return item && Math.abs(height - item.height) < aggregation + 1;
    }).map(function (item) {
      return library.logic.peers.create(item);
    });

    library.logger.trace('loader', 'Good peers - accepted', { count: peers.length });
    library.logger.debug('loader', 'Good peers', peers);

    return { height: height, peers: peers };
  }
};

// Public methods

// Rationale:
// - We pick 100 random peers from a random peer (could be unreachable).
// - Then for each of them we grab the height of their blockchain.
// - With this list we try to get a peer with sensibly good blockchain height (see __private.findGoodPeers for actual strategy).
/**
 * Gets good peers.
 * @param {Function} cb
 * @implements {modules.blocks.lastBlock.get}
 * @implements {modules.peers.list}
 * @implements {__private.findGoodPeers}
 * @return {setImmediateCallback} err | __private.network (good peers)
 */
Loader.prototype.getNetwork = function (cb) {
  if (__private.network.height > 0 && Math.abs(__private.network.height - modules.blocks.lastBlock.get().height) === 1) {
    return setImmediate(cb, null, __private.network);
  }

  modules.peers.list({}, function (err, peers) {
    if (err) {
      return setImmediate(cb, err);
    }

    __private.network = __private.findGoodPeers(peers);

    if (!__private.network.peers.length) {
      return setImmediate(cb, 'Failed to find enough good peers');
    } else {
      return setImmediate(cb, null, __private.network);
    }
  });
};

/**
 * Checks if private variable syncIntervalId have value.
 * @return {boolean} True if syncIntervalId have value
 */
Loader.prototype.syncing = function () {
  return !!__private.syncIntervalId;
};

/**
 * Returns current blockchain height to achieve if in sync process;
 * Returns `0` if syncing done.
 * @return {number}
 */
Loader.prototype.getBlocksToSync = function () {
  return __private.blocksToSync;
};

/**
 * Returns last blockchain height when syncing.
 * @return {number}
 */
Loader.prototype.getHeight = function () {
  return __private.lastBlock.height;
};

/**
 * Returns if the blockchain is in sync process.
 * @return {boolean}
 */
Loader.prototype.loaded = function () {
  return __private.loaded;
};

/**
 * Returns whether the blockchain has checked if it needs to sync
 * @return {boolean}
 */
Loader.prototype.isReadyToSync = function () {
  return __private.ready;
};

/**
 * Returns total synced blocks.
 * @return {number}
 */
Loader.prototype.getTotalBlocks = function () {
  return __private.total;
};

/**
 * Calls helpers.sandbox.callMethod().
 * @param {Function} call - Method to call.
 * @param {*} args - List of arguments.
 * @param {Function} cb - Callback function.
 *
 * @implements module:helpers#callMethod
 */
Loader.prototype.sandboxApi = function (call, args, cb) {
  sandboxHelper.callMethod(shared, call, args, cb);
};

/**
 * Checks if `modules` is loaded.
 * @return {boolean} True if `modules` is loaded.
 */
Loader.prototype.isLoaded = function () {
  return !!modules;
};

// Events
/**
 * Pulls Transactions and signatures.
 * @implements {__private.syncTimer}
 * @implements {async.series}
 * @implements {async.retry}
 * @implements {__private.loadTransactions}
 * @implements {__private.loadSignatures}
 * @implements {__private.initialize}
 * @return {Function} calls to __private.syncTimer()
 */
Loader.prototype.onPeersReady = function () {
  library.logger.trace('loader', 'Peers ready');
  // Enforce sync early
  __private.syncTimer();

  __private.ready = true;

  setImmediate(function load () {
    async.series({
      loadTransactions: function (seriesCb) {
        if (__private.loaded) {
          async.retry(__private.retries, __private.loadTransactions, function (err) {
            if (err) {
              library.logger.log('loader', 'Unconfirmed transactions loader', err);
            }

            return setImmediate(seriesCb);
          });
        } else {
          return setImmediate(seriesCb);
        }
      },
      loadSignatures: function (seriesCb) {
        if (__private.loaded) {
          async.retry(__private.retries, __private.loadSignatures, function (err) {
            if (err) {
              library.logger.error('loader', 'Failed to load signatures:', err);
            }

            return setImmediate(seriesCb);
          });
        } else {
          return setImmediate(seriesCb);
        }
      }
    }, function (err) {
      library.logger.trace('loader', 'Transactions and signatures pulled');

      if (err) {
        __private.initialize();
      }
    });
  });
};

/**
 * Assigns needed modules from scope to private modules variable.
 * Calls __private.loadBlockChain
 * @param {modules} scope
 */
Loader.prototype.onBind = function (scope) {
  modules = {
    transactions: scope.transactions,
    blocks: scope.blocks,
    peers: scope.peers,
    rounds: scope.rounds,
    transport: scope.transport,
    multisignatures: scope.multisignatures,
    system: scope.system,
    memCheckpoints: scope.memCheckpoints
  };

  __private.loadBlockChain();
};

/**
 * Sets private variable loaded to true.
 */
Loader.prototype.onBlockchainReady = function () {
  __private.loaded = true;
};

/**
 * Sets private variable loaded to false.
 * @param {Function} cb
 *
 * @return {setImmediateCallback} cb
 */
Loader.prototype.cleanup = function (cb) {
  function waitForIdle () {
    if (__private.isActive) {
      library.logger.info('loader', 'Waiting for loader to finish active sync/rebuild...');
      return setTimeout(waitForIdle, 10000);
    }

    return setImmediate(cb);
  }

  __private.loaded = false;
  __private.ready = false;
  __private.requestStop();

  return setImmediate(waitForIdle);
};

// Internal API
/**
 * @see {@link http://apidocjs.com/}
 * @todo implement API comments with apidoc.
 */
Loader.prototype.internal = {
  statusPing: function () {
    return modules.blocks.lastBlock.isFresh();
  }
};

// Shared API
/**
 * @see {@link http://apidocjs.com/}
 * @todo implement API comments with apidoc.
 */
Loader.prototype.shared = {
  status: function (req, cb) {
    return setImmediate(cb, null, {
      loaded: __private.loaded,
      now: __private.lastBlock.height,
      blocksCount: __private.total
    });
  },

  sync: function (req, cb) {
    return setImmediate(cb, null, {
      syncing: self.syncing(),
      blocks: __private.blocksToSync,
      height: modules.blocks.lastBlock.get().height,
      broadhash: modules.system.getBroadhash(),
      consensus: modules.transport.consensus()
    });
  }
};

// Export
module.exports = Loader;
