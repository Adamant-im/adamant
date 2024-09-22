const ZSchema = require("../../helpers/z_schema");
const {
  MIN_TRANSACTION_TYPE,
  MAX_TRANSACTION_TYPE,
} = require("../../helpers/tranasctionTypesBoundary");

const validator = new ZSchema({noEmptyStrings: true});

class TransactionSubscription {
  constructor() {
    /**
     * @type {Set<string>}
     */
    this.addresses = new Set();

    /**
     * @type {Set<number>}
     */
    this.types = new Set();
  }

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

  impliesAddress(address) {
    return this.addresses.has(address);
  }

  impliesTransactionType(type) {
    return this.types.has(type);
  }
}

module.exports = TransactionSubscription;
