'use strict';

const { expect } = require('chai');
const sinon = require('sinon');

const { modulesLoader } = require('../../common/initModule.js');

const constants = require('../../../helpers/constants.js');
const bignum = require('../../../helpers/bignum.js');

const { isPublicKey } = require('../../../helpers/publicKey.js');

const Accounts = require('../../../modules/accounts.js');

const {
  testAccount,
  notAMnemonicPassphrase,
  nonExistingAddress,
  invalidPublicKey,
  invalidAddress,
} = require('../../common/stubs/account.js');

describe('accounts', function () {
  /**
   * @type {Accounts}
   */
  let accounts;
  let modules;

  const dummyBlock = {
    id: '9314232245035524467',
    height: 1,
    timestamp: 0,
  };

  before(function (done) {
    modulesLoader.initAllModules((err, __modules) => {
      if (err) {
        return done(err);
      }

      const blocks = __modules.blocks;
      blocks.lastBlock.set(dummyBlock);

      const delegates = __modules.delegates;
      delegates.onBind(__modules);

      const transactions = __modules.transactions;
      transactions.onBind(__modules);

      modules = __modules;
      accounts = __modules.accounts;

      done();
    });
  });

  describe('generateAddressBuPublicKey()', () => {
    it('should throw an error when called without parameters', () => {
      expect(accounts.generateAddressByPublicKey).to.throw();
    });

    it('should throw error when called with invalid public key', () => {
      expect(() =>
        accounts.generateAddressByPublicKey(invalidPublicKey)
      ).to.throw('Invalid public key');
    });

    it('should return a valid address when called with valid public key', () => {
      const address = accounts.generateAddressByPublicKey(
        testAccount.publicKey
      );
      expect(address).to.equal(testAccount.address);
    });
  });

  describe('getAccount()', () => {
    it('should throw error when called without parameters', () => {
      expect(accounts.getAccount).to.throw();
    });

    it('should return null if no account matches the address', () => {
      const filter = { address: nonExistingAddress };
      accounts.getAccount(filter, ['address'], (err, account) => {
        expect(err).not.to.exist;
        expect(account).to.be.null;
      });
    });

    it('should throw error when called with invalid public key', () => {
      const filter = { publicKey: invalidPublicKey };
      const cb = sinon.fake();
      expect(() => accounts.getAccount(filter, [], cb)).to.throw(
        'Invalid public key'
      );
      expect(cb.called).to.be.false;
    });

    it("should return the specified fields of an account matching the given address", (done) => {
      const filter = { address: testAccount.address };
      accounts.getAccount(
        filter,
        ['username', 'address', 'publicKey'],
        (err, account) => {
          expect(err).not.to.exist;
          expect(account).to.eql({
            username: testAccount.username,
            address: testAccount.address,
            publicKey: testAccount.publicKey,
          });
          done();
        }
      );
    });

    it("should return the specified fields of an account matching the given public key", (done) => {
      const filter = { publicKey: testAccount.publicKey };
      accounts.getAccount(filter, ['username', 'address'], (err, account) => {
        expect(err).not.to.exist;
        expect(account).to.eql({
          username: testAccount.username,
          address: testAccount.address,
        });
        done();
      });
    });
  });

  // inherits behaviour from logic.account.getAll()
  describe('getAccounts()', () => {
    it('should throw error when called without parameters', () => {
      expect(accounts.getAccounts).to.throw();
    });
  });

  describe('setAccountAndGet', () => {
    it('should return error when called without public key or address', (done) => {
      accounts.setAccountAndGet({}, (err, accounts) => {
        expect(accounts).not.to.exist;
        expect(err).to.equal('Missing address or public key');
        done();
      });
    });

    it('should throw an error when invalid data is provided and no callback is specified', () => {
      expect(() => accounts.setAccountAndGet({})).to.throw(
        'Missing address or public key'
      );
    });

    it('should return error when invalid public key is provided', (done) => {
      const cb = sinon.fake();
      expect(() =>
        accounts.setAccountAndGet({ publicKey: invalidPublicKey }, cb)
      ).to.throw('Invalid public key');
      expect(cb.called).to.be.false;
      done();
    });

    it("should change the account balance and return the account", (done) => {
      const amount = 100000;

      function undo(previous) {
        accounts.setAccountAndGet(
          {
            publicKey: testAccount.publicKey,
            balance: previous.balance,
            u_balance: previous.u_balance,
          },
          (err) => {
            expect(err).not.to.exist;
            done();
          }
        );
      }

      accounts.getAccount(
        { address: testAccount.address },
        ['balance', 'u_balance'],
        (err, accountBefore) => {
          expect(err).not.to.exist;

          const balance = new bignum(accountBefore.balance)
            .plus(amount)
            .toString();
          const u_balance = new bignum(accountBefore.balance)
            .plus(amount)
            .toString();

          accounts.setAccountAndGet(
            {
              publicKey: testAccount.publicKey,
              balance,
              u_balance,
            },
            (err, account) => {
              expect(err).not.to.exist;

              // check returned values
              expect(account.balance).to.equal(balance);
              expect(account.u_balance).to.equal(u_balance);

              // check if the values were actually saved
              accounts.getAccount(
                { address: testAccount.address },
                ['balance', 'u_balance'],
                (err, accountAfter) => {
                  expect(err).not.to.exist;

                  expect(accountAfter.balance).to.equal(balance);
                  expect(accountAfter.u_balance).to.equal(u_balance);

                  undo(accountBefore);
                }
              );
            }
          );
        }
      );
    });
  });

  describe('mergeAccountAndGet', () => {
    it('should return error when called without parameters', (done) => {
      accounts.mergeAccountAndGet({}, (err, accounts) => {
        expect(accounts).not.to.exist;
        expect(err).to.equal('Missing address or public key');
        done();
      });
    });

    it('should throw an error when invalid data is provided and no callback is specified', () => {
      expect(() => accounts.mergeAccountAndGet({})).to.throw(
        'Missing address or public key'
      );
    });

    it('should throw an error when invalid public key is provided and no address is specified', (done) => {
      const cb = sinon.fake();
      expect(() =>
        accounts.mergeAccountAndGet({ publicKey: invalidPublicKey }, cb)
      ).to.throw('Invalid public key');
      expect(cb.called).to.be.false;
      done();
    });

    it("should change the account balance and return the account", (done) => {
      const amount = 100000;

      function undo(previous) {
        accounts.mergeAccountAndGet(
          {
            publicKey: testAccount.publicKey,
            balance: -amount,
            u_balance: -amount,
          },
          (err) => {
            expect(err).not.to.exist;

            accounts.getAccount(
              { publicKey: testAccount.publicKey },
              ['balance', 'u_balance'],
              (err, account) => {
                expect(err).not.to.exist;
                expect(account.balance).to.equal(previous.balance);
                expect(account.u_balance).to.equal(previous.u_balance);

                done();
              }
            );
          }
        );
      }

      accounts.getAccount(
        { address: testAccount.address },
        ['balance', 'u_balance'],
        (err, accountBefore) => {
          expect(err).not.to.exist;

          const balance = new bignum(accountBefore.balance)
            .plus(amount)
            .toString();
          const u_balance = new bignum(accountBefore.balance)
            .plus(amount)
            .toString();

          accounts.mergeAccountAndGet(
            {
              publicKey: testAccount.publicKey,
              balance: amount,
              u_balance: amount,
            },
            (err, account) => {
              expect(err).not.to.exist;

              // check returned values
              expect(account.balance).to.equal(balance);
              expect(account.u_balance).to.equal(u_balance);

              // check if the values were actually saved
              accounts.getAccount(
                { address: testAccount.address },
                ['balance', 'u_balance'],
                (err, accountAfter) => {
                  expect(err).not.to.exist;

                  expect(accountAfter.balance).to.equal(balance);
                  expect(accountAfter.u_balance).to.equal(u_balance);

                  undo(accountBefore);
                }
              );
            }
          );
        }
      );
    });
  });

  describe('isLoaded', () => {
    it('should return false before accounts.onBind() was called', function () {
      expect(accounts.isLoaded()).to.be.false;
    });
  });

  describe('onBind()', () => {
    it('should initialize modules', () => {
      accounts.onBind(modules);
      expect(accounts.isLoaded()).to.be.true;
    });
  });

  describe('shared', () => {
    const accountKeys = [
      'address',
      'unconfirmedBalance',
      'balance',
      'publicKey',
      'unconfirmedSignature',
      'secondSignature',
      'secondPublicKey',
      'multisignatures',
      'u_multisignatures',
    ];

    describe('open()', () => {
      it('should return error if "secret" is of invalid type', (done) => {
        const body = { secret: true };
        accounts.shared.open({ body }, (err, response) => {
          expect(response).not.to.exist;
          expect(err).to.include('Expected type string but found');
          done();
        });
      });

      it('should return an existing account', (done) => {
        const body = { secret: testAccount.secret };
        accounts.shared.open({ body }, (err, response) => {
          expect(err).not.to.exist;

          expect(response.account).to.have.all.keys(accountKeys);
          expect(response.account.address).to.equal(testAccount.address);
          expect(response.account.publicKey).to.equal(testAccount.publicKey);

          done();
        });
      });

      it('should generate a new account from valid passphrase', (done) => {
        const body = { secret: modulesLoader.scope.ed.generatePassphrase() };

        accounts.shared.open({ body }, (err, response) => {
          expect(err).not.to.exist;
          expect(response.account).to.have.all.keys(accountKeys);

          done();
        });
      });

      it('should throw with invalid passphrase', (done) => {
        const body = { secret: notAMnemonicPassphrase };

        accounts.shared.open({ body }, (err, response) => {
          expect(err).to.include('Mnemonic string is invalid');
          expect(response).not.to.exist;
          done();
        });
      });
    });

    describe('new()', () => {
      it('should return error when invalid public key is provided', (done) => {
        const body = { publicKey: invalidPublicKey };

        accounts.shared.new({ body }, (err, response) => {
          expect(response).not.to.exist;
          expect(err).to.include(
            "Object didn't pass validation for format publicKey"
          );
          done();
        });
      });

      it('should return account data for a new account', (done) => {
        const passphrase = modulesLoader.scope.ed.generatePassphrase();
        const hash = modulesLoader.scope.ed.createPassPhraseHash(passphrase);
        const keypair = modulesLoader.scope.ed.makeKeypair(hash);
        const publicKey = keypair.publicKey.toString('hex');

        const body = { publicKey };
        accounts.shared.new({ body }, (err, response) => {
          expect(err).not.to.exist;
          expect(response.account).to.have.all.keys(accountKeys);
          done();
        });
      });

      it('should return account data for an existing account', (done) => {
        const body = { publicKey: testAccount.publicKey };
        accounts.shared.new({ body }, (err, response) => {
          expect(err).not.to.exist;
          expect(response.account).to.have.all.keys(accountKeys);
          done();
        });
      });
    });

    describe('getBalance()', () => {
      it('should return error when invalid address is provided', (done) => {
        const body = { address: testAccount.publicKey };
        accounts.shared.getBalance({ body }, (err, response) => {
          expect(err).to.include(
            "Object didn't pass validation for format address"
          );
          expect(response).not.to.exist;
          done();
        });
      });

      it('should return balance for an existing account', (done) => {
        const body = { address: testAccount.address };
        accounts.shared.getBalance({ body }, (err, response) => {
          expect(err).not.to.exist;

          const balanceKeys = ['balance', 'unconfirmedBalance'];
          expect(response).to.have.all.keys(balanceKeys);
          done();
        });
      });

      it('should return zero balance for non-existing account', (done) => {
        const body = { address: nonExistingAddress };
        accounts.shared.getBalance({ body }, (err, response) => {
          expect(err).not.to.exist;
          expect(response.balance).to.equal('0');
          expect(response.unconfirmedBalance).to.equal('0');
          done();
        });
      });
    });

    describe('getPublickey()', () => {
      it('should return an error when invalid address is provided', (done) => {
        const body = { address: testAccount.publicKey };
        accounts.shared.getPublickey({ body }, (err, response) => {
          expect(err).to.include(
            "Object didn't pass validation for format address"
          );
          expect(response).not.to.exist;
          done();
        });
      });

      it('should return public key for an existing account', (done) => {
        const body = { address: testAccount.address };
        accounts.shared.getPublickey({ body }, (err, response) => {
          expect(err).not.to.exist;
          expect(response.publicKey).to.equal(testAccount.publicKey);
          done();
        });
      });

      it('should return error for non-existing account', (done) => {
        const body = { address: nonExistingAddress };
        accounts.shared.getPublickey({ body }, (err, response) => {
          expect(response).not.to.exist;
          expect(err).to.equal('Account not found');
          done();
        });
      });
    });

    describe('generatePublicKey()', () => {
      const responseKeys = ['publicKey'];

      it('should generate public key for a new account', (done) => {
        const passphrase = modulesLoader.scope.ed.generatePassphrase();
        const body = { secret: passphrase };
        accounts.shared.generatePublicKey({ body }, (err, response) => {
          expect(err).not.to.exist;
          expect(response).to.have.all.keys(responseKeys);
          expect(isPublicKey(response.publicKey)).to.be.true;
          done();
        });
      });

      it('should return public key for existing account', (done) => {
        const body = { secret: testAccount.secret };
        accounts.shared.generatePublicKey({ body }, (err, response) => {
          expect(err).not.to.exist;
          expect(response).to.have.all.keys(responseKeys);
          expect(response.publicKey).to.equal(testAccount.publicKey);
          done();
        });
      });

      it('should return null publicKey and the error when invalid mnemonic passphrase is provided', (done) => {
        const body = { secret: notAMnemonicPassphrase };
        accounts.shared.generatePublicKey({ body }, (err, response) => {
          expect(err).to.include('Mnemonic string is invalid');
          expect(response.publicKey).to.be.null;
          done();
        });
      });

      it('should return error when provided passphrase is of invalid type', (done) => {
        const body = { secret: 404 };
        accounts.shared.generatePublicKey({ body }, (err, response) => {
          expect(err).to.include('Expected type string');
          expect(response).not.to.exist;
          done();
        });
      });
    });

    describe('getDelegates()', () => {
      const responseKeys = ['delegates'];

      it('should return error when invalid address is provided', (done) => {
        const body = { address: testAccount.publicKey };
        accounts.shared.getDelegates({ body }, (err, response) => {
          expect(err).to.include(
            "Object didn't pass validation for format address"
          );
          expect(response).not.to.exist;
          done();
        });
      });

      it('should return the delegates voted by the address', (done) => {
        const body = { address: testAccount.address };
        accounts.shared.getDelegates({ body }, (err, response) => {
          expect(err).not.to.exist;
          accounts.getAccount(body, (err, account) => {
            expect(err).not.to.exist;
            expect(response).to.have.all.keys(responseKeys);
            expect(response.delegates).to.be.an('array');
            response.delegates.forEach((delegate) =>
              expect(account.delegates).to.include(delegate.publicKey)
            );
            done();
          });
        });
      });
    });

    describe('getDelegatesFee()', () => {
      it('should return delegates fee', (done) => {
        accounts.shared.getDelegatesFee({}, (err, response) => {
          expect(err).not.to.exist;
          expect(response).to.have.all.keys(['fee']);
          expect(response.fee).to.equal(constants.fees.delegate);
          done();
        });
      });
    });

    describe('getAccount()', () => {
      it('should return the account matching the given address', (done) => {
        const body = { address: testAccount.address };
        accounts.shared.getAccount({ body }, (err, response) => {
          expect(err).not.to.exist;

          const { account } = response;
          expect(account).to.have.all.keys(accountKeys);
          expect(account.address).to.equal(testAccount.address);
          expect(account.publicKey).to.equal(testAccount.publicKey);
          done();
        });
      });

      it('should return the account matching the given publicKey', (done) => {
        const body = { publicKey: testAccount.publicKey };
        accounts.shared.getAccount({ body }, (err, response) => {
          expect(err).not.to.exist;

          const { account } = response;
          expect(account).to.have.all.keys(accountKeys);
          expect(account.address).to.equal(testAccount.address);
          expect(account.publicKey).to.equal(testAccount.publicKey);
          done();
        });
      });

      it('should return the account the account matching the given public key and address', (done) => {
        const body = {
          address: testAccount.address,
          publicKey: testAccount.publicKey,
        };
        accounts.shared.getAccount({ body }, (err, response) => {
          expect(err).not.to.exist;

          const { account } = response;
          expect(account).to.have.all.keys(accountKeys);
          expect(account.address).to.equal(testAccount.address);
          expect(account.publicKey).to.equal(testAccount.publicKey);
          done();
        });
      });

      it('should return error if the address and the public key do not match', (done) => {
        const body = {
          address: nonExistingAddress,
          publicKey: testAccount.publicKey,
        };
        accounts.shared.getAccount({ body }, (err, response) => {
          expect(err).to.equal('Account publicKey does not match address');
          expect(response).not.to.exist;
          done();
        });
      });

      it('should return error for non-existing account', (done) => {
        const body = { address: nonExistingAddress };
        accounts.shared.getAccount({ body }, (err, response) => {
          expect(err).to.equal('Account not found');
          expect(response).not.to.exist;
          done();
        });
      });

      it('should return error when invalid public key is provided', (done) => {
        const body = { publicKey: invalidPublicKey };
        accounts.shared.getAccount({ body }, (err, response) => {
          expect(err).to.include(
            "Object didn't pass validation for format publicKey"
          );
          expect(response).not.to.exist;
          done();
        });
      });

      it('should return error when invalid address is provided', (done) => {
        const body = { address: invalidAddress };
        accounts.shared.getAccount({ body }, (err, response) => {
          expect(err).to.include(
            "Object didn't pass validation for format address"
          );
          expect(response).not.to.exist;
          done();
        });
      });
    });
  });
});
