'use strict';

var ByteBuffer = require('bytebuffer');
var constants = require('../helpers/constants.js');
var sql = require('../sql/states.js');
var valid_url = require('valid-url');
var slots = require('../helpers/slots.js');

// Private fields
var self, library, __private = {};

__private.unconfirmedNames = {};
__private.unconfirmedLinks = {};
__private.unconfirmedAscii = {};

/**
 * Initializes library.
 * @memberof module:states
 * @class
 * @classdesc Main state logic.
 * @param {Database} db
 * @param {Object} logger
 * @param {ZSchema} schema
 * @param {Object} network
 */
// Constructor
function State (db, ed, schema, account, logger, cb) {
    this.scope = {
        db: db,
        ed: ed,
        schema: schema,
        logger: logger,
        account: account
    };
    self = this;
    if (cb) {
        return setImmediate(cb, null, this);
    }
}

// Public methods
/**
 * Binds scope.modules to private variable modules.
 */
State.prototype.bind = function () {};

/**
 * Creates transaction.asset.State based on data.
 * @param {state} data
 * @param {transaction} trs
 * @return {transaction} trs with new data
 */
State.prototype.create = function (data, trs) {
    trs.amount = 0;
    trs.recipientId = null;
    trs.asset.state = {
        value: data.value,
        key: data.key,
        type: 0
    };
    if (data.state_type) {
        trs.asset.state.type = data.state_type;
    }
    return trs;
};

/**
 * Returns state fee from constants.
 * @param {transaction} trs
 * @param {account} sender
 * @return {number} fee
 */
State.prototype.calculateFee = function (trs, sender) {
    var length = Buffer.from(trs.asset.state.value, 'hex').length;
    var char_length= Math.floor((length * 100 / 150)/255);
    if (char_length==0) {
        char_length = 1;
    }
    return char_length * constants.fees.state_store;
};

/**
 * Verifies transaction and state fields.
 * @implements {library.db.query}
 * @param {transaction} trs
 * @param {account} sender
 * @param {function} cb
 * @return {setImmediateCallback} errors | trs
 */
State.prototype.verify = function (trs, sender, cb) {

    if (!trs.asset || !trs.asset.state) {
        return setImmediate(cb, 'Invalid transaction asset');
    }

    if (trs.asset.state.type > 1 || trs.asset.state.type < 0) {
        return setImmediate(cb, 'Invalid state type');
    }

    if (!trs.asset.state.value || trs.asset.state.value.trim().length === 0 || trs.asset.state.value.trim() !== trs.asset.state.value) {
        return setImmediate(cb, 'Value must not be blank');
    }

    if (trs.asset.state.value.length > 20480) {
        return setImmediate(cb, 'Value is too long. Maximum is 20480 characters');
    }

    return setImmediate(cb, null, trs);
};

/**
 * @param {transaction} trs
 * @param {account} sender
 * @param {function} cb
 * @return {setImmediateCallback} cb, null, trs
 */
State.prototype.process = function (trs, sender, cb) {
    return setImmediate(cb, null, trs);
};

/**
 * Creates a buffer with state information:
 * - type
 * - key
 * - value
 * @param {transaction} trs
 * @return {Array} Buffer
 * @throws {e} error
 */
State.prototype.getBytes = function (trs) {
    var buf;

    try {
        buf = Buffer.from([]);
        var stateBuf = Buffer.from(trs.asset.state.value);
        buf = Buffer.concat([buf, stateBuf]);

        if (trs.asset.state.key) {
            var keyBuf = Buffer.from(trs.asset.state.key);
            buf = Buffer.concat([buf, keyBuf]);
        }

        var bb = new ByteBuffer(4 + 4, true);
        bb.writeInt(trs.asset.state.type);
        bb.flip();

        buf = Buffer.concat([buf, bb.toBuffer()]);
    } catch (e) {
        throw e;
    }

    return buf;
};

/**
 * @param {transaction} trs
 * @param {block} block
 * @param {account} sender
 * @param {function} cb
 * @return {setImmediateCallback} cb
 */
State.prototype.apply = function (trs, block, sender, cb) {
    return setImmediate(cb);
};

/**
 * @param {transaction} trs
 * @param {block} block
 * @param {account} sender
 * @param {function} cb
 * @return {setImmediateCallback} cb
 */
State.prototype.undo = function (trs, block, sender, cb) {
    return setImmediate(cb);
};

/**
 * applyUncorfirmed stub
 * @param {transaction} trs
 * @param {account} sender
 * @param {function} cb
 * @return {setImmediateCallback} cb|errors
 */
State.prototype.applyUnconfirmed = function (trs, sender, cb) {
    return setImmediate(cb);
};

/**
 * undoUnconfirmed stub
 * @param {transaction} trs
 * @param {account} sender
 * @param {function} cb
 * @return {setImmediateCallback} cb
 */
State.prototype.undoUnconfirmed = function (trs, sender, cb) {
    return setImmediate(cb);
};



/**
 * @typedef {Object} state
 * @property {string} key - Between 0 and 20 chars
 * @property {string} value - Between 1 and 20480 chars
 * @property {integer} type - Number, minimum 0
 * @property {string} transactionId - transaction id
 */
State.prototype.schema = {
    id: 'State',
    type: 'object',
    properties: {
        key: {
            type: 'string',
            minLength: 0,
            maxLength: 20
        },
        value: {
            type: 'string',
            minLength: 1,
            maxLength: 20480
        },
        type: {
            type: 'integer',
            minimum: 0
        }
    },
    required: ['type', 'value']
};

/**
 * Deletes null or undefined state from transaction and validate state schema.
 * @implements {library.schema.validate}
 * @param {transaction} trs
 * @return {transaction}
 * @throws {string} Failed to validate state schema.
 */
State.prototype.objectNormalize = function (trs) {
    for (var i in trs.asset.state) {
        if (trs.asset.state[i] === null || typeof trs.asset.state[i] === 'undefined') {
            delete trs.asset.state[i];
        }
    }

    var report = this.scope.schema.validate(trs.asset.state, State.prototype.schema);

    if (!report) {
        throw 'Failed to validate state schema: ' + this.scope.schema.getLastErrors().map(function (err) {
            return err.message;
        }).join(', ');
    }

    return trs;
};

/**
 * Creates chat object based on raw data.
 * @param {Object} raw
 * @return {null|state} state object
 */
State.prototype.dbRead = function (raw) {
    if (!raw.st_stored_value) {
        return null;
    } else {
        return {state: {
            value: raw.st_stored_value,
            key: raw.st_stored_key,
            type: raw.st_type
        }};
    }
    return null;
};

State.prototype.dbTable = 'states';

State.prototype.dbFields = [
    'stored_value',
    'stored_key',
    'type',
    'transactionId'
];
State.prototype.publish = function (data) {
    if (!__private.types[data.type]) {
        throw 'Unknown transaction type ' + data.type;
    }

    if (!data.senderId) {
        throw 'Invalid sender';
    }

    if (!data.signature) {
        throw 'Invalid signature';
    }

    var trs = data;


    trs.id = this.getId(trs);

    trs.fee = __private.types[trs.type].calculateFee.call(this, trs, data.senderId) || false;

    return trs;
};
State.prototype.normalize = function (data) {
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
        senderId: data.sender.account,
        recipientId: null,
        timestamp: slots.getTime(),
        asset: {}
    };

    trs = __private.types[trs.type].create.call(this, data, trs);

    return trs;
};

/**
 * Creates db operation object based on dapp data.
 * @see privateTypes
 * @param {transaction} trs
 * @return {Object[]} table, fields, values.
 */
State.prototype.dbSave = function (trs) {
    return {
        table: this.dbTable,
        fields: this.dbFields,
        values: {
            stored_key: trs.asset.state.key,
            stored_value: trs.asset.state.value,
            type: trs.asset.state.type,
            transactionId: trs.id
        }
    };
};

/**
 * Emits 'states/change' signal.
 * @implements {library.network.io.sockets}
 * @param {transaction} trs
 * @param {function} cb
 * @return {setImmediateCallback} cb
 */
State.prototype.afterSave = function (trs, cb) {
    return setImmediate(cb);
};

/**
 * Checks sender multisignatures and transaction signatures.
 * @param {transaction} trs
 * @param {account} sender
 * @return {boolean} True if transaction signatures greather than
 * sender multimin or there are not sender multisignatures.
 */
State.prototype.ready = function (trs, sender) {
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
module.exports = State;
