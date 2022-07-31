'use strict';

var async = require('async');
var extend = require('extend');
var knex = require('knex')({
  client: 'pg'
});

var sandboxHelper = require('../helpers/sandbox.js');

// Private fields
var library, self, __private = {}, shared = {};

__private.loaded = false;
__private.SINGLE_QUOTES = /'/g;
__private.SINGLE_QUOTES_DOUBLED = '\'\'';
__private.DOUBLE_QUOTES = /"/g;
__private.DOUBLE_QUOTES_DOUBLED = '""';

/**
 * Initializes library with scope content.
 * @class
 * @classdesc Main Sql methods.
 * @param {setImmediateCallback} cb - Callback function.
 * @param {scope} scope - App instance.
 */
// Constructor
function Sql (cb, scope) {
  library = {
    logger: scope.logger,
    db: scope.db
  };
  self = this;

  setImmediate(cb, null, self);
}

// Private methods
/**
 * Adds scape values based on input type.
 * @private
 * @param {*} what
 * @return {string}
 * @throws {string} Unsupported data (with type)
 */
__private.escape = function (what) {
  switch (typeof what) {
    case 'string':
      return '\'' + what.replace(
          __private.SINGLE_QUOTES, __private.SINGLE_QUOTES_DOUBLED
      ) + '\'';
    case 'object':
      if (what == null) {
        return 'null';
      } else if (Buffer.isBuffer(what)) {
        return 'X\'' + what.toString('hex') + '\'';
      } else {
        return ('\'' + JSON.stringify(what).replace(
            __private.SINGLE_QUOTES, __private.SINGLE_QUOTES_DOUBLED
        ) + '\'');
      }
      break;
    case 'boolean':
      return what ? '1' : '0'; // 1 => true, 0 => false
    case 'number':
      if (isFinite(what)) { return '' + what; }
  }
  throw 'Unsupported data ' + typeof what;
};

/**
 * Adds double quotes to input string.
 * @private
 * @param {string} str
 * @return {string}
 */
__private.escape2 = function (str) {
  return '"' + str.replace(__private.DOUBLE_QUOTES, __private.DOUBLE_QUOTES_DOUBLED) + '"';
};

/**
 * @private
 * @param {Object} obj
 * @param {string} dappid
 */
__private.pass = function (obj, dappid) {
  for (var property in obj) {
    if (typeof obj[property] === 'object') {
      __private.pass(obj[property], dappid);
    }
    if (property === 'table') {
      obj[property] = 'dapp_' + dappid + '_' + obj[property];
    }
    if (property === 'join' && obj[property].length === undefined) {
      for (var table in obj[property]) {
        var tmp = obj[property][table];
        delete obj[property][table];
        obj[property]['dapp_' + dappid + '_' + table] = tmp;
      }
    }
    if (property === 'on' && !obj.alias) {
      for (var firstTable in obj[property]) {
        var secondTable = obj[property][firstTable];
        delete obj[property][firstTable];

        var firstTableRaw = firstTable.split('.');
        firstTable = 'dapp_' + dappid + '_' + firstTableRaw[0];

        var secondTableRaw = secondTable.split('.');
        secondTable = 'dapp_' + dappid + '_' + secondTableRaw[0];

        obj[property][firstTable] = secondTable;
      }
    }
  }
};

/**
 * Creates sql query to dapps
 * @implements {jsonSql.build}
 * @implements {library.db.query}
 * @implements {async.until}
 * @param {string} action - should be `batch` or sql query
 * @param {Object} config
 * @param {function} cb
 * @return {setImmediateCallback} cb, err, data
 */
__private.query = function (action, config, cb) {
  var sql = null;

  function done (err, data) {
    if (err) {
      err = err;
    }

    return setImmediate(cb, err, data);
  }

  if (action !== 'batch') {
    const sql = action;

    library.logger.trace('sql.query:', sql);

    library.db.query(sql).then(function (rows) {
      return done(null, rows);
    }).catch(function (err) {
      library.logger.error(err.stack);
      return done('Sql#query error');
    });
  } else {
    var batchPack = [];
    async.until(
        function (testCb) {
          batchPack = config.values.splice(0, 10);
          return testCb(null, batchPack.length === 0);
        }, function (cb) {
          var fields = Object.keys(config.fields).map(function (field) {
            return __private.escape2(config.fields[field]); // Add double quotes to field identifiers
          });
          sql = 'INSERT INTO ' + 'dapp_' + config.dappid + '_' + config.table + ' (' + fields.join(',') + ') ';
          var rows = [];
          batchPack.forEach(function (value, rowIndex) {
            var currentRow = batchPack[rowIndex];
            var fields = [];
            for (var i = 0; i < currentRow.length; i++) {
              fields.push(__private.escape(currentRow[i]));
            }
            rows.push('SELECT ' + fields.join(','));
          });
          sql = sql + ' ' + rows.join(' UNION ');
          library.db.none(sql).then(function () {
            return setImmediate(cb);
          }).catch(function (err) {
            library.logger.error(err.stack);
            return setImmediate(cb, 'Sql#query error');
          });
        }, done);
  }
};

// Public methods
/**
 * Creates sql sentences to dapp_ tables based on config param and runs them.
 * @implements {jsonSql.build}
 * @implements {async.eachSeries}
 * @implements {library.db.none}
 * @param {string} dappid
 * @param {Object} config
 * @param {function} cb
 * @return {setImmediateCallback} err message | cb
 */
Sql.prototype.createTables = function (dappid, config, cb) {
  if (!config) {
    return setImmediate(cb, 'Invalid table format');
  }

  var sqles = [];
  for (var i = 0; i < config.length; i++) {
    config[i].table = 'dapp_' + dappid + '_' + config[i].table;

    let sql;

    if (config[i].type === 'table') {
      config[i].type = 'create';
      if (config[i].foreignKeys) {
        for (var n = 0; n < config[i].foreignKeys.length; n++) {
          config[i].foreignKeys[n].table = 'dapp_' + dappid + '_' + config[i].foreignKeys[n].table;
        }
      }

      try {
        sql = knex.schema.createTableIfNotExists('user', function (table) {
          for (let j = 0; j < config[i].tableFields.length; j++) {
            const field = config[i].tableFields[j];

            table[field.type](field.name);
          }
        }).toString();
      } catch (err) {
        return setImmediate(cb, 'An error occurred while creating table: ' + err);
      }
    } else if (config[i].type === 'index') {
      sql = knex.raw(
          `create index if not exists ? ON ?(?)`,
          [config[i].name, config[i].table, config[i].indexOn]
      ).toString();
    } else {
      return setImmediate(cb, 'Unknown table type: ' + config[i].type);
    }

    sqles.push(sql);
  }

  async.eachSeries(sqles.join('; '), function (command, cb) {
    library.db.none(command).then(function () {
      return setImmediate(cb);
    }).catch(function (err) {
      return setImmediate(cb, err);
    });
  }, function (err) {
    if (err) {
      return setImmediate(cb, 'Sql#createTables error', self);
    } else {
      return setImmediate(cb);
    }
  });
};

/**
 * Drops tables based on config param.
 * @implements {async.eachSeries}
 * @implements {library.db.none}
 * @param {string} dappid
 * @param {Object} config
 * @param {function} cb
 * @return {setImmediateCallback} err message | cb
 */
Sql.prototype.dropTables = function (dappid, config, cb) {
  var tables = [];
  for (var i = 0; i < config.length; i++) {
    tables.push({ name: config[i].table.replace(/[^\w_]/gi, ''), type: config[i].type });
  }

  async.eachSeries(tables, function (table, cb) {
    if (table.type === 'create') {
      library.db.none('DROP TABLE IF EXISTS ' + table.name + ' CASCADE').then(function () {
        return setImmediate(cb, null);
      }).catch(function (err) {
        library.logger.error(err.stack);
        return setImmediate(cb, 'Sql#dropTables error');
      });
    } else if (table.type === 'index') {
      library.db.none('DROP INDEX IF EXISTS ' + table.name).then(function () {
        return setImmediate(cb, null);
      }).catch(function (err) {
        library.logger.error(err.stack);
        return setImmediate(cb, 'Sql#dropTables error');
      });
    } else {
      return setImmediate(cb);
    }
  }, cb);
};

/**
 * Calls helpers.sandbox.callMethod().
 * @implements module:helpers#callMethod
 * @param {function} call - Method to call.
 * @param {*} args - List of arguments.
 * @param {function} cb - Callback function.
 */
Sql.prototype.sandboxApi = function (call, args, cb) {
  sandboxHelper.callMethod(shared, call, args, cb);
};

// Events
/**
 * Modules are not required in this file.
 * @param {modules} scope - Loaded modules.
 */
Sql.prototype.onBind = function (scope) {
};

/**
 * Sets to true private variable loaded.
 */
Sql.prototype.onBlockchainReady = function () {
  __private.loaded = true;
};

// Shared API
/**
 * @implements {__private.query.call}
 * @param {Object} req
 * @param {function} cb
 */
shared.select = function (req, cb) {
  var config = extend({}, req.body, { dappid: req.dappid });

  __private.pass(config, config.dappid);

  const table = config.alias ?
      ({ [config.alias]: config.table }) :
      config.table;

  const sql = knex(table)
      .select(config.fields)
      .modify(function (queryBuilder) {
        if (config.limit) {
          queryBuilder.limit(config.limit);
        }

        if (config.offset) {
          queryBuilder.offset(config.offset);
        }

        if (config.condition) {
          queryBuilder.where(config.condition);
        }

        if (config.sort) {
          queryBuilder.orderBy(config.sort);
        }
      })
      .toString();

  __private.query.call(this, sql, config, cb);
};

/**
 * @implements {__private.query.call}
 * @param {Object} req
 * @param {function} cb
 */
shared.batch = function (req, cb) {
  var config = extend({}, req.body, { dappid: req.dappid });
  __private.query.call(this, 'batch', config, cb);
};

/**
 * @implements {__private.query.call}
 * @param {Object} req
 * @param {function} cb
 */
shared.insert = function (req, cb) {
  var config = extend({}, req.body, { dappid: req.dappid });

  __private.pass(config, config.dappid);

  const sql = knex(config.table)
      .insert(config.values)
      .modify(function (queryBuilder) {
        if (config.condition) {
          queryBuilder.where(config.condition);
        }
      })
      .toString();

  __private.query.call(this, sql, config, cb);
};

/**
 * @implements {__private.query.call}
 * @param {Object} req
 * @param {function} cb
 */
shared.update = function (req, cb) {
  var config = extend({}, req.body, { dappid: req.dappid });

  __private.pass(config, config.dappid);

  const sql = knex(config.table)
      .update(config.modifier)
      .modify(function (queryBuilder) {
        if (config.condition) {
          queryBuilder.where(config.condition);
        }
      })
      .toString();

  __private.query.call(this, sql, config, cb);
};

/**
 * @implements {__private.query.call}
 * @param {Object} req
 * @param {function} cb
 */
shared.remove = function (req, cb) {
  var config = extend({}, req.body, { dappid: req.dappid });
  __private.pass(config, config.dappid);

  const sql = knex(config.table)
      .modify(function (queryBuilder) {
        if (config.condition) {
          queryBuilder.where(config.condition);
        }
      })
      .del()
      .toString();

  __private.query.call(this, sql, config, cb);
};

// Export
module.exports = Sql;
