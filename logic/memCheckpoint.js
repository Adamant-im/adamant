'use strict';

var crypto = require('crypto');
var slots = require('../helpers/slots.js');
var sql = require('../sql/memCheckpoints.js');

var SCHEMA_VERSION = 1;
var TABLE_ORDER = [
  'accounts',
  'accounts2delegates',
  'accounts2u_delegates',
  'accounts2multisignatures',
  'accounts2u_multisignatures',
  'round'
];

/**
 * Persisted mem-table checkpoint logic for crash recovery.
 * Checkpoints are a local recovery cache only; blocks remain the source of truth.
 *
 * @param {object} scope
 * @param {Database} scope.db
 * @param {Logger} scope.logger
 * @param {object} scope.config
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

MemCheckpoint.SCHEMA_VERSION = SCHEMA_VERSION;

/**
 * @return {boolean}
 */
MemCheckpoint.prototype.isEnabled = function () {
  var config = this.library.config.memCheckpoints || {};
  return config.enabled !== false;
};

/**
 * @return {number}
 */
MemCheckpoint.prototype.getRetention = function () {
  var config = this.library.config.memCheckpoints || {};
  var retention = parseInt(config.retention, 10);

  if (isNaN(retention) || retention < 2) {
    return 3;
  }

  if (retention > 3) {
    return 3;
  }

  return retention;
};

/**
 * @param {number} height
 * @return {boolean}
 */
MemCheckpoint.prototype.isRoundBoundaryBlock = function (height) {
  var round = Math.ceil(height / slots.delegates);
  var nextRound = Math.ceil((height + 1) / slots.delegates);

  return round !== nextRound || height === 1 || height === slots.delegates + 1;
};

/**
 * @param {object|null} latestMeta
 * @return {number}
 */
MemCheckpoint.prototype.getNextSlot = function (latestMeta) {
  var retention = this.getRetention();

  if (!latestMeta || latestMeta.slot === undefined || latestMeta.slot === null) {
    return 0;
  }

  return (parseInt(latestMeta.slot, 10) + 1) % retention;
};

/**
 * @param {object} meta
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
 * @param {object} t - pg-promise task/tx
 * @param {number} slot
 * @param {object} meta
 * @return {Promise<string>}
 */
MemCheckpoint.prototype.computeDigest = function (t, slot, meta) {
  var self = this;
  var hash = crypto.createHash('sha256');
  var tables = sql.slotTableNames(slot);

  hash.update(self.buildDigestDomain(meta));
  hash.update('\n');

  return TABLE_ORDER.reduce(function (promise, tableKey) {
    return promise.then(function () {
      var tableName = tables[tableKey];
      var query = tableKey === 'round' ?
        sql.canonicalRound :
        (tableKey === 'accounts' ? sql.canonicalAccounts : sql.canonicalAccountDelegates);

      return t.any(query, { tableName: tableName }).then(function (rows) {
        hash.update(tableKey);
        hash.update('\n');

        rows.forEach(function (row) {
          hash.update(row.line);
          hash.update('\n');
        });
      });
    });
  }, Promise.resolve()).then(function () {
    return hash.digest('hex');
  });
};

/**
 * @param {object} t
 * @param {object} meta
 * @param {number} tipRound
 * @return {Promise<boolean>}
 */
MemCheckpoint.prototype.validateRestoredInvariants = function (t, meta, tipRound) {
  return t.batch([
    t.one(sql.countMemAccountsAtBlock, { blockId: meta.blockId }),
    t.query(sql.getMemRounds),
    t.query(sql.getOrphanedMemAccounts),
    t.query(sql.getDelegates)
  ]).then(function (results) {
    if (!results[0].count) {
      return false;
    }

    var unapplied = results[1].filter(function (row) {
      return row.round !== String(tipRound);
    });

    if (unapplied.length > 0) {
      return false;
    }

    if (results[2].length > 0) {
      return false;
    }

    if (results[3].length === 0) {
      return false;
    }

    return true;
  });
};

/**
 * @param {object} meta
 * @param {string} nethash
 * @return {Promise<object|null>}
 */
MemCheckpoint.prototype.verifyCheckpointMeta = function (meta, nethash) {
  var self = this;
  var db = self.library.db;

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

  return db.oneOrNone(sql.blockExists, {
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

    return db.tx(function (t) {
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
 * @return {Promise<object|null>}
 */
MemCheckpoint.prototype.getLatestComplete = function () {
  return this.library.db.oneOrNone(sql.getLatestComplete);
};

/**
 * @param {object} block
 * @param {number} round
 * @param {string} nethash
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
 * @param {number} tipHeight
 * @param {number} tipRound
 * @param {string} nethash
 * @return {Promise<object|null>}
 */
MemCheckpoint.prototype.findRecoverableCheckpoint = function (tipHeight, tipRound, nethash) {
  var self = this;

  if (!self.isEnabled()) {
    return Promise.resolve(null);
  }

  return self.getLatestComplete().then(function (meta) {
    if (!meta || meta.height >= tipHeight) {
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
 * @param {object} meta
 * @param {number} tipRound
 * @return {Promise<object>}
 */
MemCheckpoint.prototype.restoreCheckpoint = function (meta, tipRound) {
  var self = this;
  var slot = parseInt(meta.slot, 10);

  return self.library.db.tx(function (t) {
    return t.none(sql.clearLiveTables).then(function () {
      return t.none(sql.copySlotToLive(slot));
    }).then(function () {
      return self.validateRestoredInvariants(t, meta, tipRound);
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
