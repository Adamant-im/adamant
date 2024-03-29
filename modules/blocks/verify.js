'use strict';

var async = require('async');
var BlockReward = require('../../logic/blockReward.js');
var constants = require('../../helpers/constants.js');
var crypto = require('crypto');
var slots = require('../../helpers/slots.js');
var sql = require('../../sql/blocks.js');
var exceptions = require('../../helpers/exceptions.js');

var modules, library, self, __private = {};

__private.blockReward = new BlockReward();

function Verify (logger, block, transaction, db) {
  library = {
    logger: logger,
    db: db,
    logic: {
      block: block,
      transaction: transaction
    }
  };
  self = this;

  library.logger.trace('Blocks->Verify: Submodule initialized.');
  return self;
}

/**
 * Check transaction - perform transaction validation when processing block
 * FIXME: Some checks are probably redundant, see: logic.transactionPool
 *
 * @private
 * @async
 * @method checkTransaction
 * @param  {Object}   block Block object
 * @param  {Object}   transaction Transaction object
 * @param  {Function} cb Callback function
 * @return {Function} cb Callback function from params (through setImmediate)
 * @return {Object}   cb.err Error if occurred
 */
__private.checkTransaction = function (block, transaction, cb) {
  async.waterfall([
    function (waterCb) {
      try {
        // Calculate transaction ID
        // FIXME: Can have poor performance, because of hash calculation
        transaction.id = library.logic.transaction.getId(transaction);
      } catch (e) {
        return setImmediate(waterCb, e.toString());
      }
      // Apply block ID to transaction
      transaction.blockId = block.id;
      return setImmediate(waterCb);
    },
    function (waterCb) {
      // Check if transaction is already in database, otherwise fork 2.
      // DATABASE: read only
      library.logic.transaction.checkConfirmed(transaction, function (err) {
        if (err) {
          // Fork: Transaction already confirmed.
          modules.delegates.fork(block, 2);
          // Undo the offending transaction.
          // DATABASE: write
          modules.transactions.undoUnconfirmed(transaction, function (err2) {
            modules.transactions.removeUnconfirmedTransaction(transaction.id);
            return setImmediate(waterCb, err2 || err);
          });
        } else {
          return setImmediate(waterCb);
        }
      });
    },
    function (waterCb) {
      // Get account from database if any (otherwise cold wallet).
      // DATABASE: read only
      modules.accounts.getAccount({ publicKey: transaction.senderPublicKey }, waterCb);
    },
    function (sender, waterCb) {
      // Check if transaction id valid against database state (mem_* tables).
      // DATABASE: read only
      library.logic.transaction.verify(transaction, sender, waterCb);
    }
  ], function (err) {
    return setImmediate(cb, err);
  });
};

/**
 * Set height according to the given last block
 *
 * @private
 * @method verifyBlock
 * @method verifyReceipt
 * @param  {Object}  block Target block
 * @param  {Object}  lastBlock Last block
 * @return {Object}  block Target block
 */
__private.setHeight = function (block, lastBlock) {
  block.height = lastBlock.height + 1;

  return block;
};

/**
 * Verify block signature
 *
 * @private
 * @method verifyBlock
 * @method verifyReceipt
 * @param  {Object}  block Target block
 * @param  {Object}  result Verification results
 * @return {Object}  result Verification results
 * @return {boolean} result.verified Indicator that verification passed
 * @return {Array}   result.errors Array of validation errors
 */
__private.verifySignature = function (block, result) {
  var valid;

  try {
    valid = library.logic.block.verifySignature(block);
  } catch (e) {
    result.errors.push(e.toString());
  }

  if (!valid) {
    result.errors.push('Failed to verify block signature');
  }

  return result;
};

/**
 * Verify previous block
 *
 * @private
 * @method verifyBlock
 * @method verifyReceipt
 * @param  {Object}  block Target block
 * @param  {Object}  result Verification results
 * @return {Object}  result Verification results
 * @return {boolean} result.verified Indicator that verification passed
 * @return {Array}   result.errors Array of validation errors
 */
__private.verifyPreviousBlock = function (block, result) {
  if (!block.previousBlock && block.height !== 1) {
    result.errors.push('Invalid previous block');
  }

  return result;
};

/**
 * Verify block version
 *
 * @private
 * @method verifyBlock
 * @method verifyReceipt
 * @param  {Object}  block Target block
 * @param  {Object}  result Verification results
 * @return {Object}  result Verification results
 * @return {boolean} result.verified Indicator that verification passed
 * @return {Array}   result.errors Array of validation errors
 */
__private.verifyVersion = function (block, result) {
  if (block.version > 0) {
    result.errors.push('Invalid block version');
  }

  return result;
};

/**
 * Verify block reward
 *
 * @private
 * @method verifyBlock
 * @method verifyReceipt
 * @param  {Object}  block Target block
 * @param  {Object}  result Verification results
 * @return {Object}  result Verification results
 * @return {boolean} result.verified Indicator that verification passed
 * @return {Array}   result.errors Array of validation errors
 */
__private.verifyReward = function (block, result) {
  var expectedReward = __private.blockReward.calcReward(block.height);

  if (block.height !== 1 && expectedReward !== block.reward && exceptions.blockRewards.indexOf(block.id) === -1) {
    result.errors.push(['Invalid block reward:', block.reward, 'expected:', expectedReward].join(' '));
  }

  return result;
};

/**
 * Verify block id
 *
 * @private
 * @method verifyBlock
 * @method verifyReceipt
 * @param  {Object}  block Target block
 * @param  {Object}  result Verification results
 * @return {Object}  result Verification results
 * @return {boolean} result.verified Indicator that verification passed
 * @return {Array}   result.errors Array of validation errors
 */
__private.verifyId = function (block, result) {
  try {
    // Get block ID
    // FIXME: Why we don't have it?
    block.id = library.logic.block.getId(block);
  } catch (e) {
    result.errors.push(e.toString());
  }

  return result;
};

/**
 * Verify block payload (transactions)
 *
 * @private
 * @method verifyBlock
 * @method verifyReceipt
 * @param  {Object}  block Target block
 * @param  {Object}  result Verification results
 * @return {Object}  result Verification results
 * @return {boolean} result.verified Indicator that verification passed
 * @return {Array}   result.errors Array of validation errors
 */
__private.verifyPayload = function (block, result) {
  if (block.payloadLength > constants.maxPayloadLength) {
    result.errors.push('Payload length is too long');
  }

  if (block.transactions.length !== block.numberOfTransactions) {
    result.errors.push('Included transactions do not match block transactions count');
  }

  if (block.transactions.length > constants.maxTxsPerBlock) {
    result.errors.push('Number of transactions exceeds maximum per block');
  }

  var totalAmount = 0;
  var totalFee = 0;
  var payloadHash = crypto.createHash('sha256');
  var appliedTransactions = {};

  for (var i in block.transactions) {
    var transaction = block.transactions[i];
    var bytes;

    try {
      bytes = library.logic.transaction.getBytes(transaction);
    } catch (e) {
      result.errors.push(e.toString());
    }

    if (appliedTransactions[transaction.id]) {
      result.errors.push('Encountered duplicate transaction: ' + transaction.id);
    }

    appliedTransactions[transaction.id] = transaction;
    if (bytes) { payloadHash.update(bytes); }
    totalAmount += transaction.amount;
    totalFee += transaction.fee;
  }

  if (payloadHash.digest().toString('hex') !== block.payloadHash) {
    result.errors.push('Invalid payload hash');
  }

  if (totalAmount !== block.totalAmount) {
    result.errors.push('Invalid total amount');
  }

  if (totalFee !== block.totalFee) {
    result.errors.push('Invalid total fee');
  }

  return result;
};

/**
 * Verify block for fork cause one
 *
 * @private
 * @method verifyBlock
 * @param  {Object}  block Target block
 * @param  {Object}  lastBlock Last block
 * @param  {Object}  result Verification results
 * @return {Object}  result Verification results
 * @return {boolean} result.verified Indicator that verification passed
 * @return {Array}   result.errors Array of validation errors
 */
__private.verifyForkOne = function (block, lastBlock, result) {
  if (block.previousBlock && block.previousBlock !== lastBlock.id) {
    modules.delegates.fork(block, 1);
    result.errors.push(['Invalid previous block:', block.previousBlock, 'expected:', lastBlock.id].join(' '));
  }

  return result;
};

/**
 * Verify block slot according to timestamp
 *
 * @private
 * @method verifyBlock
 * @param  {Object}  block Target block
 * @param  {Object}  lastBlock Last block
 * @param  {Object}  result Verification results
 * @return {Object}  result Verification results
 * @return {boolean} result.verified Indicator that verification passed
 * @return {Array}   result.errors Array of validation errors
 */
__private.verifyBlockSlot = function (block, lastBlock, result) {
  var blockSlotNumber = slots.getSlotNumber(block.timestamp);
  var lastBlockSlotNumber = slots.getSlotNumber(lastBlock.timestamp);

  if (blockSlotNumber > slots.getSlotNumber() || blockSlotNumber <= lastBlockSlotNumber) {
    result.errors.push('Invalid block timestamp');
  }

  return result;
};

/**
 * Verify block before fork detection and return all possible errors related to block
 *
 * @public
 * @method verifyReceipt
 * @param  {Object}  block Full block
 * @return {Object}  result Verification results
 * @return {boolean} result.verified Indicator that verification passed
 * @return {Array}   result.errors Array of validation errors
 */
Verify.prototype.verifyReceipt = function (block) {
  var lastBlock = modules.blocks.lastBlock.get();

  block = __private.setHeight(block, lastBlock);

  var result = { verified: false, errors: [] };

  result = __private.verifySignature(block, result);
  result = __private.verifyPreviousBlock(block, result);
  result = __private.verifyVersion(block, result);
  result = __private.verifyReward(block, result);
  result = __private.verifyId(block, result);
  result = __private.verifyPayload(block, result);

  result.verified = result.errors.length === 0;
  result.errors.reverse();

  return result;
};

/**
 * Verify block before processing and return all possible errors related to block
 *
 * @public
 * @method verifyBlock
 * @param  {Object}  block Full block
 * @return {Object}  result Verification results
 * @return {boolean} result.verified Indicator that verification passed
 * @return {Array}   result.errors Array of validation errors
 */
Verify.prototype.verifyBlock = function (block) {
  var lastBlock = modules.blocks.lastBlock.get();

  block = __private.setHeight(block, lastBlock);

  var result = { verified: false, errors: [] };

  result = __private.verifySignature(block, result);
  result = __private.verifyPreviousBlock(block, result);
  result = __private.verifyVersion(block, result);
  result = __private.verifyReward(block, result);
  result = __private.verifyId(block, result);
  result = __private.verifyPayload(block, result);

  result = __private.verifyForkOne(block, lastBlock, result);
  result = __private.verifyBlockSlot(block, lastBlock, result);

  result.verified = result.errors.length === 0;
  result.errors.reverse();

  return result;
};

/**
 * Main function to process a block
 * - Verify the block looks ok
 * - Verify the block is compatible with database state (DATABASE readonly)
 * - Apply the block to database if both verifications are ok
 *
 * @async
 * @public
 * @method processBlock
 * @param  {Object}   block Full block
 * @param  {boolean}  broadcast Indicator that block needs to be broadcasted
 * @param  {Function} cb Callback function
 * @param  {boolean}  saveBlock Indicator that block needs to be saved to database
 * @param  {boolean}  checked Indicator that block was previously checked
 * @return {Function} cb Callback function from params (through setImmediate)
 * @return {Object}   cb.err Error if occurred
 */
Verify.prototype.processBlock = function (block, broadcast, cb, saveBlock) {
  if (modules.blocks.isCleaning.get()) {
    // Break processing if node shutdown requested
    return setImmediate(cb, 'Cleaning up');
  } else if (!__private.loaded) {
    // Break processing if blockchain is not loaded
    return setImmediate(cb, 'Blockchain is loading');
  }

  async.series({
    normalizeBlock: function (seriesCb) {
      try {
        block = library.logic.block.objectNormalize(block);
      } catch (err) {
        return setImmediate(seriesCb, err);
      }

      return setImmediate(seriesCb);
    },
    verifyBlock: function (seriesCb) {
      // Sanity check of the block, if values are coherent
      // No access to database
      var check = self.verifyBlock(block);

      if (!check.verified) {
        library.logger.error(['Block', block.id, 'verification failed'].join(' '), check.errors.join(', '));
        return setImmediate(seriesCb, check.errors[0]);
      }

      return setImmediate(seriesCb);
    },
    checkExists: function (seriesCb) {
      // Check if block id is already in the database (very low probability of hash collision)
      // TODO: In case of hash-collision, to me it would be a special auto-fork...
      // DATABASE: read only
      library.db.query(sql.getBlockId, { id: block.id }).then(function (rows) {
        if (rows.length > 0) {
          return setImmediate(seriesCb, ['Block', block.id, 'already exists'].join(' '));
        } else {
          return setImmediate(seriesCb);
        }
      });
    },
    validateBlockSlot: function (seriesCb) {
      // Check if block was generated by the right active delegate. Otherwise, fork 3
      // DATABASE: Read only to mem_accounts to extract active delegate list
      modules.delegates.validateBlockSlot(block, function (err) {
        if (err) {
          // Fork: Delegate does not match calculated slot
          modules.delegates.fork(block, 3);
          return setImmediate(seriesCb, err);
        } else {
          return setImmediate(seriesCb);
        }
      });
    },
    checkTransactions: function (seriesCb) {
      // Check against the mem_* tables that we can perform the transactions included in the block
      async.eachSeries(block.transactions, function (transaction, eachSeriesCb) {
        __private.checkTransaction(block, transaction, eachSeriesCb);
      }, function (err) {
        return setImmediate(seriesCb, err);
      });
    }
  }, function (err) {
    if (err) {
      return setImmediate(cb, err);
    } else {
      // The block and the transactions are OK i.e:
      // * Block and transactions have valid values (signatures, block slots, etc...)
      // * The check against database state passed (for instance sender has enough ADM, votes are under 101, etc...)
      // We thus update the database with the transactions values, save the block and tick it
      modules.blocks.chain.applyBlock(block, broadcast, cb, saveBlock);
    }
  });
};

/**
 * Handle modules initialization
 * - accounts
 * - blocks
 * - delegates
 * - transactions
 * @param {modules} scope Exposed modules
 */
Verify.prototype.onBind = function (scope) {
  library.logger.trace('Blocks->Verify: Shared modules bind.');
  modules = {
    accounts: scope.accounts,
    blocks: scope.blocks,
    delegates: scope.delegates,
    transactions: scope.transactions
  };


  // Set module as loaded
  __private.loaded = true;
};

module.exports = Verify;
