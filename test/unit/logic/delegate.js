'use strict';

const async = require('async');

const { expect } = require('chai');
const _ = require('lodash');

const TransactionLogic = require('../../../logic/transaction.js');
const Rounds = require('../../../modules/rounds.js');
const AccountLogic = require('../../../logic/account.js');
const AccountModule = require('../../../modules/accounts.js');
const Delegate = require('../../../logic/delegate.js');

const { modulesLoader } = require('../../common/initModule.js');

const constants = require('../../../helpers/constants.js');
const transactionTypes = require('../../../helpers/transactionTypes.js');

const validSender = {
  balance: 8067474861277,
  u_balance: 8067474861277,
  password:
    'rally clean ladder crane gadget century timber jealous shine scorpion beauty salon',
  username: 'market',
  publicKey: 'f4011a1360ac2769e066c789acaaeffa9d707690d4d3f6085a7d52756fbc30d0',
  multimin: 0,
  address: 'U810656636599221322',
};

const validTransactionData = {
  username: 'system',
  sender: validSender,
};

const validTransaction = {
  type: 2,
  amount: 0,
  fee: 0,
  recipientId: null,
  timestamp: 0,
  asset: {},
  senderId: 'U14384059672307251353',
  senderPublicKey:
    'cd67fb7bc27d727636b6fc725aa4a03a4dfcd68990f5aa10c98b8c97dd9ceeae',
  signature:
    'b8961823346bb9049536fbb3a5ce36b3e937fdcb80e75b0ae82a26d941663f802139c1991c9c259ff88abe33779400f7580d3564c938684dc38d6d43cd375f0c',
  id: '8869103705291559476',
};

const validUnconfirmedTransaction = {
  type: 2,
  timestamp: 0,
  amount: 0,
  senderPublicKey:
    'f4011a1360ac2769e066c789acaaeffa9d707690d4d3f6085a7d52756fbc30d0',
  senderId: 'U810656636599221322',
  asset: {
    delegate: {
      username: 'market',
      publicKey:
        'f4011a1360ac2769e066c789acaaeffa9d707690d4d3f6085a7d52756fbc30d0',
    },
  },
  signature:
    '1a4e3167185346f2cba0be57119670a0c737d63ca9e02ce3ff2a9a9e9dad0cccc53e4ced8c2b8a8fa32ce2e95c08c5e95f68a67b4040e75e339dfda6ed554b0a',
  id: '8786873494391552220',
  fee: 300000000000,
  relays: 1,
  receivedAt: '2022-12-16T07:45:53.717Z',
};

const rawValidTransaction = {
  d_username: 'market',
  t_senderPublicKey:
    'f4011a1360ac2769e066c789acaaeffa9d707690d4d3f6085a7d52756fbc30d0',
  t_senderId: 'U810656636599221322',
};

describe('Delegate', () => {
  let delegateBindings;
  /**
   * @type {Delegate}
   */
  let delegate;
  let transaction;
  let accountsModule;

  const dummyBlock = {
    id: '9314232245035524467',
    height: 1,
  };

  const dummySender = {
    address: validUnconfirmedTransaction.senderId,
  };

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
                ed: modulesLoader.scope.ed,
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
      },
      (err, result) => {
        expect(err).to.not.exist;
        delegate = new Delegate(modulesLoader.scope.schema);
        delegateBindings = {
          accounts: result.accountModule,
        };
        delegate.bind(delegateBindings.accounts);

        transaction = result.transactionLogic;
        transaction.attachAssetType(transactionTypes.DELEGATE, delegate);

        accountsModule = result.accountModule;

        done();
      }
    );
  });

  describe('bind', () => {
    it('should be okay with correct params', () => {
      expect(() => {
        delegate.bind(delegateBindings.accounts);
      }).to.not.throw();
    });

    after(() => {
      delegate.bind(delegateBindings.accounts);
    });
  });

  describe('create', () => {
    it('should throw with empty parameters', () => {
      expect(() => {
        delegate.create();
      }).to.throw();
    });

    it('should be okay with valid parameters', () => {
      expect(delegate.create(validTransactionData, validTransaction)).to.be.an(
        'object'
      );
    });
  });

  describe('calculateFee', () => {
    it('should return the correct fee', () => {
      expect(delegate.calculateFee()).to.equal(constants.fees.delegate);
    });
  });

  describe('verify', () => {
    it('should return error if recipientId is set', (done) => {
      const trs = _.cloneDeep(validTransaction);
      trs.recipientId = trs.senderId;
      delegate.verify(trs, validSender, (err) => {
        expect(err).to.equal('Invalid recipient');
        done();
      });
    });

    it('should return error if amount is not zero', (done) => {
      const trs = _.cloneDeep(validTransaction);
      trs.amount = 1;
      delegate.verify(trs, validSender, (err) => {
        expect(err).to.equal('Invalid transaction amount');
        done();
      });
    });

    it('should return error if account is a delegate', (done) => {
      const trs = _.cloneDeep(validTransaction);
      const sender = _.cloneDeep(validSender);
      sender.isDelegate = true;
      delegate.verify(trs, sender, (err) => {
        expect(err).to.equal('Account is already a delegate');
        done();
      });
    });

    it('should return error if asset delegate is not set', (done) => {
      const trs = _.cloneDeep(validTransaction);
      delete trs.asset.delegate;

      delegate.verify(trs, validSender, (err) => {
        expect(err).to.equal('Invalid transaction asset');
        done();
      });
    });

    it('should return error if username is undefined', (done) => {
      const trs = _.cloneDeep(validTransaction);
      delete trs.asset.delegate.username;

      delegate.verify(trs, validSender, (err) => {
        expect(err).to.equal('Username is undefined');
        done();
      });
    });

    it('should return error if username is not in lower case', (done) => {
      const trs = _.cloneDeep(validTransaction);
      trs.asset.delegate.username = trs.asset.delegate.username.toUpperCase();

      delegate.verify(trs, validSender, (err) => {
        expect(err).to.equal('Username must be lowercase');
        done();
      });
    });

    it('should return error if username is empty', (done) => {
      const trs = _.cloneDeep(validTransaction);
      trs.asset.delegate.username = ' ';

      delegate.verify(trs, validSender, (err) => {
        expect(err).to.equal('Empty username');
        done();
      });
    });

    it('should return error if username is too long', (done) => {
      const trs = _.cloneDeep(validTransaction);
      trs.asset.delegate.username = 'a'.repeat(21);

      delegate.verify(trs, validSender, (err) => {
        expect(err).to.equal('Username is too long. Maximum is 20 characters');
        done();
      });
    });

    // it('should return error if username looks like an address', (done) => {
    //   const trs = _.cloneDeep(validTransaction);
    //   trs.asset.delegate.username = 'u123456';

    //   delegate.verify(trs, validSender, (err) => {
    //     expect(err).to.equal('Username can not be a potential address');
    //     done();
    //   });
    // });

    it('should return error if username contains invalid characters', (done) => {
      const trs = _.cloneDeep(validTransaction);
      trs.asset.delegate.username = 'system#';

      delegate.verify(trs, validSender, (err) => {
        expect(err).to.equal(
          'Username can only contain alphanumeric characters with the exception of !@$&_.'
        );
        done();
      });
    });

    it('should verify okay for valid transaction', (done) => {
      delegate.verify(validTransaction, validSender, done);
    });
  });

  describe('process', () => {
    it('should be okay', (done) => {
      delegate.process(validTransaction, validSender, done);
    });
  });

  describe('getBytes', () => {
    it('should throw an error with no param', () => {
      expect(delegate.getBytes).to.throw();
    });

    it('should return same result when called multiple times', () => {
      const firstCalculation = delegate.getBytes(validTransaction);
      const secondCalculation = delegate.getBytes(validTransaction);
      expect(firstCalculation.equals(secondCalculation)).to.be.ok;
    });

    it('should return the valid buffer', () => {
      expect(delegate.getBytes(validTransaction)).to.eql(
        Buffer.from('73797374656d', 'hex')
      );
    });
  });

  describe('apply', () => {
    it('should add delegate flag and username', (done) => {
      const { username } = validUnconfirmedTransaction.asset.delegate;

      delegate.apply.call(
        transaction,
        validUnconfirmedTransaction,
        dummyBlock,
        dummySender,
        (err) => {
          expect(err).to.not.exist;

          accountsModule.getAccount(
            {
              username,
            },
            (err, accountAfter) => {
              expect(err).to.not.exist;
              expect(accountAfter).to.exist;
              expect(accountAfter.isDelegate).to.equal(1);
              done();
            }
          );
        }
      );
    });
  });

  describe('undo', () => {
    function applyTransaction(trs, sender, done) {
      delegate.apply.call(transaction, trs, dummyBlock, sender, done);
    }

    it('should remove delegate flag and username', (done) => {
      const { username } = validUnconfirmedTransaction.asset.delegate;
      accountsModule.getAccount({ username }, (err, accountBefore) => {
        expect(err).to.not.exist;
        expect(accountBefore).to.exist;
        expect(accountBefore.isDelegate).to.equal(1);

        delegate.undo.call(
          transaction,
          validUnconfirmedTransaction,
          dummyBlock,
          dummySender,
          (err) => {
            expect(err).to.not.exist;

            accountsModule.getAccount(
              { address: validSender.address },
              (err, accountAfter) => {
                expect(err).to.not.exist;

                expect(accountAfter).to.exist;
                expect(accountAfter.username).to.equal(null);
                expect(accountAfter.isDelegate).to.equal(0);

                applyTransaction(
                  validUnconfirmedTransaction,
                  dummySender,
                  done
                );
              }
            );
          }
        );
      });
    });
  });

  describe('objectNormalize', () => {
    it('should throw an error with no param', () => {
      expect(delegate.objectNormalize).to.throw();
    });

    it('should be ok with a valid transaction', () => {
      expect(delegate.objectNormalize(validTransaction)).to.equal(
        validTransaction
      );
    });
  });

  describe('dbRead', () => {
    it('should throw an error with no param', () => {
      expect(delegate.dbRead).to.throw();
    });

    it('should return null if d_username field is not present', () => {
      const rawTrs = _.cloneDeep(rawValidTransaction);
      delete rawTrs.d_username;
      const trs = delegate.dbRead(rawTrs);
      expect(trs).to.be.a('null');
    });

    it('should return delegate object with correct fields', () => {
      const rawTrs = _.cloneDeep(rawValidTransaction);
      const trs = delegate.dbRead(rawTrs);
      const expectedKeys = ['username', 'publicKey', 'address'];
      expect(trs.delegate).to.be.an('object');
      expect(trs.delegate).to.have.keys(expectedKeys);
    });
  });

  describe('dbSave', () => {
    it('should throw an error with no param', () => {
      expect(delegate.dbSave).to.throw();
    });

    it('should return promise object for valid parameters', () => {
      const saveQuery = delegate.dbSave(validTransaction);
      const keys = ['table', 'fields', 'values'];
      const valuesKeys = ['username', 'transactionId'];
      expect(saveQuery).to.be.an('object');
      expect(saveQuery).to.have.keys(keys);
      expect(saveQuery.values).to.have.keys(valuesKeys);
    });
  });

  describe('ready', () => {
    it('should return true when sender does not have multisignatures', () => {
      expect(delegate.ready(validTransaction, validSender)).to.be.true;
    });
  });
});
