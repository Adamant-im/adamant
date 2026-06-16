'use strict';

var _ = require('lodash');
var bignum = require('../helpers/bignum.js');
var ByteBuffer = require('bytebuffer');
var constants = require('../helpers/constants.js');
var crypto = require('crypto');
var exceptions = require('../helpers/exceptions.js');
var extend = require('extend');
var slots = require('../helpers/slots.js');
var sql = require('../sql/transactions.js');
var transactionTypes = require('../helpers/transactionTypes.js');
const Consensus = require('./consensus/consensus.js');
// Private fields
var self, modules, __private = {};

const SIGN_INT_32_MAX = 2147483647;
const SIGN_INT_32_MIN = -2147483648;

/**
 * @enum {number}
 * - 0: Transfer
 * - 1: Signature
 * - 2: Delegate
 * - 3: Vote
 * - 4: Multisignature
 * - 5: DApp
 * - 6: InTransfer
 * - 7: OutTransfer
 * - 8: ChatMessage
 * - 9: KVS
 *
 */
__private.types = {};

/**
 * Main transaction logic.
 * @param {Database} db
 * @param {object} ed
 * @param {ZSchema} schema
 * @param {object} genesisblock
 * @param {Account} account
 * @param {object} logger
 * @param {ClientWs} clientWs
 * @param {Consensus} consensus
 * @param {Function} cb - Callback function.
 * @memberof module:transactions
 * @constructor
 * @classdesc Main transaction logic.
 * @return {setImmediateCallback} With `this` as data.
 */
// Constructor
function Transaction (db, ed, schema, genesisblock, account, logger, clientWs, consensus, cb) {
  this.scope = {
    db: db,
    ed: ed,
    schema: schema,
    genesisblock: genesisblock,
    account: account,
    logger: logger,
    clientWs: clientWs,
    consensus: consensus
  };
  self = this;
  if (cb) {
    return setImmediate(cb, null, this);
  }
}

// Public methods
/**
 * Creates transaction:
 * - Analyzes data types
 * - calls `create` based on data type (see privateTypes)
 * - calls `calculateFee` based on data type (see privateTypes)
 * - creates signatures
 * @param {object} data
 * @see privateTypes
 * @implements {sign}
 * @implements {getId}
 * @return {transaction} trs
 */
Transaction.prototype.create = function (data) {
  if (!__private.types[data.type]) {
    throw 'Unknown transaction type ' + data.type;
  }

  if (!data.sender) {
    throw 'Invalid sender';
  }

  if (!data.keypair) {
    throw 'Invalid keypair';
  }

  const timestampMs = slots.getTimeMs();

  var trs = {
    type: data.type,
    amount: 0,
    senderPublicKey: data.sender.publicKey,
    requesterPublicKey: data.requester ? data.requester.publicKey.toString('hex') : null,
    timestamp: Math.floor(timestampMs / 1000),
    timestampMs,
    asset: {}
  };

  trs = __private.types[trs.type].create.call(this, data, trs);
  trs.signature = this.sign(data.keypair, trs);

  if (data.sender.secondSignature && data.secondKeypair) {
    trs.signSignature = this.sign(data.secondKeypair, trs);
  }

  trs.id = this.getId(trs);

  trs.fee = __private.types[trs.type].calculateFee.call(this, trs, data.sender) || false;

  return trs;
};

/**
 * Checks a transaction's timestamp against the future-timestamp grace period used
 * after `spaceship` activation (`maxTransactionFutureMs`).
 * This is wall-clock-relative admission control for transactions freshly entering the
 * network in real time, not a consensus rule - it must only be called at real-time
 * ingestion boundaries (Public API `publish()`, P2P `modules/transport.js`), never from
 * `verify()`, which also replays historical, long-confirmed transactions during sync
 * and must stay replay-deterministic. See AGENTS.md "Current Activation Switches".
 * @param {object} trs - The transaction object
 * @return {string|undefined} Error message if the timestamp is too far in the future
 */
Transaction.prototype.checkFutureTimestamp = function (trs) {
  const currentTimeMs = slots.getTimeMs();
  const currentTime = Math.floor(currentTimeMs / 1000);

  const currentSlotNumber = slots.getSlotNumber(currentTime);
  const transactionSlotNumber = slots.getSlotNumber(trs.timestamp);
  const transactionTimeMs = typeof trs.timestampMs === 'number' ? trs.timestampMs : trs.timestamp * 1000;
  const transactionFutureMs = transactionTimeMs - currentTimeMs;

  if (transactionSlotNumber > currentSlotNumber && transactionFutureMs > constants.maxTransactionFutureMs) {
    return 'Transaction timestamp is in the future';
  }
};

/**
 * Checks that a chat/state transaction's timestamp isn't more than `maxTransactionAgeSec`
 * in the past. Only meaningful for freshly submitted transactions - `verify()` also
 * replays historical, long-confirmed transactions (e.g. during sync), which legitimately
 * have timestamps far in the past, so this must only be called at real-time ingestion
 * boundaries (Public API `publish()`, P2P `modules/transport.js`), never from `verify()`.
 * @param {object} trs - The transaction object
 * @return {string|undefined} Error message if the timestamp is too far in the past
 */
Transaction.prototype.checkPastTimestampWindow = function (trs) {
  if (trs.type !== transactionTypes.CHAT_MESSAGE && trs.type !== transactionTypes.STATE) {
    return;
  }

  const currentTime = Math.floor(slots.getTimeMs() / 1000);
  const transactionSlotNumber = slots.getSlotNumber(trs.timestamp);
  const earliestValidTime = currentTime - constants.maxTransactionAgeSec;
  const earliestValidSlotNumber = slots.getSlotNumber(earliestValidTime);

  if (transactionSlotNumber < earliestValidSlotNumber) {
    return `Transaction timestamp is more than ${constants.maxTransactionAgeSec} seconds in the past`;
  }
};

/**
 * Modifies a transaction by adding the calculated fee and transaction ID,
 * and validates public-API admission timestamps.
 * Chat and state transactions must not be more than `maxTransactionAgeSec` in the past.
 * This should be called for freshly created transactions received from the Public API
 * @param {object} data - The transaction object
 * @throws {Error} If an invalid transaction is passed
 * @return {object} The modified transaction object
 */
Transaction.prototype.publish = function (data) {
  if (!__private.types[data.type]) {
    throw 'Unknown transaction type ' + data.type;
  }

  if (!data.senderId) {
    throw 'Invalid sender';
  }

  if (!data.signature) {
    throw 'Invalid signature';
  }

  const futureTimestampError = this.checkFutureTimestamp(data);

  if (futureTimestampError) {
    throw futureTimestampError;
  }

  const pastTimestampError = this.checkPastTimestampWindow(data);

  if (pastTimestampError) {
    throw pastTimestampError;
  }

  var trs = data;


  trs.id = this.getId(trs);

  trs.fee = __private.types[trs.type].calculateFee.call(this, trs, data.senderId) || false;

  return trs;
};
Transaction.prototype.normalize = function (data) {
  if (!__private.types[data.type]) {
    throw 'Unknown transaction type ' + data.type;
  }

  if (!data.sender) {
    throw 'Invalid sender';
  }

  var trs = {
    type: data.type,
    amount: 0,
    senderPublicKey: data.sender.publicKey,
    requesterPublicKey: data.requester ? data.requester.publicKey.toString('hex') : null,
    timestamp: slots.getTime(),
    asset: {}
  };

  trs = __private.types[trs.type].create.call(this, data, trs);

  return trs;
};
/**
 * Sets private type based on type id after instance object validation.
 * @param {number} typeId
 * @param {object} instance
 * @throws {string} Invalid instance interface if validations are wrong
 * @return {object} instance
 */
Transaction.prototype.attachAssetType = function (typeId, instance) {
  if (instance && typeof instance.create === 'function' && typeof instance.getBytes === 'function' &&
    typeof instance.calculateFee === 'function' && typeof instance.verify === 'function' &&
    typeof instance.objectNormalize === 'function' && typeof instance.dbRead === 'function' &&
    typeof instance.apply === 'function' && typeof instance.undo === 'function' &&
    typeof instance.applyUnconfirmed === 'function' && typeof instance.undoUnconfirmed === 'function' &&
    typeof instance.ready === 'function' && typeof instance.process === 'function'
  ) {
    __private.types[typeId] = instance;
    return instance;
  } else {
    throw 'Invalid instance interface';
  }
};

/**
 * Creates a signature
 * @param {object} keypair - Contains privateKey and publicKey
 * @param {transaction} trs
 * @implements {getHash}
 * @implements {scope.ed.sign}
 * @return {signature} sign
 */
Transaction.prototype.sign = function (keypair, trs) {
  var hash = this.getHash(trs);
  return this.scope.ed.sign(hash, keypair).toString('hex');
};

/**
 * Creates a signature based on multiple signatures
 * @param {object} keypair - Contains privateKey and publicKey
 * @param {transaction} trs
 * @implements {getBytes}
 * @implements {crypto.createHash}
 * @implements {scope.ed.sign}
 * @return {signature} sign
 */
Transaction.prototype.multisign = function (keypair, trs) {
  var bytes = this.getBytes(trs, true, true);
  // TODO: check put here if we need to use createPassPhraseHash instead (probably not)
  var hash = crypto.createHash('sha256').update(bytes).digest();
  return this.scope.ed.sign(hash, keypair).toString('hex');
};

/**
 * Calculates transaction id based on transaction
 * @param {transaction} trs
 *
 * @implements {bignum}
 * @implements {getHash}
 * @return {string} id
 */
Transaction.prototype.getId = function (trs) {
  var hash = this.getHash(trs);
  var temp = Buffer.alloc(8);
  for (var i = 0; i < 8; i++) {
    temp[i] = hash[7 - i];
  }

  var id = bignum.fromBuffer(temp).toString();
  return id;
};

/**
 * Creates hash based on transaction bytes.
 * @param {transaction} trs
 *
 * @implements {getBytes}
 * @implements {crypto.createHash}
 * @return {hash} sha256 crypto hash
 */
Transaction.prototype.getHash = function (trs) {
  return crypto.createHash('sha256').update(this.getBytes(trs)).digest();
};

/**
 * Calls `getBytes` based on trs type (see privateTypes)
 * @param {transaction} trs
 * @param {boolean} skipSignature
 * @param {boolean} skipSecondSignature
 * @throws {error} If buffer fails.
 * @see privateTypes
 *
 * @implements {ByteBuffer}
 * @return {!Array} Contents as an ArrayBuffer.
 */
Transaction.prototype.getBytes = function (trs, skipSignature, skipSecondSignature) {
  if (!__private.types[trs.type]) {
    throw 'Unknown transaction type ' + trs.type;
  }

  var bb;

  try {
    var assetBytes = __private.types[trs.type].getBytes.call(this, trs, skipSignature, skipSecondSignature);
    var assetSize = assetBytes ? assetBytes.length : 0;
    var i;

    bb = new ByteBuffer(1 + 4 + 32 + 32 + 8 + 8 + 64 + 64 + assetSize, true);
    bb.writeByte(trs.type);
    bb.writeInt(trs.timestamp);

    var senderPublicKeyBuffer = Buffer.from(trs.senderPublicKey, 'hex');
    for (i = 0; i < senderPublicKeyBuffer.length; i++) {
      bb.writeByte(senderPublicKeyBuffer[i]);
    }

    if (trs.requesterPublicKey) {
      var requesterPublicKey = Buffer.from(trs.requesterPublicKey, 'hex');
      for (i = 0; i < requesterPublicKey.length; i++) {
        bb.writeByte(requesterPublicKey[i]);
      }
    }

    if (trs.recipientId) {
      var recipient = trs.recipientId.slice(1);
      recipient = new bignum(recipient).toBuffer({
        size: 8
      });

      for (i = 0; i < 8; i++) {
        bb.writeByte(recipient[i] || 0);
      }
    } else {
      for (i = 0; i < 8; i++) {
        bb.writeByte(0);
      }
    }

    bb.writeLong(trs.amount);

    if (assetSize > 0) {
      for (i = 0; i < assetSize; i++) {
        bb.writeByte(assetBytes[i]);
      }
    }

    if (!skipSignature && trs.signature) {
      var signatureBuffer = Buffer.from(trs.signature, 'hex');
      for (i = 0; i < signatureBuffer.length; i++) {
        bb.writeByte(signatureBuffer[i]);
      }
    }

    if (!skipSecondSignature && trs.signSignature) {
      var signSignatureBuffer = Buffer.from(trs.signSignature, 'hex');
      for (i = 0; i < signSignatureBuffer.length; i++) {
        bb.writeByte(signSignatureBuffer[i]);
      }
    }

    bb.flip();
  } catch (e) {
    throw e;
  }

  return bb.toBuffer();
};

/**
 * Calls `ready` based on trs type (see privateTypes)
 * @param {transaction} trs
 * @param {account} sender
 * @see privateTypes
 *
 * @return {function|boolean} calls `ready` | false
 */
Transaction.prototype.ready = function (trs, sender) {
  if (!__private.types[trs.type]) {
    throw 'Unknown transaction type ' + trs.type;
  }

  if (!sender) {
    return false;
  }

  return __private.types[trs.type].ready.call(this, trs, sender);
};

/**
 * Counts transactions from `trs` table by id
 * @param {transaction} trs
 * @param {Function} cb
 *
 * @return {setImmediateCallback} error | row.count
 */
Transaction.prototype.countById = function (trs, cb) {
  this.scope.db.one(sql.countById, {
    id: trs.id
  }).then(function (row) {
    return setImmediate(cb, null, row.count);
  }).catch((err) => {
    this.scope.logger.error(
        'transactions',
        `An error occurred while fetching transactions count by ID: ${err?.message || err}`,
        err.stack
    );
    return setImmediate(cb, 'Transaction#countById error');
  });
};

/**
 * @param {transaction} trs
 * @param {Function} cb
 * @implements {countById}
 * @return {setImmediateCallback} error | cb
 */
Transaction.prototype.checkConfirmed = function (trs, cb) {
  this.countById(trs, function (err, count) {
    if (err) {
      return setImmediate(cb, err);
    } else if (count > 0) {
      return setImmediate(cb, 'Transaction is already confirmed: ' + trs.id);
    } else {
      return setImmediate(cb);
    }
  });
};

/**
 * Checks if balance is less than amount for sender.
 * @param {number} amount
 * @param {number} balance
 * @param {transaction} trs
 * @param {account} sender
 *
 * @implements {bignum}
 * @return {object} With exceeded boolean and error: address, balance
 */
Transaction.prototype.checkBalance = function (amount, balance, trs, sender) {
  var exceededBalance = new bignum(sender[balance].toString()).isLessThan(amount);
  var exceeded = (trs.blockId !== this.scope.genesisblock.block.id && exceededBalance);

  return {
    exceeded: exceeded,
    error: exceeded ? [
      'Account does not have enough ADM:', sender.address,
      'balance:', new bignum(sender[balance].toString() || '0').div(Math.pow(10, 8))
    ].join(' ') : null
  };
};

/**
 * Validates parameters.
 * Calls `process` based on trs type (see privateTypes)
 * @param {transaction} trs
 * @param {account} sender
 * @param {account} requester
 * @param {Function} cb
 * @see privateTypes
 * @implements {getId}
 * @return {setImmediateCallback} validation errors | trs
 */
Transaction.prototype.process = function (trs, sender, requester, cb) {
  if (typeof requester === 'function') {
    cb = requester;
  }

  // Check transaction type
  if (!__private.types[trs.type]) {
    return setImmediate(cb, 'Unknown transaction type ' + trs.type);
  }

  // if (!this.ready(trs, sender)) {
  //   return setImmediate(cb, 'Transaction is not ready: ' + trs.id);
  // }

  // Check sender
  if (!sender) {
    return setImmediate(cb, 'Missing sender');
  }

  // Get transaction id
  var txId;

  try {
    txId = this.getId(trs);
  } catch (e) {
    this.scope.logger.error(
        'transactions',
        `Failed to get transaction ID: ${e?.message || e}`,
        { trs, stack: e.stack }
    );
    return setImmediate(cb, 'Failed to get transaction id');
  }

  // Check transaction id
  if (trs.id && trs.id !== txId) {
    return setImmediate(cb, 'Invalid transaction id');
  } else {
    trs.id = txId;
  }

  // Equalize sender address
  trs.senderId = sender.address;

  // Call process on transaction type
  __private.types[trs.type].process.call(this, trs, sender, function (err, trs) {
    if (err) {
      return setImmediate(cb, err);
    } else {
      return setImmediate(cb, null, trs);
    }
  });
};

/**
 * Validates parameters.
 * Calls `process` based on trs type (see privateTypes)
 * @param {transaction} trs
 * @param {account} sender
 * @param {account} requester
 * @param {Function} cb
 * @see privateTypes
 * @implements {getId}
 * @return {setImmediateCallback} validation errors | trs
 */
Transaction.prototype.verify = function (trs, sender, requester, cb) {
  var valid = false;
  var err = null;

  if (typeof requester === 'function') {
    cb = requester;
  }

  // Check sender
  if (!sender) {
    return setImmediate(cb, 'Missing sender');
  }

  // Check transaction type
  if (!__private.types[trs.type]) {
    return setImmediate(cb, 'Unknown transaction type ' + trs.type);
  }

  // Check for missing sender second signature
  if (!trs.requesterPublicKey && sender.secondSignature && !trs.signSignature && trs.blockId !== this.scope.genesisblock.block.id) {
    return setImmediate(cb, 'Missing sender second signature');
  }

  // If second signature provided, check if sender has one enabled
  if (!trs.requesterPublicKey && !sender.secondSignature && (trs.signSignature && trs.signSignature.length > 0)) {
    return setImmediate(cb, 'Sender does not have a second signature');
  }

  // Check for missing requester second signature
  if (trs.requesterPublicKey && requester.secondSignature && !trs.signSignature) {
    return setImmediate(cb, 'Missing requester second signature');
  }

  // If second signature provided, check if requester has one enabled
  if (trs.requesterPublicKey && !requester.secondSignature && (trs.signSignature && trs.signSignature.length > 0)) {
    return setImmediate(cb, 'Requester does not have a second signature');
  }

  // Check sender public key
  if (sender.publicKey && sender.publicKey !== trs.senderPublicKey) {
    err = ['Invalid sender public key:', trs.senderPublicKey, 'expected:', sender.publicKey].join(' ');

    if (exceptions.senderPublicKey.indexOf(trs.id) > -1) {
      this.scope.logger.debug('transactions', err, trs);
    } else {
      return setImmediate(cb, err);
    }
  }

  // Check sender is not genesis account unless block id equals genesis
  if ([exceptions.genesisPublicKey.mainnet, exceptions.genesisPublicKey.testnet].indexOf(sender.publicKey) !== -1 && trs.blockId !== this.scope.genesisblock.block.id) {
    return setImmediate(cb, 'Invalid sender. Can not send from genesis account');
  }

  // Check sender address
  if (String(trs.senderId).toUpperCase() !== String(sender.address).toUpperCase()) {
    return setImmediate(cb, 'Invalid sender address');
  }

  // Determine multisignatures from sender or transaction asset
  var multisignatures = sender.multisignatures || sender.u_multisignatures || [];
  if (multisignatures.length === 0) {
    if (trs.asset && trs.asset.multisignature && trs.asset.multisignature.keysgroup) {
      for (var i = 0; i < trs.asset.multisignature.keysgroup.length; i++) {
        var key = trs.asset.multisignature.keysgroup[i];

        if (!key || typeof key !== 'string') {
          return setImmediate(cb, 'Invalid member in keysgroup');
        }

        multisignatures.push(key.slice(1));
      }
    }
  }

  // // Check requester public key
  if (trs.requesterPublicKey) {
    multisignatures.push(trs.senderPublicKey);

    if (sender.multisignatures.indexOf(trs.requesterPublicKey) < 0) {
      return setImmediate(cb, 'Account does not belong to multisignature group');
    }
  }

  // Verify signature
  try {
    valid = false;
    valid = this.verifySignature(trs, (trs.requesterPublicKey || trs.senderPublicKey), trs.signature);
  } catch (e) {
    this.scope.logger.error(
        'transactions',
        'An error occurred while trying to verify signature for a transaction.',
        { trs, stack: e.stack }
    );
    return setImmediate(cb, e.toString());
  }

  if (!valid) {
    err = 'Failed to verify signature';

    if (exceptions.signatures.indexOf(trs.id) > -1) {
      this.scope.logger.debug('transactions', err, trs);
      valid = true;
      err = null;
    } else {
      return setImmediate(cb, err);
    }
  }

  // Verify second signature
  if (requester.secondSignature || sender.secondSignature) {
    try {
      valid = false;
      valid = this.verifySecondSignature(trs, (requester.secondPublicKey || sender.secondPublicKey), trs.signSignature);
    } catch (e) {
      return setImmediate(cb, e.toString());
    }

    if (!valid) {
      return setImmediate(cb, 'Failed to verify second signature');
    }
  }

  // Check that signatures are unique
  if (trs.signatures && trs.signatures.length) {
    var signatures = trs.signatures.reduce(function (p, c) {
      if (p.indexOf(c) < 0) {
        p.push(c);
      }
      return p;
    }, []);

    if (signatures.length !== trs.signatures.length) {
      return setImmediate(cb, 'Encountered duplicate signature in transaction');
    }
  }

  // Verify multisignatures
  if (trs.signatures) {
    for (var d = 0; d < trs.signatures.length; d++) {
      valid = false;

      for (var s = 0; s < multisignatures.length; s++) {
        if (trs.requesterPublicKey && multisignatures[s] === trs.requesterPublicKey) {
          continue;
        }

        if (this.verifySignature(trs, multisignatures[s], trs.signatures[d])) {
          valid = true;
        }
      }

      if (!valid) {
        return setImmediate(cb, 'Failed to verify multisignature');
      }
    }
  }

  // Calculate fee
  var fee = __private.types[trs.type].calculateFee.call(this, trs, sender) || false;
  if (!fee || trs.fee !== fee) {
    if (exceptions.fee.indexOf(trs.id) > -1) {
      this.scope.logger.debug('transactions', 'Invalid transaction fee', trs);
    } else {
      return setImmediate(cb, 'Invalid transaction fee');
    }
  }

  // Check amount
  if (trs.amount < 0 || trs.amount > constants.totalAmount || String(trs.amount).indexOf('.') >= 0 || trs.amount.toString().indexOf('e') >= 0) {
    return setImmediate(cb, 'Invalid transaction amount');
  }

  // Check confirmed sender balance
  var amount = new bignum(trs.amount.toString()).plus(trs.fee.toString());
  var senderBalance = this.checkBalance(amount, 'balance', trs, sender);

  if (senderBalance.exceeded) {
    return setImmediate(cb, senderBalance.error);
  }

  // Check timestamp
  const { timestamp, timestampMs } = trs;

  if (timestamp > SIGN_INT_32_MAX || timestamp < SIGN_INT_32_MIN) {
    return setImmediate(cb, 'Invalid transaction timestamp. Timestamp is not within the signed int32 range');
  }

  if (typeof timestampMs === 'number') {
    const timestampMsDelta = timestampMs - timestamp * 1000;

    const { maxTimestampMsDelta } = constants;
    if (timestampMsDelta < 0 || timestampMsDelta >= maxTimestampMsDelta) {
      return setImmediate(cb, `Invalid transaction timestamp. timestampMs must be within the same second as timestamp, from 0 to ${maxTimestampMsDelta - 1}ms`);
    }
  }

  // Call verify on transaction type
  __private.types[trs.type].verify.call(this, trs, sender, function (err) {
    if (err) {
      return setImmediate(cb, err);
    } else {
      // Check for already confirmed transaction
      return self.checkConfirmed(trs, cb);
    }
  });
};

/**
 * Verifies signature for valid transaction type
 * @param {transaction} trs
 * @param {publicKey} publicKey
 * @param {signature} signature
 * @throws {error}
 *
 * @implements {getBytes}
 * @implements {verifyBytes}
 * @return {boolean}
 */
Transaction.prototype.verifySignature = function (trs, publicKey, signature) {
  if (!__private.types[trs.type]) {
    throw 'Unknown transaction type ' + trs.type;
  }

  if (!signature) {
    return false;
  }

  var res;

  try {
    var bytes = this.getBytes(trs, true, true);
    res = this.verifyBytes(bytes, publicKey, signature);
  } catch (e) {
    throw e;
  }

  return res;
};

/**
 * Verifies second signature for valid transaction type
 * @param {transaction} trs
 * @param {publicKey} publicKey
 * @param {signature} signature
 * @throws {error}
 *
 * @implements {getBytes}
 * @implements {verifyBytes}
 * @return {boolean}
 */
Transaction.prototype.verifySecondSignature = function (trs, publicKey, signature) {
  if (!__private.types[trs.type]) {
    throw 'Unknown transaction type ' + trs.type;
  }

  if (!signature) {
    return false;
  }

  var res;

  try {
    var bytes = this.getBytes(trs, false, true);
    res = this.verifyBytes(bytes, publicKey, signature);
  } catch (e) {
    throw e;
  }

  return res;
};

/**
 * Verifies hash, publicKey and signature.
 * @param {Array} bytes
 * @param {publicKey} publicKey
 * @param {signature} signature
 * @throws {error}
 *
 * @implements {crypto.createHash}
 * @implements {scope.ed.verify}
 * @return {boolean} verified hash, signature and publicKey
 */
Transaction.prototype.verifyBytes = function (bytes, publicKey, signature) {
  var res;

  try {
    var data2 = Buffer.alloc(bytes.length);

    for (var i = 0; i < data2.length; i++) {
      data2[i] = bytes[i];
    }

    var hash = crypto.createHash('sha256').update(data2).digest();
    var signatureBuffer = Buffer.from(signature, 'hex');
    var publicKeyBuffer = Buffer.from(publicKey, 'hex');

    res = this.scope.ed.verify(hash, signatureBuffer || ' ', publicKeyBuffer || ' ');
  } catch (e) {
    throw e;
  }

  return res;
};

/**
 * Merges account into sender address, Calls `apply` based on trs type (privateTypes).
 * @param {transaction} trs
 * @param {block} block
 * @param {account} sender
 * @param {Function} cb - Callback function
 * @see privateTypes
 * @implements {checkBalance}
 * @implements {account.merge}
 * @implements {modules.rounds.calc}
 * @return {setImmediateCallback} for errors | cb
 */
Transaction.prototype.apply = function (trs, block, sender, cb) {
  if (!this.ready(trs, sender)) {
    return setImmediate(cb, 'Transaction is not ready');
  }

  // Check confirmed sender balance
  var amount = new bignum(trs.amount.toString()).plus(trs.fee.toString());
  var senderBalance = this.checkBalance(amount, 'balance', trs, sender);

  if (senderBalance.exceeded) {
    return setImmediate(cb, senderBalance.error);
  }

  amount = amount.toNumber();

  const diff = {
    balance: -amount,
    blockId: block.id,
    round: modules.rounds.calc(block.height)
  };

  this.scope.logger.trace('transactions', 'Logic/Transaction->apply', diff);

  this.scope.account.merge(sender.address, diff, function (err, sender) {
    if (err) {
      return setImmediate(cb, err);
    }
    /**
     * calls apply for Transfer, Signature, Delegate, Vote, Multisignature,
     * DApp, InTransfer or OutTransfer.
     * @param {*} err
     */
    __private.types[trs.type].apply.call(this, trs, block, sender, function (err) {
      if (err) {
        this.scope.account.merge(sender.address, {
          balance: amount,
          blockId: block.id,
          round: modules.rounds.calc(block.height)
        }, function (err) {
          return setImmediate(cb, err);
        });
      } else {
        return setImmediate(cb);
      }
    }.bind(this));
  }.bind(this));
};

/**
 * Merges account into sender address, Calls `undo` based on trs type (privateTypes).
 * @param {transaction} trs
 * @param {block} block
 * @param {account} sender
 * @param {Function} cb - Callback function
 * @see privateTypes
 * @implements {bignum}
 * @implements {account.merge}
 * @implements {modules.rounds.calc}
 * @return {setImmediateCallback} for errors | cb
 */
Transaction.prototype.undo = function (trs, block, sender, cb) {
  var amount = new bignum(trs.amount.toString());
  amount = amount.plus(trs.fee.toString()).toNumber();

  const diff = {
    balance: amount,
    blockId: block.id,
    round: modules.rounds.calc(block.height)
  };

  this.scope.logger.trace('transactions', 'Logic/Transaction->undo', diff);

  this.scope.account.merge(sender.address, diff, function (err, sender) {
    if (err) {
      return setImmediate(cb, err);
    }

    __private.types[trs.type].undo.call(this, trs, block, sender, function (err) {
      if (err) {
        this.scope.account.merge(sender.address, {
          balance: -amount,
          blockId: block.id,
          round: modules.rounds.calc(block.height)
        }, function (err) {
          return setImmediate(cb, err);
        });
      } else {
        return setImmediate(cb);
      }
    }.bind(this));
  }.bind(this));
};

/**
 * Checks unconfirmed sender balance. Merges account into sender address with
 * unconfirmed balance negative amount.
 * Calls `applyUnconfirmed` based on trs type (privateTypes). If error merge
 * account with amount.
 * @param {transaction} trs
 * @param {account} sender
 * @param {account} requester
 * @param {Function} cb - Callback function
 * @see privateTypes
 * @implements {bignum}
 * @implements {checkBalance}
 * @implements {account.merge}
 * @return {setImmediateCallback} for errors | cb
 */
Transaction.prototype.applyUnconfirmed = function (trs, sender, requester, cb) {
  if (typeof requester === 'function') {
    cb = requester;
  }

  // Check unconfirmed sender balance
  var amount = new bignum(trs.amount.toString()).plus(trs.fee.toString());
  var senderBalance = this.checkBalance(amount, 'u_balance', trs, sender);

  if (senderBalance.exceeded) {
    return setImmediate(cb, senderBalance.error);
  }

  amount = amount.toNumber();

  if (this.scope.clientWs) {
    var new_trs = Object.assign({}, trs);
    new_trs.block_timestamp = null;
    if (!new_trs.recipientPublicKey && new_trs.recipientId) {
      this.scope.db.query(`SELECT ENCODE ("publicKey", \'hex\') AS "publicKey" from mem_accounts WHERE address='${new_trs.recipientId}' limit 1`).then((rows) => {
        if (rows[0]) {
          new_trs.recipientPublicKey = rows[0]['publicKey'];
        }
        this.scope.clientWs.emit(new_trs);
      }).catch((err) => {
        this.scope.logger.error(
            'ws-client-server',
            'An error occurred while trying to retrieve publicKey for a recipient',
            { new_trs, stack: err.stack }
        );
      });
    } else {
      this.scope.clientWs.emit(new_trs);
    }
  }
  this.scope.account.merge(sender.address, {
    u_balance: -amount
  }, function (err, sender) {
    if (err) {
      return setImmediate(cb, err);
    }

    __private.types[trs.type].applyUnconfirmed.call(this, trs, sender, function (err) {
      if (err) {
        this.scope.account.merge(sender.address, {
          u_balance: amount
        }, function (err2) {
          return setImmediate(cb, err2 || err);
        });
      } else {
        return setImmediate(cb);
      }
    }.bind(this));
  }.bind(this));
};

/**
 * Merges account into sender address with unconfirmed balance trs amount.
 * Calls `undoUnconfirmed` based on trs type (privateTypes). If error merge
 * account with negative amount.
 * @param {transaction} trs
 * @param {account} sender
 * @param {Function} cb - Callback function
 * @see privateTypes
 * @implements {bignum}
 * @implements {account.merge}
 * @return {setImmediateCallback} for errors | cb
 */
Transaction.prototype.undoUnconfirmed = function (trs, sender, cb) {
  var amount = new bignum(trs.amount.toString());
  amount = amount.plus(trs.fee.toString()).toNumber();

  this.scope.account.merge(sender.address, {
    u_balance: amount
  }, function (err, sender) {
    if (err) {
      return setImmediate(cb, err);
    }

    __private.types[trs.type].undoUnconfirmed.call(this, trs, sender, function (err) {
      if (err) {
        this.scope.account.merge(sender.address, {
          u_balance: -amount
        }, function (err2) {
          return setImmediate(cb, err2 || err);
        });
      } else {
        return setImmediate(cb);
      }
    }.bind(this));
  }.bind(this));
};

Transaction.prototype.dbTable = 'trs';

Transaction.prototype.dbFields = [
  'id',
  'blockId',
  'type',
  'timestamp',
  'timestampMs',
  'height',
  'blockTimestamp',
  'senderPublicKey',
  'requesterPublicKey',
  'senderId',
  'recipientId',
  'amount',
  'fee',
  'signature',
  'signSignature',
  'signatures'
];

/**
 * Creates db trs object transaction. Calls `dbSave` based on trs type (privateTypes).
 * @param {transaction} trs
 * @throws {string | error} error string | catch error
 * @see privateTypes
 * @return {object[]} dbSave result + created object
 */
Transaction.prototype.dbSave = function (trs) {
  if (!__private.types[trs.type]) {
    throw 'Unknown transaction type ' + trs.type;
  }

  var senderPublicKey, signature, signSignature, requesterPublicKey;

  try {
    senderPublicKey = Buffer.from(trs.senderPublicKey, 'hex');
    signature = Buffer.from(trs.signature, 'hex');
    signSignature = trs.signSignature ? Buffer.from(trs.signSignature, 'hex') : null;
    requesterPublicKey = trs.requesterPublicKey ? Buffer.from(trs.requesterPublicKey, 'hex') : null;
  } catch (e) {
    throw e;
  }

  var promises = [{
    table: this.dbTable,
    fields: this.dbFields,
    values: {
      id: trs.id,
      blockId: trs.blockId,
      height: trs.height,
      blockTimestamp: trs.block_timestamp,
      type: trs.type,
      timestamp: trs.timestamp,
      timestampMs: trs.timestampMs,
      senderPublicKey: senderPublicKey,
      requesterPublicKey: requesterPublicKey,
      senderId: trs.senderId,
      recipientId: trs.recipientId || null,
      amount: trs.amount,
      fee: trs.fee,
      signature: signature,
      signSignature: signSignature,
      signatures: trs.signatures ? trs.signatures.join(',') : null
    }
  }];

  var promise = __private.types[trs.type].dbSave(trs);

  if (promise) {
    promises.push(promise);
  }

  return promises;
};

/**
 * Calls `afterSave` based on trs type (privateTypes).
 * @param {transaction} trs
 * @param {Function} cb
 * @see privateTypes
 * @return {setImmediateCallback} error string | cb
 */
Transaction.prototype.afterSave = function (trs, cb) {
  var tx_type = __private.types[trs.type];

  if (!tx_type) {
    return setImmediate(cb, 'Unknown transaction type ' + trs.type);
  } else {
    if (typeof tx_type.afterSave === 'function') {
      return tx_type.afterSave.call(this, trs, cb);
    } else {
      return setImmediate(cb);
    }
  }
};

/**
 * @typedef {object} transaction
 *
 * @property {string} id
 * @property {number} height
 * @property {string} blockId
 * @property {number} type
 * @property {number} timestamp
 * @property {number} timestampMs
 * @property {publicKey} senderPublicKey
 * @property {publicKey} requesterPublicKey
 * @property {string} senderId
 * @property {string} recipientId
 * @property {number} amount
 * @property {number} fee
 * @property {string} signature
 * @property {string} signSignature
 * @property {object} asset
 * @property {multisignature} [asset.multisignature]
 * @property {signature} [asset.signature]
 * @property {dapp} [asset.dapp]
 * @property {object} [asset.outTransfer] - Contains dappId and transactionId
 * @property {object} [asset.inTransfer] - Contains dappId
 * @property {votes} [asset.votes] - Contains multiple votes to a transactionId
 *
 */
Transaction.prototype.schema = {
  id: 'Transaction',
  type: 'object',
  properties: {
    id: {
      type: 'string',
      format: 'id',
      minLength: 1,
      maxLength: 20
    },
    height: {
      type: 'integer'
    },
    blockId: {
      type: 'string',
      format: 'id',
      minLength: 1,
      maxLength: 20
    },
    type: {
      type: 'integer'
    },
    timestamp: {
      type: 'integer'
    },
    timestampMs: {
      type: ['integer', 'null']
    },
    senderPublicKey: {
      type: 'string',
      format: 'publicKey'
    },
    requesterPublicKey: {
      type: 'string',
      format: 'publicKey'
    },
    senderId: {
      type: 'string',
      format: 'address',
      minLength: 1,
      maxLength: 22
    },
    recipientId: {
      type: 'string',
      format: 'address',
      minLength: 1,
      maxLength: 22
    },
    amount: {
      type: 'integer',
      minimum: 0,
      maximum: constants.totalAmount
    },
    fee: {
      type: 'integer',
      minimum: 0,
      maximum: constants.totalAmount
    },
    signature: {
      type: 'string',
      format: 'signature'
    },
    signSignature: {
      type: 'string',
      format: 'signature'
    },
    asset: {
      type: 'object'
    }
  },
  required: ['type', 'timestamp', 'senderPublicKey', 'signature']
};

/**
 * Calls `objectNormalize` based on trs type (privateTypes).
 * @param {transaction} trs
 * @throws {string} error message
 * @see privateTypes
 *
 * @implements {scope.schema.validate}
 * @return {error|transaction} error string | trs normalized
 */
Transaction.prototype.objectNormalize = function (trs, height) {
  if (!__private.types[trs.type]) {
    throw 'Unknown transaction type ' + trs.type;
  }

  for (var i in trs) {
    if (trs[i] === null || typeof trs[i] === 'undefined') {
      delete trs[i];
    }
  }

  if (!this.scope.consensus.isActivated('spaceship', height)) {
    delete trs.timestampMs;
  }

  var report = this.scope.schema.validate(trs, Transaction.prototype.schema);

  if (!report) {
    throw 'Failed to validate transaction schema: ' + this.scope.schema.getLastErrors().map(function (err) {
      return err.message;
    }).join(', ');
  }

  try {
    trs = __private.types[trs.type].objectNormalize.call(this, trs);
  } catch (e) {
    throw e;
  }

  return trs;
};

/**
 * Calls `dbRead` based on trs type (privateTypes) to add trs asset.
 * @param {object} raw
 * @throws {string} Unknown transaction type
 * @see privateTypes
 * @return {null|tx}
 */
Transaction.prototype.dbRead = function (raw) {
  if (!raw.t_id) {
    return null;
  } else {
    var tx = {
      id: raw.t_id,
      height: raw.b_height,
      blockId: raw.b_id || raw.t_blockId,
      type: parseInt(raw.t_type),
      block_timestamp: parseInt(raw.block_timestamp),
      timestamp: parseInt(raw.t_timestamp),
      timestampMs: raw.t_timestampMs != null ? parseInt(raw.t_timestampMs) : null,
      senderPublicKey: raw.t_senderPublicKey,
      requesterPublicKey: raw.t_requesterPublicKey,
      senderId: raw.t_senderId,
      recipientId: raw.t_recipientId,
      recipientPublicKey: raw.m_recipientPublicKey || null,
      amount: parseInt(raw.t_amount),
      fee: parseInt(raw.t_fee),
      signature: raw.t_signature,
      signSignature: raw.t_signSignature,
      signatures: raw.t_signatures ? raw.t_signatures.split(',') : [],
      confirmations: parseInt(raw.confirmations),
      asset: {}
    };
    if (!tx.block_timestamp && raw.b_timestamp) {
      tx.block_timestamp = parseInt(raw.b_timestamp);
    }
    if (!__private.types[tx.type]) {
      throw 'Unknown transaction type ' + tx.type;
    }

    var asset = __private.types[tx.type].dbRead.call(this, raw);

    if (asset) {
      tx.asset = extend(tx.asset, asset);
    }

    return tx;
  }
};

// Events
/**
 * Binds input parameters to private variables modules.
 * @param {object} __modules
 */
Transaction.prototype.bindModules = function (__modules) {
  this.scope.logger.trace('transactions', 'Logic/Transaction->bindModules');
  modules = {
    rounds: __modules.rounds
  };
};

// Export
module.exports = Transaction;
