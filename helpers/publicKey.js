/**
 * Tests if the provided value is a valid public key
 * @param {*} value - Value to test.
 * @return {boolean} whether the string can be considered a public key
 */
exports.isPublicKey = (value) => {
  return typeof value === 'string' && Buffer.from(value, 'hex').length === 32;
};
