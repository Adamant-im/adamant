'use strict';

var ByteBuffer = require('bytebuffer');
var constants = require('../helpers/constants.js');

// Private fields
var modules, library;

/**
 * Initializes library.
 * @param {ZSchema} schema
 * @param {object} logger
 * @memberof module:signatures
 * @class
 * @classdesc Main signature logic.
 */
// Constructor
function Signature (schema, logger) {
  library = {
    schema: schema,
    logger: logger
  };
}

/**
 * Binds input parameters to private variable modules
 * @param {Accounts} accounts
 */
Signature.prototype.bind = function (accounts) {
  modules = {
    accounts: accounts
  };
};

/**
 * Creates a signature and sets related data.
 * @param {object} data - Uses secondKeypair publicKey.
 * @param {transaction} trs - Transaction to add signature data to asset.
 *
 * @return {transaction} trs with new data
 */
Signature.prototype.create = function (data, trs) {
  trs.recipientId = null;
  trs.amount = 0;
  trs.asset.signature = {
    publicKey: data.secondKeypair.publicKey.toString('hex')
  };

  return trs;
};

/**
 * Obtains constant fee secondsignature.
 * @param {transaction} trs - Unnecessary parameter.
 * @param {account} sender - Unnecessary parameter.
 * @see {@link module:helpers~constants}
 *
 * @return {number} Secondsignature fee.
 */
Signature.prototype.calculateFee = function (trs, sender) {
  return constants.fees.secondsignature;
};

/**
 * Verifies signature fields from transaction asset and sender.
 * @param {transaction} trs
 * @param {account} sender
 * @param {Function} cb - Callback function.
 * @implements module:transactions#Transaction~verifySignature
 * @returns {setImmediateCallback|transaction} returns error string if invalid parameter |
 * trs validated.
 */
Signature.prototype.verify = function (trs, sender, cb) {
  if (!trs.asset || !trs.asset.signature) {
    return setImmediate(cb, 'Invalid transaction asset');
  }

  if (trs.amount !== 0) {
    return setImmediate(cb, 'Invalid transaction amount');
  }

  try {
    if (!trs.asset.signature.publicKey || Buffer.from(trs.asset.signature.publicKey, 'hex').length !== 32) {
      return setImmediate(cb, 'Invalid public key');
    }
  } catch (e) {
    library.logger.error('signatures', e.stack);
    return setImmediate(cb, 'Invalid public key');
  }

  return setImmediate(cb, null, trs);
};

/**
 * Returns transaction with setImmediate.
 * @param {transaction} trs
 * @param {account} sender
 * @param {Function} cb - Callback function.
 * @todo check extra parameter sender.
 *
 * @returns {setImmediateCallback} Null error
 */
Signature.prototype.process = function (trs, sender, cb) {
  return setImmediate(cb, null, trs);
};

/**
 * Returns a buffer with bytes from transaction asset information.
 * @param {transaction} trs - Uses multisignature from asset.
 * @throws {error} If buffer fails.
 * @see {@link https://github.com/dcodeIO/bytebuffer.js/wiki/API}
 * @todo check if this function is called.
 *
 * @requires bytebuffer
 * @return {!Array} Contents as an ArrayBuffer.
 */
Signature.prototype.getBytes = function (trs) {
  var bb;

  try {
    bb = new ByteBuffer(32, true);
    var publicKeyBuffer = Buffer.from(trs.asset.signature.publicKey, 'hex');

    for (var i = 0; i < publicKeyBuffer.length; i++) {
      bb.writeByte(publicKeyBuffer[i]);
    }

    bb.flip();
  } catch (e) {
    throw e;
  }
  return bb.toBuffer();
};

/**
 * Sets account second signature from transaction asset.
 * @param {transaction} trs - Uses publicKey from asset signature.
 * @param {block} block - Unnecessary parameter.
 * @param {account} sender - Uses the address
 * @param {Function} cb - Callback function.
 * @implements module:accounts#Accounts~setAccountAndGet
 * @return {setImmediateCallback} for errors
 */
Signature.prototype.apply = function (trs, block, sender, cb) {
  modules.accounts.setAccountAndGet({
    address: sender.address,
    secondSignature: 1,
    u_secondSignature: 0,
    secondPublicKey: trs.asset.signature.publicKey
  }, cb);
};

/**
 * Sets account second signature to null.
 * @param {transaction} trs - Unnecessary parameter.
 * @param {block} block - Unnecessary parameter.
 * @param {account} sender
 * @param {Function} cb - Callback function.
 * @implements module:accounts#Accounts~setAccountAndGet
 */
Signature.prototype.undo = function (trs, block, sender, cb) {
  modules.accounts.setAccountAndGet({
    address: sender.address,
    secondSignature: 0,
    u_secondSignature: 1,
    secondPublicKey: null
  }, cb);
};

/**
 * Activates unconfirmed second signature for sender account.
 * @param {transaction} trs - Unnecessary parameter.
 * @param {block} block - Unnecessary parameter.
 * @param {account} sender
 * @param {Function} cb - Callback function.
 * @implements module:accounts#Accounts~setAccountAndGet
 * @return {setImmediateCallback} Error if second signature is already enabled.
 */
Signature.prototype.applyUnconfirmed = function (trs, sender, cb) {
  if (sender.u_secondSignature || sender.secondSignature) {
    return setImmediate(cb, 'Second signature already enabled');
  }

  modules.accounts.setAccountAndGet({ address: sender.address, u_secondSignature: 1 }, cb);
};

/**
 * Deactivates unconfirmed second signature for sender account.
 * @param {transaction} trs - Unnecessary parameter.
 * @param {block} block - Unnecessary parameter.
 * @param {account} sender
 * @param {Function} cb - Callback function.
 * @implements module:accounts#Accounts~setAccountAndGet
 */
Signature.prototype.undoUnconfirmed = function (trs, sender, cb) {
  modules.accounts.setAccountAndGet({ address: sender.address, u_secondSignature: 0 }, cb);
};
/**
 * @typedef signature
 * @property {publicKey} publicKey
 */
Signature.prototype.schema = {
  id: 'Signature',
  object: true,
  properties: {
    publicKey: {
      type: 'string',
      format: 'publicKey'
    }
  },
  required: ['publicKey']
};

/**
 * Validates signature schema.
 * @param {transaction} trs - Uses signature from asset.
 * @throws {string} Error message.
 * @returns {transaction} Transaction validated.
 */
Signature.prototype.objectNormalize = function (trs) {
  var report = library.schema.validate(trs.asset.signature, Signature.prototype.schema);

  if (!report) {
    throw 'Failed to validate signature schema: ' + this.scope.schema.getLastErrors().map(function (err) {
      return err.message;
    }).join(', ');
  }

  return trs;
};

/**
 * Creates signature object based on raw data.
 * @param {object} raw - Data from database.
 * @todo check if this function is called.
 *
 * @returns {multisignature} signature Object with transaction id.
 */
Signature.prototype.dbRead = function (raw) {
  if (!raw.s_publicKey) {
    return null;
  } else {
    var signature = {
      transactionId: raw.t_id,
      publicKey: raw.s_publicKey
    };

    return { signature: signature };
  }
};

Signature.prototype.dbTable = 'signatures';

Signature.prototype.dbFields = [
  'transactionId',
  'publicKey'
];

/**
 * Creates database Object based on trs data.
 * @param {transaction} trs - Contains signature object.
 * @todo check if this function is called.
 *
 * @returns {object} {table:signatures, values: publicKey and transaction id}.
 */
Signature.prototype.dbSave = function (trs) {
  var publicKey;

  try {
    publicKey = Buffer.from(trs.asset.signature.publicKey, 'hex');
  } catch (e) {
    throw e;
  }

  return {
    table: this.dbTable,
    fields: this.dbFields,
    values: {
      transactionId: trs.id,
      publicKey: publicKey
    }
  };
};

/**
 * Evaluates transaction signatures and sender multisignatures.
 * @param {transaction} trs - signatures.
 * @param {account} sender
 * @todo validate this logic, check if this function is called.
 * @returns {boolean} logic based on trs signatures and sender multisignatures.
 */
Signature.prototype.ready = function (trs, sender) {
  if (Array.isArray(sender.multisignatures) && sender.multisignatures.length) {
    if (!Array.isArray(trs.signatures)) {
      return false;
    }
    return trs.signatures.length >= sender.multimin;
  } else {
    return true;
  }
};

// Export
module.exports = Signature;
