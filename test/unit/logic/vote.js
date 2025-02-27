'use strict'; /* eslint*/

const async = require('async');

const { expect } = require('chai');
const _ = require('lodash');

const diff = require('../../../helpers/diff.js');
const transactionTypes = require('../../../helpers/transactionTypes.js');
const constants = require('../../../helpers/constants.js');

const { modulesLoader } = require('../../common/initModule');

const TransactionLogic = require('../../../logic/transaction.js');
const Vote = require('../../../logic/vote.js');
const Transfer = require('../../../logic/transfer.js');
const Rounds = require('../../../modules/rounds.js');
const AccountLogic = require('../../../logic/account.js');
const AccountModule = require('../../../modules/accounts.js');
const DelegateModule = require('../../../modules/delegates.js');

const { dummyBlock } = require('../../common/stubs/blocks.js');
const {
  iAccount,
  testAccount,
  testAccountKeypair,
} = require('../../common/stubs/account.js');
const {
  validTransactionData,
  validTransaction,
  existedDelegateKey,
  invalidDelegateKey,
} = require('../../common/stubs/transactions/vote.js');

describe('vote', () => {
  let voteBindings;
  let vote;
  let accountsModule;
  let transaction;

  const votedDelegates = [
    'd365e59c9880bd5d97c78475010eb6d96c7a3949140cda7e667f9513218f9089',
    'd3a3c26c3906080689d0c2ccd3df30f2f4797c881e21a92aa4579bc68744581f',
    '2deabea717a9e9054e3759e3041b84409dd6195c74d9d7736e0cd8442c000f5a',
  ];

  function addVotes(votes, done) {
    const trs = _.clone(validTransaction);
    trs.asset.votes = votes;
    async.parallel(
      [
        (cb) => {
          vote.apply.call(transaction, trs, dummyBlock, testAccount, cb);
        },
        (cb) => {
          vote.applyUnconfirmed.call(transaction, trs, testAccount, cb);
        },
      ],
      done
    );
  }

  function checkAccountVotes(senderPublicKey, state, votes, action, done) {
    votes = action == 'apply' ? votes : diff.reverse(votes);
    accountsModule.getAccount(
      { publicKey: senderPublicKey },
      (err, account) => {
        const delegates =
          (state === 'confirmed' ? account.delegates : account.u_delegates) ||
          [];
        const groupedVotes = _.groupBy(votes, (v) => v[0]);

        expect(
          delegates.filter(
            (v) => groupedVotes['+'] && groupedVotes['+'].indexOf('+' + v) != -1
          ).length
        ).to.be.greaterThanOrEqual(
          groupedVotes['+'] ? groupedVotes['+'].length : 0
        );
        expect(
          delegates.filter(
            (v) => groupedVotes['-'] && groupedVotes['-'].indexOf('-' + v) != -1
          ).length
        ).to.equal(0);
        done();
      }
    );
  }

  before((done) => {
    async.auto(
      {
        rounds(cb) {
          modulesLoader.initModule(Rounds, modulesLoader.scope, cb);
        },
        accountLogic(cb) {
          modulesLoader.initLogicWithDb(AccountLogic, cb, {});
        },
        transactionLogic: [
          'rounds',
          'accountLogic',
          (result, cb) => {
            modulesLoader.initLogicWithDb(
              TransactionLogic,
              (err, __transaction) => {
                __transaction.bindModules(result);
                cb(err, __transaction);
              },
              {
                ed: require('../../../helpers/ed'),
                account: result.account,
              }
            );
          },
        ],
        accountModule: [
          'accountLogic',
          'transactionLogic',
          (result, cb) => {
            modulesLoader.initModuleWithDb(AccountModule, cb, {
              logic: {
                account: result.accountLogic,
                transaction: result.transactionLogic,
              },
            });
          },
        ],
        delegateModule: [
          'accountModule',
          (result, cb) => {
            modulesLoader.initModuleWithDb(
              DelegateModule,
              (err, __delegates) => {
                // not all required bindings, only the ones required for votes
                __delegates.onBind({
                  rounds: result.rounds,
                  accounts: result.accountModule,
                });
                cb(err, __delegates);
              },
              {
                logic: {
                  transaction: result.transactionLogic,
                },
                library: {
                  schema: modulesLoader.scope.schema,
                },
              }
            );
          },
        ],
      },
      (err, result) => {
        expect(err).to.not.exist;
        vote = new Vote(modulesLoader.scope.logger, modulesLoader.scope.schema);
        voteBindings = {
          delegate: result.delegateModule,
          rounds: result.rounds,
          account: result.accountModule,
        };
        vote.bind(result.delegateModule, result.rounds);
        transaction = result.transactionLogic;
        transaction.attachAssetType(transactionTypes.VOTE, vote);
        accountsModule = result.accountModule;
        done();
      }
    );
  });

  before((done) => {
    // create new account for testing;
    const transfer = new Transfer();
    transfer.bind(voteBindings.account, voteBindings.rounds);
    transaction.attachAssetType(transactionTypes.SEND, transfer);

    const sendTrs = {
      type: 0,
      amount: 8067474861277,
      senderPublicKey:
        'c094ebee7ec0c50ebee32918655e089f6e1a604b83bcaa760293c61e0f18ab6f',
      requesterPublicKey: null,
      timestamp: 34251006,
      asset: {},
      data: undefined,
      recipientId: '2262452491031990877L',
      signature:
        'f2910e221d88134265974d9fc8efee0532e7e14ffdb22a9674c64bfd01863e70da75db51f7e0adcfbe87d9efdaef9f914f577ca08a7664db290e8e5ad89eb30c',
      id: '4802102241260248478',
      fee: 10000000,
      senderId: '16313739661670634666L',
    };

    const sender = {
      username: null,
      isDelegate: 0,
      address: '16313739661670634666L',
      publicKey:
        'c094ebee7ec0c50ebee32918655e089f6e1a604b83bcaa760293c61e0f18ab6f',
      balance: 9850458911801508,
      u_balance: 9850458911801508,
      blockId: '8505659485551877884',
    };

    transaction.apply(sendTrs, dummyBlock, sender, done);
  });

  before((done) => {
    addVotes(
      votedDelegates.map((v) => `+${v}`),
      (err) => {
        // it's okay if it returns error, because that means I've already voted for these delegates
        done();
      }
    );
  });

  describe('bind()', () => {
    it('should be okay with correct params', () => {
      expect(() => {
        vote.bind(voteBindings.delegate, voteBindings.rounds);
      }).to.not.throw();
    });

    after(() => {
      vote.bind(voteBindings.delegate, voteBindings.rounds);
    });
  });

  describe('create()', () => {
    it('should throw with empty parameters', () => {
      expect(() => {
        vote.create();
      }).to.throw();
    });

    it('should be okay with valid parameters', () => {
      expect(vote.create(validTransactionData, validTransaction)).to.be.an(
        'object'
      );
    });
  });

  describe('calculateFee()', () => {
    it('should return the correct fee', () => {
      expect(vote.calculateFee()).to.equal(constants.fees.vote);
    });
  });

  describe('verify()', () => {
    it('should return error when recipientId and sender id are different', (done) => {
      const trs = _.cloneDeep(validTransaction);
      trs.recipientId = iAccount.address;
      vote.verify(trs, testAccount, (err) => {
        expect(err).to.equal('Invalid recipient');
        done();
      });
    });

    it('should return error when votes are not set', (done) => {
      const trs = _.cloneDeep(validTransaction);
      delete trs.asset.votes;
      vote.verify(trs, testAccount, (err) => {
        expect(err).to.equal('Invalid transaction asset');
        done();
      });
    });

    it('should return error asset votes are not an array', (done) => {
      const trs = _.cloneDeep(validTransaction);
      trs.asset.votes = '+' + votedDelegates[0];
      vote.verify(trs, testAccount, (err) => {
        expect(err).to.equal('Invalid votes. Must be an array');
        done();
      });
    });

    it('should return error when voting for an account twice', (done) => {
      const trs = _.cloneDeep(validTransaction);
      trs.asset.votes = Array.apply(null, Array(2)).map((v, i) => {
        return (i % 2 ? '+' : '-') + votedDelegates[0];
      });

      vote.verify(trs, testAccount, (err) => {
        expect(err).to.equal(
          'Multiple votes for same delegate are not allowed'
        );
        done();
      });
    });

    it('should return error when votes array is empty', (done) => {
      const trs = _.cloneDeep(validTransaction);
      trs.asset.votes = [];
      vote.verify(trs, testAccount, (err) => {
        expect(err).to.equal('Invalid votes. Must not be empty');
        done();
      });
    });

    it('should return error when removing vote for delegate sender has not voted', (done) => {
      const trs = _.cloneDeep(validTransaction);
      trs.asset.votes = ['-' + iAccount.publicKey];
      vote.verify(trs, testAccount, (err) => {
        expect(err).to.equal(
          'Failed to remove vote, account has not voted for this delegate'
        );
        done();
      });
    });

    it('should return error if votes are more than 33', (done) => {
      const trs = _.cloneDeep(validTransaction);
      trs.asset.votes = [
        '-904c294899819cce0283d8d351cb10febfa0e9f0acd90a820ec8eb90a7084c37',
        '-399a7d14610c4da8800ed929fc6a05133deb8fbac8403dec93226e96fa7590ee',
        '-6e904b2f678eb3b6c3042acb188a607d903d441d61508d047fe36b3c982995c8',
        '-1af35b29ca515ff5b805a5e3a0ab8c518915b780d5988e76b0672a71b5a3be02',
        '-d8daea40fd098d4d546aa76b8e006ce4368c052ffe2c26b6eb843e925d54a408',
        '-386217d98eee87268a54d2d76ce9e801ac86271284d793154989e37cb31bcd0e',
        '-86499879448d1b0215d59cbf078836e3d7d9d2782d56a2274a568761bff36f19',
        '-948b8b509579306694c00833ec1c0f81e964487db2206ddb1517bfeca2b0dc1b',
        '-b00269bd169f0f89bd2f278788616521dd1539868ced5a63b652208a04ee1556',
        '-e13a0267444e026fe755ec128858bf3c519864631e0e4c474ba33f2470a18b83',
        '-1cc68fa0b12521158e09779fd5978ccc0ac26bf99320e00a9549b542dd9ada16',
        '-a10f963752b3a44702dfa48b429ac742bea94d97849b1180a36750df3a783621',
        '-f33f93aa1f3ddcfd4e42d3206ddaab966f7f1b6672e5096d6da6adefd38edc67',
        '-b5341e839b25c4cc2aaf421704c0fb6ba987d537678e23e45d3ca32454a2908c',
        '-da673805f349faf9ca1db167cb941b27f4517a36d23b3c21da4159cff0045fbe',
        '-55405aed8c3a1eabe678be3ad4d36043d6ef8e637d213b84ee703d87f6b250ed',
        '-19ffdf99dee16e4be2db4b0e000b56ab3a4e10bee9f457d8988f75ff7a79fc00',
        '-85b07e51ffe528f272b7eb734d0496158f2b0f890155ebe59ba2989a8ccc9a49',
        '-8a0bcba8e909036b7a0fdb244f049d847b117d871d203ef7cc4c3917c94fd5fd',
        '-95ea7eb026e250741be85e3593166ef0c4cb3a6eb9114dba8f0974987f10403f',
        '-cf8a3bf23d1936a34facc4ff63d86d21cc2e1ac17e0010035dc3ef7ae85010dc',
        '-82174ee408161186e650427032f4cfb2496f429b4157da78888cbcea39c387fc',
        '-4bde949c19a0803631768148019473929b5f8661e9e48efb8d895efa9dd24aef',
        '-2f9b9a43b915bb8dcea45ea3b8552ebec202eb196a7889c2495d948e15f4a724',
        '-9503d36c0810f9ac1a9d7d45bf778387a2baab151a45d77ac1289fbe29abb18f',
        '-a50a55d4476bb118ba5121a07b51c185a8fe0a92b65840143b006b9820124df4',
        '-fc8672466cc16688b5e239a784cd0e4c0acf214af039d9b2bf7a006da4043883',
        '-db821a4f828db977c6a8d186cc4a44280a6ef6f54ac18ec9eb32f78735f38683',
        '-ba7acc3bcbd47dbf13d744e57f696341c260ce2ea8f332919f18cb543b1f3fc7',
        '-47c8b3d6a9e418f0920ef58383260bcd04799db150612d4ff6eb399bcd07f216',
        '-d1c3a2cb254554971db289b917a665b5c547617d6fd20c2d6051bc5dfc805b34',
        '-47b9b07df72d38c19867c6a8c12429e6b8e4d2be48b27cd407da590c7a2af0dc',
        '-9a7452495138cf7cf5a1564c3ef16b186dd8ab4f96423f160e22a3aec6eb614f',
        '-c4dfedeb4f639f749e498a2307f1545ddd6bda62e5503ac1832b122c4a5aedf9',
        '-96c16a6251e1b9a8c918d5821a5aa8dfb9385607258338297221c5a226eca5c6',
        '-910da2a8e20f25ccbcb029fdcafd369b43d75e5bc4dc6d92352c29404acc350f',
        '-eabfe7093ef2394deb1b84287f2ceb1b55fe638edc3358a28fc74f64b3498094',
        '-94b163c5a5ad346db1c84edaff51604164476cf78b8834b6b610dd03bd6b65d9',
        '-6164b0cc68f8de44cde90c78e838b9ee1d6041fa61cf0cfbd834d76bb369a10e',
        '-3476bba16437ee0e04a29daa34d753139fbcfc14152372d7be5b7c75d51bac6c',
        '-01389197bbaf1afb0acd47bbfeabb34aca80fb372a8f694a1c0716b3398db746',
      ];
      vote.verify(trs, testAccount, (err) => {
        expect(err).to.equal(
          'Voting limit exceeded. Maximum is 33 votes per transaction'
        );
        done();
      });
    });

    it('should return error for casting multiple votes for same account in a transaction', (done) => {
      const trs = _.cloneDeep(validTransaction);
      trs.asset.votes = Array.apply(null, Array(2)).map((v, i) => {
        return '+904c294899819cce0283d8d351cb10febfa0e9f0acd90a820ec8eb90a7084c37';
      });
      vote.verify(trs, testAccount, (err) => {
        expect(err).to.equal(
          'Multiple votes for same delegate are not allowed'
        );
        done();
      });
    });

    it('should verify transaction with correct params', (done) => {
      const trs = _.cloneDeep(validTransaction);
      trs.asset.votes = [
        '-d365e59c9880bd5d97c78475010eb6d96c7a3949140cda7e667f9513218f9089',
      ];
      vote.verify(trs, testAccount, done);
    });
  });

  describe('verifyVote()', () => {
    it('should throw if vote is of invalid length', (done) => {
      const invalidVote =
        '-01389197bbaf1afb0acd47bbfeabb34aca80fb372a8f694a1c0716b3398d746';
      vote.verifyVote(invalidVote, (err) => {
        expect(err).to.equal('Invalid vote format');
        done();
      });
    });

    it('should be okay for removing vote', (done) => {
      const validVote =
        '-01389197bbaf1afb0acd47bbfeabb34aca80fb372a8f694a1c0716b3398d746f';
      vote.verifyVote(validVote, done);
    });

    it('should be okay for adding vote', (done) => {
      const validVote =
        '+01389197bbaf1afb0acd47bbfeabb34aca80fb372a8f694a1c0716b3398d746f';
      vote.verifyVote(validVote, done);
    });
  });

  describe('checkConfirmedDelegates()', () => {
    it('should return err if vote is already made to a delegate', (done) => {
      const trs = _.cloneDeep(validTransaction);
      trs.asset.votes = votedDelegates.map((v) => {
        return '+' + v;
      });
      vote.checkConfirmedDelegates(trs, (err) => {
        expect(err).to.equal(
          'Failed to add vote, account has already voted for this delegate'
        );
        done();
      });
    });

    it('should return err when account is not a delegate', (done) => {
      const trs = _.cloneDeep(validTransaction);
      trs.asset.votes = ['+' + iAccount.publicKey];
      vote.checkConfirmedDelegates(trs, (err) => {
        expect(err).to.equal('Delegate not found');
        done();
      });
    });

    it('should be okay when adding vote to a delegate', (done) => {
      const trs = _.clone(validTransaction);
      // remove existing votes
      trs.asset.votes = votedDelegates.map((v) => {
        return '-' + v;
      });
      vote.apply.call(transaction, trs, dummyBlock, testAccount, (err) => {
        checkAccountVotes(
          trs.senderPublicKey,
          'confirmed',
          trs.asset.votes,
          'apply',
          () => null
        );
        trs.asset.votes = votedDelegates.map((v) => {
          return '+' + v;
        });
        vote.checkConfirmedDelegates(trs, () => null);
        // restore votes
        trs.asset.votes = votedDelegates.map((v) => {
          return '+' + v;
        });
        vote.apply.call(transaction, trs, dummyBlock, testAccount, (err) => {
          checkAccountVotes(
            trs.senderPublicKey,
            'confirmed',
            trs.asset.votes,
            'apply',
            done
          );
        });
      });
    });

    it('should return err if vote is not made for a delegate', (done) => {
      const trs = _.cloneDeep(validTransaction);
      trs.asset.votes = [
        '-9f2fcc688518324273da230afff9756312bf23592174896fab669c2d78b1533c',
      ];
      vote.checkConfirmedDelegates(trs, (err) => {
        expect(err).to.equal(
          'Failed to remove vote, account has not voted for this delegate'
        );
        done();
      });
    });

    it('should be okay when removing vote for a delegate', (done) => {
      const trs = _.cloneDeep(validTransaction);
      trs.asset.votes = [`-${existedDelegateKey}`];
      vote.checkConfirmedDelegates(trs, done);
    });
  });

  describe('checkUnconfirmedDelegates()', () => {
    it('should return err if vote is already made to a delegate', (done) => {
      const trs = _.cloneDeep(validTransaction);
      trs.asset.votes = votedDelegates.map((v) => {
        return '+' + v;
      });
      vote.checkUnconfirmedDelegates(trs, (err) => {
        expect(err).to.equal(
          'Failed to add vote, account has already voted for this delegate'
        );
        done();
      });
    });

    it('should return err when account is not a delegate', (done) => {
      const trs = _.cloneDeep(validTransaction);
      trs.asset.votes = [`+${invalidDelegateKey}`];
      vote.checkUnconfirmedDelegates(trs, (err) => {
        expect(err).to.include('Invalid public key');
        done();
      });
    });

    it('should be okay when adding vote to a delegate', (done) => {
      const trs = _.clone(validTransaction);
      trs.asset.votes = votedDelegates.map((v) => {
        return '-' + v;
      });
      vote.apply.call(transaction, trs, dummyBlock, testAccount, (err) => {
        checkAccountVotes(
          trs.senderPublicKey,
          'confirmed',
          trs.asset.votes,
          'apply',
          () => null
        );
        trs.asset.votes = votedDelegates.map((v) => {
          return '+' + v;
        });
        vote.apply.call(transaction, trs, dummyBlock, testAccount, (err) => {
          checkAccountVotes(
            trs.senderPublicKey,
            'confirmed',
            trs.asset.votes,
            'apply',
            done
          );
        });
      });
    });

    it('should return err if vote is not made for a delegate', (done) => {
      const trs = _.cloneDeep(validTransaction);
      trs.asset.votes = [
        '-9f2fcc688518324273da230afff9756312bf23592174896fab669c2d78b1533c',
      ];
      vote.checkUnconfirmedDelegates(trs, (err) => {
        expect(err).to.equal(
          'Failed to remove vote, account has not voted for this delegate'
        );
        done();
      });
    });

    it('should return okay when removing vote for a delegate', (done) => {
      const trs = _.cloneDeep(validTransaction);
      trs.asset.votes = votedDelegates.map((v) => {
        return '-' + v;
      });
      vote.checkUnconfirmedDelegates(trs, done);
    });
  });

  describe('process()', () => {
    it('should be okay', (done) => {
      vote.process(validTransaction, testAccount, done);
    });
  });

  describe('apply()', () => {
    it('should remove votes for delegates', (done) => {
      const trs = _.clone(validTransaction);
      trs.asset.votes = votedDelegates.map((v) => {
        return '-' + v;
      });
      vote.apply.call(transaction, trs, dummyBlock, testAccount, (err) => {
        checkAccountVotes(
          trs.senderPublicKey,
          'confirmed',
          trs.asset.votes,
          'apply',
          done
        );
      });
    });

    it('should add vote for delegate', (done) => {
      const trs = _.cloneDeep(validTransaction);
      trs.asset.votes = votedDelegates.map((v) => {
        return '+' + v;
      });
      vote.apply.call(transaction, trs, dummyBlock, testAccount, (err) => {
        checkAccountVotes(
          trs.senderPublicKey,
          'confirmed',
          trs.asset.votes,
          'apply',
          done
        );
      });
    });
  });

  describe('undo()', () => {
    it('should undo remove votes for delegates', (done) => {
      const trs = _.clone(validTransaction);
      trs.asset.votes = votedDelegates.map((v) => {
        return '-' + v;
      });
      vote.undo.call(
        transaction,
        validTransaction,
        dummyBlock,
        testAccount,
        (err) => {
          checkAccountVotes(
            trs.senderPublicKey,
            'confirmed',
            trs.asset.votes,
            'undo',
            done
          );
        }
      );
    });

    it('should undo add vote for delegate', (done) => {
      const trs = _.cloneDeep(validTransaction);
      trs.asset.votes = votedDelegates.map((v) => {
        return '+' + v;
      });
      vote.undo.call(transaction, trs, dummyBlock, testAccount, (err) => {
        checkAccountVotes(
          trs.senderPublicKey,
          'confirmed',
          trs.asset.votes,
          'undo',
          done
        );
      });
    });
  });

  describe('applyUnconfirmed()', () => {
    it('should remove votes for delegates', (done) => {
      const trs = _.clone(validTransaction);
      trs.asset.votes = votedDelegates.map((v) => {
        return '-' + v;
      });
      vote.applyUnconfirmed.call(
        transaction,
        validTransaction,
        testAccount,
        (err) => {
          checkAccountVotes(
            trs.senderPublicKey,
            'unconfirmed',
            trs.asset.votes,
            'apply',
            done
          );
        }
      );
    });

    it('should add vote for delegate', (done) => {
      const trs = _.cloneDeep(validTransaction);
      trs.asset.votes = votedDelegates.map((v) => {
        return '+' + v;
      });
      vote.applyUnconfirmed.call(transaction, trs, testAccount, (err) => {
        checkAccountVotes(
          trs.senderPublicKey,
          'unconfirmed',
          trs.asset.votes,
          'apply',
          done
        );
      });
    });
  });

  describe('undoUnconfirmed()', () => {
    it('should undo remove votes for delegates', (done) => {
      const trs = _.clone(validTransaction);
      trs.asset.votes = votedDelegates.map((v) => {
        return '-' + v;
      });
      vote.undoUnconfirmed.call(
        transaction,
        validTransaction,
        testAccount,
        (err) => {
          checkAccountVotes(
            trs.senderPublicKey,
            'unconfirmed',
            trs.asset.votes,
            'undo',
            done
          );
        }
      );
    });

    it('should undo add vote for delegate', (done) => {
      const trs = _.cloneDeep(validTransaction);
      trs.asset.votes = votedDelegates.map((v) => {
        return '+' + v;
      });
      vote.undoUnconfirmed.call(transaction, trs, testAccount, (err) => {
        checkAccountVotes(
          trs.senderPublicKey,
          'unconfirmed',
          trs.asset.votes,
          'undo',
          done
        );
      });
    });
  });

  describe('objectNormalize()', () => {
    it('should normalize object for valid trs', () => {
      expect(vote.objectNormalize.call(transaction, validTransaction)).to.eql(
        validTransaction
      );
    });

    it('should throw error for duplicate votes in a transaction', () => {
      const trs = _.cloneDeep(validTransaction);
      trs.asset.votes.push(trs.asset.votes[0]);
      expect(() => {
        vote.objectNormalize.call(transaction, trs);
      }).to.throw(
        'Failed to validate vote schema: Array items are not unique (indexes 0 and 3)'
      );
    });

    it('should return error when votes array is longer than maximum acceptable', () => {
      const trs = _.cloneDeep(validTransaction);
      trs.asset.votes = Array.apply(
        null,
        Array(constants.maxVotesPerTransaction + 1)
      ).map(() => {
        return '+' + iAccount.publicKey;
      });
      expect(() => {
        vote.objectNormalize.call(transaction, trs);
      }).to.throw(
        'Failed to validate vote schema: Array is too long (34), maximum 33'
      );
    });
  });

  describe('dbRead()', () => {
    it('should read votes correct', () => {
      const rawVotes =
        '+9d3058175acab969f41ad9b86f7a2926c74258670fe56b37c429c01fca9f2f0f,+141b16ac8d5bd150f16b1caa08f689057ca4c4434445e56661831f4e671b7c0a,+3ff32442bb6da7d60c1b7752b24e6467813c9b698e0f278d48c43580da972135';
      expect(
        vote.dbRead({
          v_votes: rawVotes,
        })
      ).to.eql({
        votes: rawVotes.split(','),
      });
    });

    it('should return null if no votes are supplied', () => {
      expect(
        vote.dbRead({
          v_votes: null,
        })
      ).to.be.null;
    });
  });

  describe('dbSave()', () => {
    it('should create return db save promise', () => {
      const valuesKeys = ['votes', 'transactionId'];
      const saveQuery = vote.dbSave(validTransaction);
      expect(saveQuery)
        .to.be.an('object')
        .with.keys(['table', 'fields', 'values']);
      expect(saveQuery.values).to.have.keys(valuesKeys);
      expect(saveQuery.values.votes).to.equal(
        validTransaction.asset.votes.join(',')
      );
    });
  });

  describe('ready()', () => {
    it('should return true for single signature trs', () => {
      expect(vote.ready(validTransaction, testAccount)).to.be.true;
    });

    it('should return false for multi signature transaction with less signatures', () => {
      const trs = _.cloneDeep(validTransaction);
      const vs = _.cloneDeep(testAccount);
      vs.multisignatures = [testAccountKeypair.publicKey.toString('hex')];
      expect(transaction.ready(trs, vs)).to.be.false;
    });

    it('should return true for multi signature transaction with alteast min signatures', () => {
      const trs = _.cloneDeep(validTransaction);
      const vs = _.cloneDeep(testAccount);
      vs.multisignatures = [testAccountKeypair.publicKey.toString('hex')];
      vs.multimin = 1;
      delete trs.signature;
      trs.signature = transaction.sign(testAccountKeypair, trs);
      trs.signatures = [transaction.multisign(testAccountKeypair, trs)];
      expect(transaction.ready(trs, vs)).to.be.true;
    });
  });
});
