/**
 * Consensus activation heights for different protocol upgrades.
 * Each key represents a protocol name, and its value is the block height
 * at which the consensus change is activated.
 */
const consensusActivationHeights = {
  /**
   * The "spaceship" upgrade introduces:
   * - `timestampMs` field for transactions, validated during synchronization.
   */
  spaceship: 100_000_000,
};

module.exports = {
  consensusActivationHeights,
};
