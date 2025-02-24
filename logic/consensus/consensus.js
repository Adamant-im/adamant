const { consensusActivationHeights } = require('./activationHeights.js');

class Consensus {
  constructor() {
    this.loader = null;
  }

  bindModules(modules) {
    this.loader = modules.loader;
  }

  isActivated(codeName) {
    if (typeof codeName !== 'string') {
      throw new Error(`Expected code name to be a string but got ${typeof codeName}`);
    }

    const activationHeight = consensusActivationHeights[codeName];

    if (activationHeight === undefined) {
      return false;
    }

    const currentHeight = this.loader.getHeight();

    return currentHeight >= activationHeight;
  }
}

module.exports = Consensus;
