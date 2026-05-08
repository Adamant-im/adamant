'use strict';

const { expect } = require('chai');

const Consensus = require('../../../logic/consensus/consensus.js');
const defaultConfig = require('../../../config.default.json');

const consensusActivationHeights = defaultConfig.consensusActivationHeights;

describe('consensus', () => {
  function createConsensus (activationHeights, loaderHeight) {
    const consensus = new Consensus(activationHeights);

    consensus.bindModules({
      loader: {
        getHeight: () => loaderHeight
      }
    });

    return consensus;
  }

  describe('isActivated()', () => {
    it('should use default activation heights when config is omitted', () => {
      const consensus = createConsensus(null, consensusActivationHeights.spaceship);

      expect(consensus.isActivated('spaceship')).to.be.true;
      expect(consensus.isActivated('spaceship', consensusActivationHeights.spaceship - 1)).to.be.false;
    });

    it('should allow config activation heights to override defaults', () => {
      const consensus = createConsensus({ spaceship: 10 }, 9);

      expect(consensus.isActivated('spaceship')).to.be.false;
      expect(consensus.isActivated('spaceship', 10)).to.be.true;
    });

    it('should preserve fairSystem first active height', () => {
      const consensus = createConsensus(null, consensusActivationHeights.fairSystem);

      expect(consensusActivationHeights.fairSystem).to.equal(4359465);
      expect(consensus.isActivated('fairSystem', 4359464)).to.be.false;
      expect(consensus.isActivated('fairSystem', 4359465)).to.be.true;
    });
  });
});
