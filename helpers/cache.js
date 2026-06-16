'use strict';

var redis = require('redis');

/**
 * Connects with redis server using the config provided via parameters
 * @param {boolean} cacheEnabled
 * @param {object} config - Redis configuration
 * @param {object} logger
 * @param {Function} cb
 */
module.exports.connect = function (cacheEnabled, config, logger, cb) {
  var isRedisLoaded = false;

  if (!cacheEnabled) {
    return cb(null, { cacheEnabled: cacheEnabled, client: null });
  }

  const redisConfig = { ...config };

  // delete password key if it's value is null
  if (redisConfig.password === null) {
    delete redisConfig.password;
  }

  // node-redis v6 defaults to RESP3; keep the established RESP2 response semantics.
  if (redisConfig.RESP === undefined) {
    redisConfig.RESP = 2;
  }

  var client = redis.createClient(redisConfig);

  client.connect()
      .then(() => {
        logger.info('cache', 'App connected with redis server');

        if (!isRedisLoaded) {
          isRedisLoaded = true;
          client.ready = isRedisLoaded;
          return cb(null, { cacheEnabled: cacheEnabled, client: client });
        }
      })
      .catch((err) => {
        logger.error('cache', 'An error occurred while connecting to redis server:', err);
        // Only throw an error if cache was enabled in config but were unable to load it properly
        if (!isRedisLoaded) {
          isRedisLoaded = true;
          return cb(null, { cacheEnabled: cacheEnabled, client: null });
        }
      });
};
