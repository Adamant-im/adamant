const TransactionTypes = require('./transactionTypes');

/**
 * List of transaction types excluding chat message types
 */
const transactionValues = Object
  .values(TransactionTypes)
  .filter((type) => typeof type === 'number');

exports.MIN_TRANSACTION_TYPE = Math.min(...transactionValues);
exports.MAX_TRANSACTION_TYPE = Math.max(...transactionValues);
