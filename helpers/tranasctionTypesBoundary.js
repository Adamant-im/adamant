const TransactionTypes = require('./transactionTypes');

/**
 * List of transaction types excluding chat message types
 */
const transactionValues = Object
  .values(TransactionTypes)
  .filter((type) => typeof type === 'number');

/**
 * List of chat message transaction types
 */
const transactionChatAssetValues = Object.values(TransactionTypes.CHAT_MESSAGE_TYPES);

exports.MIN_TRANSACTION_TYPE = Math.min(...transactionValues);
exports.MAX_TRANSACTION_TYPE = Math.max(...transactionValues);

exports.MIN_CHAT_MESSAGE_TRANSACTION_TYPE = Math.min(...transactionChatAssetValues);
exports.MAX_CHAT_MESSAGE_TRANSACTION_TYPE = Math.max(...transactionChatAssetValues);
