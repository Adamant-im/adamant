'use strict';

var MemCheckpoint = require('../logic/memCheckpoint.js');

var modules, library, self, __private = {};

__private.loaded = false;
__private.creating = false;
__private.schemaMismatch = false;

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
    config: scope.config,
    balancesSequence: scope.balancesSequence
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
 * Called only after the full applyBlock pipeline has finished. The callback is
 * invoked when the checkpoint copy has finished (or was skipped), so the caller
 * can hold the block-processing critical section for the duration of the copy.
 * Balance/unconfirmed writers are excluded via `balancesSequence`.
 * @param {object} block Applied block.
 * @param {boolean} persisted Whether the block was saved to the database.
 * @param {Function} [cb] Called when checkpoint work is finished or skipped.
 */
MemCheckpoints.prototype.onBlockApplied = function (block, persisted, cb) {
  cb = cb || function () {};

  if (!__private.loaded || !persisted || __private.creating || __private.schemaMismatch) {
    return setImmediate(cb);
  }

  if (!__private.logic.isEnabled()) {
    return setImmediate(cb);
  }

  if (!__private.logic.isRoundBoundaryBlock(block.height)) {
    return setImmediate(cb);
  }

  var round = modules.rounds.calc(block.height);

  // Throttle checkpoints during catch-up sync so the per-round mem_* copy
  // does not slow down block replay; crash recovery still keeps the replay
  // window bounded to SYNC_ROUND_INTERVAL rounds.
  if (!__private.logic.shouldCheckpointRound(round, modules.loader.syncing())) {
    return setImmediate(cb);
  }

  __private.creating = true;

  library.balancesSequence.add(function (sequenceCb) {
    __private.logic.createCheckpoint(block, round, library.config.nethash).then(function () {
      return setImmediate(sequenceCb);
    }, function (err) {
      return setImmediate(sequenceCb, err);
    });
  }, function () {
    __private.creating = false;
    return setImmediate(cb);
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
    rounds: scope.rounds,
    loader: scope.loader
  };
};

/**
 * Enable checkpoint creation after blockchain loading has finished.
 * Verifies checkpoint slot tables still match the live mem_* schema first;
 * on mismatch, checkpoint creation is disabled to avoid silently stale slots.
 * @listens module:loader~event:blockchainReady
 */
MemCheckpoints.prototype.onBlockchainReady = function () {
  if (!__private.logic.isEnabled()) {
    __private.loaded = true;
    return;
  }

  __private.logic.verifySlotSchemas().then(function (mismatch) {
    if (mismatch) {
      __private.schemaMismatch = true;
      library.logger.error('memCheckpoints', 'Checkpoint slot schema does not match live mem_* tables, checkpoint creation disabled. Re-create checkpoint slot tables to re-enable.', mismatch);
    }
    __private.loaded = true;
  }).catch(function (err) {
    __private.schemaMismatch = true;
    __private.loaded = true;
    library.logger.error('memCheckpoints', `Failed to verify checkpoint slot schema, checkpoint creation disabled: ${err?.message || err}`);
  });
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
