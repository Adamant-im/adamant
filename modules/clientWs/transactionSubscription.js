const ZSchema = require('../../helpers/z_schema');
const {
  MIN_TRANSACTION_TYPE,
  MAX_TRANSACTION_TYPE,
  MIN_CHAT_MESSAGE_TRANSACTION_TYPE,
  MAX_CHAT_MESSAGE_TRANSACTION_TYPE
} = require('../../helpers/transactionTypesBoundary');
const transactionTypes = require('../../helpers/transactionTypes');

const validator = new ZSchema({ noEmptyStrings: true });
const BALANCE_FIELDS = new Set(['balance', 'unconfirmedBalance']);

class TransactionSubscription {
  constructor (socket) {
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

    /**
     * Public account balance fields to include in change events
     * @type {Set<string>}
     */
    this.balanceFields = new Set();

    /**
     * Whether the socket receives new block headers
     * @type {boolean}
     */
    this.blocks = false;
  }

  /**
   * Determines if the transaction matches subscribed addresses and types
   * Skips addresses or types check if not subscribed to any
   * @param {object} transaction - Unconfirmed transaction to check against
   * @return {boolean}
   */
  impliesTransaction (transaction) {
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
   * @param {...string} addresses - Addresses to subscribe to
   * @return {boolean} - whether successfully subscribed to at least one address
   */
  subscribeToAddresses (...addresses) {
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
   * @param {...number} types - Transaction types to subscribe to
   * @return {boolean} - whether successfully subscribed to at least one transaction type
   */
  subscribeToTypes (...types) {
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
   * @param {...number} assetChatTypes - Types of `transaction.asset.chat` to subscribe to
   * @return {boolean} - whether successfully subscribed to at least one `transaction.asset.chat` type
   */
  subscribeToAssetChatTypes (...assetChatTypes) {
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
   * Subscribes to supported public account balance fields.
   * @param {...string} fields - Public account fields to subscribe to
   * @return {boolean} Whether at least one supported field was subscribed
   */
  subscribeToBalances (...fields) {
    let subscribed = false;

    fields.forEach((field) => {
      if (BALANCE_FIELDS.has(field)) {
        this.balanceFields.add(field);
        subscribed = true;
      }
    });

    return subscribed;
  }

  /**
   * Enables or disables new block events for this socket.
   * @param {boolean} enabled - Desired block subscription state
   * @return {boolean} Whether the supplied state was valid
   */
  subscribeToBlocks (enabled) {
    if (typeof enabled !== 'boolean') {
      return false;
    }

    this.blocks = enabled;
    return true;
  }

  /**
   * Checks whether this socket has any active client WebSocket subscription.
   * @return {boolean} Whether at least one subscription is active
   */
  hasSubscriptions () {
    return this.addresses.size > 0 ||
      this.types.size > 0 ||
      this.assetChatTypes.size > 0 ||
      this.balanceFields.size > 0 ||
      this.blocks;
  }

  /**
   * Determines if the address is included in the list of subscribed addresses
   * @param {string} address - Address to check
   * @return {boolean}
   */
  impliesAddress (address) {
    return this.addresses.has(address);
  }

  /**
   * Determines if the type is included in the list of subscribed types
   * @param {number} type - Transaction type to check
   * @return {boolean}
   */
  impliesTransactionType (type) {
    return this.types.has(type);
  }

  /**
   * Determines if the type is included in the list of subscribed types
   * @param {number} assetType - Transaction type to check
   * @return {boolean}
   */
  impliesTransactionAssetType (assetType) {
    return this.assetChatTypes.has(assetType);
  }
}

module.exports = TransactionSubscription;
