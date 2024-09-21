const TransactionTypes = require('./transactionTypes');

const transactionValues = Object
  .values(TransactionTypes)
  .filter((type) => typeof type === 'number');

exports.MIN_TRANSACTION_TYPE = Math.min(...transactionValues);
exports.MAX_TRANSACTION_TYPE = Math.max(...transactionValues);
