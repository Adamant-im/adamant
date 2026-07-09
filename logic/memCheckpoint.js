'use strict';

var crypto = require('crypto');
var slots = require('../helpers/slots.js');
var sql = require('../sql/memCheckpoints.js');

/** @type {number} Digest/schema version for checkpoint metadata and hashing. */
var SCHEMA_VERSION = 1;

/** @type {number} Number of rotating checkpoint slots kept on disk (slots 0..2). */
var CHECKPOINT_SLOT_COUNT = 3;

/**
 * Checkpoint table copy/hash order. Accounts must come before dependent tables.
 * @type {string[]}
 */
var TABLE_ORDER = [
  'accounts',
  'accounts2delegates',
  'accounts2u_delegates',
  'accounts2multisignatures',
  'accounts2u_multisignatures',
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
 * @param {number} height
 * @return {boolean}
 */
MemCheckpoint.prototype.isRoundBoundaryBlock = function (height) {
  var round = Math.ceil(height / slots.delegates);
  var nextRound = Math.ceil((height + 1) / slots.delegates);

  return round !== nextRound || height === 1 || height === slots.delegates + 1;
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

    return self.library.db.tx(function (t) {
      return self.computeDigest(t, meta.slot, meta).then(function (digest) {
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
 * Copy live mem_* tables into a rotating checkpoint slot after a settled round boundary.
 * @param {object} block Last block of the completed round.
 * @param {number} round Round number for the checkpoint.
 * @param {string} nethash Node nethash written into metadata.
 * @return {Promise<void>}
 */
MemCheckpoint.prototype.createCheckpoint = function (block, round, nethash) {
  var self = this;

  if (!self.isEnabled()) {
    return Promise.resolve();
  }

  return self.getLatestComplete().then(function (latestMeta) {
    var slot = self.getNextSlot(latestMeta);
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

    return self.library.db.tx(function (t) {
      return t.none(sql.upsertMetaWriting, meta).then(function () {
        return t.none(sql.clearSlotTables(slot));
      }).then(function () {
        return t.none(sql.copyLiveToSlot(slot));
      }).then(function () {
        return self.computeDigest(t, slot, meta);
      }).then(function (digest) {
        return t.none(sql.markMetaComplete, { slot: slot, digest: digest });
      });
    }).then(function () {
      self.library.logger.info('memCheckpoints', 'Created mem-table checkpoint', {
        slot: slot,
        height: block.height,
        round: round,
        blockId: block.id
      });
    }).catch(function (err) {
      self.library.logger.error('memCheckpoints', `Failed to create checkpoint: ${err?.message || err}`, err.stack);
    });
  });
};

/**
 * Find the latest checkpoint that is safe to restore for the current chain tip.
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

  return self.getLatestComplete().then(function (meta) {
    if (!meta) {
      return null;
    }

    if (parseInt(meta.height, 10) >= parseInt(tipHeight, 10)) {
      return null;
    }

    return self.verifyCheckpointMeta(meta, nethash).then(function (verified) {
      if (!verified) {
        return null;
      }

      if (parseInt(verified.round, 10) > tipRound) {
        self.library.logger.warn('memCheckpoints', 'Rejecting checkpoint with round ahead of chain tip');
        return null;
      }

      return verified;
    });
  });
};

/**
 * Replace live mem_* tables with a verified checkpoint slot.
 * @param {object} meta Verified checkpoint metadata.
 * @return {Promise<object>} Restored checkpoint metadata.
 */
MemCheckpoint.prototype.restoreCheckpoint = function (meta) {
  var self = this;
  var slot = parseInt(meta.slot, 10);
  var checkpointRound = parseInt(meta.round, 10);

  return self.library.db.tx(function (t) {
    return t.none(sql.clearLiveTables).then(function () {
      return t.none(sql.copySlotToLive(slot));
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
