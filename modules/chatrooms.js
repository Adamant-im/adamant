'use strict';

const Chat = require('../logic/chat.js');
const transactionTypes = require('../helpers/transactionTypes.js');
const Transfer = require('../logic/transfer.js');

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

    },
    getMessages: function (req, cb) {

    }
};

Chatrooms.prototype.shared = {};

module.exports = Chatrooms;