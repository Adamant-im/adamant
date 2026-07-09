'use strict';

const { expect } = require('chai');
const crypto = require('crypto');
const slots = require('../../../helpers/slots.js');
const MemCheckpoint = require('../../../logic/memCheckpoint.js');
const sql = require('../../../sql/memCheckpoints.js');
const { modulesLoader } = require('../../common/initModule.js');

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
      expect(logic.isRoundBoundaryBlock(100)).to.equal(false);
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
  });

  describe('checkpoint lifecycle', function () {
    const block = {
      id: 'mem_ckpt_test_block',
      height: 1
    };
    const round = 1;
    let createdMeta;

    before(function (done) {
      db.tx(function (t) {
        return t.one('SELECT "id", "height" FROM blocks WHERE "height" = 1').then(function (genesis) {
          block.id = genesis.id;
          block.height = genesis.height;

          return t.none('DELETE FROM mem_state_checkpoint_meta');
        }).then(function () {
          return t.none(sql.clearLiveTables);
        }).then(function () {
          return t.none('INSERT INTO mem_accounts ("address", "balance", "u_balance", "blockId", "isDelegate", "publicKey") VALUES (\'MEMCKPT1\', 10, 10, ${blockId}, 1, decode(\'aa\', \'hex\'))', { blockId: block.id });
        });
      }).then(function () {
        return logic.createCheckpoint(block, round, nethash);
      }).then(function () {
        return logic.getLatestComplete();
      }).then(function (meta) {
        createdMeta = meta;
        done();
      }).catch(done);
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
  });

  after(function () {
    return db.none(sql.clearSlotTables(0) + sql.clearSlotTables(1) + sql.clearSlotTables(2) + 'DELETE FROM mem_state_checkpoint_meta;');
  });
});
