'use strict';

const whyIsNodeRunning = require('why-is-node-running')
const { expect } = require('chai');

const { removeQueuedJob } = require('../../common/globalAfter.js');
const { modulesLoader } = require('../../common/initModule.js');
const {
  testAccount,
  invalidPublicKey,
  invalidAddress,
} = require('../../common/stubs/account.js');

const constants = require('../../../helpers/constants.js');
const Delegates = require('../../../modules/delegates.js');

const aDelegate = testAccount;

const validGeneratorPubicKey = aDelegate.publicKey;

describe('delegates', function () {
  /**
   * @type {Delegates}
   */
  let delegates;
  let modules;

  const dummyBlock = {
    id: '9314232245035524467',
    height: 1,
    timestamp: 0,
  };

  before(() => {
    delete require.cache[require.resolve('../../../modules/delegates.js')];
  });

  before(function (done) {
    modulesLoader.initAllModules((err, __modules) => {
      if (err) {
        return done(err);
      }

      const blocks = __modules.blocks;
      blocks.lastBlock.set(dummyBlock);

      modules = __modules;
      delegates = __modules.delegates;

      done();
    });
  });

  describe('isLoaded', () => {
    it('should return false before delegates.onBind() was called', function () {
      expect(delegates.isLoaded()).to.be.false;
    });
  });

  describe('onBind()', () => {
    it('should initialize modules', () => {
      delegates.onBind(modules);
      expect(delegates.isLoaded()).to.be.true;
    });
  });

  describe('generateDelegateList', () => {
    it('should generate delegate list with different positions at the following height', (done) => {
      const height = 0;
      delegates.generateDelegateList(height, (err, previousList) => {
        expect(err).to.not.exist;
        expect(previousList).not.to.be.empty;

        previousList.forEach((item) => expect(item).to.be.a.string);

        delegates.generateDelegateList(height + 1, (err, nextList) => {
          expect(err).to.not.exist;
          expect(previousList.length).to.equal(nextList.length);
          expect(previousList).to.have.members(nextList);
          expect(previousList).not.to.eql(nextList);
          done();
        });
      });
    });
  });

  describe('getDelegates', () => {
    it('should throw when called with no parameters', () => {
      expect(delegates.getDelegates).to.throw();
    });

    it('should return all 101 delegates', (done) => {
      delegates.getDelegates({}, {}, (err, response) => {
        expect(response.delegates).to.be.an('array');
        expect(response.count).to.equal(101);
        expect(err).not.to.exist;
        done();
      });
    });
  });

  describe('shared', () => {
    describe('getDelegate', () => {
      it('should return error when invalid username is provided', (done) => {
        const body = { username: 1 };
        delegates.shared.getDelegate({ body }, (err, response) => {
          expect(err).to.include('Expected type string');
          expect(response).not.to.exist;
          done();
        });
      });

      it('should return error when invalid publicKey is provided', (done) => {
        const body = {publicKey: invalidPublicKey}
        delegates.shared.getDelegate({ body }, (err, response) => {
          expect(err).to.include("Object didn't pass validation for format publicKey")
          expect(response).not.to.exist;
          done();
        });
      });

      it('should return error when invalid address is provided', (done) => {
        const body = {address: invalidAddress}
        delegates.shared.getDelegate({ body }, (err, response) => {
          expect(err).to.include("Object didn't pass validation for format address")
          expect(response).not.to.exist;
          done();
        });
      });

      it('should find delegate matching the username', (done) => {
        const body = { username: aDelegate.username };
        delegates.shared.getDelegate({ body }, (err, response) => {
          expect(err).not.to.exist;
          expect(response).to.have.property('delegate');

          const { delegate } = response;

          expect(delegate.username).to.equal(aDelegate.username);
          expect(delegate.publicKey).to.equal(aDelegate.publicKey);
          expect(delegate.address).to.equal(aDelegate.address);

          done();
        });
      });

      it('should find delegate matching the public key', (done) => {
        const body = { publicKey: aDelegate.publicKey };
        delegates.shared.getDelegate({ body }, (err, response) => {
          expect(err).not.to.exist;
          expect(response).to.have.property('delegate');

          const { delegate } = response;

          expect(delegate.username).to.equal(aDelegate.username);
          expect(delegate.publicKey).to.equal(aDelegate.publicKey);
          expect(delegate.address).to.equal(aDelegate.address);

          done();
        });
      });

      // it('should find delegate matching the address', (done) => {
      //   const body = { address: aDelegate.address }
      //   delegates.shared.getDelegate({ body }, (err, response) => {
      //     expect(err).not.to.exist;
      //     expect(response).to.have.property('delegate');

      //     const { delegate } = response;

      //     expect(delegate.username).to.equal(aDelegate.username);
      //     expect(delegate.publicKey).to.equal(aDelegate.publicKey);
      //     expect(delegate.address).to.equal(aDelegate.address);

      //     done();
      //   });
      // });
    });

    describe('getNextForgers', () => {
      it('should return next forgers for the current height', (done) => {
        const body = {};
        delegates.shared.getNextForgers({ body }, (err, response) => {
          const keys = [
            'currentBlock',
            'currentBlockSlot',
            'currentSlot',
            'delegates',
          ];

          expect(err).not.to.exist;
          expect(response).to.have.keys(keys);

          expect(response.currentBlock).to.equal(dummyBlock.height);
          expect(response.currentBlockSlot).to.equal(0);
          expect(response.currentSlot).to.be.greaterThan(0);
          expect(response.delegates).not.to.be.empty;
          done();
        });
      });

      it('should limit delegates count in response', (done) => {
        const body = { limit: 1 };
        delegates.shared.getNextForgers({ body }, (err, response) => {
          expect(err).not.to.exist;
          expect(response.delegates.length).to.equal(1);
          done();
        });
      });
    });

    describe('search', () => {
      it('should throw when no "q" parameter is provided', (done) => {
        const body = { orderBy: 'username' };
        delegates.shared.search({ body }, (err, response) => {
          expect(response).not.to.exist;
          expect(err).to.equal('Missing required property: q');
          done();
        });
      });

      it('should throw error when invalid "orderBy" parameter is provided', (done) => {
        const body = { q: 'market', orderBy: 'votesWeight' };
        delegates.shared.search({ body }, (err, response) => {
          expect(response).not.to.exist;
          expect(err).to.equal('Invalid sort field');
          done();
        });
      });

      it('should return all delegates with "er" in its username', (done) => {
        const body = { q: 'er' };
        delegates.shared.search({ body }, (err, response) => {
          expect(err).not.to.exist;
          expect(response).to.have.key('delegates');
          // todo
          response.delegates.forEach((delegate) =>
            expect(delegate.username).to.include(body.q)
          );
          done();
        });
      });

      it('should find the delegate matching the query', (done) => {
        const body = { q: 'market' };
        delegates.shared.search({ body }, (err, response) => {
          expect(err).not.to.exist;
          response.delegates.forEach((delegate) =>
            expect(delegate.username).to.include(body.q)
          );
          done();
        });
      });
    });

    describe('count', () => {
      it('should return number of delegates in database', (done) => {
        delegates.shared.count({}, (err, response) => {
          expect(err).not.to.exist;
          expect(response).to.have.key('count');
          expect(response.count).to.be.greaterThanOrEqual(101);
          done();
        });
      });
    });

    describe('getVoters', () => {
      it('should throw error when no public key is provided', (done) => {
        const body = {};
        delegates.shared.getVoters({ body }, (err, response) => {
          expect(response).not.to.exist;
          expect(err).to.equal('Missing required property: publicKey');
          done();
        });
      });

      it('should return voters of the delegate matching the public key', (done) => {
        const body = { publicKey: aDelegate.publicKey };
        delegates.shared.getVoters({ body }, (err, response) => {
          expect(err).not.to.exist;
          expect(response).to.have.key('accounts');
          expect(response.accounts).not.to.be.empty;
          done();
        });
      });
    });

    describe('getFee', () => {
      it('should return the delegate registration fee', () => {
        delegates.shared.getFee({}, (err, response) => {
          expect(err).not.to.exist;
          expect(response).to.have.key('fee');
          expect(response.fee).to.equal(constants.fees.delegate);
        });
      });
    });

    describe('getForgedByAccount', () => {
      it('should return error when invalid generator public key is provided', (done) => {
        const body = { generatorPublicKey: invalidPublicKey };
        delegates.shared.getForgedByAccount({ body }, (err, response) => {
          expect(response).not.to.exist;
          expect(err).to.include(
            "Object didn't pass validation for format publicKey"
          );
          done();
        });
      });

      it('should return error when invalid "start" parameter is provided', (done) => {
        const body = {
          generatorPublicKey: validGeneratorPubicKey,
          start: 'string',
          end: 61741820,
        };

        delegates.shared.getForgedByAccount({ body }, (err, response) => {
          expect(response).not.to.exist;
          expect(err).to.include('Expected type integer but found type string');
          done();
        });
      });

      it('should return error when invalid "end" parameter is provided', (done) => {
        const body = {
          generatorPublicKey: validGeneratorPubicKey,
          start: 61741820,
          end: 'string',
        };

        delegates.shared.getForgedByAccount({ body }, (err, response) => {
          expect(response).not.to.exist;
          expect(err).to.include('Expected type integer but found type string');
          done();
        });
      });

      it('should return error when no accounts match the generator public key', (done) => {
        const body = {
          generatorPublicKey:
            'f4011a1360ac2769e066c789acaaeffa9d707690d4d3f6085a7d52756fbc30d1',
        };

        delegates.shared.getForgedByAccount({ body }, (err, response) => {
          expect(response).not.to.exist;
          expect(err).to.equal('Account not found');
          done();
        });
      });

      it('should return delegate forging stats for the provided public key', (done) => {
        const body = { generatorPublicKey: validGeneratorPubicKey };
        delegates.shared.getForgedByAccount({ body }, (err, response) => {
          const keys = ['fees', 'rewards', 'forged'];

          expect(response).to.have.all.keys(keys);
          expect(err).not.to.exist;
          done();
        });
      });

      it('should return delegate past forging stats with forged amount less than current', (done) => {
        const body = { generatorPublicKey: validGeneratorPubicKey };
        delegates.shared.getForgedByAccount({ body }, (err, allTimeStats) => {
          expect(err).not.to.exist;

          const allTimeForgedAmount = Number(allTimeStats.forged);
          expect(allTimeForgedAmount).not.to.be.NaN;

          delegates.shared.getForgedByAccount(
            { body: { ...body, start: 0, end: 61741820 } },
            (err, intervalStats) => {
              expect(err).not.to.exist;

              const intervalForgedAmount = Number(intervalStats.forged);
              expect(intervalForgedAmount).not.to.be.NaN;

              expect(intervalForgedAmount).to.be.lessThan(allTimeForgedAmount);
              done();
            }
          );
        });
      });
    });
  });
});
