'use strict';

var ByteBuffer = require('bytebuffer');
var constants = require('../helpers/constants.js');
var sql = require('../sql/chats.js');
var valid_url = require('valid-url');
var slots = require('../helpers/slots.js');
var exceptions = require('../helpers/exceptions.js');

// Private fields
var self, library, __private = {};
var modules;

__private.unconfirmedNames = {};
__private.unconfirmedLinks = {};
__private.unconfirmedAscii = {};

/**
 * Initializes library.
 * @memberof module:chats
 * @class
 * @classdesc Main chat logic.
 * @param {Database} db
 * @param {Object} logger
 * @param {ZSchema} schema
 * @param {Object} network
 */
// Constructor
function Chat (db, ed, schema, account, logger, cb) {
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
Chat.prototype.bind = function (accounts, rounds) {
    modules = {
        accounts: accounts,
        rounds: rounds,
    };
};

/**
 * Creates transaction.asset.Chat based on data.
 * @param {dapp} data
 * @param {transaction} trs
 * @return {transaction} trs with new data
 */
Chat.prototype.create = function (data, trs) {
    trs.amount = 0;
    trs.recipientId = data.recipientId;
    trs.asset.chat = {
        message: data.message,
        own_message: data.own_message,
        type: 0
    };
    if (data.message_type) {
        trs.asset.chat.type = data.message_type;
    }
    return trs;
};

/**
 * Returns dapp fee from constants.
 * @param {transaction} trs
 * @param {account} sender
 * @return {number} fee
 */
Chat.prototype.calculateFee = function (trs, sender) {
    var length = Buffer.from(trs.asset.chat.message, 'hex').length;
    var char_length= Math.floor((length * 100 / 150)/255);
    if (char_length==0) {
        char_length = 1;
    }
    var fee = 0;
    if (trs.asset.chat.type === 0) {
        fee = char_length * constants.fees.old_chat_message;
    }
    else {
        fee = char_length * constants.fees.chat_message;
    }
    if (trs.amount > 0) {
        if (constants.fees.chat_message) {
            fee = constants.fees.send;
        } else {
            fee += constants.fees.send;
        }
    }
    return fee;
};

/**
 * Verifies transaction and chat fields.
 * @implements {library.db.query}
 * @param {transaction} trs
 * @param {account} sender
 * @param {function} cb
 * @return {setImmediateCallback} errors | trs
 */
Chat.prototype.verify = function (trs, sender, cb) {
    var i;

    if (!trs.recipientId) {
        return setImmediate(cb, 'Invalid recipient');
    }


    if (!trs.asset || !trs.asset.chat) {
        return setImmediate(cb, 'Invalid transaction asset');
    }


    if (trs.asset.chat.type > 3 || trs.asset.chat.type < 0) {
        return setImmediate(cb, 'Invalid message type');
    }


    if (!trs.asset.chat.message || trs.asset.chat.message.trim().length === 0 || trs.asset.chat.message.trim() !== trs.asset.chat.message) {
        return setImmediate(cb, 'Message must not be blank');
    }

    if (trs.asset.chat.message.length > 20480) {
        return setImmediate(cb, 'Message is too long. Maximum is 20480 characters');
    }


    return setImmediate(cb, null, trs);
};

/**
 * @param {transaction} trs
 * @param {account} sender
 * @param {function} cb
 * @return {setImmediateCallback} cb, null, trs
 */
Chat.prototype.process = function (trs, sender, cb) {
    return setImmediate(cb, null, trs);
};

/**
 * Creates a buffer with dapp information:
 * - name
 * - description
 * - tags
 * - link
 * - icon
 * - type
 * - category
 * @param {transaction} trs
 * @return {Array} Buffer
 * @throws {e} error
 */
Chat.prototype.getBytes = function (trs) {
    var buf;

    try {
        buf = Buffer.from([]);
        var messageBuf = Buffer.from(trs.asset.chat.message, 'hex');
        buf = Buffer.concat([buf, messageBuf]);

        if (trs.asset.chat.own_message) {
            var ownMessageBuf = Buffer.from(trs.asset.chat.own_message, 'hex');
            buf = Buffer.concat([buf, ownMessageBuf]);
        }


        var bb = new ByteBuffer(4 + 4, true);
        bb.writeInt(trs.asset.chat.type);
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
Chat.prototype.apply = function (trs, block, sender, cb) {
    if (trs.amount > 0 && exceptions.commentTransfers.indexOf(trs.id) === -1) {
        modules.accounts.setAccountAndGet({address: trs.recipientId}, function (err, recipient) {
            if (err) {
                return setImmediate(cb, err);
            }

            modules.accounts.mergeAccountAndGet({
                address: trs.recipientId,
                balance: trs.amount,
                u_balance: trs.amount,
                blockId: block.id,
                round: modules.rounds.calc(block.height)
            }, function (err) {
                return setImmediate(cb, err);
            });
        });
    }
    else {
        return setImmediate(cb);
    }
};

/**
 * @param {transaction} trs
 * @param {block} block
 * @param {account} sender
 * @param {function} cb
 * @return {setImmediateCallback} cb
 */
Chat.prototype.undo = function (trs, block, sender, cb) {
    if (trs.amount > 0 && exceptions.commentTransfers.indexOf(trs.id) === -1) {
        modules.accounts.setAccountAndGet({address: trs.recipientId}, function (err, recipient) {
            if (err) {
                return setImmediate(cb, err);
            }

            modules.accounts.mergeAccountAndGet({
                address: trs.recipientId,
                balance: -trs.amount,
                u_balance: -trs.amount,
                blockId: block.id,
                round: modules.rounds.calc(block.height)
            }, function (err) {
                return setImmediate(cb, err);
            });
        });
    }
    else {
        return setImmediate(cb);
    }
};

/**
 * Checks if chat name and link exists, if not adds them to private
 * unconfirmed variables.
 * @param {transaction} trs
 * @param {account} sender
 * @param {function} cb
 * @return {setImmediateCallback} cb|errors
 */
Chat.prototype.applyUnconfirmed = function (trs, sender, cb) {
    return setImmediate(cb);
};

/**
 * Deletes dapp name and link from private unconfirmed variables.
 * @param {transaction} trs
 * @param {account} sender
 * @param {function} cb
 * @return {setImmediateCallback} cb
 */
Chat.prototype.undoUnconfirmed = function (trs, sender, cb) {
    return setImmediate(cb);
};



/**
 * @typedef {Object} chat
 * @property {dappCategory} category - Number between 0 and 8
 * @property {string} name - Between 1 and 32 chars
 * @property {string} description - Between 0 and 160 chars
 * @property {string} tags - Between 0 and 160 chars
 * @property {dappType} type - Number, minimum 0
 * @property {string} link - Between 0 and 2000 chars
 * @property {string} icon - Between 0 and 2000 chars
 * @property {string} transactionId - transaction id
 */
Chat.prototype.schema = {
    id: 'Chat',
    type: 'object',
    properties: {
        message: {
            type: 'string',
            minLength: 1,
            maxLength: 20480
        },
        own_message: {
            type: 'string',
            minLength: 0,
            maxLength: 20480
        },
        type: {
            type: 'integer',
            minimum: 0
        }
    },
    required: ['type', 'message']
};

/**
 * Deletes null or undefined dapp from transaction and validate dapp schema.
 * @implements {library.schema.validate}
 * @param {transaction} trs
 * @return {transaction}
 * @throws {string} Failed to validate dapp schema.
 */
Chat.prototype.objectNormalize = function (trs) {
    for (var i in trs.asset.chat) {
        if (trs.asset.chat[i] === null || typeof trs.asset.chat[i] === 'undefined') {
            delete trs.asset.chat[i];
        }
    }

    var report = this.scope.schema.validate(trs.asset.chat, Chat.prototype.schema);

    if (!report) {
        throw 'Failed to validate chat schema: ' + this.scope.schema.getLastErrors().map(function (err) {
            return err.message;
        }).join(', ');
    }

    return trs;
};

/**
 * Creates chat object based on raw data.
 * @param {Object} raw
 * @return {null|dapp} dapp object
 */
Chat.prototype.dbRead = function (raw) {
    if (!raw.c_message) {
        return null;
    } else {
        return {chat: {
            message: raw.c_message,
            own_message: raw.c_own_message,
            type: raw.c_type
        }};
    }
    return null;
};

Chat.prototype.dbTable = 'chats';

Chat.prototype.dbFields = [
    'message',
    'own_message',
    'type',
    'transactionId'
];
Chat.prototype.publish = function (data) {
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
Chat.prototype.normalize = function (data) {
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
        recipientId: data.recipientId,
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
Chat.prototype.dbSave = function (trs) {
    return {
        table: this.dbTable,
        fields: this.dbFields,
        values: {
            message: trs.asset.chat.message,
            own_message: trs.asset.chat.own_message,
            type: trs.asset.chat.type,
            transactionId: trs.id
        }
    };
};

/**
 * Emits 'dapps/change' signal.
 * @implements {library.network.io.sockets}
 * @param {transaction} trs
 * @param {function} cb
 * @return {setImmediateCallback} cb
 */
Chat.prototype.afterSave = function (trs, cb) {
    return setImmediate(cb);
};

/**
 * Checks sender multisignatures and transaction signatures.
 * @param {transaction} trs
 * @param {account} sender
 * @return {boolean} True if transaction signatures greather than
 * sender multimin or there are not sender multisignatures.
 */
Chat.prototype.ready = function (trs, sender) {
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
module.exports = Chat;
