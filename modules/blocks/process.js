'use strict';

var _ = require('lodash');
var async = require('async');
var constants = require('../../helpers/constants.js');
var schema = require('../../schema/blocks.js');
var slots = require('../../helpers/slots.js');
var sql = require('../../sql/blocks.js');

var modules, library, self, __private = {};

/**
 * Formats block sync progress from the current loader target.
 * @param {block} block - Block loaded from a peer.
 * @returns {string} Human-readable block height, target and progress details.
 */
function formatSyncProgress (block) {
  var target = modules.loader && modules.loader.getBlocksToSync && modules.loader.getBlocksToSync();
  var details = 'height: ' + block.height;

  if (target > 0) {
    var progress = Math.min((block.height / target) * 100, 100);
    details = 'target: ' + target + ' ' + details + ' (' + progress.toFixed(2) + '%)';
  }

  return details;
}

/**
 * Initializes library.
 * @memberof module:blocks
 * @class
 * @classdesc Main Process logic.
 * Allows process blocks.
 * @param {Object} logger
 * @param {Block} block
 * @param {Peers} peers
 * @param {Transaction} transaction
 * @param {ZSchema} schema
 * @param {Database} db
 * @param {Sequence} dbSequence
 * @param {Sequence} sequence
 * @param {Object} genesisblock
 */
function Process (logger, block, peers, transaction, schema, db, dbSequence, sequence, genesisblock) {
  library = {
    logger: logger,
    schema: schema,
    db: db,
    dbSequence: dbSequence,
    sequence: sequence,
    genesisblock: genesisblock,
    logic: {
      block: block,
      peers: peers,
      transaction: transaction
    }
  };
  self = this;

  library.logger.trace('blocks', 'Blocks->Process: Submodule initialized.');
  return self;
}

/**
 * Performs chain comparison with remote peer
 * WARNING: Can trigger chain recovery
 *
 * @async
 * @public
 * @method getCommonBlock
 * @param  {Peer}     peer Peer to perform chain comparison with
 * @param  {number}   height Block height
 * @param  {Function} cb Callback function
 * @return {Function} cb Callback function from params (through setImmediate)
 * @return {Object}   cb.err Error if occurred
 * @return {Object}   cb.res Result object
 */
Process.prototype.getCommonBlock = function (peer, height, cb) {
  var comparisionFailed = false;

  async.waterfall([
    function (waterCb) {
      // Get IDs sequence (comma separated list)
      modules.blocks.utils.getIdSequence(height, function (err, res) {
        return setImmediate(waterCb, err, res);
      });
    },
    function (res, waterCb) {
      var ids = res.ids;

      // Perform request to supplied remote peer
      modules.transport.getFromPeer(peer, {
        api: '/blocks/common?ids=' + ids,
        method: 'GET'
      }, function (err, res) {
        if (err || res.body.error) {
          return setImmediate(waterCb, err || res.body.error.toString());
        } else if (!res.body.common) {
          // FIXME: Need better checking here, is base on 'common' property enough?
          comparisionFailed = true;
          return setImmediate(waterCb, ['Chain comparison failed with peer:', peer.string, 'using ids:', ids].join(' '));
        } else {
          return setImmediate(waterCb, null, res);
        }
      });
    },
    function (res, waterCb) {
      // Validate remote peer response via schema
      library.schema.validate(res.body.common, schema.getCommonBlock, function (err) {
        if (err) {
          return setImmediate(waterCb, err[0].message);
        } else {
          return setImmediate(waterCb, null, res);
        }
      });
    },
    function (res, waterCb) {
      // Check that block with ID, previousBlock and height exists in database
      library.db.query(sql.getCommonBlock(res.body.common.previousBlock), {
        id: res.body.common.id,
        previousBlock: res.body.common.previousBlock,
        height: res.body.common.height
      }).then(function (rows) {
        if (!rows.length || !rows[0].count) {
          // Block doesn't exists - comparison failed
          comparisionFailed = true;
          return setImmediate(waterCb, ['Chain comparison failed with peer:', peer.string, 'using block:', JSON.stringify(res.body.common)].join(' '));
        } else {
          // Block exists - it's common between our node and remote peer
          return setImmediate(waterCb, null, res.body.common);
        }
      }).catch(function (err) {
        // SQL error occurred
        library.logger.error('blocks', `Failed to get common block: ${err?.message || err}`, err.stack);
        return setImmediate(waterCb, 'Blocks#getCommonBlock error');
      });
    }
  ], function (err, res) {
    // If comparison failed and current consensus is low - perform chain recovery
    if (comparisionFailed && modules.transport.poorConsensus()) {
      return modules.blocks.chain.recoverChain(cb);
    } else {
      return setImmediate(cb, err, res);
    }
  });
};


/**
 * Loads full blocks from database, used when rebuilding blockchain, snapshotting.
 * Logs each block with height, round, previous block id and transaction count
 * before applying it so replay diagnostics can identify the exact block.
 * see: loader.loadBlockChain (private)
 *
 * @async
 * @public
 * @method loadBlocksOffset
 * @param  {number}   limit Limit amount of blocks
 * @param  {number}   offset Offset to start at
 * @param  {boolean}  verify Indicator that block needs to be verified
 * @param  {Function} cb Callback function
 * @param  {Function} shouldStop Optional callback that returns true on shutdown
 * @return {Function} cb Callback function from params (through setImmediate)
 * @return {Object}   cb.err Error if occurred
 * @return {Object}   cb.lastBlock Current last block
 */
Process.prototype.loadBlocksOffset = function (limit, offset, verify, cb, shouldStop) {
  // Calculate limit if offset is supplied
  var newLimit = limit + (offset || 0);
  var params = { limit: newLimit, offset: offset || 0 };

  library.logger.debug('loader', 'Loading blocks offset', { limit: limit, offset: offset, verify: verify });
  // Execute in sequence via dbSequence
  library.dbSequence.add(function (cb) {
    // Loads full blocks from database
    // FIXME: Weird logic in that SQL query, also ordering used can be performance bottleneck - to rewrite
    library.db.query(sql.loadBlocksOffset, params).then(function (rows) {
      // Normalize blocks
      var blocks = modules.blocks.utils.readDbRows(rows);

      async.eachSeries(blocks, function (block, cb) {
        // Stop processing if node shutdown was requested
        if (modules.blocks.isCleaning.get() || (shouldStop && shouldStop())) {
          return setImmediate(cb);
        }

        library.logger.debug('loader', 'Processing block', {
          id: block.id,
          height: block.height,
          previousBlock: block.previousBlock,
          round: modules.rounds.calc(block.height),
          transactions: block.transactions.length
        });
        if (verify && block.id !== library.genesisblock.block.id) {
          // Sanity check of the block, if values are coherent.
          // No access to database.
          var check = modules.blocks.verify.verifyBlock(block);

          if (!check.verified) {
            library.logger.error('loader', ['Block', block.id, 'verification failed'].join(' '), check.errors.join(', '));
            // Return first error from checks
            return setImmediate(cb, check.errors[0]);
          }
        }
        if (block.id === library.genesisblock.block.id) {
          modules.blocks.chain.applyGenesisBlock(block, cb);
        } else {
          // Apply block - broadcast: false, saveBlock: false
          // FIXME: Looks like we are missing some validations here, because applyBlock is different than processBlock used elsewhere
          // - that need to be checked and adjusted to be consistent
          modules.blocks.chain.applyBlock(block, false, cb, false);
        }
        // Update last block
        modules.blocks.lastBlock.set(block);
      }, function (err) {
        return setImmediate(cb, err, modules.blocks.lastBlock.get());
      });
    }).catch(function (err) {
      library.logger.error('loader', `Failed to get blocks offset: ${err?.message || err}`, err.stack);
      return setImmediate(cb, 'Blocks#loadBlocksOffset error');
    });
  }, cb);
};

/**
 * Ask remote peer for blocks and process them
 *
 * @async
 * @public
 * @method loadBlocksFromPeer
 * @param  {Peer}     peer Peer to perform chain comparison with
 * @param  {Function} cb Callback function
 * @param  {Function} shouldStop Optional callback that returns true on shutdown
 * @return {Function} cb Callback function from params (through setImmediate)
 * @return {Object}   cb.err Error if occurred
 * @return {Object}   cb.lastValidBlock Normalized new last block
 */
Process.prototype.loadBlocksFromPeer = function (peer, cb, shouldStop) {
  // Set current last block as last valid block
  var lastValidBlock = modules.blocks.lastBlock.get();

  // Normalize peer
  peer = library.logic.peers.create(peer);
  library.logger.info('loader', 'Loading blocks from: ' + peer.string);

  function getFromPeer (seriesCb) {
    // Ask remote peer for blocks
    modules.transport.getFromPeer(peer, {
      method: 'GET',
      api: '/blocks?lastBlockId=' + lastValidBlock.id
    }, function (err, res) {
      err = err || res.body.error;
      if (err) {
        return setImmediate(seriesCb, err);
      } else {
        return setImmediate(seriesCb, null, res.body.blocks);
      }
    });
  }

  // Validate remote peer response via schema
  function validateBlocks (blocks, seriesCb) {
    var report = library.schema.validate(blocks, schema.loadBlocksFromPeer);

    if (!report) {
      return setImmediate(seriesCb, 'Received invalid blocks data');
    } else {
      return setImmediate(seriesCb, null, blocks);
    }
  }

  // Process all received blocks
  function processBlocks (blocks, seriesCb) {
    // Skip if there are no blocks
    if (blocks.length === 0) {
      return setImmediate(seriesCb);
    }
    // Iterate over received blocks, normalize block first...
    async.eachSeries(modules.blocks.utils.readDbRows(blocks), function (block, eachSeriesCb) {
      if (modules.blocks.isCleaning.get() || (shouldStop && shouldStop())) {
        // Cancel processing if node shutdown was requested
        return setImmediate(eachSeriesCb);
      } else {
        // ...then process block
        return processBlock(block, eachSeriesCb);
      }
    }, function (err) {
      return setImmediate(seriesCb, err);
    });
  }

  // Process single block
  function processBlock (block, seriesCb) {
    // Start block processing - broadcast: false, saveBlock: true
    modules.blocks.verify.processBlock(block, false, function (err) {
      if (!err) {
        // Update last valid block
        lastValidBlock = block;
        library.logger.info('loader', ['Block', block.id, 'loaded from:', peer.string].join(' '), formatSyncProgress(block));
      } else {
        var id = (block ? block.id : 'null');

        library.logger.debug('loader', 'Block processing failed', { id: id, err: err.toString(), module: 'blocks', block: block });
      }
      return seriesCb(err);
    }, true);
  }

  async.waterfall([
    getFromPeer,
    validateBlocks,
    processBlocks
  ], function (err) {
    if (err) {
      return setImmediate(cb, 'Error loading blocks: ' + (err.message || err), lastValidBlock);
    } else {
      return setImmediate(cb, null, lastValidBlock);
    }
  });
};

/**
 * Generate new block
 * see: loader.loadBlockChain (private)
 *
 * @async
 * @public
 * @method generateBlock
 * @param  {Object}   keypair Pair of private and public keys, see: helpers.ed.makeKeypair
 * @param  {number}   timestamp Slot time, see: helpers.slots.getSlotTime
 * @param  {Function} cb Callback function
 * @return {Function} cb Callback function from params (through setImmediate)
 * @return {Object}   cb.err Error message if error occurred
 */
Process.prototype.generateBlock = function (keypair, timestamp, cb) {
  // Get transactions that will be included in block
  var transactions = modules.transactions.getUnconfirmedTransactionList(false, constants.maxTxsPerBlock);
  var ready = [];

  async.eachSeries(transactions, function (transaction, cb) {
    modules.accounts.getAccount({ publicKey: transaction.senderPublicKey }, function (err, sender) {
      if (err || !sender) {
        return setImmediate(cb, 'Sender not found');
      }

      // Check transaction depends on type
      if (library.logic.transaction.ready(transaction, sender)) {
        // Verify transaction
        library.logic.transaction.verify(transaction, sender, function (err) {
          ready.push(transaction);
          return setImmediate(cb);
        });
      } else {
        return setImmediate(cb);
      }
    });
  }, function () {
    var block;

    try {
      // Create a block
      block = library.logic.block.create({
        keypair: keypair,
        timestamp: timestamp,
        previousBlock: modules.blocks.lastBlock.get(),
        transactions: ready
      });
    } catch (e) {
      library.logger.error('loader', `Failed to generate a new block: ${e?.message || e}`, e.stack);
      return setImmediate(cb, e);
    }

    // Start block processing - broadcast: true, saveBlock: true
    modules.blocks.verify.processBlock(block, true, cb, true);
  });
};

/**
 * EVENTS
 */

/**
 * Handles a newly received live block.
 * @public
 * @param {block} block - Received block.
 * @listens module:transport~event:receiveBlock
 * @returns {void}
 */
Process.prototype.onReceiveBlock = function (block) {
  var lastBlock;

  // Synchronization applies blocks through the loader. Queuing live notifications
  // at the same time only creates a large backlog of stale callbacks.
  if (!__private.isReadyToReceiveBlock()) {
    library.logger.debug('loader', 'Client not yet ready to receive block', block.id);
    return;
  }

  // Execute in sequence via sequence
  library.sequence.add(function (cb) {
    // Readiness may change while this callback waits behind earlier sequence work.
    if (!__private.isReadyToReceiveBlock()) {
      library.logger.debug('loader', 'Client not yet ready to receive block', block.id);
      return setImmediate(cb);
    }

    // Get the last block
    lastBlock = modules.blocks.lastBlock.get();

    // Detect sane block
    if (block.previousBlock === lastBlock.id && lastBlock.height + 1 === block.height) {
      // Process received block
      return __private.receiveBlock(block, cb);
    } else if (block.previousBlock !== lastBlock.id && lastBlock.height + 1 === block.height) {
      // Process received fork cause 1
      return __private.receiveForkOne(block, lastBlock, cb);
    } else if (block.previousBlock === lastBlock.previousBlock && block.height === lastBlock.height && block.id !== lastBlock.id) {
      // Process received fork cause 5
      return __private.receiveForkFive(block, lastBlock, cb);
    } else {
      if (block.id === lastBlock.id) {
        library.logger.debug('loader', 'Block already processed', block.id);
      } else if (block.height < lastBlock.height) {
        library.logger.debug('loader', 'Received old block', block.id);
      } else {
        library.logger.warn('loader', [
          'Discarded the received block because it does not match the current chain.',

          'Blockchain Last Block:',

          'Id=', lastBlock.id,
          'Height=', lastBlock.height,

          'Received Block:',

          'Id=', block.id,
          'Height=', block.height,
          'Round=', modules.rounds.calc(block.height),
          'Slot=', slots.getSlotNumber(block.timestamp),
          'Generator=', block.generatorPublicKey
        ].join(' '));
      }

      // Discard received block
      return setImmediate(cb);
    }
  });
};

/**
 * Returns whether the node can process live blocks.
 * @private
 * @returns {boolean} Whether live block processing is currently safe.
 */
__private.isReadyToReceiveBlock = function () {
  const syncPending = !modules.loader.isReadyToSync() || modules.loader.syncing();

  return __private.loaded && !syncPending && !modules.rounds.ticking();
};

/**
 * Receive block - logs info about received block, updates last receipt, processes block
 *
 * @private
 * @async
 * @method receiveBlock
 * @param {Object}   block Full normalized block
 * @param {Function} cb Callback function
 */
__private.receiveBlock = function (block, cb) {
  library.logger.info('loader', [
    'Received new block id:', block.id,
    'height:', block.height,
    'round:', modules.rounds.calc(block.height),
    'slot:', slots.getSlotNumber(block.timestamp),
    'reward:', block.reward
  ].join(' '));

  // Update last receipt
  modules.blocks.lastReceipt.update();
  // Start block processing - broadcast: true, saveBlock: true
  modules.blocks.verify.processBlock(block, true, cb, true);
};

/**
 * Receive block detected as fork cause 1: Consecutive height but different previous block id.
 * Logs both competing blocks so fork decisions can be audited from logs.
 *
 * @private
 * @async
 * @method receiveBlock
 * @param {Object}   block Received block
 * @param {Object}   lastBlock Current local last block
 * @param {Function} cb Callback function
 */
__private.receiveForkOne = function (block, lastBlock, cb) {
  var tmp_block = _.clone(block);

  // Fork: Consecutive height but different previous block id
  modules.delegates.fork(block, 1);

  // Keep the oldest block, or if both have same age, keep block with lower id
  if (block.timestamp > lastBlock.timestamp || (block.timestamp === lastBlock.timestamp && block.id > lastBlock.id)) {
    library.logger.info('loader', 'Last block stands after processing fork cause 1', {
      receivedBlockId: block.id,
      receivedBlockHeight: block.height,
      receivedBlockTimestamp: block.timestamp,
      lastBlockId: lastBlock.id,
      lastBlockHeight: lastBlock.height,
      lastBlockTimestamp: lastBlock.timestamp
    });
    return setImmediate(cb); // Discard received block
  } else {
    library.logger.info('loader', 'Last block and parent loses after processing fork cause 1', {
      receivedBlockId: block.id,
      receivedBlockHeight: block.height,
      receivedBlockTimestamp: block.timestamp,
      lastBlockId: lastBlock.id,
      lastBlockHeight: lastBlock.height,
      lastBlockTimestamp: lastBlock.timestamp
    });
    async.series([
      function (seriesCb) {
        try {
          tmp_block = library.logic.block.objectNormalize(tmp_block);
        } catch (err) {
          return setImmediate(seriesCb, err);
        }
        return setImmediate(seriesCb);
      },
      // Check received block before any deletion
      function (seriesCb) {
        var check = modules.blocks.verify.verifyReceipt(tmp_block);

        if (!check.verified) {
          library.logger.error('loader', ['Block', tmp_block.id, 'verification failed'].join(' '), check.errors.join(', '));
          // Return first error from checks
          return setImmediate(seriesCb, check.errors[0]);
        } else {
          return setImmediate(seriesCb);
        }
      },
      // Delete last 2 blocks
      modules.blocks.chain.deleteLastBlock,
      modules.blocks.chain.deleteLastBlock
    ], function (err) {
      if (err) {
        library.logger.error('loader', 'Fork cause 1 recovery failed', err);
      }
      return setImmediate(cb, err);
    });
  }
};

/**
 * Receive block detected as fork cause 5: Same height and previous block id, but different block id.
 * Logs both competing blocks so fork decisions can be audited from logs.
 *
 * @private
 * @async
 * @method receiveBlock
 * @param {Object}   block Received block
 * @param {Object}   lastBlock Current local last block
 * @param {Function} cb Callback function
 */
__private.receiveForkFive = function (block, lastBlock, cb) {
  var tmp_block = _.clone(block);

  // Fork: Same height and previous block id, but different block id
  modules.delegates.fork(block, 5);

  // Check if delegate forged on more than one node
  if (block.generatorPublicKey === lastBlock.generatorPublicKey) {
    library.logger.warn('loader', 'Delegate forging on multiple nodes', block.generatorPublicKey);
  }

  // Keep the oldest block, or if both have same age, keep block with lower id
  if (block.timestamp > lastBlock.timestamp || (block.timestamp === lastBlock.timestamp && block.id > lastBlock.id)) {
    library.logger.info('loader', 'Last block stands after processing fork 5', {
      receivedBlockId: block.id,
      receivedBlockHeight: block.height,
      receivedBlockTimestamp: block.timestamp,
      lastBlockId: lastBlock.id,
      lastBlockHeight: lastBlock.height,
      lastBlockTimestamp: lastBlock.timestamp
    });
    return setImmediate(cb); // Discard received block
  } else {
    library.logger.info('loader', 'Last block loses after processing fork 5', {
      receivedBlockId: block.id,
      receivedBlockHeight: block.height,
      receivedBlockTimestamp: block.timestamp,
      lastBlockId: lastBlock.id,
      lastBlockHeight: lastBlock.height,
      lastBlockTimestamp: lastBlock.timestamp
    });
    async.series([
      function (seriesCb) {
        try {
          tmp_block = library.logic.block.objectNormalize(tmp_block);
        } catch (err) {
          return setImmediate(seriesCb, err);
        }
        return setImmediate(seriesCb);
      },
      // Check received block before any deletion
      function (seriesCb) {
        var check = modules.blocks.verify.verifyReceipt(tmp_block);

        if (!check.verified) {
          library.logger.error('loader', ['Block', tmp_block.id, 'verification failed'].join(' '), check.errors.join(', '));
          // Return first error from checks
          return setImmediate(seriesCb, check.errors[0]);
        } else {
          return setImmediate(seriesCb);
        }
      },
      // Delete last block
      function (seriesCb) {
        modules.blocks.chain.deleteLastBlock(seriesCb);
      },
      // Process received block
      function (seriesCb) {
        return __private.receiveBlock(block, seriesCb);
      }
    ], function (err) {
      if (err) {
        library.logger.error('loader', 'Fork cause 5 recovery failed', err);
      }
      return setImmediate(cb, err);
    });
  }
};

/**
 * Handle modules initialization
 * - accounts
 * - blocks
 * - delegates
 * - loader
 * - rounds
 * - transactions
 * - transport
 * @param {modules} scope Exposed modules
 */
Process.prototype.onBind = function (scope) {
  library.logger.trace('loader', 'Blocks->Process: Shared modules bind.');
  modules = {
    accounts: scope.accounts,
    blocks: scope.blocks,
    delegates: scope.delegates,
    loader: scope.loader,
    rounds: scope.rounds,
    transactions: scope.transactions,
    transport: scope.transport
  };

  // Set module as loaded
  __private.loaded = true;
};

module.exports = Process;
