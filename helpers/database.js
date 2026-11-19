'use strict';

var async = require('async');
var bignum = require('./bignum');
var fs = require('fs');
var path = require('path');

// var isWin = /^win/.test(process.platform);
// var isMac = /^darwin/.test(process.platform);

/**
 * Migrator functions
 * @constructor
 * @private
 * @param {object} pgp - pg promise
 * @param {object} db - pg connection
 * @param {Logger} logger - Application logger.
 */
function Migrator (pgp, db, logger) {
  /**
   * Gets one record from `migrations` table
   * @method
   * @param {function} waterCb - Callback function
   * @return {function} waterCb with error | Boolean
   */
  this.checkMigrations = function (waterCb) {
    db.one('SELECT to_regclass(\'migrations\')').then(function (row) {
      return waterCb(null, Boolean(row.to_regclass));
    }).catch(function (err) {
      return waterCb(err);
    });
  };

  /**
   * Gets last migration record from `migrations` table.
   * @method
   * @param {boolean} hasMigrations
   * @param {function} waterCb - Callback function
   * @return {function} waterCb with error | row data
   */
  this.getLastMigration = function (hasMigrations, waterCb) {
    if (!hasMigrations) {
      return waterCb(null, null);
    }
    db.query('SELECT * FROM migrations ORDER BY "id" DESC LIMIT 1').then(function (rows) {
      if (rows[0]) {
        rows[0].id = new bignum(rows[0].id);
      }
      return waterCb(null, rows[0]);
    }).catch(function (err) {
      return waterCb(err);
    });
  };

  /**
   * Reads folder `sql/migrations` and returns files rather than
   * lastMigration id.
   * @method
   * @param {object} lastMigration
   * @param {function} waterCb - Callback function
   * @return {function} waterCb with error | pendingMigrations
   */
  this.readPendingMigrations = function (lastMigration, waterCb) {
    var migrationsPath = path.join(process.cwd(), 'sql', 'migrations');
    var pendingMigrations = [];

    function matchMigrationName (file) {
      var name = file.match(/_.+\.sql$/);

      return Array.isArray(name) ? name[0].replace(/_/, '').replace(/\.sql$/, '') : null;
    }

    function matchMigrationId (file) {
      var id = file.match(/^[0-9]+/);

      return Array.isArray(id) ? new bignum(id[0]) : null;
    }

    fs.readdir(migrationsPath, function (err, files) {
      if (err) {
        return waterCb(err);
      }

      files.map(function (file) {
        return {
          id: matchMigrationId(file),
          name: matchMigrationName(file),
          path: path.join(migrationsPath, file)
        };
      }).filter(function (file) {
        return (
          (file.id && file.name) && fs.statSync(file.path).isFile() && /\.sql$/.test(file.path)
        );
      }).forEach(function (file) {
        if (!lastMigration || file.id.isGreaterThan(lastMigration.id)) {
          pendingMigrations.push(file);
        }
      });

      return waterCb(null, pendingMigrations);
    });
  };

  /**
   * Creates and execute a db query for each pending migration.
   * @method
   * @param {Array} pendingMigrations
   * @param {function} waterCb - Callback function
   * @return {function} waterCb with error | appliedMigrations
   */
  this.applyPendingMigrations = function (pendingMigrations, waterCb) {
    if (pendingMigrations.length) {
      logger.info('migrator', `Found ${pendingMigrations.length} pending migrations. Start executing, this may take a while…`);
    }

    var appliedMigrations = [];

    async.eachSeries(pendingMigrations, function (file, eachCb) {
      var sql = new pgp.QueryFile(file.path, { minify: true });

      db.query(sql).then(function () {
        appliedMigrations.push(file);
        return eachCb();
      }).catch(function (err) {
        return eachCb(err);
      });
    }, function (err) {
      if (pendingMigrations.length && !err) {
        logger.info('migrator', 'Migrations have been successfully completed.');
      }

      return waterCb(err, appliedMigrations);
    });
  };

  /**
   * Inserts into `migrations` table the previous applied migrations.
   * @method
   * @param {Array} appliedMigrations
   * @param {function} waterCb - Callback function
   * @return {function} waterCb with error
   */
  this.insertAppliedMigrations = function (appliedMigrations, waterCb) {
    async.eachSeries(appliedMigrations, function (file, eachCb) {
      db.query('INSERT INTO migrations(id, name) VALUES($1, $2) ON CONFLICT DO NOTHING', [file.id.toString(), file.name]).then(function () {
        return eachCb();
      }).catch(function (err) {
        return eachCb(err);
      });
    }, function (err) {
      return waterCb(err);
    });
  };

  /**
   * Executes 'runtime.sql' file, that set peers clock to null and state to 1.
   * @method
   * @param {function} waterCb - Callback function
   * @return {function} waterCb with error
   */
  this.applyRuntimeQueryFile = function (waterCb) {
    var dirname = path.basename(__dirname) === 'helpers' ? path.join(__dirname, '..') : __dirname;
    var sql = new pgp.QueryFile(path.join(dirname, 'sql', 'runtime.sql'), { minify: true });

    db.query(sql).then(function () {
      return waterCb();
    }).catch(function (err) {
      return waterCb(err);
    });
  };
}

// Fail a new TCP connect that never completes instead of occupying a pool slot
// until the process is restarted. libpq derives connect_timeout from this value
// in whole seconds, so it must stay at least one second.
var CONNECTION_TIMEOUT_MS = 10000;

// TCP keepalive for the pure JavaScript driver. pg-native uses libpq, which does
// not receive node-postgres keepAlive fields in its connection string; native
// recovery uses the error handling and query timeout below.
var KEEPALIVE_INITIAL_DELAY_MS = 10000;

// Upper bound for one query after startup migrations. A PostgreSQL restart can
// leave a checked-out client waiting forever on a socket that will never answer.
// That never invokes the query callback, so sequence/dbSequence/balancesSequence
// stay on that task and the loader stops scheduling sync while syncing() is
// still false. The timeout forces the callback. It is intentionally long so a
// healthy block, round, or checkpoint statement is not aborted.
var QUERY_TIMEOUT_MS = 300000;

var LOST_CONNECTION_CODES = {
  ECONNRESET: true,
  ECONNREFUSED: true,
  EPIPE: true,
  ETIMEDOUT: true,
  ESOCKETTIMEDOUT: true,
  ENOTFOUND: true,
  EAI_AGAIN: true,
  ECONNABORTED: true,
  '08000': true,
  '08001': true,
  '08003': true,
  '08004': true,
  '08006': true,
  '08007': true,
  '53300': true,
  '57P01': true,
  '57P02': true,
  '57P03': true
};

var LOST_CONNECTION_MESSAGE_PATTERNS = [
  /connection refused/i,
  /connection terminated/i,
  /connection closed/i,
  /server closed the connection/i,
  /could not connect to server/i,
  /the database system is (?:shutting down|starting up)/i,
  /terminating connection/i,
  /Client has encountered a connection error/,
  /Query read timeout/,
  /timeout exceeded when trying to connect/,
  /sorry, too many clients/i
];

/**
 * True when the driver will not be able to run another query on this connection.
 * pg-native often reports these as a plain Error with no SQLSTATE, so message
 * text from libpq has to be recognized too. Query cancellation (57014) and
 * protocol violations (08P01) are not treated as a lost connection.
 * @param {Error} err
 * @return {boolean}
 */
function isLostConnectionError (err) {
  if (!err) {
    return false;
  }

  var code = typeof err.code === 'string' ? err.code : '';

  if (LOST_CONNECTION_CODES[code]) {
    return true;
  }

  var errorClass = code.substring(0, 2);

  if ((errorClass === '08' && code !== '08P01') || (errorClass === '57' && code !== '57014')) {
    return true;
  }

  var message = String(err.message || '');

  return LOST_CONNECTION_MESSAGE_PATTERNS.some(function (pattern) {
    return pattern.test(message);
  });
}

/**
 * Marks a client so pg-promise fails queued transaction cleanup and destroys it
 * on release instead of returning it to the pool. A dead client that is checked
 * out again never opens a new session.
 * @param {Error} err
 * @param {object} client
 */
function markLostClient (err, client) {
  if (!client || !isLostConnectionError(err)) {
    return;
  }

  // A read timeout is reported before the driver has stopped the active query.
  // Make pg-promise's automatic ROLLBACK fail immediately instead of queueing
  // behind it; releasing the client then closes the transaction on the server.
  client._queryable = false;

  if (!client.$connectionError) {
    client.$connectionError = err;
  }
}

/**
 * Copies database config into the shape node-postgres and pg-promise consume.
 * Does not set query_timeout; that is enabled only after migrations finish.
 * @param {object} config
 * @return {object}
 */
function preparePoolConfig (config) {
  var poolConfig = Object.assign({}, config);

  poolConfig.user = poolConfig.user || process.env.USER;

  if (poolConfig.poolSize) {
    poolConfig.max = poolConfig.poolSize;
  }

  delete poolConfig.poolSize;

  if (poolConfig.idleTimeoutMillis == null && poolConfig.poolIdleTimeout != null) {
    poolConfig.idleTimeoutMillis = poolConfig.poolIdleTimeout;
  }

  if (poolConfig.connectionTimeoutMillis == null) {
    poolConfig.connectionTimeoutMillis = CONNECTION_TIMEOUT_MS;
  }

  if (poolConfig.keepAlive == null) {
    poolConfig.keepAlive = true;
  }

  if (poolConfig.keepAliveInitialDelayMillis == null) {
    poolConfig.keepAliveInitialDelayMillis = KEEPALIVE_INITIAL_DELAY_MS;
  }

  delete poolConfig.query_timeout;

  return poolConfig;
}

/**
 * Arms the query timeout on the pool and on clients already created for migrations.
 * The native and JavaScript drivers read connectionParameters.query_timeout when a
 * query starts, so existing clients pick the value up without a reconnect.
 * @param {object} pool
 * @param {number} timeoutMs
 */
function enableQueryTimeout (pool, timeoutMs) {
  if (!pool || !pool.options) {
    return;
  }

  pool.options.query_timeout = timeoutMs;

  (pool._clients || []).forEach(function (client) {
    if (client && client.connectionParameters) {
      client.connectionParameters.query_timeout = timeoutMs;
    }
  });
}

/**
 * Connects to the database and performs:
 * - checkMigrations
 * - getLastMigration
 * - readPendingMigrations
 * - applyPendingMigrations
 * - insertAppliedMigrations
 * - applyRuntimeQueryFile
 * @memberof module:helpers
 * @requires pg-promise
 * @requires pg-monitor
 * @implements Migrator
 * @method connect
 * @param {object} config
 * @param {function} logger
 * @param {function} cb
 * @return {function} error|cb
 */
module.exports.connect = function (config, logger, cb) {
  var pgOptions = {
    pgNative: process.env.PG_NATIVE !== 'false',
    error: function (err, e) {
      if (e && e.client) {
        markLostClient(err, e.client);
      }
    }
  };

  var pgp = require('pg-promise')(pgOptions);
  var monitor = require('pg-monitor');

  monitor.attach(pgOptions, config.logEvents);
  monitor.setTheme('matrix');

  monitor.setLog(function (msg, info) {
    if (info.event === 'error') {
      logger.error('pg-monitor', info.text);
    } else {
      logger.info('pg-monitor', `${info.event}: ${info.text}`);
    }
    info.display = false;
  });

  var poolConfig = preparePoolConfig(config);
  var db = pgp(poolConfig);

  // pg-promise already listens so an idle-client error is not an uncaught
  // exception. This listener records the drop; the pool has removed the client
  // before the event, and the next checkout opens a new connection.
  db.$pool.on('error', function (err) {
    var message = err && err.message ? err.message : err;
    logger.error('database', 'Idle PostgreSQL connection dropped: ' + message + '. The next query opens a new connection.');
  });

  var migrator = new Migrator(pgp, db, logger);

  async.waterfall([
    migrator.checkMigrations,
    migrator.getLastMigration,
    migrator.readPendingMigrations,
    migrator.applyPendingMigrations,
    migrator.insertAppliedMigrations,
    migrator.applyRuntimeQueryFile
  ], function (err) {
    if (!err) {
      enableQueryTimeout(db.$pool, QUERY_TIMEOUT_MS);
    }

    return cb(err, db);
  });
};

module.exports.CONNECTION_TIMEOUT_MS = CONNECTION_TIMEOUT_MS;
module.exports.KEEPALIVE_INITIAL_DELAY_MS = KEEPALIVE_INITIAL_DELAY_MS;
module.exports.QUERY_TIMEOUT_MS = QUERY_TIMEOUT_MS;
module.exports.isLostConnectionError = isLostConnectionError;
module.exports.markLostClient = markLostClient;
module.exports.preparePoolConfig = preparePoolConfig;
module.exports.enableQueryTimeout = enableQueryTimeout;
