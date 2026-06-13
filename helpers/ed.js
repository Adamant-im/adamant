'use strict';

var sodium = require('sodium-native');

var mnemonic = require('bitcore-mnemonic');

var crypto = require('crypto');

/**
 * Crypto functions that implements sodium.
 * @memberof module:helpers
 * @requires sodium
 * @namespace
 */
var ed = {};

/**
 * Returns whether the passphrase is valid mnemonic
 * @param {string} passphrase passhraase to test
 * @returns {boolean}
 */
ed.isValidPassphrase = function (passphrase) {
  return mnemonic.isValid(passphrase, mnemonic.Words.ENGLISH);
};

/**
 * Generates a new passphrase
 * @returns {string} passphrase
 */
ed.generatePassphrase = function () {
  const secretMnemonic = new mnemonic(mnemonic.Words.ENGLISH);
  return secretMnemonic.phrase;
};

/**
 * Creates a hash based on a passphrase.
 * @param {string} passPhrase
 * @return {string} hash
 */

ed.createPassPhraseHash = function (passPhrase) {
  var secretMnemonic = new mnemonic(passPhrase, mnemonic.Words.ENGLISH);
  return crypto.createHash('sha256').update(secretMnemonic.toSeed().toString('hex'), 'hex').digest();
};


/**
 * Creates a keypair based on a hash.
 * @implements {sodium}
 * @param {hash} hash
 * @return {Object} publicKey, privateKey
 */
ed.makeKeypair = function (hash) {
  const publicKey = Buffer.alloc(sodium.crypto_sign_PUBLICKEYBYTES);
  const privateKey = Buffer.alloc(sodium.crypto_sign_SECRETKEYBYTES);
  sodium.crypto_sign_seed_keypair(publicKey, privateKey, hash);

  return {
    publicKey,
    privateKey
  };
};

/**
 * Creates a signature based on a hash and a keypair.
 * @implements {sodium}
 * @param {hash} hash
 * @param {keypair} keypair
 * @return {signature} signature
 */
ed.sign = function (hash, keypair) {
  const signature = Buffer.alloc(sodium.crypto_sign_BYTES);
  sodium.crypto_sign_detached(signature, hash, keypair.privateKey);
  return signature;
};

/**
 * Verifies a signature based on a hash and a publicKey.
 * @implements {sodium}
 * @param {hash} hash
 * @param {keypair} keypair
 * @return {Boolean} true id verified
 */
ed.verify = function (hash, signatureBuffer, publicKeyBuffer) {
  if (!Buffer.isBuffer(signatureBuffer) || signatureBuffer.length !== sodium.crypto_sign_BYTES) {
    throw new Error('Signature must be a 64-byte buffer');
  }

  if (!Buffer.isBuffer(publicKeyBuffer) || publicKeyBuffer.length !== sodium.crypto_sign_PUBLICKEYBYTES) {
    throw new Error('Public key must be a 32-byte buffer');
  }

  return sodium.crypto_sign_verify_detached(signatureBuffer, hash, publicKeyBuffer);
};

module.exports = ed;
