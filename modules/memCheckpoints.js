'use strict';

var MemCheckpoint = require('../logic/memCheckpoint.js');

var modules, library, self, __private = {};

__private.loaded = false;
__private.creating = false;

/**
 * @param {Function} cb
 * @param {scope} scope
 * @constructor
 */
function MemCheckpoints (cb, scope) {
  library = {
    logger: scope.logger,
    db: scope.db,
    config: scope.config
  };

  __private.logic = new MemCheckpoint({
    db: scope.db,
    logger: scope.logger,
    config: {
      memCheckpoints: (scope.config.loading && scope.config.loading.memCheckpoints) || {}
    }
  });

  self = this;
  setImmediate(cb, null, self);
}

/**
 * @return {boolean}
 */
MemCheckpoints.prototype.isEnabled = function () {
  return __private.logic.isEnabled();
};

/**
 * @return {MemCheckpoint}
 */
MemCheckpoints.prototype.logic = function () {
  return __private.logic;
};

/**
 * @param {object} block
 * @param {boolean} persisted
 */
MemCheckpoints.prototype.onBlockApplied = function (block, persisted) {
  if (!__private.loaded || !persisted || __private.creating) {
    return;
  }

  if (!__private.logic.isEnabled()) {
    return;
  }

  if (!__private.logic.isRoundBoundaryBlock(block.height)) {
    return;
  }

  var round = modules.rounds.calc(block.height);

  __private.creating = true;

  __private.logic.createCheckpoint(block, round, library.config.nethash).finally(function () {
    __private.creating = false;
  });
};

/**
 * Attempt checkpoint-based recovery before a full mem-table rebuild.
 *
 * @param {number} tipHeight
 * @param {number} tipRound
 * @param {Function} cb
 */
MemCheckpoints.prototype.tryRecover = function (tipHeight, tipRound, cb) {
  if (!__private.logic.isEnabled()) {
    return setImmediate(cb, null, null);
  }

  __private.logic.findRecoverableCheckpoint(tipHeight, tipRound, library.config.nethash).then(function (meta) {
    if (!meta) {
      return setImmediate(cb, null, null);
    }

    return __private.logic.restoreCheckpoint(meta).then(function (restored) {
      return setImmediate(cb, null, restored);
    });
  }).catch(function (err) {
    library.logger.warn('memCheckpoints', `Checkpoint recovery failed, falling back to full rebuild: ${err?.message || err}`);
    return setImmediate(cb, null, null);
  });
};

/**
 * @param {modules} scope
 */
MemCheckpoints.prototype.onBind = function (scope) {
  modules = {
    rounds: scope.rounds
  };
};

/**
 * @listens module:loader~event:blockchainReady
 */
MemCheckpoints.prototype.onBlockchainReady = function () {
  __private.loaded = true;
};

/**
 * @param {Function} cb
 */
MemCheckpoints.prototype.cleanup = function (cb) {
  __private.loaded = false;
  return setImmediate(cb);
};

module.exports = MemCheckpoints;
