'use strict';

var async = require('async');
var pgp = require('pg-promise');
var path = require('path');

const knex = require('knex')({
  client: 'pg' // Specify the client to use PostgreSQL syntax
});

var constants = require('../helpers/constants.js');
var slots = require('../helpers/slots.js');

// Private fields
var self, library, __private = {};

/**
 * Main account logic.
 * @memberof module:accounts
 * @constructor
 * @classdesc Main account logic.
 * @param {Database} db
 * @param {ZSchema} schema
 * @param {object} logger
 * @param {ClientWs} [clientWs] - Optional client WebSocket event publisher.
 * @param {function} cb - Callback function.
 * @return {setImmediateCallback} With `this` as data.
 */
function Account (db, schema, logger, clientWs, cb) {
  if (typeof clientWs === 'function') {
    cb = clientWs;
    clientWs = null;
  }

  this.scope = {
    db: db,
    schema: schema,
    clientWs: clientWs
  };

  self = this;
  library = {
    logger: logger
  };

  this.table = 'mem_accounts';
  /**
   * @typedef {object} account
   * @property {string} username - Lowercase, between 1 and 20 chars.
   * @property {boolean} isDelegate
   * @property {boolean} u_isDelegate
   * @property {boolean} secondSignature
   * @property {boolean} u_secondSignature
   * @property {string} u_username
   * @property {address} address - Uppercase, between 1 and 22 chars.
   * @property {publicKey} publicKey
   * @property {publicKey} secondPublicKey
   * @property {number} balance - Between 0 and totalAmount from constants.
   * @property {number} u_balance - Between 0 and totalAmount from constants.
   * @property {number} vote
   * @property {number} rate
   * @property {string[]} delegates - From mem_account2delegates table, filtered by address.
   * @property {string[]} u_delegates - From mem_account2u_delegates table, filtered by address.
   * @property {string[]} multisignatures - From mem_account2multisignatures table, filtered by address.
   * @property {string[]} u_multisignatures - From mem_account2u_multisignatures table, filtered by address.
   * @property {number} multimin - Between 0 and 17.
   * @property {number} u_multimin - Between 0 and 17.
   * @property {number} multilifetime - Between 1 and 72.
   * @property {number} u_multilifetime - Between 1 and 72.
   * @property {string} blockId
   * @property {boolean} nameexist
   * @property {boolean} u_nameexist
   * @property {number} producedblocks - Between -1 and 1.
   * @property {number} missedblocks - Between -1 and 1.
   * @property {number} fees
   * @property {number} rewards
   * @property {boolean} virgin
   */
  this.model = [
    {
      name: 'username',
      type: 'String',
      filter: {
        type: 'string',
        case: 'lower',
        maxLength: 20,
        minLength: 1
      },
      conv: String,
      immutable: true
    },
    {
      name: 'isDelegate',
      type: 'SmallInt',
      filter: {
        type: 'boolean'
      },
      conv: Boolean
    },
    {
      name: 'u_isDelegate',
      type: 'SmallInt',
      filter: {
        type: 'boolean'
      },
      conv: Boolean
    },
    {
      name: 'secondSignature',
      type: 'SmallInt',
      filter: {
        type: 'boolean'
      },
      conv: Boolean
    },
    {
      name: 'u_secondSignature',
      type: 'SmallInt',
      filter: {
        type: 'boolean'
      },
      conv: Boolean
    },
    {
      name: 'u_username',
      type: 'String',
      filter: {
        type: 'string',
        case: 'lower',
        maxLength: 20,
        minLength: 1
      },
      conv: String,
      immutable: true
    },
    {
      name: 'address',
      type: 'String',
      filter: {
        required: true,
        type: 'string',
        case: 'upper',
        minLength: 1,
        maxLength: 22
      },
      conv: String,
      immutable: true,
      expression: 'UPPER("address")'
    },
    {
      name: 'publicKey',
      type: 'Binary',
      filter: {
        type: 'string',
        format: 'publicKey'
      },
      conv: String,
      immutable: true,
      expression: 'ENCODE("publicKey", \'hex\')'
    },
    {
      name: 'secondPublicKey',
      type: 'Binary',
      filter: {
        type: 'string',
        format: 'publicKey'
      },
      conv: String,
      immutable: true,
      expression: 'ENCODE("secondPublicKey", \'hex\')'
    },
    {
      name: 'balance',
      type: 'BigInt',
      filter: {
        required: true,
        type: 'integer',
        minimum: 0,
        maximum: constants.totalAmount
      },
      conv: Number,
      expression: '("balance")::bigint'
    },
    {
      name: 'u_balance',
      type: 'BigInt',
      filter: {
        required: true,
        type: 'integer',
        minimum: 0,
        maximum: constants.totalAMount
      },
      conv: Number,
      expression: '("u_balance")::bigint'
    },
    {
      name: 'vote',
      type: 'BigInt',
      filter: {
        type: 'integer'
      },
      conv: Number,
      expression: '("vote")::bigint'
    },
    {
      name: 'votesWeight',
      type: 'BigInt',
      filter: {
        type: 'integer'
      },
      conv: Number,
      expression: '("votesWeight")::bigint'
    },
    {
      name: 'rate',
      type: 'BigInt',
      filter: {
        type: 'integer'
      },
      conv: Number,
      expression: '("rate")::bigint'
    },
    {
      name: 'delegates',
      type: 'Text',
      filter: {
        type: 'array',
        uniqueItems: true
      },
      conv: Array,
      expression: '(SELECT ARRAY_AGG("dependentId") FROM ' + this.table + '2delegates WHERE "accountId" = a."address")'
    },
    {
      name: 'u_delegates',
      type: 'Text',
      filter: {
        type: 'array',
        uniqueItems: true
      },
      conv: Array,
      expression: '(SELECT ARRAY_AGG("dependentId") FROM ' + this.table + '2u_delegates WHERE "accountId" = a."address")'
    },
    {
      name: 'multisignatures',
      type: 'Text',
      filter: {
        type: 'array',
        uniqueItems: true
      },
      conv: Array,
      expression: '(SELECT ARRAY_AGG("dependentId") FROM ' + this.table + '2multisignatures WHERE "accountId" = a."address")'
    },
    {
      name: 'u_multisignatures',
      type: 'Text',
      filter: {
        type: 'array',
        uniqueItems: true
      },
      conv: Array,
      expression: '(SELECT ARRAY_AGG("dependentId") FROM ' + this.table + '2u_multisignatures WHERE "accountId" = a."address")'
    },
    {
      name: 'multimin',
      type: 'SmallInt',
      filter: {
        type: 'integer',
        minimum: 0,
        maximum: 17
      },
      conv: Number
    },
    {
      name: 'u_multimin',
      type: 'SmallInt',
      filter: {
        type: 'integer',
        minimum: 0,
        maximum: 17
      },
      conv: Number
    },
    {
      name: 'multilifetime',
      type: 'SmallInt',
      filter: {
        type: 'integer',
        minimum: 1,
        maximum: 72
      },
      conv: Number
    },
    {
      name: 'u_multilifetime',
      type: 'SmallInt',
      filter: {
        type: 'integer',
        minimum: 1,
        maximum: 72
      },
      conv: Number
    },
    {
      name: 'blockId',
      type: 'String',
      filter: {
        type: 'string',
        minLength: 1,
        maxLength: 20
      },
      conv: String
    },
    {
      name: 'nameexist',
      type: 'SmallInt',
      filter: {
        type: 'boolean'
      },
      conv: Boolean
    },
    {
      name: 'u_nameexist',
      type: 'SmallInt',
      filter: {
        type: 'boolean'
      },
      conv: Boolean
    },
    {
      name: 'producedblocks',
      type: 'Number',
      filter: {
        type: 'integer',
        minimum: -1,
        maximum: 1
      },
      conv: Number
    },
    {
      name: 'missedblocks',
      type: 'Number',
      filter: {
        type: 'integer',
        minimum: -1,
        maximum: 1
      },
      conv: Number
    },
    {
      name: 'fees',
      type: 'BigInt',
      filter: {
        type: 'integer'
      },
      conv: Number,
      expression: '("fees")::bigint'
    },
    {
      name: 'rewards',
      type: 'BigInt',
      filter: {
        type: 'integer'
      },
      conv: Number,
      expression: '("rewards")::bigint'
    },
    {
      name: 'virgin',
      type: 'SmallInt',
      filter: {
        type: 'boolean'
      },
      conv: Boolean,
      immutable: true
    }
  ];

  // Obtains fields from model
  this.fields = this.model.map(function (field) {
    var _tmp = {};

    if (field.expression) {
      _tmp.expression = field.expression;
    } else {
      if (field.mod) {
        _tmp.expression = field.mod;
      }
      _tmp.field = field.name;
    }
    if (_tmp.expression || field.alias) {
      _tmp.alias = field.alias || field.name;
    }

    return _tmp;
  });

  // Obtains binary fields from model
  this.binary = [];
  this.model.forEach(function (field) {
    if (field.type === 'Binary') {
      this.binary.push(field.name);
    }
  }.bind(this));

  // Obtains filters from model
  this.filter = {};
  this.model.forEach(function (field) {
    this.filter[field.name] = field.filter;
  }.bind(this));

  // Obtains conv from model
  this.conv = {};
  this.model.forEach(function (field) {
    this.conv[field.name] = field.conv;
  }.bind(this));

  // Obtains editable fields from model
  this.editable = [];
  this.model.forEach(function (field) {
    if (!field.immutable) {
      this.editable.push(field.name);
    }
  }.bind(this));

  return setImmediate(cb, null, this);
}

/**
 * Applies the account address filter to a knex query and removes it from the
 * remaining generic filter object.
 * @private
 * @param {object} query - Knex query builder for the `mem_accounts` table.
 * @param {object} filter - Mutable account filter object.
 * @return {object} The query builder with address conditions applied.
 */
__private.applyAddressFilter = function (query, filter) {
  if (typeof filter.address === 'string') {
    query = query.whereRaw('upper("address") = ?', [filter.address.toUpperCase()]);
  } else if (filter.address && Array.isArray(filter.address.$in)) {
    var addresses = filter.address.$in.map(function (address) {
      return String(address).toUpperCase();
    });

    if (addresses.length) {
      query = query.whereIn(knex.raw('upper("address")'), addresses);
    } else {
      query = query.whereRaw('1 = 0');
    }
  }
  delete filter.address;

  return query;
};

/**
 * Applies supported comparison filters that cannot be expressed through a
 * plain object equality predicate.
 * @private
 * @param {object} query - Knex query builder for the `mem_accounts` table.
 * @param {object} filter - Mutable account filter object.
 * @return {object} The query builder with range conditions applied.
 */
__private.applyRangeFilters = function (query, filter) {
  if (filter.balance && typeof filter.balance === 'object' && filter.balance.$gt !== undefined) {
    query = query.where('balance', '>', filter.balance.$gt);
    delete filter.balance;
  }

  return query;
};

/**
 * Removes pagination and sorting controls before passing filters to `where()`.
 * @private
 * @param {object} filter - Mutable account filter object.
 * @return {void}
 */
__private.stripQueryControls = function (filter) {
  delete filter.limit;
  delete filter.offset;
  delete filter.sort;
};

/**
 * Creates memory tables related to accounts:
 * - mem_accounts
 * - mem_round
 * - mem_accounts2delegates
 * - mem_accounts2u_delegates
 * - mem_accounts2multisignatures
 * - mem_accounts2u_multisignatures
 * @param {function} cb - Callback function.
 * @return {setImmediateCallback} cb|error.
 */
Account.prototype.createTables = function (cb) {
  const filename = path.join(process.cwd(), 'sql', 'memoryTables.sql');
  var sql = new pgp.QueryFile(filename, { minify: true });

  this.scope.db.query(sql).then(function () {
    return setImmediate(cb);
  }).catch(function (err) {
    library.logger.error('accounts', `An error occurred while trying to create memory tables from ${filename}: ${err?.message || err}.`, err.stack);
    return setImmediate(cb, 'Account#createTables error');
  });
};

/**
 * Deletes the contents of these tables:
 * - mem_round
 * - mem_accounts2delegates
 * - mem_accounts2u_delegates
 * - mem_accounts2multisignatures
 * - mem_accounts2u_multisignatures
 * @param {function} cb - Callback function.
 * @return {setImmediateCallback} cb|error.
 */
Account.prototype.removeTables = function (cb) {
  var sqles = [];

  [this.table,
    'mem_round',
    'mem_accounts2delegates',
    'mem_accounts2u_delegates',
    'mem_accounts2multisignatures',
    'mem_accounts2u_multisignatures'].forEach(function (table) {
    const sql = knex(table).del().toString() + ';';
    sqles.push(sql);
  });

  this.scope.db.query(sqles.join('')).then(function () {
    return setImmediate(cb);
  }).catch(function (err) {
    library.logger.error('accounts', `An error occurred while trying to delete memory tables: ${err?.message || err}.`, err.stack);
    return setImmediate(cb, 'Account#removeTables error');
  });
};

/**
 * Validates account schema.
 * @param {account} account
 * @return {err|account} Error message or input parameter account.
 * @throws {string} If schema.validate fails, throws 'Failed to validate account schema'.
 */
Account.prototype.objectNormalize = function (account) {
  var report = this.scope.schema.validate(account, {
    id: 'Account',
    object: true,
    properties: this.filter
  });

  if (!report) {
    throw 'Failed to validate account schema: ' + this.scope.schema.getLastErrors().map(function (err) {
      return err.message;
    }).join(', ');
  }

  return account;
};

/**
 * Checks type, length and format from publicKey.
 * @param {publicKey} publicKey
 * @throws {string} throws one error for every check.
 */
Account.prototype.verifyPublicKey = function (publicKey) {
  if (publicKey !== undefined) {
    // Check type
    if (typeof publicKey !== 'string') {
      throw 'Invalid public key, must be a string';
    }
    // Check length
    if (publicKey.length < 64) {
      throw 'Invalid public key, must be 64 characters long';
    }
    // Check format
    if (!/^[0-9A-Fa-f]+$/.test(publicKey)) {
      throw 'Invalid public key, must be a hex string';
    }
  }
};

/**
 * Normalizes address and creates binary buffers to insert.
 * @param {object} raw - with address and public key.
 * @return {object} Normalized address.
 */
Account.prototype.toDB = function (raw) {
  const values = {};

  this.binary.forEach(function (field) {
    if (raw[field]) {
      values[field] = Buffer.from(raw[field], 'hex');
      raw[field] = knex.raw(`$(${field})`);
    }
  });

  // Normalize address
  raw.address = String(raw.address).toUpperCase();

  return { raw: raw, values: values };
};

/**
 * Gets account information for specified fields and filter criteria.
 * @param {object} filter - Contains address.
 * @param {Object|function} fields - Table fields.
 * @param {function} cb - Callback function.
 * @return {setImmediateCallback} Returns null or Object with database data.
 */
Account.prototype.get = function (filter, fields, cb) {
  if (typeof(fields) === 'function') {
    cb = fields;
    fields = this.fields.map(function (field) {
      return field.alias || field.field;
    });
  }

  this.getAll(filter, fields, function (err, data) {
    return setImmediate(cb, err, data && data.length ? data[0] : null);
  });
};

/**
 * Gets accounts information from mem_accounts.
 * @param {object} filter - Query conditions and optional pagination/sort controls.
 * @param {object|function} fields - Table fields or callback function.
 * @param {function} cb - Callback function.
 * @return {setImmediateCallback} data with rows | 'Account#getAll error'.
 */
Account.prototype.getAll = function (filter, fields, cb) {
  filter = Object.assign({}, filter);

  if (typeof(fields) === 'function') {
    cb = fields;
    fields = this.fields.map(function (field) {
      return field.alias || field.field;
    });
  }

  var realFields = this.fields
      .filter(function (field) {
        return fields.indexOf(field.alias || field.field) !== -1;
      })
      .map(function (field) {
        if (field.expression) {
          return knex.raw(`${field.expression} as "${field.alias || field.name}"`);
        }
        if (field.alias) {
          return `${field.field} as ${field.alias}`;
        }
        return field.field;
      });

  // todo: what does it do?
  var realConv = {};
  Object.keys(this.conv).forEach(function (key) {
    if (fields.indexOf(key) !== -1) {
      realConv[key] = this.conv[key];
    }
  }.bind(this));

  let query = knex({ a: this.table }).select(realFields);

  query = __private.applyAddressFilter(query, filter);
  query = __private.applyRangeFilters(query, filter);

  if (filter.limit > 0) {
    query = query.limit(filter.limit);
  }

  if (filter.offset > 0) {
    query = query.offset(filter.offset);
  }

  if (filter.sort) {
    const sort = Object.entries(filter.sort).map(([column, sort]) => ({
      column,
      order: sort === 1 ? 'asc' : 'desc'
    }));

    query = query.orderBy(sort);
  }

  __private.stripQueryControls(filter);

  query = query.where(filter);

  this.scope.db.query(query.toString() + ';').then(function (rows) {
    return setImmediate(cb, null, rows);
  }).catch(function (err) {
    library.logger.error('accounts', `An error occurred while trying to query mem_accounts table: ${err?.message || err}.`, err.stack);
    return setImmediate(cb, 'Account#getAll error');
  });
};

/**
 * Counts accounts matching filter criteria.
 * @param {object} filter - Query conditions for `mem_accounts`.
 * @param {function} cb - Callback function.
 * @return {setImmediateCallback} Callback with the matching account count or 'Account#count error'.
 */
Account.prototype.count = function (filter, cb) {
  filter = Object.assign({}, filter);

  let query = knex({ a: this.table }).count('* as count');
  query = __private.applyAddressFilter(query, filter);
  query = __private.applyRangeFilters(query, filter);
  __private.stripQueryControls(filter);
  query = query.where(filter);

  this.scope.db.query(query.toString() + ';').then(function (rows) {
    return setImmediate(cb, null, Number(rows[0].count));
  }).catch(function (err) {
    library.logger.error('accounts', `An error occurred while trying to count mem_accounts rows: ${err?.message || err}.`, err.stack);
    return setImmediate(cb, 'Account#count error');
  });
};

/**
 * Sets fields for specific address in mem_accounts table.
 * @param {address} address
 * @param {object} rawFields
 * @param {function} cb - Callback function.
 * @return {setImmediateCallback} cb | 'Account#set error'.
 */
Account.prototype.set = function (address, rawFields, cb) {
  // Verify public key
  this.verifyPublicKey(rawFields.publicKey);

  // Normalize address
  address = String(address).toUpperCase();
  rawFields.address = address;

  const fields = this.toDB(rawFields);
  const query = knex(this.table)
      .insert(fields.raw)
      .onConflict('address')
      .merge(fields.raw)
      .toString() + ';';

  this.scope.db.none(query, fields.values).then(function () {
    return setImmediate(cb);
  }).catch(function (err) {
    library.logger.error('accounts', `An error occurred while trying to set fields for the mem_accounts table: ${err?.message || err}.`, err.stack);
    return setImmediate(cb, 'Account#set error');
  });
};

/**
 * Updates account from mem_account with diff data belonging to an editable field.
 * Inserts into mem_round "address", "amount", "delegate", "blockId", "round"
 * based on field balance or delegates.
 * @param {address} address
 * @param {object} diff - Must contains only mem_account editable fields.
 * @param {function} cb - Callback function.
 * @return {setImmediateCallback|cb|done} Multiple returns: done() or error.
 */
Account.prototype.merge = function (address, diff, cb) {
  var update = {}, remove = {}, insert = {}, insert_object = {}, remove_object = {}, round = [];
  var account = this;

  // Verify public key
  this.verifyPublicKey(diff.publicKey);

  // Normalize address
  address = String(address).toUpperCase();

  for (const value of this.editable) {
    var val, i;

    if (diff[value] !== undefined) {
      var trueValue = diff[value];
      switch (self.conv[value]) {
        case String:
          update[value] = trueValue;
          break;
        case Number:
          if (isNaN(trueValue) || trueValue === Infinity) {
            const error = new Error(`Encountered unsafe number: ${trueValue}`);
            library.logger.error('accounts', `${error.message}; While trying to merge: ${JSON.stringify(diff)}`, error.stack);
            return setImmediate(cb, error.message);
          } else if (Math.abs(trueValue) === trueValue && trueValue !== 0) {
            update[value] = knex.raw('?? + ?', [value, Math.floor(trueValue)]);

            if (value === 'balance') {
              round.push({
                query: 'INSERT INTO mem_round ("address", "amount", "delegate", "blockId", "round") SELECT ${address}, (${amount})::bigint, "dependentId", ${blockId}, ${round} FROM mem_accounts2delegates WHERE "accountId" = ${address};',
                values: {
                  address: address,
                  amount: trueValue,
                  blockId: diff.blockId,
                  round: diff.round
                }
              });
            }
          } else if (trueValue < 0) {
            update[value] = knex.raw('?? - ?', [value, Math.floor(Math.abs(trueValue))]);

            // If decrementing u_balance on account
            if (update.u_balance) {
              // Remove virginity and ensure marked columns become immutable
              update.virgin = 0;
            }
            if (value === 'balance') {
              round.push({
                query: 'INSERT INTO mem_round ("address", "amount", "delegate", "blockId", "round") SELECT ${address}, ${amount}::bigint, "dependentId", ${blockId}, ${round} FROM mem_accounts2delegates WHERE "accountId" = ${address};',
                values: {
                  address: address,
                  amount: trueValue,
                  blockId: diff.blockId,
                  round: diff.round
                }
              });
            }
          }
          break;
        case Array:
          if (Object.prototype.toString.call(trueValue[0]) === '[object Object]') {
            for (i = 0; i < trueValue.length; i++) {
              val = trueValue[i];
              if (val.action === '-') {
                delete val.action;
                remove_object[value] = remove_object[value] || [];
                remove_object[value].push(val);
              } else if (val.action === '+') {
                delete val.action;
                insert_object[value] = insert_object[value] || [];
                insert_object[value].push(val);
              } else {
                delete val.action;
                insert_object[value] = insert_object[value] || [];
                insert_object[value].push(val);
              }
            }
          } else {
            for (i = 0; i < trueValue.length; i++) {
              var math = trueValue[i][0];
              val = null;
              if (math === '-') {
                val = trueValue[i].slice(1);
                remove[value] = remove[value] || [];
                remove[value].push(val);
                if (value === 'delegates') {
                  round.push({
                    query: 'INSERT INTO mem_round ("address", "amount", "delegate", "blockId", "round") SELECT ${address}, (-balance)::bigint, ${delegate}, ${blockId}, ${round} FROM mem_accounts WHERE address = ${address};',
                    values: {
                      address: address,
                      delegate: val,
                      blockId: diff.blockId,
                      round: diff.round
                    }
                  });
                }
              } else if (math === '+') {
                val = trueValue[i].slice(1);
                insert[value] = insert[value] || [];
                insert[value].push(val);
                if (value === 'delegates') {
                  round.push({
                    query: 'INSERT INTO mem_round ("address", "amount", "delegate", "blockId", "round") SELECT ${address}, (balance)::bigint, ${delegate}, ${blockId}, ${round} FROM mem_accounts WHERE address = ${address};',
                    values: {
                      address: address,
                      delegate: val,
                      blockId: diff.blockId,
                      round: diff.round
                    }
                  });
                }
              } else {
                val = trueValue[i];
                insert[value] = insert[value] || [];
                insert[value].push(val);
                if (value === 'delegates') {
                  round.push({
                    query: 'INSERT INTO mem_round ("address", "amount", "delegate", "blockId", "round") SELECT ${address}, (balance)::bigint, ${delegate}, ${blockId}, ${round} FROM mem_accounts WHERE address = ${address};',
                    values: {
                      address: address,
                      delegate: val,
                      blockId: diff.blockId,
                      round: diff.round
                    }
                  });
                }
              }
            }
          }
          break;
      }
    }
  }

  var sqles = [];

  if (Object.keys(remove).length) {
    Object.keys(remove).forEach(function (el) {
      const sql = knex(self.table + '2' + el)
          .whereIn('dependentId', remove[el])
          .andWhere('accountId', address)
          .del()
          .toString() + ';';

      sqles.push(sql);
    });
  }

  if (Object.keys(insert).length) {
    Object.keys(insert).forEach(function (el) {
      for (var i = 0; i < insert[el].length; i++) {
        const sql = knex(self.table + '2' + el)
            .insert({
              accountId: address,
              dependentId: insert[el][i]
            })
            .toString() + ';';

        sqles.push(sql);
      }
    });
  }

  if (Object.keys(remove_object).length) {
    Object.keys(remove_object).forEach(function (el) {
      remove_object[el].accountId = address;

      const sql = knex(self.table + '2' + el);

      remove_object[el].forEach(function (item) {
        sql.where(item);
      });

      sqles.push(sql.del().toString() + ';');
    });
  }

  if (Object.keys(insert_object).length) {
    Object.keys(insert_object).forEach(function (el) {
      insert_object[el].accountId = address;
      for (var i = 0; i < insert_object[el].length; i++) {
        const sql = knex(self.table + '2' + el)
            .insert(insert_object[el])
            .toString() + ';';

        sqles.push(sql);
      }
    });
  }

  if (Object.keys(update).length) {
    const sql = knex(this.table)
        .update(update)
        .where({ address: address })
        .toString() + ';';

    sqles.push(sql);
  }

  function done (err) {
    if (cb.length !== 2) {
      return setImmediate(cb, err);
    } else {
      if (err) {
        return setImmediate(cb, err);
      }
      self.get({ address: address }, cb);
    }
  }

  var queries = sqles.concat(round).map(function (sql) {
    if (typeof sql === 'string') {
      return sql;
    }

    return pgp.as.format(sql.query, sql.values);
  }).join('');

  if (!cb) {
    return queries;
  }

  if (queries.length === 0) {
    return done();
  }

  this.scope.db.none(queries).then(function () {
    const changedBalanceFields = ['balance', 'u_balance'].filter(function (field) {
      return Object.prototype.hasOwnProperty.call(update, field);
    });

    if (changedBalanceFields.length && account.scope.clientWs) {
      try {
        account.scope.clientWs.emitBalanceChange(
            address,
            changedBalanceFields,
            account.get.bind(account, { address: address }, ['address', 'balance', 'u_balance'])
        );
      } catch (err) {
        library.logger.debug(
            'ws-client-server',
            `Unable to publish balance change for ${address}: ${err?.message || err}`,
            err?.stack
        );
      }
    }

    return done();
  }).catch(function (err) {
    library.logger.error('account', `An error occurred while trying to merge account data: ${err?.message || err}`, err.stack);
    return done('Account#merge error');
  });
};

/**
 * Removes an account from mem_account table based on address.
 * @param {address} address
 * @param {function} cb - Callback function.
 * @return {setImmediateCallback} Data with address | Account#remove error.
 */
Account.prototype.remove = function (address, cb) {
  const sql = knex(this.table)
      .where({ address: address })
      .del()
      .toString() + ';';

  this.scope.db.none(sql).then(function () {
    return setImmediate(cb, null, address);
  }).catch(function (err) {
    library.logger.error('account', `An error occurred while trying to remove an account: ${err?.message || err}`, err.stack);
    return setImmediate(cb, 'Account#remove error');
  });
};

// Export
module.exports = Account;
