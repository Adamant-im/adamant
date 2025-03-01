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

__private.listChats = function (filter, cb) {
  let params = {}, where = [], whereOr = [];

  if (filter.type >= 0) {
    where.push('"c_type" = ${type}');
    params.type = filter.type;
  }

  let includeDirectTransfers = false;

  if (typeof filter.includeDirectTransfers !== 'undefined') {
    includeDirectTransfers = Boolean(filter.includeDirectTransfers);
  }

  if (typeof filter.withoutDirectTransfers !== 'undefined') {
    includeDirectTransfers = !filter.withoutDirectTransfers;
  }

  if (includeDirectTransfers) {
    where.push('"t_type" = ' + transactionTypes.CHAT_MESSAGE);
  } else {
    where.push(`("t_type" = ${transactionTypes.CHAT_MESSAGE} OR "t_type" = ${transactionTypes.SEND})`);
  }
  where.push(`(NOT("c_type" = ${transactionTypes.CHAT_MESSAGE_TYPES.SIGNAL_MESSAGE}) OR c_type IS NULL) `);
  if (filter.senderId) {
    where.push('"t_senderId" = ${name}');
    params.name = filter.senderId;
  }

  if (filter.recipientId) {
    where.push('"t_recipientId" = ${name}');
    params.name = filter.recipientId;
  }

  if (filter.userId) {
    whereOr.push('"t_senderId" = ${name}');
    whereOr.push('"t_recipientId" = ${name}');
    params.name = filter.userId;
  }

  if (!filter.limit) {
    params.limit = 25;
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
      filter.orderBy, sql.chatroomsSortDefaults
  );

  if (orderBy.error) {
    return setImmediate(cb, orderBy.error);
  }

  let unconfirmedTransactions = [];

  if (filter.returnUnconfirmed) {
    unconfirmedTransactions = modules.transactions.getUnconfirmedTransactions({
      isIn: filter.userId,
    });

    params.mergingOffset = unconfirmedTransactions.length;
    params.mergingLimit = filter.limit;

    params.limit += Math.min(params.offset, unconfirmedTransactions.length);
    params.offset = Math.max(0, params.offset - unconfirmedTransactions.length);
  }

  library.db.query(sql.countChats({
    where: where,
    whereOr: whereOr
  }), params).then(function (rows) {
    const count = rows.length ? Number(rows[0].count) : 0;
    library.db.query(sql.listChats({
      where: where,
      whereOr: whereOr,
      sortField: orderBy.sortField,
      sortMethod: orderBy.sortMethod
    }), params).then(function (rows) {
      let transactions = rows.map(library.logic.transaction.dbRead);

      if (filter.returnUnconfirmed) {
        transactions = modules.transactions.mergeUnconfirmedTransactions(
          transactions,
          unconfirmedTransactions,
          {
            orderBy,
            includeDirectTransfers,
            limit: params.mergingLimit,
            offset: params.mergingOffset,
          }
        );
      }

      const chats = {};

      for (const trs of transactions) {
        const uid = trs.senderId !== filter.userId ? trs.senderId : trs.recipientId;

        chats[uid] = {
          lastTransaction: trs,
          participants: [
            { address: trs.senderId, publicKey: trs.senderPublicKey },
            { address: trs.recipientId, publicKey: trs.recipientPublicKey },
          ]
        };
      }

      const data = {
        chats: Object.values(chats),
        count: String(count + unconfirmedTransactions.length)
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

__private.listMessages = function (filter, cb) {
  let params = {}, where = [], whereOr = [];

  if (filter.type >= 0) {
    where.push('"c_type" = ${type}');
    params.type = filter.type;
  } else {
    where.push(`(NOT("c_type" = ${transactionTypes.CHAT_MESSAGE_TYPES.SIGNAL_MESSAGE}) OR c_type IS NULL)`);
  }

  let includeDirectTransfers = false;

  if (typeof filter.includeDirectTransfers !== 'undefined') {
    includeDirectTransfers = Boolean(filter.includeDirectTransfers);
  }

  if (typeof filter.withoutDirectTransfers !== 'undefined') {
    includeDirectTransfers = !filter.withoutDirectTransfers;
  }

  if (includeDirectTransfers) {
    where.push(`("t_type" = ${transactionTypes.CHAT_MESSAGE} OR "t_type" = ${transactionTypes.SEND})`);
  } else {
    where.push('"t_type" = ' + transactionTypes.CHAT_MESSAGE);
  }

  if (filter.senderId) {
    where.push('"t_senderId" = ${name}');
    params.name = filter.senderId;
  }

  if (filter.recipientId) {
    where.push('"t_recipientId" = ${name}');
    params.name = filter.recipientId;
  }

  if (filter.companionId && filter.userId) {
    whereOr.push('("t_senderId" = ${pname} AND "t_recipientId" = ${name})');
    whereOr.push('("t_recipientId" = ${pname} AND "t_senderId" = ${name})');
    params.pname = filter.companionId;
    params.name = filter.userId;
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
      filter.orderBy, sql.chatroomsSortDefaults
  );

  if (orderBy.error) {
    return setImmediate(cb, orderBy.error);
  }

  let unconfirmedTransactions = [];

  if (filter.returnUnconfirmed) {
    const unconfirmedFilters = {
      ...filter,
      senderIds: [filter.companionId, filter.userId],
      recipientIds: [filter.companionId, filter.userId],
      type: transactionTypes.CHAT_MESSAGE,
    };

    unconfirmedTransactions = modules.transactions.getUnconfirmedTransactions(unconfirmedFilters, {
      allowedFilters: [
        'type',
      ],
      aliases: {
        type: 'assetChatType'
      },
    });

    count += unconfirmedTransactions.length;

    params.mergingOffset = unconfirmedTransactions.length;
    params.mergingLimit = filter.limit;

    params.limit += Math.min(params.offset, unconfirmedTransactions.length);
    params.offset = Math.max(0, params.offset - unconfirmedTransactions.length);
  }

  library.db.query(sql.countList({
    where: where,
    whereOr: whereOr
  }), params).then(function (rows) {
    const count = rows.length ? rows[0].count : 0;
    library.db.query(sql.listMessages({
      where: where,
      whereOr: whereOr,
      sortField: orderBy.sortField,
      sortMethod: orderBy.sortMethod
    }), params).then(function (rows) {
      let transactions = [];
      for (let i = 0; i < rows.length; i++) {
        const trs = library.logic.transaction.dbRead(rows[i]);
        transactions.push(trs);
      }

      if (filter.returnUnconfirmed) {
        transactions = modules.transactions.mergeUnconfirmedTransactions(
          transactions,
          unconfirmedTransactions,
          {
            orderBy,
            includeDirectTransfers,
            limit: params.mergingLimit,
            offset: params.mergingOffset,
          }
        );
      }

      const data = {
        messages: transactions,
        participants: transactions.length ? [
          { address: transactions[0].senderId, publicKey: transactions[0].senderPublicKey },
          { address: transactions[0].recipientId, publicKey: transactions[0].recipientPublicKey }
        ] : [],
        count: String(count + unconfirmedTransactions.length)
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
    sql: scope.sql
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
    const validRequest = req.path.match(/^\/([Uu][0-9]+)\/?([Uu][0-9]+)?$/);

    if (!validRequest) {
      return setImmediate(cb, 'Invalid Request path');
    }

    const [, userId, companionId] = validRequest;

    req.body = {
      ...req.body,
      userId: userId.toUpperCase(),
      companionId: companionId?.toUpperCase()
    };

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
        __private.listChats(req.body, function (err, data) {
          if (err) {
            return setImmediate(waterCb, 'Failed to get transactions: ' + err);
          } else {
            return setImmediate(waterCb, null, {
              chats: data.chats,
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
    const validRequest = req.path.match(/^\/([Uu][0-9]+)\/([Uu][0-9]+)$/);

    if (!validRequest) {
      return setImmediate(cb, 'Invalid Request path');
    }

    const [, userId, companionId] = validRequest;

    req.body = {
      ...req.body,
      userId: userId.toUpperCase(),
      companionId: companionId.toUpperCase()
    };

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
        __private.listMessages(req.body, function (err, data) {
          if (err) {
            return setImmediate(waterCb, 'Failed to get transactions: ' + err);
          } else {
            return setImmediate(waterCb, null, {
              messages: data.messages,
              participants: data.participants,
              count: data.count
            });
          }
        });
      }
    ], function (err, res) {
      return setImmediate(cb, err, res);
    });
  }
};

Chatrooms.prototype.shared = {};

module.exports = Chatrooms;
