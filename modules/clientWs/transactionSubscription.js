const ZSchema = require('../../helpers/z_schema');
const {
  MIN_TRANSACTION_TYPE,
  MAX_TRANSACTION_TYPE,
  MIN_CHAT_MESSAGE_TRANSACTION_TYPE,
  MAX_CHAT_MESSAGE_TRANSACTION_TYPE
} = require('../../helpers/tranasctionTypesBoundary');
const transactionTypes = require('../../helpers/transactionTypes');

const validator = new ZSchema({noEmptyStrings: true});

class TransactionSubscription {
  constructor(socket) {
    this.socket = socket;

    /**
     * List of addresses to subscribe to
     * @type {Set<string>}
     */
    this.addresses = new Set();

    /**
     * List of types to subscribe to
     * @see {@link ../../helpers/transaction.js} for the list of available types
     * @type {Set<number>}
     */
    this.types = new Set();

    /**
     * List of asset chat types to subscribe to
     * @type {Set<number>}
     */
    this.assetChatTypes = new Set();
  }

  /**
   * Determines if the transaction matches subscribed addresses and types
   * Skips addresses or types check if not subscribed to any
   * @param {object} transaction - Unconfirmed transaction to check against
   * @returns {boolean}
   */
  impliesTransaction(transaction) {
    if (this.addresses.size) {
      const isSubscribedByAddress =
        this.impliesAddress(transaction.recipientId) ||
        this.impliesAddress(transaction.senderId);

      if (!isSubscribedByAddress) {
        return false;
      }

      if (
        this.types.size === 0 &&
        this.assetChatTypes.size === 0
      ) {
        return true;
      }
    }

    if (
      this.assetChatTypes.size &&
      transaction.type === transactionTypes.CHAT_MESSAGE
    ) {
      return this.impliesTransactionAssetType(transaction.asset.chat.type);
    }

    return this.impliesTransactionType(transaction.type);
  }

  /**
   * Subscribes to the given addresses
   * @param {...Array<string>} addresses - List of addresses to subscribe
   * @returns {boolean} - whether succuessfuly subscribed to at least one address
   */
  subscribeToAddresses(...addresses) {
    let subscribed = false;

    addresses.forEach((address) => {
      const isValidAddress = validator.validate(address, {
        format: 'address'
      });

      if (isValidAddress) {
        this.addresses.add(address.toUpperCase());
        subscribed = true;
      }
    });

    return subscribed;
  }

  /**
   * Subscribes to the given types
   * @see {@link ../../helpers/transaction.js} for the list of available types
   * @param {...Array<number>} types - List of types to subscribe
   * @returns {boolean} - whether succuessfuly subscribed to at least one transaction type
   */
  subscribeToTypes(...types) {
    let subscribed = false;

    types.forEach((type) => {
      if (
        typeof type === 'number' &&
        type >= MIN_TRANSACTION_TYPE &&
        type <= MAX_TRANSACTION_TYPE
      ) {
        this.types.add(type);
        subscribed = true;
      }
    });

    return subscribed;
  }

  /**
   * Subscribes to the given types for `transaction.asset.chat`
   * @param {...Array<number>} assetChatTypes - List of types of `transaction.asset.chat` to subscribe
   * @returns {boolean} - whether succuessfuly subscribed to at least one `transaction.asset.chat` type
   */
  subscribeToAssetChatTypes(...assetChatTypes) {
    let subscribed = false;

    assetChatTypes.forEach((type) => {
      if (
        typeof type === 'number' &&
        type >= MIN_CHAT_MESSAGE_TRANSACTION_TYPE &&
        type <= MAX_CHAT_MESSAGE_TRANSACTION_TYPE
      ) {
        this.assetChatTypes.add(type);
        subscribed = true;
      }
    });

    return subscribed;
  }

  /**
   * Determines if the address is included in the list of subscribed addresses
   * @param {string} address - Address to check
   * @returns {boolean}
   */
  impliesAddress(address) {
    return this.addresses.has(address);
  }

  /**
   * Determines if the type is included in the list of subscribed types
   * @param {number} type - Transaction type to check
   * @returns {boolean}
   */
  impliesTransactionType(type) {
    return this.types.has(type);
  }

  /**
   * Determines if the type is included in the list of subscribed types
   * @param {number} assetType - Transaction type to check
   * @returns {boolean}
   */
  impliesTransactionAssetType(assetType) {
    return this.assetChatTypes.has(assetType);
  }
}

module.exports = TransactionSubscription;
