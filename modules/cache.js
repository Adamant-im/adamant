var async = require('async');
var transactionTypes = require('../helpers/transactionTypes.js');
var errorCacheDisabled = 'Cache Unavailable';

/**
 * Creates an isolated Redis cache module.
 * @constructor
 * @param {Function} cb - Callback invoked with the initialized cache.
 * @param {object} scope - Application scope containing cache and logger instances.
 */
function Cache (cb, scope) {
  this.client = scope.cache.client;
  this.logger = scope.logger;
  this.cacheEnabled = scope.cache.cacheEnabled;
  this.cacheReady = true;

  // The application bus invokes lifecycle handlers with the handler function
  // as its receiver, so bind handlers that depend on this Cache instance.
  this.onNewBlock = this.onNewBlock.bind(this);
  this.onFinishRound = this.onFinishRound.bind(this);
  this.onTransactionsSaved = this.onTransactionsSaved.bind(this);
  this.onSyncStarted = this.onSyncStarted.bind(this);
  this.onSyncFinished = this.onSyncFinished.bind(this);

  setImmediate(cb, null, this);
}

/**
 * Returns whether this cache instance has a ready Redis connection.
 * @return {boolean} Whether Redis caching is enabled and connected.
 */
Cache.prototype.isConnected = function () {
  // The cache helper updates client.ready when the Redis connection is established.
  return this.cacheEnabled && this.client && this.client.ready;
};

/**
 * Returns whether cache mutations are allowed and Redis is connected.
 * @return {boolean} Whether this cache instance is ready.
 */
Cache.prototype.isReady = function () {
  return this.cacheReady && this.isConnected();
};

/**
 * Reads and parses a JSON value from Redis.
 * @param {string} key - Redis key.
 * @param {Function} cb - Callback receiving the parsed value.
 * @return {Promise<void>} Promise resolved after the callback is invoked.
 */
Cache.prototype.getJsonForKey = async function (key, cb) {
  if (!this.isConnected()) {
    return cb(errorCacheDisabled);
  }

  let parsedValue;

  try {
    const value = await this.client.get(key);
    parsedValue = JSON.parse(value);
  } catch (err) {
    cb(err, key);
    return;
  }

  cb(null, parsedValue);
};

/**
 * Serializes and stores a JSON value in Redis.
 * @param {string} key - Redis key.
 * @param {object} value - JSON-compatible value.
 * @param {Function} [cb] - Optional completion callback.
 * @return {Promise<void>} Promise resolved after the write attempt.
 */
Cache.prototype.setJsonForKey = async function (key, value, cb) {
  if (!this.isConnected()) {
    if (typeof cb === 'function') {
      cb(errorCacheDisabled);
    }
    return;
  }

  let res;
  try {
    // redis calls toString on objects, which converts it to object [object] so calling stringify before saving
    res = await this.client.set(key, JSON.stringify(value));
  } catch (err) {
    if (typeof cb === 'function') {
      return cb(err, value);
    }
    return;
  }

  if (typeof cb === 'function') {
    cb(null, res);
  }
};

/**
 * Deletes a JSON value from Redis.
 * @param {string} key - Redis key.
 * @param {Function} cb - Completion callback.
 * @return {void}
 */
Cache.prototype.deleteJsonForKey = function (key, cb) {
  if (!this.isConnected()) {
    return cb(errorCacheDisabled);
  }

  this.client.del(key)
      .then((res) => cb(null, res))
      .catch((err) => cb(err, key));
};

/**
 * Deletes all Redis entries matching a scan pattern.
 * @param {string} pattern - Redis scan pattern.
 * @param {Function} cb - Completion callback.
 * @return {Promise<void>} Promise resolved after matching entries are removed.
 */
Cache.prototype.removeByPattern = async function (pattern, cb) {
  if (!this.isConnected()) {
    return cb(errorCacheDisabled);
  }

  try {
    const keysToDelete = [];

    for await (const key of this.client.scanIterator({ MATCH: pattern })) {
      keysToDelete.push(...key);
    }

    if (keysToDelete.length > 0) {
      await this.client.del(keysToDelete);
    }

    cb(null);
  } catch (err) {
    cb(err);
  }
};

/**
 * Removes all entries from the configured Redis database.
 * @param {Function} cb - Completion callback.
 * @return {void}
 */
Cache.prototype.flushDb = function (cb) {
  if (!this.isConnected()) {
    return cb(errorCacheDisabled);
  }

  this.client.flushDb()
      .then((res) => cb(null, res))
      .catch((err) => cb(err));
};

/**
 * Closes the Redis connection during application cleanup.
 * @param {Function} cb - Completion callback.
 * @return {void}
 */
Cache.prototype.cleanup = function (cb) {
  this.quit(cb);
};

/**
 * Closes this cache instance's Redis connection.
 * @param {Function} cb - Completion callback.
 * @return {void}
 */
Cache.prototype.quit = function (cb) {
  if (!this.isConnected()) {
    // because connection isn't established in the first place.
    return cb();
  }

  this.client.quit()
      .then((res) => cb(null, res))
      .catch((err) => cb(err));
};

/**
 * Invalidates block and transaction cache entries after a new block.
 * @param {Block} block - Applied block.
 * @param {Broadcast} broadcast - Block broadcast flag.
 * @param {Function} cb - Completion callback.
 * @return {void}
 */
Cache.prototype.onNewBlock = function (block, broadcast, cb) {
  cb = cb || function () { };

  if (!this.isReady()) { return cb(errorCacheDisabled); }
  const cache = this;

  async.map(['/api/blocks*', '/api/transactions*'], function (pattern, mapCb) {
    cache.removeByPattern(pattern, function (err) {
      if (err) {
        cache.logger.error('cache', ['Error clearing keys with pattern:', pattern, ' on new block'].join(' '));
      } else {
        cache.logger.trace('cache', ['Keys with pattern:', pattern, 'cleared from cache on new block'].join(' '));
      }
      mapCb(err);
    });
  }, cb);
};

/**
 * Invalidates delegate cache entries after a round finishes.
 * @param {Round} round - Completed round.
 * @param {Function} cb - Completion callback.
 * @return {void}
 */
Cache.prototype.onFinishRound = function (round, cb) {
  cb = cb || function () { };

  if (!this.isReady()) { return cb(errorCacheDisabled); }
  var pattern = '/api/delegates*';
  const cache = this;

  cache.removeByPattern(pattern, function (err) {
    if (err) {
      cache.logger.error('cache', ['Error clearing keys with pattern:', pattern, ' round finish'].join(' '));
    } else {
      cache.logger.trace('cache', ['Keys with pattern: ', pattern, 'cleared from cache new Round'].join(' '));
    }
    return cb(err);
  });
};


/**
 * Invalidates delegate cache entries after saving a delegate transaction.
 * @param {Transactions[]} transactions - Saved transactions.
 * @param {Function} cb - Completion callback.
 * @return {void}
 */
Cache.prototype.onTransactionsSaved = function (transactions, cb) {
  cb = cb || function () { };

  if (!this.isReady()) { return cb(errorCacheDisabled); }
  var pattern = '/api/delegates*';
  const cache = this;

  var delegateTransaction = transactions.find(function (trs) {
    return !!trs && trs.type === transactionTypes.DELEGATE;
  });

  if (!!delegateTransaction) {
    cache.removeByPattern(pattern, function (err) {
      if (err) {
        cache.logger.error('cache', ['Error clearing keys with pattern:', pattern, ' on delegate trs'].join(' '));
      } else {
        cache.logger.trace('cache', ['Keys with pattern:', pattern, 'cleared from cache on delegate trs'].join(' '));
      }
      return cb(err);
    });
  } else {
    cb();
  }
};

/**
 * Disables cache mutations while blockchain synchronization is active.
 * @return {void}
 */
Cache.prototype.onSyncStarted = function () {
  this.cacheReady = false;
};

/**
 * Clears stale API entries and enables cache mutations after synchronization.
 * @param {Function} [cb] - Optional completion callback.
 * @return {void}
 */
Cache.prototype.onSyncFinished = function (cb) {
  cb = cb || function () { };

  if (!this.isConnected()) {
    this.cacheReady = true;
    return cb();
  }

  const cache = this;

  cache.removeByPattern('/api/*', function (err) {
    if (err) {
      cache.logger.error('cache', 'Failed to clear cache after blockchain synchronization', err);
      return cb(err);
    }

    cache.cacheReady = true;
    cache.logger.trace('cache', 'Cache cleared after blockchain synchronization');
    return cb();
  });
};

module.exports = Cache;
