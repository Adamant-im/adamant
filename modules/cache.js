var async = require('async');
var transactionTypes = require('../helpers/transactionTypes.js');
var cacheReady = true;
var errorCacheDisabled = 'Cache Unavailable';
var client;
var self;
var logger;
var cacheEnabled;

/**
 * Cache module
 * @constructor
 * @param {Function} cb
 * @param {Object} scope
 */
function Cache (cb, scope) {
  self = this;
  client = scope.cache.client;
  logger = scope.logger;
  cacheEnabled = scope.cache.cacheEnabled;
  setImmediate(cb, null, self);
}

/**
 * It gets the status of the redis connection
 * @return {Boolean} status
 */
Cache.prototype.isConnected = function () {
  // using client.ready because this variable is updated on client connected
  return cacheEnabled && client && client.ready;
};

/**
 * It gets the caching readiness and the connection of redis
 * @return {Boolean} status
 */
Cache.prototype.isReady = function () {
  return cacheReady && self.isConnected();
};

/**
 * It gets the json value for a key from redis
 * @param {String} key
 * @param {Function} cb
 * @return {Function} cb
 */
Cache.prototype.getJsonForKey = async function (key, cb) {
  if (!self.isConnected()) {
    return cb(errorCacheDisabled);
  }

  let parsedValue;

  try {
    const value = await client.get(key);
    parsedValue = JSON.parse(value);
  } catch (err) {
    cb(err, key);
    return;
  }

  cb(null, parsedValue);
};

/**
 * It sets json value for a key in redis
 * @param {String} key
 * @param {Object} value
 * @param {Function} cb
 */
Cache.prototype.setJsonForKey = async function (key, value, cb) {
  if (!self.isConnected()) {
    if (typeof cb === 'function') {
      cb(errorCacheDisabled);
    }
    return;
  }

  let res;
  try {
    // redis calls toString on objects, which converts it to object [object] so calling stringify before saving
    res = await client.set(key, JSON.stringify(value))
  } catch (err) {
    if (typeof cb === 'function') {
      cb(err, value);
    }
  }

  if (typeof cb === 'function') {
    cb(null, res);
  }
};

/**
 * It deletes json value for a key in redis
 * @param {String} key
 */
Cache.prototype.deleteJsonForKey = function (key, cb) {
  if (!self.isConnected()) {
    return cb(errorCacheDisabled);
  }

  client.del(key)
      .then((res) => cb(null, res))
      .catch((err) => cb(err, key));
};

/**
 * It scans keys with provided pattern in redis db and deletes the entries that match
 * @param {String} pattern
 * @param {Function} cb
 */
Cache.prototype.removeByPattern = function (pattern, cb) {
  if (!self.isConnected()) {
    return cb(errorCacheDisabled);
  }
  var keys, cursor = 0;
  async.doWhilst(function iteratee (whilstCb) {
    client.scan(cursor, { MATCH: pattern })
        .then((res) => {
          cursor = res.cursor;
          keys = res.keys;
          if (keys.length > 0) {
            client.del(keys)
                .then((res) => whilstCb(null, res))
                .catch((err) => whilstCb(err));
          } else {
            return whilstCb();
          }
        })
        .catch((err) => {
          return whilstCb(err);
        });
  }, function test (...args) {
    return args[args.length - 1](null, cursor > 0);
  }, cb);
};

/**
 * It removes all entries from redis db
 * @param {Function} cb
 */
Cache.prototype.flushDb = function (cb) {
  if (!self.isConnected()) {
    return cb(errorCacheDisabled);
  }

  client.flushDb()
      .then((res) => cb(null, res))
      .catch((err) => cb(err));
};

/**
 * On application clean event, it quits the redis connection
 * @param {Function} cb
 */
Cache.prototype.cleanup = function (cb) {
  self.quit(cb);
};

/**
 * it quits the redis connection
 * @param {Function} cb
 */
Cache.prototype.quit = function (cb) {
  if (!self.isConnected()) {
    // because connection isn't established in the first place.
    return cb();
  }

  client.quit()
      .then((res) => cb(null, res))
      .catch((err) => cb(err));
};

/**
 * This function will be triggered on new block, it will clear all cache entires.
 * @param {Block} block
 * @param {Broadcast} broadcast
 * @param {Function} cb
 */
Cache.prototype.onNewBlock = function (block, broadcast, cb) {
  cb = cb || function () { };

  if (!self.isReady()) { return cb(errorCacheDisabled); }
  async.map(['/api/blocks*', '/api/transactions*'], function (pattern, mapCb) {
    self.removeByPattern(pattern, function (err) {
      if (err) {
        logger.error(['Error clearing keys with pattern:', pattern, ' on new block'].join(' '));
      } else {
        logger.debug(['keys with pattern:', pattern, 'cleared from cache on new block'].join(' '));
      }
      mapCb(err);
    });
  }, cb);
};

/**
 * This function will be triggered when a round finishes, it will clear all cache entires.
 * @param {Round} round
 * @param {Function} cb
 */
Cache.prototype.onFinishRound = function (round, cb) {
  cb = cb || function () { };

  if (!self.isReady()) { return cb(errorCacheDisabled); }
  var pattern = '/api/delegates*';
  self.removeByPattern(pattern, function (err) {
    if (err) {
      logger.error(['Error clearing keys with pattern:', pattern, ' round finish'].join(' '));
    } else {
      logger.debug(['keys with pattern: ', pattern, 'cleared from cache new Round'].join(' '));
    }
    return cb(err);
  });
};


/**
 * This function will be triggered when transactions are processed, it will clear all cache entires if there is a delegate type transaction.
 * @param {Transactions[]} transactions
 * @param {Function} cb
 */
Cache.prototype.onTransactionsSaved = function (transactions, cb) {
  cb = cb || function () { };

  if (!self.isReady()) { return cb(errorCacheDisabled); }
  var pattern = '/api/delegates*';

  var delegateTransaction = transactions.find(function (trs) {
    return !!trs && trs.type === transactionTypes.DELEGATE;
  });

  if (!!delegateTransaction) {
    self.removeByPattern(pattern, function (err) {
      if (err) {
        logger.error(['Error clearing keys with pattern:', pattern, ' on delegate trs'].join(' '));
      } else {
        logger.debug(['keys with pattern:', pattern, 'cleared from cache on delegate trs'].join(' '));
      }
      return cb(err);
    });
  } else {
    cb();
  }
};

/**
 * Disable any changes in cache while syncing
 */
Cache.prototype.onSyncStarted = function () {
  cacheReady = false;
};

/**
 * Enable changes in cache after syncing finished
 */
Cache.prototype.onSyncFinished = function () {
  cacheReady = true;
};

module.exports = Cache;
