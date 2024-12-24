const __private = {};

/**
 * @type {TransactionPool}
 */
let self;
let library;

function TransactionPool(cb, scope) {
  library = {
    logic: {
      transactionPool: scope.logic.transactionPool,
    },
  };

  self = this;

  setImmediate(cb, null, self);
}

TransactionPool.prototype.list = function (filter) {
  let transactions = library.logic.transactionPool.getUnconfirmedTransactionList();

  if (JSON.stringify(filter) === '{}') {
    return transactions;
  }

  transactions = transactions.filter((transaction) => {
    const matches = {
      type: (value) => transaction.type === value,
      minAmount: (value) => transaction.amount >= value,
      maxAmount: (value) => transaction.amount <= value,
      senderId: (value) => transaction.senderId === value,
      recipientId: (value) => transaction.recipientId === value,
      senderPublicKey: (value) => transaction.senderPublicKey === value,
      recipientPublicKey: (value) => transaction.recipientPublicKey === value,
      fromTimestamp: (value) => transaction.timestamp >= value,
      toTimestamp: (value) => transaction.timestamp <= value,
      types: (value) => value?.includes(transaction.type),
      senderIds: () => value?.includes(transaction.senderId),
      recipientIds: (value) => value?.includes(transaction.recipientId),
      senderPublicKeys: (value) => value?.includes(transaction.senderPublicKey),
      recipientPublicKeys: (value) => value?.includes(transaction.recipientPublicKey),
    };

    const evaluate = (key, value) => {
      const actualKey = key.replace(/^(AND:|OR:)/, "");
      return matches[actualKey]?.(value) || false;
    };

    return Object.entries(filter).reduce((result, [key, value]) => {
      const isAnd = key.startsWith("AND:");
      const condition = evaluate(key, value);
      return isAnd ? result && condition : result || condition;
    }, false);
  });

  return transactions;
}

module.exports = TransactionPool
