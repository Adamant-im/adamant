'use strict';

var crypto = require('crypto');
var slots = require('../helpers/slots.js');
var sql = require('../sql/memCheckpoints.js');

/** @type {number} Digest/schema version for checkpoint metadata and hashing. */
var SCHEMA_VERSION = 1;

/** @type {number} Number of rotating checkpoint slots kept on disk (slots 0..2). */
var CHECKPOINT_SLOT_COUNT = 3;

/**
 * Checkpoint every Nth round while the node is catching up with the network,
 * so sync throughput is not reduced by a mem_* copy at every round boundary.
 * @type {number}
 */
var SYNC_ROUND_INTERVAL = 100;

/**
 * Checkpoint table copy/hash order. Accounts must come before dependent tables.
 * Unconfirmed junction tables (`*2u_*`) are intentionally excluded: they are
 * deterministically rebuilt from confirmed state on restore (see
 * `sql.resetUnconfirmedStateStatements`), so copying and hashing them is wasted
 * work that would only slow the per-round copy.
 * @type {string[]}
 */
var TABLE_ORDER = [
  'accounts',
  'accounts2delegates',
  'accounts2multisignatures',
  'round'
];

/**
 * Append one checkpoint table to the running SHA-256 digest.
 * @private
 * @param {object} hash Node.js hash instance.
 * @param {string} tableKey Logical table key from {@link TABLE_ORDER}.
 * @param {object[]} rows Canonical rows ordered by SQL.
 */
function appendTableDigest (hash, tableKey, rows) {
  hash.update(tableKey);
  hash.update('\n');

  rows.forEach(function (row) {
    hash.update(row.line);
    hash.update('\n');
  });
}

/**
 * Run SQL statements sequentially on one pg client.
 * pg-native rejects overlapping queries on the same connection.
 * @param {object} t pg-promise task/transaction.
 * @param {string[]} statements
 * @return {Promise<void>}
 */
function execStatementsSequential (t, statements) {
  if (!statements || !statements.length) {
    return Promise.resolve();
  }

  return statements.reduce(function (promise, statement) {
    return promise.then(function () {
      return t.none(statement);
    });
  }, Promise.resolve());
}

/**
 * Persisted mem-table checkpoint logic for crash recovery.
 * Checkpoints are a local recovery cache only; blocks remain the source of truth.
 *
 * @param {object} scope
 * @param {Database} scope.db
 * @param {Logger} scope.logger
 * @param {object} scope.config
 * @param {object} [scope.config.memCheckpoints]
 * @param {boolean} [scope.config.memCheckpoints.enabled]
 * @constructor
 */
function MemCheckpoint (scope) {
  this.scope = scope;
  this.library = {
    db: scope.db,
    logger: scope.logger,
    config: scope.config
  };
}

/** @type {number} */
MemCheckpoint.SCHEMA_VERSION = SCHEMA_VERSION;

/** @type {number} */
MemCheckpoint.CHECKPOINT_SLOT_COUNT = CHECKPOINT_SLOT_COUNT;

/** @type {number} */
MemCheckpoint.SYNC_ROUND_INTERVAL = SYNC_ROUND_INTERVAL;

/**
 * Whether persisted mem-table checkpoints are enabled.
 * @return {boolean}
 */
MemCheckpoint.prototype.isEnabled = function () {
  var config = this.library.config.memCheckpoints || {};
  return config.enabled !== false;
};

/**
 * Whether a block height is a completed-round boundary where checkpoints are safe to take.
 * Only the last block of a round qualifies (for example heights 101, 202, ...).
 * @param {number} height
 * @return {boolean}
 */
MemCheckpoint.prototype.isRoundBoundaryBlock = function (height) {
  var round = Math.ceil(height / slots.delegates);
  var nextRound = Math.ceil((height + 1) / slots.delegates);

  return round !== nextRound;
};

/**
 * Whether a checkpoint should be taken for a completed round.
 * Every round during normal operation; every {@link SYNC_ROUND_INTERVAL}th
 * round while syncing, to keep catch-up throughput unaffected.
 * @param {number} round Completed round number.
 * @param {boolean} syncing Whether the node is catching up with the network.
 * @return {boolean}
 */
MemCheckpoint.prototype.shouldCheckpointRound = function (round, syncing) {
  if (!syncing) {
    return true;
  }

  return round % SYNC_ROUND_INTERVAL === 0;
};

/**
 * Select the next rotating slot index for a new checkpoint write.
 * @param {object|null} latestMeta Latest complete checkpoint metadata row.
 * @return {number}
 */
MemCheckpoint.prototype.getNextSlot = function (latestMeta) {
  if (!latestMeta || latestMeta.slot === undefined || latestMeta.slot === null) {
    return 0;
  }

  return (parseInt(latestMeta.slot, 10) + 1) % CHECKPOINT_SLOT_COUNT;
};

/**
 * Build the metadata prefix included in the checkpoint digest domain.
 * @param {object} meta
 * @param {number|string} meta.height
 * @param {string} meta.blockId
 * @param {number|string} meta.round
 * @param {string} meta.nethash
 * @return {string}
 */
MemCheckpoint.prototype.buildDigestDomain = function (meta) {
  return [
    SCHEMA_VERSION,
    meta.height,
    meta.blockId,
    meta.round,
    meta.nethash
  ].join(':');
};

/**
 * Compute a deterministic SHA-256 digest over checkpoint metadata and slot table contents.
 * Queries run sequentially on the supplied task to avoid overlapping pg client queries.
 * @param {object} t pg-promise task/transaction.
 * @param {number} slot Checkpoint slot index.
 * @param {object} meta Checkpoint metadata used for the digest domain.
 * @return {Promise<string>} Hex-encoded digest.
 */
MemCheckpoint.prototype.computeDigest = function (t, slot, meta) {
  var hash = crypto.createHash('sha256');
  var tables = sql.slotTableNames(slot);
  var tableIndex = 0;

  hash.update(this.buildDigestDomain(meta));
  hash.update('\n');

  var digestNextTable = function () {
    if (tableIndex >= TABLE_ORDER.length) {
      return Promise.resolve(hash.digest('hex'));
    }

    var tableKey = TABLE_ORDER[tableIndex++];
    var tableName = tables[tableKey];
    var query = tableKey === 'round' ?
      sql.canonicalRound :
      (tableKey === 'accounts' ? sql.canonicalAccounts : sql.canonicalAccountDelegates);

    return t.any(query, { tableName: tableName }).then(function (rows) {
      appendTableDigest(hash, tableKey, rows);
      return digestNextTable();
    });
  };

  return digestNextTable();
};

/**
 * Validate restored live mem_* tables against checkpoint metadata.
 * Uses the checkpoint round, not the current chain tip round.
 * @param {object} t pg-promise task/transaction.
 * @param {object} meta Restored checkpoint metadata.
 * @param {number} checkpointRound Round encoded in the checkpoint.
 * @return {Promise<boolean>}
 */
MemCheckpoint.prototype.validateRestoredInvariants = function (t, meta, checkpointRound) {
  var expectedRound = String(checkpointRound);

  // Run checks sequentially: pg-native rejects overlapping queries on one client.
  return t.one(sql.countMemAccountsAtBlock, { blockId: meta.blockId }).then(function (accounts) {
    if (!accounts.count) {
      return false;
    }

    return t.query(sql.getMemRounds);
  }).then(function (roundRows) {
    var unapplied = roundRows.filter(function (row) {
      return row.round !== expectedRound;
    });

    if (unapplied.length > 0) {
      return false;
    }

    return t.query(sql.getOrphanedMemAccounts);
  }).then(function (orphanedRows) {
    if (orphanedRows.length > 0) {
      return false;
    }

    return t.query(sql.getDelegates);
  }).then(function (delegateRows) {
    return delegateRows.length > 0;
  });
};

/**
 * Verify checkpoint metadata, block reference, and stored digest.
 * @param {object} meta Checkpoint metadata row.
 * @param {string} nethash Expected node nethash.
 * @return {Promise<object|null>} Verified metadata or null when rejected.
 */
MemCheckpoint.prototype.verifyCheckpointMeta = function (meta, nethash) {
  var self = this;

  if (!meta || meta.status !== 'complete') {
    return Promise.resolve(null);
  }

  if (parseInt(meta.schemaVersion, 10) !== SCHEMA_VERSION) {
    self.library.logger.warn('memCheckpoints', 'Rejecting checkpoint with unsupported schema version', {
      expected: SCHEMA_VERSION,
      actual: meta.schemaVersion
    });
    return Promise.resolve(null);
  }

  if (meta.nethash !== nethash) {
    self.library.logger.warn('memCheckpoints', 'Rejecting checkpoint with mismatched nethash');
    return Promise.resolve(null);
  }

  if (!meta.digest) {
    self.library.logger.warn('memCheckpoints', 'Rejecting checkpoint without digest');
    return Promise.resolve(null);
  }

  return self.library.db.oneOrNone(sql.blockExists, {
    blockId: meta.blockId,
    height: meta.height
  }).then(function (block) {
    if (!block) {
      self.library.logger.warn('memCheckpoints', 'Rejecting checkpoint with missing block reference', {
        blockId: meta.blockId,
        height: meta.height
      });
      return null;
    }

    // Normalize slot to a number: some pg parsers (e.g. pg-native) return the
    // SMALLINT column as a string, which slotTableNames() would reject.
    var slot = parseInt(meta.slot, 10);

    return self.library.db.tx(function (t) {
      return self.computeDigest(t, slot, meta).then(function (digest) {
        if (digest !== meta.digest) {
          self.library.logger.warn('memCheckpoints', 'Rejecting checkpoint with invalid digest');
          return null;
        }

        return meta;
      });
    });
  });
};

/**
 * Load the newest complete checkpoint metadata row.
 * @return {Promise<object|null>}
 */
MemCheckpoint.prototype.getLatestComplete = function () {
  return this.library.db.oneOrNone(sql.getLatestComplete);
};

/**
 * Compare checkpoint slot table schemas against live mem_* tables.
 * Detects live-table migrations that were not applied to the slot tables,
 * which would otherwise produce failing copies or stale checkpoints.
 * @return {Promise<object|null>} First mismatch found, or null when all slots match.
 */
MemCheckpoint.prototype.verifySlotSchemas = function () {
  var self = this;
  var pairs = [];

  for (var slot = 0; slot < CHECKPOINT_SLOT_COUNT; slot++) {
    var slotTables = sql.slotTableNames(slot);

    TABLE_ORDER.forEach(function (tableKey) {
      pairs.push({
        liveTable: sql.liveTableNames[tableKey],
        slotTable: slotTables[tableKey]
      });
    });
  }

  var pairIndex = 0;

  var checkNextPair = function () {
    if (pairIndex >= pairs.length) {
      return Promise.resolve(null);
    }

    var pair = pairs[pairIndex++];

    return self.library.db.oneOrNone(sql.compareTableSchemas, pair).then(function (mismatch) {
      if (mismatch) {
        return Object.assign({ liveTable: pair.liveTable, slotTable: pair.slotTable }, mismatch);
      }

      return checkNextPair();
    });
  };

  return checkNextPair();
};

/**
 * Copy live mem_* tables into a rotating checkpoint slot after a settled round boundary.
 * @param {object} block Last block of the completed round.
 * @param {number} round Round number for the checkpoint.
 * @param {string} nethash Node nethash written into metadata.
 * @param {Function} [onPinned] Invoked once the transaction has pinned its MVCC
 *   snapshot to `block`; the caller may then release the block-processing
 *   critical section while the copy continues in the background.
 * @return {Promise<void>}
 */
MemCheckpoint.prototype.createCheckpoint = function (block, round, nethash, onPinned) {
  var self = this;

  var pinned = false;
  var signalPinned = function () {
    if (pinned) {
      return;
    }
    pinned = true;
    if (onPinned) {
      onPinned();
    }
  };

  if (!self.isEnabled()) {
    signalPinned();
    return Promise.resolve();
  }

  // REPEATABLE READ gives all copy and digest statements one MVCC snapshot,
  // so the copied tables cannot mix state from different blocks. The snapshot is
  // established by the first statement below and stays frozen for the whole
  // transaction, so the copy can safely run after the critical section is released.
  var txMode = self.library.db.$config.pgp.txMode;
  var mode = new txMode.TransactionMode({ tiLevel: txMode.isolationLevel.repeatableRead });
  var createdSlot;

  return self.library.db.tx({ mode: mode }, function (t) {
    return t.oneOrNone(sql.getLatestComplete).then(function (latestMeta) {
      var slot = self.getNextSlot(latestMeta);
      createdSlot = slot;
      var createdAt = Date.now();
      var meta = {
        slot: slot,
        schemaVersion: SCHEMA_VERSION,
        height: block.height,
        blockId: block.id,
        round: round,
        nethash: nethash,
        createdAt: createdAt
      };

      return t.none(sql.upsertMetaWriting, meta).then(function () {
        // The snapshot is now frozen at `block` (the reads above ran within it);
        // safe to let the caller resume block processing while the copy proceeds.
        signalPinned();
        return t.any(sql.getMemRounds);
      }).then(function (roundRows) {
        // Settled round boundary: mem_round must hold only rows for this round
        // (usually none). Anything else means the snapshot captured an unsettled
        // or mid-block state, so refuse to persist a misleading checkpoint.
        var expectedRound = String(round);
        var unsettled = roundRows.filter(function (row) {
          return String(row.round) !== expectedRound;
        });

        if (unsettled.length > 0) {
          throw new Error('mem_round not settled at checkpoint boundary for round ' + round);
        }

        return execStatementsSequential(t, sql.clearSlotTablesStatements(slot));
      }).then(function () {
        return execStatementsSequential(t, sql.copyLiveToSlotStatements(slot));
      }).then(function () {
        // Guard against a copy that captured state ahead of the checkpoint block.
        return t.oneOrNone(sql.getSlotAccountsMaxBlockHeight(slot));
      }).then(function (row) {
        var copiedHeight = row && row.height !== null ? parseInt(row.height, 10) : 0;

        if (copiedHeight > parseInt(block.height, 10)) {
          throw new Error('Checkpoint copy captured state ahead of block ' + block.height + ' (found height ' + copiedHeight + ')');
        }

        return self.computeDigest(t, slot, meta);
      }).then(function (digest) {
        return t.none(sql.markMetaComplete, { slot: slot, digest: digest });
      });
    });
  }).then(function () {
    self.library.logger.info('memCheckpoints', 'Created mem-table checkpoint', {
      slot: createdSlot,
      height: block.height,
      round: round,
      blockId: block.id
    });
  }).catch(function (err) {
    self.library.logger.error('memCheckpoints', `Failed to create checkpoint: ${err?.message || err}`, err && err.stack);
  }).then(function () {
    // Release the caller even if the transaction failed before the pin was reached.
    signalPinned();
  });
};

/**
 * Find the newest checkpoint that is safe to restore for the current chain tip.
 * All complete slots are considered from newest to oldest, so a corrupted or
 * stale newest slot no longer forces a full rebuild while an older, still-valid
 * slot exists — that is the point of keeping {@link CHECKPOINT_SLOT_COUNT} slots.
 * @param {number} tipHeight Current chain height/block count used by loader.
 * @param {number} tipRound Current round at chain tip.
 * @param {string} nethash Expected node nethash.
 * @return {Promise<object|null>}
 */
MemCheckpoint.prototype.findRecoverableCheckpoint = function (tipHeight, tipRound, nethash) {
  var self = this;

  if (!self.isEnabled()) {
    return Promise.resolve(null);
  }

  var chainHeight = parseInt(tipHeight, 10);

  return self.library.db.any(sql.getCompleteDesc).then(function (metas) {
    if (!metas || !metas.length) {
      return null;
    }

    var index = 0;

    var tryNext = function () {
      if (index >= metas.length) {
        return Promise.resolve(null);
      }

      var meta = metas[index++];
      var checkpointHeight = parseInt(meta.height, 10);

      // A checkpoint ahead of the local chain is unusable; try an older slot.
      if (checkpointHeight > chainHeight) {
        return tryNext();
      }

      // Genesis-height checkpoints are test-only; real nodes only persist round-boundary slots (>= delegates).
      if (checkpointHeight < slots.delegates && chainHeight > slots.delegates) {
        self.library.logger.warn('memCheckpoints', 'Skipping pre-round checkpoint on grown chain', {
          slot: meta.slot,
          checkpointHeight: checkpointHeight,
          tipHeight: chainHeight
        });
        return tryNext();
      }

      return self.verifyCheckpointMeta(meta, nethash).then(function (verified) {
        if (!verified) {
          return tryNext();
        }

        if (parseInt(verified.round, 10) > tipRound) {
          self.library.logger.warn('memCheckpoints', 'Skipping checkpoint with round ahead of chain tip', {
            slot: verified.slot
          });
          return tryNext();
        }

        return verified;
      });
    };

    return tryNext();
  });
};

/**
 * Replace live mem_* tables with a verified checkpoint slot.
 * Unconfirmed (u_*) state is reset to the confirmed state after the copy,
 * because the transaction pool the checkpoint observed no longer exists.
 * @param {object} meta Verified checkpoint metadata.
 * @return {Promise<object>} Restored checkpoint metadata.
 */
MemCheckpoint.prototype.restoreCheckpoint = function (meta) {
  var self = this;
  var slot = parseInt(meta.slot, 10);
  var checkpointRound = parseInt(meta.round, 10);

  return self.library.db.tx(function (t) {
    return execStatementsSequential(t, sql.clearLiveTablesStatements).then(function () {
      return execStatementsSequential(t, sql.copySlotToLiveStatements(slot));
    }).then(function () {
      return execStatementsSequential(t, sql.resetUnconfirmedStateStatements);
    }).then(function () {
      return self.validateRestoredInvariants(t, meta, checkpointRound);
    }).then(function (valid) {
      if (!valid) {
        throw new Error('Restored checkpoint failed invariant checks');
      }

      return meta;
    });
  }).then(function (restoredMeta) {
    self.library.logger.info('memCheckpoints', 'Restored mem-table checkpoint', {
      slot: restoredMeta.slot,
      height: restoredMeta.height,
      round: restoredMeta.round,
      blockId: restoredMeta.blockId
    });

    return restoredMeta;
  });
};

module.exports = MemCheckpoint;
module.exports.execStatementsSequential = execStatementsSequential;
