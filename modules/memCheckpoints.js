'use strict';

var MemCheckpoint = require('../logic/memCheckpoint.js');

var modules, library, self, __private = {};

__private.loaded = false;
__private.creating = false;

/**
 * Module wrapper for persisted mem-table checkpoint creation and recovery.
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
 * Whether persisted mem-table checkpoints are enabled in config.
 * @return {boolean}
 */
MemCheckpoints.prototype.isEnabled = function () {
  return __private.logic.isEnabled();
};

/**
 * Expose the underlying checkpoint logic for tests and diagnostics.
 * @return {MemCheckpoint}
 */
MemCheckpoints.prototype.logic = function () {
  return __private.logic;
};

/**
 * Create a checkpoint after a persisted block at a completed round boundary.
 * Called only after the full applyBlock pipeline has finished.
 * @param {object} block Applied block.
 * @param {boolean} persisted Whether the block was saved to the database.
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
 * @param {number} tipHeight Current chain height/block count used by loader.
 * @param {number} tipRound Current round at chain tip.
 * @param {Function} cb Callback `(err, checkpoint|null)`.
 */
MemCheckpoints.prototype.tryRecover = function (tipHeight, tipRound, cb) {
  if (!__private.logic.isEnabled()) {
    return setImmediate(cb, null, null);
  }

  __private.logic.findRecoverableCheckpoint(tipHeight, tipRound, library.config.nethash).then(function (meta) {
    if (!meta) {
      library.logger.warn('memCheckpoints', 'No complete recoverable mem-table checkpoint found');
      return setImmediate(cb, null, null);
    }

    return __private.logic.restoreCheckpoint(meta).then(function (restored) {
      return setImmediate(cb, null, restored);
    });
  }).catch(function (err) {
    library.logger.warn('memCheckpoints', `Checkpoint recovery failed: ${err?.message || err}; falling back to full rebuild…`);
    return setImmediate(cb, null, null);
  });
};

/**
 * Bind modules required for checkpoint creation.
 * @param {modules} scope
 */
MemCheckpoints.prototype.onBind = function (scope) {
  modules = {
    rounds: scope.rounds
  };
};

/**
 * Enable checkpoint creation after blockchain loading has finished.
 * @listens module:loader~event:blockchainReady
 */
MemCheckpoints.prototype.onBlockchainReady = function () {
  __private.loaded = true;
};

/**
 * Disable checkpoint creation during shutdown.
 * @param {Function} cb
 */
MemCheckpoints.prototype.cleanup = function (cb) {
  __private.loaded = false;
  return setImmediate(cb);
};

module.exports = MemCheckpoints;
