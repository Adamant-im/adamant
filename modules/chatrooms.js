'use strict';

const _ = require('lodash');
const async = require('async');
const Chat = require('../logic/chat.js');
const sql = require('../sql/chats.js');
const transactionTypes = require('../helpers/transactionTypes.js');
const schema = require('../schema/chatrooms.js');
const Transfer = require('../logic/transfer.js');
const OrderBy = require('../helpers/orderBy.js');

// Private fields
let modules, library, self, __private = {}, shared = {};

__private.assetTypes = {};

/**
 * Initializes library with scope content and generates instances for:
 * - Chatrooms
 * Calls logic.transaction.attachAssetType().
 *
 * Listens `exit` signal.
 * Checks 'public/chat' folder and created it if doesn't exists.
 * @memberof module:chatrooms
 * @class
 * @classdesc Main chatrooms methods.
 * @param {function} cb - Callback function.
 * @param {scope} scope - App instance.
 * @return {setImmediateCallback} Callback function with `self` as data.
 */
// Constructor
function Chatrooms (cb, scope) {
    library = {
        logger: scope.logger,
        db: scope.db,
        public: scope.public,
        network: scope.network,
        schema: scope.schema,
        ed: scope.ed,
        balancesSequence: scope.balancesSequence,
        logic: {
            transaction: scope.logic.transaction,
            chat: scope.logic.chat
        }
    };
    self = this;

    __private.assetTypes[transactionTypes.CHAT_MESSAGE] = library.logic.transaction.attachAssetType(
        transactionTypes.CHAT_MESSAGE,
        new Chat(
            scope.db,
            scope.logger,
            scope.schema,
            scope.network
        )
    );
    __private.assetTypes[transactionTypes.SEND] = library.logic.transaction.attachAssetType(
        transactionTypes.SEND, new Transfer()
    );
    setImmediate(cb, null, self);
}

__private.list = function (filter, cb) {
    let params = {}, where = [];

    if (filter.type >= 0) {
        where.push('"c_type" = ${type}');
        params.type = filter.type;
    }
    else {
        // message type=3 is reserved for system messages, and shouldn't be retrieved without a filter
        where.push('NOT ("c_type" = 3)');
    }
    where.push('"t_type" = '+ transactionTypes.CHAT_MESSAGE);

    if (filter.senderId) {
        where.push('"t_senderId" = ${name}');
        params.name = filter.senderId;
    }
    if (filter.recipientId) {
        where.push('"t_recipientId" = ${name}');
        params.name = filter.recipientId;
    }

    if (!filter.limit) {
        params.limit = 100;
    } else {
        params.limit = Math.abs(filter.limit);
    }

    if (!filter.offset) {
        params.offset = 0;
    } else {
        params.offset = Math.abs(filter.offset);
    }

    if (params.limit > 100) {
        return setImmediate(cb, 'Invalid limit. Maximum is 100');
    }

    const orderBy = OrderBy(
        filter.orderBy, {
            sortFields: sql.sortFields
        }
    );

    if (orderBy.error) {
        return setImmediate(cb, orderBy.error);
    }
    library.db.query(sql.countList({
        where: where
    }), params).then(function (rows) {
        const count = rows.length ? rows[0].count : 0;
        library.db.query(sql.list({
            where: where,
            sortField: orderBy.sortField,
            sortMethod: orderBy.sortMethod
        }), params).then(function (rows) {
            let transactions = [];
            let participants = [];

            for (let i = 0; i < rows.length; i++) {
                const trs = library.logic.transaction.dbRead(rows[i]);
                transactions.push(trs);
                participants.push(trs.senderId);
                participants.push(trs.recipientId);
            }
            const data = {
                chats: transactions,
                participants: participants,
                count: count
            };
            return setImmediate(cb, null, data);
        }).catch(function (err) {
            library.logger.error(err.stack);
            return setImmediate(cb, err);
        });
    }).catch(function (err) {
        library.logger.error(err.stack);
        return setImmediate(cb, err);
    });
};

Chatrooms.prototype.onBind = function (scope) {
    modules = {
        transactions: scope.transactions,
        accounts: scope.accounts,
        peers: scope.peers,
        sql: scope.sql,
    };
    __private.assetTypes[transactionTypes.CHAT_MESSAGE].bind(
        scope.accounts,
        scope.rounds
    );
};

/**
 * Checks if `modules` is loaded.
 * @return {boolean} True if `modules` is loaded.
 */
Chatrooms.prototype.isLoaded = function () {
    return !!modules;
};

Chatrooms.prototype.internal = {
    getChats: function (req, cb) {
        async.waterfall([
            function (waterCb) {
                const params = req.body;

                library.schema.validate(params, schema.getChats, function (err) {
                    if (err) {
                        return setImmediate(waterCb, err[0].message);
                    } else {
                        return setImmediate(waterCb, null);
                    }
                });
            },
            function (waterCb) {
                __private.list(req.body, function (err, data) {
                    if (err) {
                        return setImmediate(waterCb, 'Failed to get transactions: ' + err);
                    } else {
                        return setImmediate(waterCb, null, {
                            chats: data.chats,
                            participants: data.participants,
                            count: data.count
                        });
                    }
                });
            }
        ], function (err, res) {
            return setImmediate(cb, err, res);
        });
    },
    getMessages: function (req, cb) {

    }
};

Chatrooms.prototype.shared = {};

module.exports = Chatrooms;