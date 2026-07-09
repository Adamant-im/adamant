'use strict';

var bignum = require('../helpers/bignum.js');
var BlockReward = require('../logic/blockReward.js');
var constants = require('../helpers/constants.js');
var crypto = require('crypto');
var extend = require('extend');
var schema = require('../schema/accounts.js');
var sandboxHelper = require('../helpers/sandbox.js');
var transactionTypes = require('../helpers/transactionTypes.js');
var Vote = require('../logic/vote.js');

// Private fields
var modules, library, self, __private = {}, shared = {};

__private.assetTypes = {};
__private.blockReward = new BlockReward();
__private.topDefaultLimit = 100;
__private.topMaxLimit = 100;

/**
 * Parses a bounded integer query parameter.
 * @private
 * @param {object} query - API query parameters.
 * @param {string} field - Field name to parse.
 * @param {number|undefined} defaultValue - Value to use when the field is absent.
 * @param {number} minimum - Inclusive minimum value.
 * @param {number} maximum - Inclusive maximum value.
 * @return {object} Parsed value or an error message.
 */
__private.parseTopInteger = function (query, field, defaultValue, minimum, maximum) {
  var raw = query[field];

  if (raw === undefined) {
    return { value: defaultValue };
  }

  var value = Number(raw);

  if (raw === '' || !Number.isInteger(value)) {
    return { error: 'Invalid ' + field + ': expected an integer value' };
  }
  if (value < minimum) {
    return { error: 'Invalid ' + field + ': value must be at least ' + minimum };
  }
  if (value > maximum) {
    return { error: 'Invalid ' + field + ': value must be at most ' + maximum };
  }

  return { value: value };
};

/**
 * Normalizes `/api/accounts/top` query parameters into explicit database
 * filters and pagination values.
 * @private
 * @param {object} query - API query parameters after schema validation.
 * @return {object} Normalized filter, limit, and offset values or an error message.
 */
__private.normalizeTopQuery = function (query) {
  query = query || {};

  var limit = __private.parseTopInteger(query, 'limit', __private.topDefaultLimit, 0, __private.topMaxLimit);
  var offset = __private.parseTopInteger(query, 'offset', 0, 0, Number.MAX_SAFE_INTEGER);
  var isDelegate = __private.parseTopInteger(query, 'isDelegate', undefined, 0, 1);
  var filter = {};

  if (limit.error) {
    return { error: limit.error };
  }
  if (offset.error) {
    return { error: offset.error };
  }
  if (isDelegate.error) {
    return { error: isDelegate.error };
  }

  // Keep this whitelist explicit so public query parameters cannot become
  // arbitrary `mem_accounts` WHERE predicates.
  if (isDelegate.value === 0 || isDelegate.value === 1) {
    filter.isDelegate = isDelegate.value;
  }

  // Rich-list results and counts should ignore empty accounts.
  filter.balance = { $gt: 0 };

  return {
    filter: filter,
    limit: limit.value,
    offset: offset.value
  };
};

/**
 * Initializes library with scope content and generates a Vote instance.
 * Calls logic.transaction.attachAssetType().
 * @memberof module:accounts
 * @constructor
 * @classdesc Main accounts methods.
 * @implements module:accounts.Account#Vote
 * @param {function} cb - Callback function.
 * @param {scope} scope - App instance.
 * @return {setImmediateCallback} Callback function with `self` as data.
 */
function Accounts (cb, scope) {
  library = {
    ed: scope.ed,
    accounts: scope.accounts,
    schema: scope.schema,
    balancesSequence: scope.balancesSequence,
    logic: {
      account: scope.logic.account,
      transaction: scope.logic.transaction
    }
  };
  self = this;

  __private.assetTypes[transactionTypes.VOTE] = library.logic.transaction.attachAssetType(
      transactionTypes.VOTE,
      new Vote(
          scope.logger,
          scope.schema
      )
  );

  setImmediate(cb, null, self);
}
/**
 * Gets account from publicKey
 * If not exist, generates new account data with public address
 * obtained from secret parameter.
 * @private
 * @param {function} publicKey
 * @param {function} cb - Callback function.
 * @return {setImmediateCallback} As per logic new|current account data object.
 */
__private.newAccount = function (publicKey, cb) {
  self.setAccountAndGet({ publicKey: publicKey }, function (err, account) {
    if (err) {
      return setImmediate(cb, err);
    }

    if (account) {
      if (account.publicKey === null) {
        account.publicKey = publicKey;
      }
      return setImmediate(cb, null, account);
    } else {
      return setImmediate(cb, null, {
        address: self.generateAddressByPublicKey(publicKey),
        u_balance: '0',
        balance: '0',
        publicKey: publicKey,
        u_secondSignature: 0,
        secondSignature: 0,
        secondPublicKey: null,
        multisignatures: null,
        u_multisignatures: null
      });
    }
  });
};

/**
 * Generates address based on public key.
 * @param {publicKey} publicKey - PublicKey.
 * @return {address} Address generated.
 * @throws {string} If address is invalid throws `Invalid public key`.
 */
Accounts.prototype.generateAddressByPublicKey = function (publicKey) {
  var address = library.accounts.getAddressByPublicKey(publicKey);

  if (!address) {
    throw 'Invalid public key: ' + publicKey;
  }

  return address;
};

/**
 * Gets account information, calls logic.account.get().
 * @overload
 * @param {object} filter - Contains publicKey.
 * @param {Array} fields - Fields to get.
 * @param {function} cb - Callback function.
 */

/**
 * Gets account information, calls logic.account.get().
 * @overload
 * @param {object} filter - Contains publicKey.
 * @param {function} cb - Callback function.
 */

/**
 * Gets account information, calls logic.account.get().
 * @implements module:accounts#Account~get
 * @param {object} filter - Contains publicKey.
 * @param {Array | function} fields - Fields to get or callback function.
 * @param {function} [cb] - Callback function.
 */
Accounts.prototype.getAccount = function (filter, fields, cb) {
  if (filter.publicKey) {
    try {
      filter.address = self.generateAddressByPublicKey(filter.publicKey);
    } catch (error) {
      if (typeof fields === 'function') {
        return setImmediate(fields, error);
      }
      return setImmediate(cb, error);
    }
    delete filter.publicKey;
  }

  library.logic.account.get(filter, fields, cb);
};

/**
 * Gets accounts information, calls logic.account.getAll().
 * @implements module:accounts#Account~getAll
 * @param {object} filter - Query conditions and optional pagination/sort controls.
 * @param {object} fields - Account fields to return.
 * @param {function} cb - Callback function.
 * @return {void}
 */
Accounts.prototype.getAccounts = function (filter, fields, cb) {
  library.logic.account.getAll(filter, fields, cb);
};

/**
 * Counts accounts matching filter criteria.
 * @param {object} filter - Query conditions for `mem_accounts`.
 * @param {function} cb - Callback function.
 * @return {void}
 */
Accounts.prototype.countAccounts = function (filter, cb) {
  library.logic.account.count(filter, cb);
};

/**
 * Validates input address and calls logic.account.set() and logic.account.get().
 * @implements module:accounts#Account~set
 * @implements module:accounts#Account~get
 * @param {object} data - Contains address or public key to generate address.
 * @param {function} cb - Callback function.
 * @return {setImmediateCallback} Errors.
 * @return {function()} Call to logic.account.get().
 */
Accounts.prototype.setAccountAndGet = function (data, cb) {
  var address = data.address || null;
  var err;

  if (address === null) {
    if (data.publicKey) {
      address = self.generateAddressByPublicKey(data.publicKey);
    } else {
      err = 'Missing address or public key';
    }
  }

  if (err) {
    if (typeof cb === 'function') {
      return setImmediate(cb, err);
    } else {
      throw err;
    }
  }

  library.logic.account.set(address, data, function (err) {
    if (err) {
      return setImmediate(cb, err);
    }
    return library.logic.account.get({ address: address }, cb);
  });
};

/**
 * Validates input address and calls logic.account.merge().
 * @implements module:accounts#Account~merge
 * @param {object} data - Contains address and public key.
 * @param {function} cb - Callback function.
 * @return {setImmediateCallback} for errors wit address and public key.
 * @return {function} calls to logic.account.merge().
 * @todo improve publicKey validation try/catch
 */
Accounts.prototype.mergeAccountAndGet = function (data, cb) {
  var address = data.address || null;
  var err;

  if (address === null) {
    if (data.publicKey) {
      address = self.generateAddressByPublicKey(data.publicKey);
    } else {
      err = 'Missing address or public key';
    }
  }

  if (err) {
    if (typeof cb === 'function') {
      return setImmediate(cb, err);
    } else {
      throw err;
    }
  }

  return library.logic.account.merge(address, data, cb);
};

/**
 * Calls helpers.sandbox.callMethod().
 * @implements module:helpers#callMethod
 * @param {function} call - Method to call.
 * @param {object} args - List of arguments.
 * @param {function} cb - Callback function.
 * @todo verified function and arguments.
 */
Accounts.prototype.sandboxApi = function (call, args, cb) {
  sandboxHelper.callMethod(shared, call, args, cb);
};

// Events
/**
 * Calls Vote.bind() with scope.
 * @implements module:accounts#Vote~bind
 * @param {modules} scope - Loaded modules.
 */
Accounts.prototype.onBind = function (scope) {
  modules = {
    delegates: scope.delegates,
    accounts: scope.accounts,
    transactions: scope.transactions
  };

  __private.assetTypes[transactionTypes.VOTE].bind(
      scope.delegates,
      scope.rounds
  );
};
/**
 * Checks if modules is loaded.
 * @return {boolean} true if modules is loaded
 */
Accounts.prototype.isLoaded = function () {
  return !!modules;
};

// Shared API
/**
 * @todo implement API comments with apidoc.
 * @see {@link http://apidocjs.com/}
 */
Accounts.prototype.shared = {
  new: function (req, cb) {
    library.schema.validate(req.body, schema.new, function (err) {
      if (err) {
        return setImmediate(cb, err[0].message);
      }

      __private.newAccount(req.body.publicKey, function (err, account) {
        if (!err) {
          var accountData = {
            address: account.address,
            unconfirmedBalance: account.u_balance,
            balance: account.balance,
            publicKey: account.publicKey,
            unconfirmedSignature: account.u_secondSignature,
            secondSignature: account.secondSignature,
            secondPublicKey: account.secondPublicKey,
            multisignatures: account.multisignatures,
            u_multisignatures: account.u_multisignatures
          };

          return setImmediate(cb, null, { account: accountData });
        } else {
          return setImmediate(cb, err);
        }
      });
    });
  },
  getBalance: function (req, cb) {
    library.schema.validate(req.body, schema.getBalance, function (err) {
      if (err) {
        return setImmediate(cb, err[0].message);
      }

      self.getAccount({ address: req.body.address }, function (err, account) {
        if (err) {
          return setImmediate(cb, err);
        }

        var balance = account ? account.balance : '0';
        var unconfirmedBalance = account ? account.u_balance : '0';

        return setImmediate(cb, null, { balance: balance, unconfirmedBalance: unconfirmedBalance });
      });
    });
  },

  getPublickey: function (req, cb) {
    library.schema.validate(req.body, schema.getPublicKey, function (err) {
      if (err) {
        return setImmediate(cb, err[0].message);
      }

      self.getAccount({ address: req.body.address }, function (err, account) {
        if (err) {
          return setImmediate(cb, err);
        }

        if (!account || !account.publicKey) {
          return setImmediate(cb, 'Account not found');
        }

        return setImmediate(cb, null, { publicKey: account.publicKey });
      });
    });
  },

  getDelegates: function (req, cb) {
    library.schema.validate(req.body, schema.getDelegates, function (err) {
      if (err) {
        return setImmediate(cb, err[0].message);
      }

      self.getAccount({ address: req.body.address }, function (err, account) {
        if (err) {
          return setImmediate(cb, err);
        }

        if (!account) {
          return setImmediate(cb, 'Account not found');
        }

        if (account.delegates) {
          modules.delegates.getDelegates(req.body, {}, function (err, res) {
            if (err) {
              return setImmediate(cb, err);
            }

            var delegates = res.delegates.filter(function (delegate) {
              return account.delegates.indexOf(delegate.publicKey) !== -1;
            });

            return setImmediate(cb, null, { delegates: delegates });
          });
        } else {
          return setImmediate(cb, null, { delegates: [] });
        }
      });
    });
  },

  getDelegatesFee: function (req, cb) {
    return setImmediate(cb, null, { fee: constants.fees.delegate });
  },
  voteForDelegates: function (req, cb) {
    const reqBody = typeof req.body?.transaction === 'object' ?
      req.body.transaction : req.body;

    library.schema.validate(reqBody, schema.voteForDelegates, function (err) {
      if (err) {
        return setImmediate(cb, err[0].message);
      }

      var keypair = { publicKey: reqBody.senderPublicKey };

      library.balancesSequence.add(function (cb) {
        self.setAccountAndGet({ publicKey: keypair.publicKey.toString('hex') }, function (err, account) {
          if (err) {
            return setImmediate(cb, err);
          }

          if (!account || !account.publicKey) {
            return setImmediate(cb, 'Account not found');
          }

          if (account.secondSignature && !reqBody.secondSecret) {
            return setImmediate(cb, 'Invalid second passphrase');
          }

          var secondKeypair = null;

          if (account.secondSignature) {
            var secondHash = library.ed.createPassPhraseHash(reqBody.secondSecret);
            secondKeypair = library.ed.makeKeypair(secondHash);
          }

          var transaction = reqBody;

          try {
            transaction = library.logic.transaction.publish(transaction);
          } catch (e) {
            return setImmediate(cb, e.toString());
          }

          modules.transactions.receiveTransactions([transaction], true, cb);
        });
      }, function (err, transaction) {
        if (err) {
          return setImmediate(cb, err);
        }

        return setImmediate(cb, null, { transaction: transaction[0] });
      });
    });
  },
  getAccount: function (req, cb) {
    library.schema.validate(req.body, schema.getAccount, function (err) {
      if (err) {
        return setImmediate(cb, err[0].message);
      }

      if (!req.body.address && !req.body.publicKey) {
        return setImmediate(cb, 'Missing required property: address or publicKey');
      }

      // self.getAccount can accept publicKey as argument, but we also compare here
      // if account publicKey match address (when both are supplied)
      var address = req.body.publicKey ? self.generateAddressByPublicKey(req.body.publicKey) : req.body.address;
      if (req.body.address && req.body.publicKey && address !== req.body.address) {
        return setImmediate(cb, 'Account publicKey does not match address');
      }

      self.getAccount({ address: address }, function (err, account) {
        if (err) {
          return setImmediate(cb, err);
        }

        if (!account) {
          return setImmediate(cb, 'Account not found');
        }
        if (req.body.publicKey && !account.publicKey) {
          account.publicKey = req.body.publicKey;
          library.logic.account.set(account.address, { publicKey: account.publicKey }, function () { });
        }
        return setImmediate(cb, null, {
          account: {
            address: account.address,
            unconfirmedBalance: account.u_balance,
            balance: account.balance,
            publicKey: account.publicKey,
            unconfirmedSignature: account.u_secondSignature,
            secondSignature: account.secondSignature,
            secondPublicKey: account.secondPublicKey,
            multisignatures: account.multisignatures || [],
            u_multisignatures: account.u_multisignatures || []
          }
        });
      });
    });
  }
};

// Internal API
/**
 * @todo implement API comments with apidoc.
 * @see {@link http://apidocjs.com/}
 */
Accounts.prototype.internal = {
  count: function (req, cb) {
    return setImmediate(cb, null, { success: true, count: Object.keys(__private.accounts).length });
  },

  /**
   * Gets richest accounts with bounded pagination and optional filters.
   * @param {object} query - Sanitized API query parameters.
   * @param {function} cb - Callback function.
   * @return {setImmediateCallback} Callback with accounts, count, limit, and offset.
   */
  top: function (query, cb) {
    var normalized = __private.normalizeTopQuery(query);

    if (normalized.error) {
      return setImmediate(cb, normalized.error);
    }

    self.countAccounts(normalized.filter, function (err, count) {
      if (err) {
        return setImmediate(cb, err);
      }

      // `limit=0` lets clients fetch only pagination metadata without relying
      // on an unbounded account query.
      if (normalized.limit === 0) {
        return setImmediate(cb, null, {
          success: true,
          accounts: [],
          count: count,
          limit: normalized.limit,
          offset: normalized.offset
        });
      }

      self.getAccounts(Object.assign({}, normalized.filter, {
        sort: {
          balance: -1,
          // Secondary sort keeps pagination stable when accounts share balance.
          address: 1
        },
        offset: normalized.offset,
        limit: normalized.limit
      }), ['address', 'balance', 'publicKey', 'username', 'isDelegate'], function (err, raw) {
        if (err) {
          return setImmediate(cb, err);
        }

        var accounts = raw.map(function (account) {
          return {
            address: account.address,
            balance: account.balance,
            publicKey: account.publicKey,
            username: account.username,
            isDelegate: account.isDelegate
          };
        });

        return setImmediate(cb, null, {
          success: true,
          accounts: accounts,
          count: count,
          limit: normalized.limit,
          offset: normalized.offset
        });
      });
    });
  },

  getAllAccounts: function (req, cb) {
    return setImmediate(cb, null, { success: true, accounts: __private.accounts });
  }
};

// Export
module.exports = Accounts;
