const { consensusActivationHeights } = require('./activationHeights.js');

/**
 * Manages consensus activation status based on blockchain height
 * Determines whether specific protocol upgrades have been activated
 */
class Consensus {
  constructor() {
    this.loader = null;
  }

  /**
   * Binds required modules to the Consensus instance
   * @param {object} modules - The modules to bind
   * @param {object} modules.loader - The loader module providing blockchain height
   */
  bindModules(modules) {
    this.loader = modules.loader;
  }

  /**
   * Checks if a given consensus upgrade is activated based on the current blockchain height
   * @param {string} codeName - The name of the consensus upgrade
   * @throws {Error} If `codeName` is not a string
   * @return {boolean} `true` if the upgrade is activated, otherwise `false`
   */
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
