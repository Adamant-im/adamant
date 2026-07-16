'use strict';

const { expect } = require('chai');
const crypto = require('crypto');
const net = require('net');
const slots = require('../../../helpers/slots.js');
const MemCheckpoint = require('../../../logic/memCheckpoint.js');
const execStatementsSequential = MemCheckpoint.execStatementsSequential;
const sql = require('../../../sql/memCheckpoints.js');
const { modulesLoader } = require('../../common/initModule.js');
const testConfig = require('../../config.json');

var LIVE_TABLES = [
  'mem_accounts',
  'mem_accounts2delegates',
  'mem_accounts2u_delegates',
  'mem_accounts2multisignatures',
  'mem_accounts2u_multisignatures',
  'mem_round',
  'mem_state_checkpoint_meta'
];

function backupTableName (tableName) {
  return '_mem_ckpt_utest_bak_' + tableName;
}

function listCheckpointSlotTables () {
  var tables = [];

  for (var slot = 0; slot < MemCheckpoint.CHECKPOINT_SLOT_COUNT; slot++) {
    var slotTables = sql.slotTableNames(slot);
    Object.keys(slotTables).forEach(function (key) {
      tables.push(slotTables[key]);
    });
  }

  return tables;
}

function listTablesToBackup () {
  return LIVE_TABLES.concat(listCheckpointSlotTables());
}

function listBackupTables () {
  return listTablesToBackup().map(backupTableName);
}

function assertNoStaleBackupTables (db) {
  return db.any(
      'SELECT tablename FROM pg_tables WHERE schemaname = current_schema() AND tablename = ANY(${names}) ORDER BY tablename',
      { names: listBackupTables() }
  ).then(function (rows) {
    if (rows.length > 0) {
      throw new Error('Stale memCheckpoint unit-test backup tables exist: ' + rows.map(function (row) {
        return row.tablename;
      }).join(', ') + '. Restore or drop them before running this suite.');
    }
  });
}

function assertLocalTestnetStopped () {
  return new Promise(function (resolve, reject) {
    var socket = net.createConnection({
      host: testConfig.address || '127.0.0.1',
      port: testConfig.port
    });

    socket.setTimeout(500);

    socket.once('connect', function () {
      socket.destroy();
      reject(new Error(
          'Local testnet appears to be running on ' + (testConfig.address || '127.0.0.1') + ':' + testConfig.port +
          '. Stop the node before running memCheckpoint lifecycle tests because they temporarily replace mem_* tables.'
      ));
    });

    socket.once('timeout', function () {
      socket.destroy();
      resolve();
    });

    socket.once('error', function (err) {
      if (err && err.code === 'ECONNREFUSED') {
        resolve();
        return;
      }

      reject(err);
    });
  });
}

function getChainTip (db) {
  return db.one('SELECT "id", "height" FROM blocks ORDER BY "height" DESC LIMIT 1');
}

function assertChainTipUnchanged (db, expectedTip) {
  return getChainTip(db).then(function (actualTip) {
    if (actualTip.id !== expectedTip.id || Number(actualTip.height) !== Number(expectedTip.height)) {
      throw new Error(
          'Refusing to restore memCheckpoint unit-test backups because the chain tip changed from ' +
          expectedTip.height + ':' + expectedTip.id + ' to ' + actualTip.height + ':' + actualTip.id +
          '. Restore the test database from a snapshot before continuing.'
      );
    }
  });
}

function backupTable (t, tableName) {
  var backupName = backupTableName(tableName);

  return t.none('DROP TABLE IF EXISTS "' + backupName + '"').then(function () {
    return t.none('CREATE TABLE "' + backupName + '" AS TABLE "' + tableName + '"');
  });
}

function restoreTable (t, tableName) {
  var backupName = backupTableName(tableName);

  return t.oneOrNone('SELECT to_regclass(${backupName}) AS reg', { backupName: backupName }).then(function (row) {
    if (!row || !row.reg) {
      return;
    }

    return t.none('DELETE FROM "' + tableName + '"').then(function () {
      return t.none('INSERT INTO "' + tableName + '" SELECT * FROM "' + backupName + '"');
    }).then(function () {
      return t.none('DROP TABLE "' + backupName + '"');
    });
  });
}

function backupSharedDbState (db) {
  var tables = listTablesToBackup();

  return db.tx(function (t) {
    return tables.reduce(function (promise, tableName) {
      return promise.then(function () {
        return backupTable(t, tableName);
      });
    }, Promise.resolve());
  });
}

function restoreSharedDbState (db) {
  var tables = listTablesToBackup();

  return db.tx(function (t) {
    return execStatementsSequential(t, sql.clearLiveTablesStatements.concat(['DELETE FROM mem_state_checkpoint_meta;'])).then(function () {
      return tables.reduce(function (promise, tableName) {
        return promise.then(function () {
          return restoreTable(t, tableName);
        });
      }, Promise.resolve());
    });
  });
}

describe('memCheckpoint', function () {
  let logic;
  let db;
  const nethash = '38f153a81332dea86751451fd992df26a9249f0834f72f58f84ac31cceb70f43';

  before(function (done) {
    modulesLoader.getDbConnection(function (err, connection) {
      if (err) {
        return done(err);
      }

      db = connection;
      logic = new MemCheckpoint({
        db: db,
        logger: modulesLoader.logger,
        config: {
          memCheckpoints: {
            enabled: true
          }
        }
      });
      done();
    });
  });

  describe('helpers', function () {
    it('should detect round boundary blocks', function () {
      expect(logic.isRoundBoundaryBlock(101)).to.equal(true);
      expect(logic.isRoundBoundaryBlock(202)).to.equal(true);
      expect(logic.isRoundBoundaryBlock(100)).to.equal(false);
      expect(logic.isRoundBoundaryBlock(102)).to.equal(false);
      expect(logic.isRoundBoundaryBlock(1)).to.equal(false);
      expect(logic.getNextSlot({ slot: 2 })).to.equal(0);
    });

    it('should build deterministic digest domain', function () {
      const domain = logic.buildDigestDomain({
        height: 101,
        blockId: 'abc',
        round: 1,
        nethash: nethash
      });

      expect(domain).to.equal('1:101:abc:1:' + nethash);
    });

    it('should checkpoint every round when not syncing', function () {
      expect(logic.shouldCheckpointRound(1, false)).to.equal(true);
      expect(logic.shouldCheckpointRound(99, false)).to.equal(true);
    });

    it('should checkpoint every 100th round while syncing', function () {
      expect(logic.shouldCheckpointRound(99, true)).to.equal(false);
      expect(logic.shouldCheckpointRound(100, true)).to.equal(true);
      expect(logic.shouldCheckpointRound(200, true)).to.equal(true);
    });
  });

  describe('checkpoint lifecycle', function () {
    const block = {
      id: 'mem_ckpt_test_block',
      height: 1
    };
    const round = 1;
    let createdMeta;
    let backupCreated = false;
    let chainTipBeforeBackup;

    before(function () {
      return assertLocalTestnetStopped().then(function () {
        return assertNoStaleBackupTables(db);
      }).then(function () {
        return getChainTip(db);
      }).then(function (chainTip) {
        chainTipBeforeBackup = chainTip;
        return backupSharedDbState(db);
      }).then(function () {
        backupCreated = true;

        return db.tx(function (t) {
          return t.one('SELECT "id", "height" FROM blocks WHERE "height" = 1').then(function (genesis) {
            block.id = genesis.id;
            block.height = genesis.height;

            return t.none('DELETE FROM mem_state_checkpoint_meta');
          }).then(function () {
            return execStatementsSequential(t, sql.clearLiveTablesStatements);
          }).then(function () {
            return t.none('INSERT INTO mem_accounts ("address", "balance", "u_balance", "blockId", "isDelegate", "publicKey") VALUES (\'MEMCKPT1\', 10, 10, ${blockId}, 1, decode(\'aa\', \'hex\'))', { blockId: block.id });
          });
        });
      }).then(function () {
        return logic.createCheckpoint(block, round, nethash);
      }).then(function () {
        return logic.getLatestComplete();
      }).then(function (meta) {
        createdMeta = meta;
      }).catch(function (err) {
        if (!backupCreated) {
          throw err;
        }

        return assertChainTipUnchanged(db, chainTipBeforeBackup).then(function () {
          return restoreSharedDbState(db);
        }).then(function () {
          backupCreated = false;
          throw err;
        });
      });
    });

    after(function () {
      if (!backupCreated) {
        return;
      }

      return assertChainTipUnchanged(db, chainTipBeforeBackup).then(function () {
        return restoreSharedDbState(db);
      }).then(function () {
        backupCreated = false;
      });
    });

    it('should create a complete checkpoint with digest', function () {
      expect(createdMeta).to.be.an('object');
      expect(createdMeta.status).to.equal('complete');
      expect(parseInt(createdMeta.height, 10)).to.equal(block.height);
      expect(createdMeta.digest).to.match(/^[a-f0-9]{64}$/);
    });

    it('should verify a valid checkpoint', function () {
      return logic.verifyCheckpointMeta(createdMeta, nethash).then(function (verified) {
        expect(verified).to.be.an('object');
        expect(verified.blockId).to.equal(block.id);
      });
    });

    it('should reject checkpoint with corrupted digest', function () {
      const corrupted = Object.assign({}, createdMeta, {
        digest: crypto.createHash('sha256').update('invalid').digest('hex')
      });

      return logic.verifyCheckpointMeta(corrupted, nethash).then(function (verified) {
        expect(verified).to.equal(null);
      });
    });

    it('should reject checkpoint with schema version mismatch', function () {
      const mismatched = Object.assign({}, createdMeta, {
        schemaVersion: 999
      });

      return logic.verifyCheckpointMeta(mismatched, nethash).then(function (verified) {
        expect(verified).to.equal(null);
      });
    });

    it('should reject checkpoint with invalid block reference', function () {
      const invalid = Object.assign({}, createdMeta, {
        blockId: 'missing_block_id',
        height: 999999999
      });

      return logic.verifyCheckpointMeta(invalid, nethash).then(function (verified) {
        expect(verified).to.equal(null);
      });
    });

    it('should restore checkpoint and pass invariant checks', function () {
      return db.tx(function (t) {
        return t.none('UPDATE mem_accounts SET "blockId" = \'broken\'');
      }).then(function () {
        return logic.restoreCheckpoint(createdMeta);
      }).then(function (restored) {
        expect(parseInt(restored.height, 10)).to.equal(block.height);
        return db.one(sql.countMemAccountsAtBlock, { blockId: block.id });
      }).then(function (row) {
        expect(row.count).to.equal(1);
      });
    });

    it('should fail invariant checks when mem_round holds an unexpected round', function () {
      // Regression: validateRestoredInvariants must short-circuit the
      // unapplied-rounds check. A bare `return false` did not stop the chain —
      // the value was consumed as the next query's rows, so a checkpoint with a
      // wrong mem_round could still validate as `true`. Runs inside a tx and
      // deletes the injected row before resolving so shared state is untouched.
      const badRound = String(round + 999);

      return db.tx(function (t) {
        return t.none(
            'INSERT INTO mem_round ("address", "amount", "delegate", "blockId", "round") VALUES (\'MEMCKPT1\', 0, \'d\', ${blockId}, ${badRound})',
            { blockId: block.id, badRound: badRound }
        ).then(function () {
          return logic.validateRestoredInvariants(t, createdMeta, round);
        }).then(function (valid) {
          expect(valid).to.equal(false);
          return t.none('DELETE FROM mem_round WHERE "round" = ${badRound}', { badRound: badRound });
        });
      });
    });

    it('should keep previous complete checkpoint when a new write is interrupted', function () {
      const previousDigest = createdMeta.digest;

      return db.none(sql.upsertMetaWriting, {
        slot: logic.getNextSlot(createdMeta),
        schemaVersion: MemCheckpoint.SCHEMA_VERSION,
        height: block.height + slots.delegates,
        blockId: 'interrupted_block',
        round: round + 1,
        nethash: nethash,
        createdAt: Date.now()
      }).then(function () {
        return logic.getLatestComplete();
      }).then(function (latest) {
        expect(latest.digest).to.equal(previousDigest);
        expect(latest.status).to.equal('complete');
      });
    });

    it('should not recover genesis checkpoint on grown chain', function () {
      return logic.findRecoverableCheckpoint(slots.delegates + 100, 3, nethash).then(function (result) {
        expect(result).to.equal(null);
      });
    });

    it('should recover a checkpoint exactly at the chain tip', function () {
      return logic.findRecoverableCheckpoint(block.height, round, nethash).then(function (result) {
        expect(result).to.be.an('object');
        expect(result.blockId).to.equal(block.id);
      });
    });

    it('should reject a checkpoint ahead of the chain tip', function () {
      return logic.findRecoverableCheckpoint(block.height - 1, round, nethash).then(function (result) {
        expect(result).to.equal(null);
      });
    });

    it('should skip a rejected newest slot and recover an older valid slot', function () {
      // Newest complete slot references a height that has no matching block, so
      // it fails verification. Recovery must fall back to the older valid slot
      // instead of giving up and forcing a full rebuild (rotating-slot model).
      var newestSlot = logic.getNextSlot(createdMeta);
      var badDigest = crypto.createHash('sha256').update('bad-newest').digest('hex');

      return db.none(sql.upsertMetaWriting, {
        slot: newestSlot,
        schemaVersion: MemCheckpoint.SCHEMA_VERSION,
        height: block.height + 1,
        blockId: block.id, // real id but wrong height -> blockExists fails
        round: round,
        nethash: nethash,
        createdAt: Date.now()
      }).then(function () {
        return db.none(sql.markMetaComplete, { slot: newestSlot, digest: badDigest });
      }).then(function () {
        // tip must be >= the bad checkpoint height so it is actually verified
        // (not skipped as "ahead of chain") and then rejected.
        return logic.findRecoverableCheckpoint(block.height + 1, round, nethash);
      }).then(function (result) {
        expect(result).to.be.an('object');
        expect(parseInt(result.height, 10)).to.equal(block.height);
        expect(result.blockId).to.equal(block.id);
      }).then(function () {
        return db.none('DELETE FROM mem_state_checkpoint_meta WHERE "slot" = ${slot}', { slot: newestSlot });
      });
    });

    it('should report no slot schema mismatch on freshly migrated tables', function () {
      return logic.verifySlotSchemas().then(function (mismatch) {
        expect(mismatch).to.equal(null);
      });
    });

    it('should reject unsupported checkpoint slot indices', function () {
      expect(function () {
        sql.slotTableNames(99);
      }).to.throw(/Invalid checkpoint slot/);
    });
  });
});
