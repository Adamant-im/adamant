const ZSchema = require("../../helpers/z_schema");
const {
  MIN_TRANSACTION_TYPE,
  MAX_TRANSACTION_TYPE,
} = require("../../helpers/tranasctionTypesBoundary");

const validator = new ZSchema({noEmptyStrings: true});

class TransactionSubscription {
  constructor() {
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

      if (this.types.size === 0) {
        return true;
      }
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
}

module.exports = TransactionSubscription;
