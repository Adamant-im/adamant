const defaultConfig = require('../../config.default.json');

/**
 * Manages consensus activation status based on blockchain height
 * Determines whether specific protocol upgrades have been activated
 */
class Consensus {
  /**
   * Creates a consensus activation registry.
   * @param {object} [activationHeights] - Per-upgrade activation height overrides.
   */
  constructor (activationHeights) {
    this.blocks = null;
    this.loader = null;
    this.activationHeights = {
      ...defaultConfig.consensusActivationHeights,
      ...(activationHeights || {})
    };
  }

  /**
   * Binds required modules to the Consensus instance
   * @param {object} modules - The modules to bind
   * @param {object} [modules.blocks] - Blocks module providing the authoritative chain head.
   * @param {object} [modules.loader] - Loader module used as a compatibility fallback.
   */
  bindModules (modules) {
    this.blocks = modules.blocks || null;
    this.loader = modules.loader || null;
  }

  /**
   * Returns the authoritative current blockchain height.
   * The blocks module advances on every applied block, while loader height can lag
   * between synchronization cycles on a locally forging node.
   * @returns {number} Current blockchain height.
   */
  getCurrentHeight () {
    if (this.blocks && this.blocks.lastBlock && typeof this.blocks.lastBlock.get === 'function') {
      return this.blocks.lastBlock.get().height;
    }

    if (this.loader && typeof this.loader.getHeight === 'function') {
      return this.loader.getHeight();
    }

    throw new Error('Consensus height source is not bound');
  }

  /**
   * Checks if a given consensus upgrade is activated based on a block height.
   * Uses the current blockchain height when `height` is omitted.
   * @param {string} codeName - The name of the consensus upgrade
   * @param {number} [height] - Block height to check
   */
  isActivated (codeName, height) {
    if (typeof codeName !== 'string') {
      throw new Error(`Expected code name to be a string but got ${typeof codeName}`);
    }

    if (height !== undefined && typeof height !== 'number') {
      throw new Error(`Expected height to be a number but got ${typeof height}`);
    }

    const activationHeight = this.activationHeights[codeName];

    if (activationHeight === undefined) {
      return false;
    }

    const currentHeight = height === undefined ? this.getCurrentHeight() : height;

    return currentHeight >= activationHeight;
  }
}

module.exports = Consensus;
