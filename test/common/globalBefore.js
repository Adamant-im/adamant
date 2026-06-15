'use strict';

var node = require('./../node.js');

/**
 * @param {object} db
 * @param {Logger} logger
 * @param {string} table
 * @param {Function} cb
 */
function clearDatabaseTable (db, logger, table, cb) {
  db.query('DELETE FROM ' + table).then(function (result) {
    cb(null, result);
  }).catch(function (err) {
    logger.err('Failed to clear database table: ' + table);
    throw err;
  });
}

/**
 * @param {Function} cb
 * @param {number} [retries=10] retries
 * @param {number} [timeout=200] timeout
 */
function waitUntilBlockchainReady (cb, retries, timeout) {
  if (!retries) {
    retries = 10;
  }
  if (!timeout) {
    timeout = 1000;
  }
  (function fetchBlockchainStatus () {
    node.get('/api/loader/status', function (err, res) {
      node.expect(err).to.not.exist;
      retries -= 1;
      if (!res.body.loaded && retries >= 0) {
        return setTimeout(function () {
          fetchBlockchainStatus();
        }, timeout);
      } else if (res.body.success && res.body.loaded) {
        return cb();
      }
      return cb('Failed to load blockchain');
    });
  })();
}

module.exports = {
  clearDatabaseTable: clearDatabaseTable,
  waitUntilBlockchainReady: waitUntilBlockchainReady
};
