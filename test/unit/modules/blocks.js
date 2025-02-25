'use strict';

const { expect } = require('chai');

const _ = require('lodash');
const sinon = require('sinon');

const { modulesLoader } = require('../../common/initModule.js');
const { dummyBlock } = require('../../common/stubs/blocks.js');

const constants = require('../../../helpers/constants.js');
const Blocks = require('../../../modules/blocks.js');

const generateFreshTimestamp = (secondsAgo) => {
  const delta =
    secondsAgo === undefined ? constants.blockReceiptTimeOut - 1 : secondsAgo;
  const currentTimestamp =
    Math.floor(Date.now() / 1000) - Math.floor(constants.epochTime / 1000);

  return currentTimestamp - delta;
};

describe('blocks', function () {
  /**
   * @type {Blocks}
   */
  let blocks;

  before(function (done) {
    modulesLoader.initModules(
      [{ blocks: Blocks }],
      [
        { transaction: require('../../../logic/transaction') },
        { block: require('../../../logic/block') },
        { peers: require('../../../logic/peers.js') },
      ],
      {},
      function (err, __blocks) {
        if (err) {
          return done(err);
        }
        blocks = __blocks.blocks;
        done();
      }
    );
  });

  describe('lastBlock', () => {
    afterEach(() => {
      blocks.lastBlock.set({});
    });

    describe('set()', () => {
      it('should set the last block and return it', () => {
        const block = _.cloneDeep(dummyBlock);

        const result = blocks.lastBlock.set(block);
        expect(result).to.eql(block);

        const lastBlock = blocks.lastBlock.get();
        expect(lastBlock).to.eql(block);
      });
    });

    describe('get()', () => {
      it('should return the last set block', () => {
        const beforeBlock = blocks.lastBlock.get();
        expect(beforeBlock).to.eql({});

        blocks.lastBlock.set(dummyBlock);

        const afterBlock = blocks.lastBlock.get();
        expect(afterBlock).to.eql(dummyBlock);
      });
    });

    describe('isFresh()', () => {
      it('should return false when last block is not set', () => {
        const fresh = blocks.lastBlock.isFresh();
        expect(fresh).to.be.false;
      });

      it('should return false when the last block is too old', () => {
        const block = _.cloneDeep(dummyBlock);
        block.timestamp = 0;

        blocks.lastBlock.set(block);

        const fresh = blocks.lastBlock.isFresh();
        expect(fresh).to.be.false;
      });

      it('should return true for the block with the timestamp within constants.blockRecepitTimeOut', () => {
        const block = _.cloneDeep(dummyBlock);
        block.timestamp = generateFreshTimestamp();

        blocks.lastBlock.set(block);

        const fresh = blocks.lastBlock.isFresh();
        expect(fresh).to.be.true;
      });
    });
  });

  describe('getBlockProgressLogger', function () {
    it('should logs correctly', function () {
      var tracker = blocks.utils.getBlockProgressLogger(5, 2, '');
      tracker.log = sinon.spy();
      expect(tracker.applied).to.equals(0);
      expect(tracker.step).to.equals(2);
      tracker.applyNext();
      expect(tracker.log.calledOnce).to.ok;
      expect(tracker.applied).to.equals(1);
      tracker.applyNext();
      expect(tracker.log.calledTwice).to.not.ok;
      expect(tracker.applied).to.equals(2);
      tracker.applyNext();
      expect(tracker.log.calledTwice).to.ok;
      expect(tracker.applied).to.equals(3);
      tracker.applyNext();
      expect(tracker.log.calledThrice).to.not.ok;
      expect(tracker.applied).to.equals(4);
      tracker.applyNext();
      expect(tracker.log.calledThrice).to.ok;
      expect(tracker.applied).to.equals(5);

      expect(tracker.applyNext.bind(tracker)).to.throw(
        'Cannot apply transaction over the limit: 5'
      );
    });
  });
});
