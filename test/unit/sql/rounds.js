'use strict';

const { expect } = require('chai');
const crypto = require('crypto');

const Account = require('../../../logic/account.js');
const Rounds = require('../../../modules/rounds.js');
const accountsHelper = require('../../../helpers/accounts.js');
const constants = require('../../../helpers/constants.js');
const slots = require('../../../helpers/slots.js');
const sql = require('../../../sql/rounds.js');
const zSchema = require('../../../helpers/z_schema.js');
const { modulesLoader } = require('../../common/initModule.js');

const ACTIVE_DELEGATES = constants.activeDelegates;
const ROLLBACK_SENTINEL = Symbol('rollback-test-tx');

/**
 * Runs a callback inside a PostgreSQL transaction that always rolls back.
 * Combined with a transaction-scoped private schema (`SET LOCAL search_path`),
 * all table data and snapshot DDL stay isolated from shared `public` tables.
 * @param {object} db - pg-promise database connection.
 * @param {Function} fn - Transaction body receiving `t`.
 * @return {Promise<void>}
 */
function withRolledBackTx (db, fn) {
  return db.tx(function (t) {
    return Promise.resolve(fn(t)).then(function () {
      throw ROLLBACK_SENTINEL;
    });
  }).catch(function (err) {
    if (err === ROLLBACK_SENTINEL) {
      return;
    }
    throw err;
  });
}

/**
 * Generates deterministic 32-byte hex public keys for fixture delegates.
 * @param {number} count
 * @return {string[]}
 */
function makePublicKeys (count) {
  const keys = [];

  for (let i = 0; i < count; i++) {
    keys.push(crypto.createHash('sha256').update('round-fixture-delegate-' + i).digest('hex'));
  }

  return keys;
}

/**
 * Builds deterministic block fixtures spanning rounds 1 and 2.
 * Round 1 contains nonzero fees in blocks 2..101 while block 1 stays zeroed.
 * @param {string[]} publicKeys
 * @param {object} [options]
 * @param {number} [options.round1Reward=50000000] Reward assigned to blocks 2..101.
 * @param {number} [options.round2Reward=45000000] Reward assigned to blocks 102..202.
 * @return {object[]}
 */
function buildFixtureBlocks (publicKeys, options) {
  const opts = options || {};
  const round1Reward = opts.round1Reward !== undefined ? opts.round1Reward : 50000000;
  const round2Reward = opts.round2Reward !== undefined ? opts.round2Reward : 45000000;
  const blocks = [];

  for (let height = 1; height <= ACTIVE_DELEGATES * 2; height++) {
    const isGenesis = height === 1;
    // Leave 3 delegates out of round 1 and 2 delegates out of round 2 to exercise outsiders/missedblocks.
    const delegateIndex = isGenesis ?
      0 :
      (height <= ACTIVE_DELEGATES ? ((height - 1) % (ACTIVE_DELEGATES - 3)) : ((height - 1) % (ACTIVE_DELEGATES - 2)));

    let totalFee = 0;
    if (!isGenesis && height <= ACTIVE_DELEGATES) {
      // Nonzero fees in blocks 2..101 including a remainder not divisible by 101.
      totalFee = height % 10 === 0 ? 50000000 + height : (height === 2 ? 123456789 : 0);
    } else if (height > ACTIVE_DELEGATES) {
      totalFee = height % 7 === 0 ? 10000000 + height : 0;
    }

    const reward = isGenesis ? 0 : (height <= ACTIVE_DELEGATES ? round1Reward : round2Reward);

    blocks.push({
      id: String(100000 + height),
      version: 0,
      timestamp: height * slots.interval,
      height: height,
      previousBlock: isGenesis ? null : String(100000 + height - 1),
      numberOfTransactions: 0,
      totalAmount: 0,
      totalFee: totalFee,
      reward: reward,
      payloadLength: 0,
      payloadHash: Buffer.alloc(32, height % 256),
      generatorPublicKey: publicKeys[delegateIndex],
      blockSignature: Buffer.alloc(64, (height * 3) % 256)
    });
  }

  return blocks;
}

/**
 * Creates a private transaction-scoped schema and sets `search_path` to it so
 * every unqualified table and snapshot DDL (`mem_round_snapshot`,
 * `mem_votes_snapshot`) resolves inside the isolated schema without touching
 * or locking shared `public` tables.
 * @param {object} t - pg-promise transaction task.
 * @return {Promise<void>}
 */
function createIsolatedSchema (t) {
  const schemaName = 'round_test_' + process.pid;
  const statements = [
    'CREATE SCHEMA ' + schemaName + ';',
    'SET LOCAL search_path TO ' + schemaName + ';',
    'CREATE TABLE blocks (LIKE public.blocks INCLUDING DEFAULTS);',
    'CREATE TABLE mem_accounts (LIKE public.mem_accounts INCLUDING DEFAULTS);',
    'ALTER TABLE mem_accounts ADD PRIMARY KEY ("address");',
    'CREATE TABLE mem_round (LIKE public.mem_round INCLUDING DEFAULTS);',
    'CREATE TABLE mem_accounts2delegates (LIKE public.mem_accounts2delegates INCLUDING DEFAULTS);',
    'CREATE TABLE mem_accounts2u_delegates (LIKE public.mem_accounts2u_delegates INCLUDING DEFAULTS);',
    'CREATE TABLE mem_accounts2multisignatures (LIKE public.mem_accounts2multisignatures INCLUDING DEFAULTS);',
    'CREATE TABLE mem_accounts2u_multisignatures (LIKE public.mem_accounts2u_multisignatures INCLUDING DEFAULTS);'
  ];

  return statements.reduce(function (chain, statement) {
    return chain.then(function () {
      return t.none(statement);
    });
  }, Promise.resolve());
}

/**
 * Inserts a fixture block into the isolated blocks table.
 * @param {object} t - pg-promise transaction task.
 * @param {object} block
 * @return {Promise<void>}
 */
function insertBlock (t, block) {
  return t.none(
      'INSERT INTO blocks ("id", "version", "timestamp", "height", "previousBlock", "numberOfTransactions", "totalAmount", "totalFee", "reward", "payloadLength", "payloadHash", "generatorPublicKey", "blockSignature") ' +
      'VALUES (${id}, ${version}, ${timestamp}, ${height}, ${previousBlock}, ${numberOfTransactions}, ${totalAmount}, ${totalFee}, ${reward}, ${payloadLength}, ${payloadHash}, DECODE(${generatorPublicKey}, \'hex\'), ${blockSignature});',
      block
  );
}

/**
 * Seeds genesis delegate accounts and initial votes in the isolated mem_* tables.
 * @param {object} t - pg-promise transaction task.
 * @param {string[]} publicKeys
 * @param {object} genesisBlock
 * @return {Promise<void>}
 */
function seedGenesisAccounts (t, publicKeys, genesisBlock) {
  const statements = [
    'DELETE FROM mem_accounts2delegates;',
    'DELETE FROM mem_accounts2u_delegates;',
    'DELETE FROM mem_accounts2multisignatures;',
    'DELETE FROM mem_accounts2u_multisignatures;',
    'DELETE FROM mem_round;',
    'DELETE FROM mem_accounts;',
    'DROP TABLE IF EXISTS mem_round_snapshot;',
    'DROP TABLE IF EXISTS mem_votes_snapshot;'
  ];

  return statements.reduce(function (chain, statement) {
    return chain.then(function () {
      return t.none(statement);
    });
  }, Promise.resolve()).then(function () {
    return publicKeys.reduce(function (chain, pk, index) {
      const address = accountsHelper.getAddressByPublicKey(pk);
      const initialBalance = 10000000000 + (index * 100000000);
      const votedPk = publicKeys[(index + 1) % publicKeys.length];

      return chain.then(function () {
        return t.none(
            'INSERT INTO mem_accounts ("address", "publicKey", "username", "u_username", "isDelegate", "u_isDelegate", "balance", "u_balance", "vote", "votesWeight", "producedblocks", "missedblocks", "fees", "rewards", "blockId") ' +
            'VALUES (${address}, DECODE(${pk}, \'hex\'), ${username}, ${username}, 1, 1, ${balance}, ${balance}, 0, 0, 0, 0, 0, 0, ${blockId});',
            {
              address: address,
              pk: pk,
              username: 'delegate_' + index,
              balance: initialBalance,
              blockId: genesisBlock.id
            }
        );
      }).then(function () {
        return t.none(
            'INSERT INTO mem_accounts2delegates ("accountId", "dependentId") VALUES (${address}, ${votedPk});',
            { address: address, votedPk: votedPk }
        );
      }).then(function () {
        // Mirror genesis vote registration into mem_round so height-1 settlement initializes votes.
        return t.none(
            'INSERT INTO mem_round ("address", "amount", "delegate", "blockId", "round") VALUES (${address}, ${amount}, ${votedPk}, ${blockId}, 1);',
            {
              address: address,
              amount: initialBalance,
              votedPk: votedPk,
              blockId: genesisBlock.id
            }
        );
      });
    }, Promise.resolve());
  });
}

/**
 * Captures deterministic derived account and round state for comparison.
 * @param {object} t - pg-promise transaction task.
 * @return {Promise<object>}
 */
function snapshotState (t) {
  return t.any(
      'SELECT "address", "balance"::text, "u_balance"::text, "vote"::text, "votesWeight"::text, ' +
      '"producedblocks", "missedblocks", "fees"::text, "rewards"::text, "blockId" ' +
      'FROM mem_accounts ORDER BY "address" ASC;'
  ).then(function (accounts) {
    return t.any(
        'SELECT "address", "amount"::text, "delegate", "blockId", "round"::text ' +
        'FROM mem_round ORDER BY "round", "address", "delegate", "blockId", "amount";'
    ).then(function (memRound) {
      return { accounts: accounts, memRound: memRound };
    });
  });
}

/**
 * Runs Rounds.tick as a Promise.
 * @param {Rounds} rounds
 * @param {object} block
 * @return {Promise<void>}
 */
function tickAsync (rounds, block) {
  return new Promise(function (resolve, reject) {
    rounds.tick(block, function (err) {
      if (err) {
        return reject(err);
      }
      return resolve();
    });
  });
}

/**
 * Runs Rounds.backwardTick as a Promise.
 * @param {Rounds} rounds
 * @param {object} block
 * @param {object} previousBlock
 * @return {Promise<void>}
 */
function backwardTickAsync (rounds, block, previousBlock) {
  return new Promise(function (resolve, reject) {
    rounds.backwardTick(block, previousBlock, function (err) {
      if (err) {
        return reject(err);
      }
      return resolve();
    });
  });
}

/**
 * Builds a transaction-bound Rounds instance backed by real Account merge SQL.
 * @param {object} t - pg-promise transaction task.
 * @param {string[]} activeDelegateKeys
 * @return {Promise<Rounds>}
 */
function createTxRounds (t, activeDelegateKeys) {
  const logger = {
    debug: function () {},
    error: function () {},
    info: function () {},
    trace: function () {},
    warn: function () {}
  };

  // Route nested db.tx calls onto the outer test transaction so the isolated schema remains active.
  const txDb = {
    query: function (query, values) {
      return t.query(query, values);
    },
    none: function (query, values) {
      return t.none(query, values);
    },
    tx: function (handler) {
      return Promise.resolve(handler(t));
    }
  };

  return new Promise(function (resolve, reject) {
    new Account(txDb, new zSchema(), logger, null, function (accountErr, accountLogic) {
      if (accountErr) {
        return reject(accountErr);
      }

      const accountsModule = {
        generateAddressByPublicKey: function (publicKey) {
          return accountsHelper.getAddressByPublicKey(publicKey);
        },
        mergeAccountAndGet: function (data, cb) {
          const address = data.address || accountsHelper.getAddressByPublicKey(data.publicKey);
          return accountLogic.merge(address, data, cb);
        }
      };

      const delegatesModule = {
        generateDelegateList: function (height, cb) {
          return setImmediate(cb, null, activeDelegateKeys.slice());
        }
      };

      new Rounds(function (roundsErr, roundsInstance) {
        if (roundsErr) {
          return reject(roundsErr);
        }

        roundsInstance.onBind({
          accounts: accountsModule,
          blocks: {},
          delegates: delegatesModule
        });

        return resolve(roundsInstance);
      }, {
        bus: { message: function () {} },
        clientWs: null,
        config: { loading: { snapshot: 0 } },
        db: txDb,
        logger: logger,
        network: { wsServer: { emit: function () {} } }
      });
    });
  });
}

describe('rounds SQL and replay settlement', function () {
  let db;

  before(function (done) {
    modulesLoader.getDbConnection(function (err, connection) {
      db = connection;
      done(err);
    });
  });

  it('bounds summedRound fees, rewards and delegates by block height in ascending height order', function () {
    const publicKeys = makePublicKeys(ACTIVE_DELEGATES);
    const blocks = buildFixtureBlocks(publicKeys);

    // Use varying per-block rewards in this SQL check to verify ordering and upper-bound slicing.
    blocks.forEach(function (block) {
      if (block.height > 1) {
        block.reward = block.height * 1000;
      }
    });

    // Insert blocks out of height order (even heights descending, then odd heights descending)
    // so the test fails if `ORDER BY b.height ASC` is removed from `sql.summedRound`.
    const interleavedBlocks = blocks
        .filter(function (block) {
          return block.height % 2 === 0;
        })
        .reverse()
        .concat(
            blocks
                .filter(function (block) {
                  return block.height % 2 !== 0;
                })
                .reverse()
        );

    return withRolledBackTx(db, function (t) {
      return createIsolatedSchema(t).then(function () {
        return interleavedBlocks.reduce(function (chain, block) {
          return chain.then(function () {
            return insertBlock(t, block);
          });
        }, Promise.resolve());
      }).then(function () {
        return t.query(sql.summedRound, {
          round: 1,
          activeDelegates: ACTIVE_DELEGATES,
          height: 1
        });
      }).then(function (genesisRows) {
        expect(genesisRows).to.have.length(1);
        expect(Number(genesisRows[0].fees)).to.equal(0);
        expect(genesisRows[0].rewards.map(Number)).to.deep.equal([0]);
        expect(genesisRows[0].delegates).to.deep.equal([blocks[0].generatorPublicKey]);

        // Inclusive upper bound check for a partial height inside round 1.
        return t.query(sql.summedRound, {
          round: 1,
          activeDelegates: ACTIVE_DELEGATES,
          height: 50
        });
      }).then(function (partialRows) {
        const expectedPartial = blocks.slice(0, 50);
        const expectedFees = expectedPartial.reduce(function (sum, b) {
          return sum + b.totalFee;
        }, 0);

        expect(Number(partialRows[0].fees)).to.equal(expectedFees);
        expect(partialRows[0].rewards.map(Number)).to.deep.equal(expectedPartial.map(function (b) {
          return b.reward;
        }));
        expect(partialRows[0].delegates).to.deep.equal(expectedPartial.map(function (b) {
          return b.generatorPublicKey;
        }));

        return t.query(sql.summedRound, {
          round: 1,
          activeDelegates: ACTIVE_DELEGATES,
          height: ACTIVE_DELEGATES
        });
      }).then(function (round1Rows) {
        const expectedRound1 = blocks.slice(0, ACTIVE_DELEGATES);
        const expectedFees = expectedRound1.reduce(function (sum, b) {
          return sum + b.totalFee;
        }, 0);

        expect(expectedFees).to.be.above(0);
        expect(Number(round1Rows[0].fees)).to.equal(expectedFees);
        expect(round1Rows[0].rewards.map(Number)).to.deep.equal(expectedRound1.map(function (b) {
          return b.reward;
        }));
        expect(round1Rows[0].delegates).to.deep.equal(expectedRound1.map(function (b) {
          return b.generatorPublicKey;
        }));

        return t.query(sql.summedRound, {
          round: 2,
          activeDelegates: ACTIVE_DELEGATES,
          height: ACTIVE_DELEGATES * 2
        });
      }).then(function (round2Rows) {
        const expectedRound2 = blocks.slice(ACTIVE_DELEGATES, ACTIVE_DELEGATES * 2);
        const expectedFees = expectedRound2.reduce(function (sum, b) {
          return sum + b.totalFee;
        }, 0);

        expect(expectedFees).to.be.above(0);
        expect(Number(round2Rows[0].fees)).to.equal(expectedFees);
        expect(round2Rows[0].rewards.map(Number)).to.deep.equal(expectedRound2.map(function (b) {
          return b.reward;
        }));
        expect(round2Rows[0].delegates).to.deep.equal(expectedRound2.map(function (b) {
          return b.generatorPublicKey;
        }));
      });
    });
  });

  it('produces identical derived state for incremental sync and full genesis replay with fees and rewards in blocks 2..101', function () {
    const publicKeys = makePublicKeys(ACTIVE_DELEGATES);
    const blocks = buildFixtureBlocks(publicKeys, {
      round1Reward: 50000000,
      round2Reward: 45000000
    });
    const incrementalSnapshots = {};
    const replaySnapshots = {};

    return withRolledBackTx(db, function (t) {
      let rounds;

      return createIsolatedSchema(t).then(function () {
        return createTxRounds(t, publicKeys);
      }).then(function (roundsInstance) {
        rounds = roundsInstance;
        return seedGenesisAccounts(t, publicKeys, blocks[0]);
      }).then(function () {
        // Phase 1: Incremental sync — persist each block immediately before its tick.
        return blocks.reduce(function (chain, block) {
          return chain.then(function () {
            return insertBlock(t, block);
          }).then(function () {
            return tickAsync(rounds, block);
          }).then(function () {
            if (
              block.height === 1 ||
              block.height === ACTIVE_DELEGATES ||
              block.height === ACTIVE_DELEGATES * 2
            ) {
              return snapshotState(t).then(function (snap) {
                incrementalSnapshots[block.height] = snap;
              });
            }
          });
        }, Promise.resolve());
      }).then(function () {
        // Confirm genesis initialized votes while applying zero fees/rewards at height 1.
        const height1Fees = incrementalSnapshots[1].accounts.reduce(function (sum, row) {
          return sum + Number(row.fees);
        }, 0);
        const height1Rewards = incrementalSnapshots[1].accounts.reduce(function (sum, row) {
          return sum + Number(row.rewards);
        }, 0);
        const height1Votes = incrementalSnapshots[1].accounts.reduce(function (sum, row) {
          return sum + Number(row.vote);
        }, 0);

        expect(height1Fees).to.equal(0);
        expect(height1Rewards).to.equal(0);
        expect(height1Votes).to.be.above(0);

        // Confirm round 1 applied fees and rewards once at height 101.
        const expectedRound1Fees = blocks.slice(0, ACTIVE_DELEGATES).reduce(function (sum, b) {
          return sum + b.totalFee;
        }, 0);
        const expectedRound1Rewards = blocks.slice(0, ACTIVE_DELEGATES).reduce(function (sum, b) {
          return sum + b.reward;
        }, 0);
        const height101Fees = incrementalSnapshots[ACTIVE_DELEGATES].accounts.reduce(function (sum, row) {
          return sum + Number(row.fees);
        }, 0);
        const height101Rewards = incrementalSnapshots[ACTIVE_DELEGATES].accounts.reduce(function (sum, row) {
          return sum + Number(row.rewards);
        }, 0);

        expect(height101Fees).to.equal(expectedRound1Fees);
        expect(height101Rewards).to.equal(expectedRound1Rewards);

        // Phase 2: Full genesis replay — all 202 blocks are already persisted in `blocks`,
        // while mem_* tables are reset to genesis before replaying from height 1.
        return seedGenesisAccounts(t, publicKeys, blocks[0]);
      }).then(function () {
        return blocks.reduce(function (chain, block) {
          return chain.then(function () {
            return tickAsync(rounds, block);
          }).then(function () {
            if (
              block.height === 1 ||
              block.height === ACTIVE_DELEGATES ||
              block.height === ACTIVE_DELEGATES * 2
            ) {
              return snapshotState(t).then(function (snap) {
                replaySnapshots[block.height] = snap;
              });
            }
          });
        }, Promise.resolve());
      }).then(function () {
        expect(replaySnapshots[1]).to.deep.equal(incrementalSnapshots[1]);
        expect(replaySnapshots[ACTIVE_DELEGATES]).to.deep.equal(incrementalSnapshots[ACTIVE_DELEGATES]);
        expect(replaySnapshots[ACTIVE_DELEGATES * 2]).to.deep.equal(incrementalSnapshots[ACTIVE_DELEGATES * 2]);
      });
    });
  });

  it('preserves state across round-boundary rollback and re-apply with mixed rewards at heights 101 and 202', function () {
    const publicKeys = makePublicKeys(ACTIVE_DELEGATES);
    const blocks = buildFixtureBlocks(publicKeys, {
      round1Reward: 50000000,
      round2Reward: 45000000
    });
    // Also exercise a mid-round reward milestone transition inside round 2 (50M -> 45M at position 22).
    blocks.forEach(function (block) {
      if (block.height > ACTIVE_DELEGATES && block.height <= ACTIVE_DELEGATES + 21) {
        block.reward = 50000000;
      }
    });
    const snapshots = {};

    return withRolledBackTx(db, function (t) {
      let rounds;

      return createIsolatedSchema(t).then(function () {
        return createTxRounds(t, publicKeys);
      }).then(function (roundsInstance) {
        rounds = roundsInstance;
        return seedGenesisAccounts(t, publicKeys, blocks[0]);
      }).then(function () {
        // Apply round 1 (heights 1..101), capturing snapshots at 100 and 101.
        return blocks.slice(0, ACTIVE_DELEGATES).reduce(function (chain, block) {
          return chain.then(function () {
            return insertBlock(t, block);
          }).then(function () {
            return tickAsync(rounds, block);
          }).then(function () {
            if (block.height === ACTIVE_DELEGATES - 1 || block.height === ACTIVE_DELEGATES) {
              return snapshotState(t).then(function (snap) {
                snapshots[block.height] = snap;
              });
            }
          });
        }, Promise.resolve());
      }).then(function () {
        // Roll back block 101 while it is still persisted in `blocks`, then delete and re-apply it.
        const block101 = blocks[ACTIVE_DELEGATES - 1];
        const block100 = blocks[ACTIVE_DELEGATES - 2];

        return backwardTickAsync(rounds, block101, block100).then(function () {
          return t.none('DELETE FROM blocks WHERE "height" = ${height};', { height: block101.height });
        }).then(function () {
          return snapshotState(t);
        }).then(function (afterRollback101) {
          expect(afterRollback101.accounts.map(function (row) {
            return Object.assign({}, row, { blockId: null });
          })).to.deep.equal(snapshots[block100.height].accounts.map(function (row) {
            return Object.assign({}, row, { blockId: null });
          }));
          expect(afterRollback101.memRound).to.deep.equal(snapshots[block100.height].memRound);

          return insertBlock(t, block101);
        }).then(function () {
          return tickAsync(rounds, block101);
        }).then(function () {
          return snapshotState(t);
        }).then(function (afterReapply101) {
          expect(afterReapply101).to.deep.equal(snapshots[block101.height]);
        });
      }).then(function () {
        // Continue through round 2 (heights 102..202), capturing snapshots at 201 and 202.
        return blocks.slice(ACTIVE_DELEGATES).reduce(function (chain, block) {
          return chain.then(function () {
            return insertBlock(t, block);
          }).then(function () {
            return tickAsync(rounds, block);
          }).then(function () {
            if (block.height === (ACTIVE_DELEGATES * 2) - 1 || block.height === ACTIVE_DELEGATES * 2) {
              return snapshotState(t).then(function (snap) {
                snapshots[block.height] = snap;
              });
            }
          });
        }, Promise.resolve());
      }).then(function () {
        // Roll back block 202 while still persisted, then delete and re-apply it.
        const block202 = blocks[(ACTIVE_DELEGATES * 2) - 1];
        const block201 = blocks[(ACTIVE_DELEGATES * 2) - 2];

        return backwardTickAsync(rounds, block202, block201).then(function () {
          return t.none('DELETE FROM blocks WHERE "height" = ${height};', { height: block202.height });
        }).then(function () {
          return snapshotState(t);
        }).then(function (afterRollback202) {
          expect(afterRollback202.accounts.map(function (row) {
            return Object.assign({}, row, { blockId: null });
          })).to.deep.equal(snapshots[block201.height].accounts.map(function (row) {
            return Object.assign({}, row, { blockId: null });
          }));
          expect(afterRollback202.memRound).to.deep.equal(snapshots[block201.height].memRound);

          return insertBlock(t, block202);
        }).then(function () {
          return tickAsync(rounds, block202);
        }).then(function () {
          return snapshotState(t);
        }).then(function (afterReapply202) {
          expect(afterReapply202).to.deep.equal(snapshots[block202.height]);
        });
      });
    });
  });
});
