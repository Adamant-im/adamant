var _ = require('lodash');
var async = require('async');
var constants = require('../helpers/constants.js');
var crypto = require('crypto');
var State = require('../logic/state.js');
var extend = require('extend');
var ip = require('ip');
var npm = require('npm');
var OrderBy = require('../helpers/orderBy.js');
var path = require('path');
var popsicle = require('popsicle');
var Router = require('../helpers/router.js');
var schema = require('../schema/states.js');
var sql = require('../sql/states.js');
var TransactionPool = require('../logic/transactionPool.js');
var transactionTypes = require('../helpers/transactionTypes.js');

// Private fields
var modules, library, self, __private = {}, shared = {};

__private.assetTypes = {};


/**
 * Initializes library with scope content and generates instances for:
 * - States
 * Calls logic.transaction.attachAssetType().
 *
 * Listens `exit` signal.
 * Checks 'public/state' folder and created it if doesn't exists.
 * @memberof module:states
 * @class
 * @classdesc Main states methods.
 * @param {function} cb - Callback function.
 * @param {scope} scope - App instance.
 * @return {setImmediateCallback} Callback function with `self` as data.
 * @todo apply node pattern for callbacks: callback always at the end.
 * @todo add 'use strict';
 */
// Constructor
function States (cb, scope) {
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

    __private.assetTypes[transactionTypes.STATE] = library.logic.transaction.attachAssetType(
        transactionTypes.STATE,
        new State(
            scope.db,
            scope.logger,
            scope.schema,
            scope.network
        )
    );
    setImmediate(cb, null, self);
}

// Private methods
/**
 * Gets record from `states` table based on id
 * @private
 * @implements {library.db.query}
 * @param {string} id
 * @param {function} cb
 * @return {setImmediateCallback} error description | row data
 */
__private.get = function (id, cb) {
    library.db.query(sql.get, {id: id}).then(function (rows) {
        if (rows.length === 0) {
            return setImmediate(cb, 'state records not found');
        } else {
            return setImmediate(cb, null, rows[0]);
        }
    }).catch(function (err) {
        library.logger.error(err.stack);
        return setImmediate(cb, 'STATE#get error');
    });
};

/**
 * Gets records from `states` table based on id list
 * @private
 * @implements {library.db.query}
 * @param {string[]} ids
 * @param {function} cb
 * @return {setImmediateCallback} error description | rows data
 */
__private.getByIds = function (ids, cb) {
    library.db.query(sql.getByIds, [ids]).then(function (rows) {
        return setImmediate(cb, null, rows);
    }).catch(function (err) {
        library.logger.error(err.stack);
        return setImmediate(cb, 'STATE#getByIds error');
    });
};

/**
 * Gets records from `states` table based on filter
 * @private
 * @implements {library.db.query}
 * @param {Object} filter - Could contains type, address, limit,
 * offset, orderBy
 * @param {function} cb
 * @return {setImmediateCallback} error description | rows data
 */
__private.list = function (filter, cb) {
    var params = {}, where = [];

    if (filter.type >= 0) {
        where.push('"st_type" = ${type}');
        params.type = filter.type;
    }
    if (filter.key) {
        where.push('"st_stored_key" = ${key}');
        params.key = filter.key;
    }
    where.push('"t_type" = '+ transactionTypes.STATE);

    if (filter.senderId) {
        where.push('"t_senderId" = ${name}');
        params.name = filter.senderId;
    }
    if (filter.fromHeight) {
        where.push('"b_height" > ${height}');
        params.height = filter.fromHeight;
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

    var orderBy = OrderBy(
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
        var count = rows.length ? rows[0].count : 0;
        library.db.query(sql.list({
            where: where,
            sortField: orderBy.sortField,
            sortMethod: orderBy.sortMethod
        }), params).then(function (rows) {
            var transactions = [];

            for (var i = 0; i < rows.length; i++) {
                transactions.push(library.logic.transaction.dbRead(rows[i]));
            }

            var data = {
                transactions: transactions,
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


States.prototype.onBind = function (scope) {
    modules = {
        transactions: scope.transactions,
        accounts: scope.accounts,
        peers: scope.peers,
        sql: scope.sql,
    };
};

/**
 * Checks if `modules` is loaded.
 * @return {boolean} True if `modules` is loaded.
 */
States.prototype.isLoaded = function () {
    return !!modules;
};

/**
 * Internal & Shared
 * - DApps.prototype.internal
 * - shared.
 * @todo implement API comments with apidoc.
 * @see {@link http://apidocjs.com/}
 */
States.prototype.internal = {
    getTransactions: function (req, cb) {
        async.waterfall([
            function (waterCb) {
                var params = {};
                var pattern = /(and|or){1}:/i;

                // Filter out 'and:'/'or:' from params to perform schema validation
                _.each(req.body, function (value, key) {
                    var param = String(key).replace(pattern, '');
                    // Dealing with array-like parameters (csv comma separated)
                    if (_.includes(['senderIds', 'senderPublicKeys'], param)) {
                        value = String(value).split(',');
                        req.body[key] = value;
                    }
                    params[param] = value;
                });

                library.schema.validate(params, schema.getTransactions, function (err) {
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
                        return setImmediate(waterCb, null, {transactions: data.transactions, count: data.count});
                    }
                });
            }
        ], function (err, res) {
            return setImmediate(cb, err, res);
        });
    },
    normalize: function (req, cb) {
        library.schema.validate(req.body, schema.normalize, function (err) {
            if (err) {
                return setImmediate(cb, err[0].message);
            }

            var query = {address: req.body.recipientId};

            modules.accounts.getAccount(query, function (err, recipient) {
                if (err) {
                    return setImmediate(cb, err);
                }
                var keypair = {publicKey: ''};
                var recipientId = recipient ? recipient.address : req.body.recipientId;

                if (!recipientId) {
                    return setImmediate(cb, 'Invalid recipient');
                }

                if (req.body.multisigAccountPublicKey && req.body.multisigAccountPublicKey !== keypair.publicKey.toString('hex')) {
                    modules.accounts.getAccount({publicKey: req.body.multisigAccountPublicKey}, function (err, account) {
                        if (err) {
                            return setImmediate(cb, err);
                        }

                        if (!account || !account.publicKey) {
                            return setImmediate(cb, 'Multisignature account not found');
                        }

                        if (!Array.isArray(account.multisignatures)) {
                            return setImmediate(cb, 'Account does not have multisignatures enabled');
                        }

                        if (account.multisignatures.indexOf(keypair.publicKey.toString('hex')) < 0) {
                            return setImmediate(cb, 'Account does not belong to multisignature group');
                        }

                        modules.accounts.getAccount({publicKey: keypair.publicKey}, function (err, requester) {
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
                                    type: transactionTypes.SEND,
                                    amount: req.body.amount,
                                    sender: account,
                                    recipientId: recipientId,
                                    keypair: keypair,
                                    requester: keypair,
                                    secondKeypair: secondKeypair
                                });
                            } catch (e) {
                                return setImmediate(cb, e.toString());
                            }

                            modules.transactions.receiveTransactions([transaction], true, cb);
                        });
                    });
                } else {
                    modules.accounts.setAccountAndGet({publicKey: req.body.publicKey}, function (err, account) {
                        if (err) {
                            return setImmediate(cb, err);
                        }

                        if (!account || !account.publicKey) {
                            return setImmediate(cb, 'Account not found');
                        }

                        if (account.secondSignature && !req.body.secondSecret) {
                            return setImmediate(cb, 'Missing second passphrase');
                        }

                        var secondKeypair = null;

                        if (account.secondSignature) {
                            var secondHash = library.ed.createPassPhraseHash(req.body.secondSecret);
                            secondKeypair = library.ed.makeKeypair(secondHash);
                        }

                        var transaction;

                        try {
                            transaction = library.logic.transaction.normalize({
                                type: transactionTypes.CHAT_MESSAGE,
                                amount: 0,
                                sender: account,
                                recipientId: recipientId,
                                message: req.body.message,
                                own_message: req.body.own_message,
                                message_type: req.body.message_type,
                                keypair: keypair,
                                secondKeypair: secondKeypair
                            });
                        } catch (e) {
                            return setImmediate(cb, e.toString());
                        }
                        return setImmediate(cb, null, {transaction: transaction});

                    });
                }
            });

        });
    },
    store: function (req, cb) {
        library.schema.validate(req.body.transaction, schema.store, function (err) {
            if (err) {
                return setImmediate(cb, err[0].message);
            }

            var query = {address: req.body.transaction.senderId};
            var keypair = {};
            library.balancesSequence.add(function (cb) {


                    if (req.body.multisigAccountPublicKey && req.body.multisigAccountPublicKey !== req.body.transaction.publicKey) {
                        modules.accounts.getAccount({publicKey: req.body.multisigAccountPublicKey}, function (err, account) {
                            if (err) {
                                return setImmediate(cb, err);
                            }

                            if (!account || !account.publicKey) {
                                return setImmediate(cb, 'Multisignature account not found');
                            }

                            if (!Array.isArray(account.multisignatures)) {
                                return setImmediate(cb, 'Account does not have multisignatures enabled');
                            }

                            if (account.multisignatures.indexOf(keypair.publicKey.toString('hex')) < 0) {
                                return setImmediate(cb, 'Account does not belong to multisignature group');
                            }

                            modules.accounts.getAccount({publicKey: keypair.publicKey}, function (err, requester) {
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
                                        type: transactionTypes.SEND,
                                        amount: req.body.amount,
                                        sender: account,
                                        recipientId: null,
                                        keypair: null,
                                        requester: null,
                                        secondKeypair: secondKeypair
                                    });
                                } catch (e) {
                                    return setImmediate(cb, e.toString());
                                }

                                modules.transactions.receiveTransactions([transaction], true, cb);
                            });
                        });
                    } else {

                        modules.accounts.setAccountAndGet({publicKey: req.body.transaction.senderPublicKey}, function (err, account) {
                            if (err) {
                                return setImmediate(cb, err);
                            }

                            if (!account || !account.publicKey) {
                                return setImmediate(cb, 'Account not found');
                            }

                            if (account.secondSignature && !req.body.secondSecret) {
                                return setImmediate(cb, 'Missing second passphrase');
                            }

                            var secondKeypair = null;

                            if (account.secondSignature) {
                                var secondHash = library.ed.createPassPhraseHash(req.body.secondSecret);
                                secondKeypair = library.ed.makeKeypair(secondHash);
                            }

                            var transaction;

                            try {
                                transaction = library.logic.transaction.publish(req.body.transaction);
                            } catch (e) {
                                return setImmediate(cb, e.toString());
                            }

                            modules.transactions.receiveTransactions([transaction], true, cb);
                        });
                    }

            }, function (err, transaction) {
                if (err) {
                    return setImmediate(cb, err);
                }

                return setImmediate(cb, null, {transactionId: transaction[0].id});
            });
        });
    },
    get: function (query, cb) {
        __private.get(query.id, function (err, state) {
            if (err) {
                return setImmediate(cb, null, {success: false, error: err});
            } else {
                return setImmediate(cb, null, {success: true, state: state});
            }
        });
    }

};

// Export
module.exports = States;
