/**
 * Tests if the provided value is a valid public key
 * @param {any} str string to test
 * @returns {boolean} whether the string can be considered a public key
 */
exports.isPublicKey = (value) => {
  return typeof value === "string" && Buffer.from(value, "hex").length === 32;
};
