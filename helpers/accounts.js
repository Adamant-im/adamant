'use strict';

var crypto = require('crypto');

var bignum = require('./bignum.js');

// let sodium = require('sodium');
var sodium = require('sodium-browserify-tweetnacl');

let Mnemonic = require('bitcore-mnemonic');
const { isPublicKey } = require('./publicKey.js');

var accounts = {};

/**
 * Gets address by public key
 * @private
 * @implements {crypto.createHash}
 * @implements {bignum.fromBuffer}
 * @param {string} publicKey
 * @return {string} The address matching the public key, or an empty string if an invalid public key was provided
 */
accounts.getAddressByPublicKey = function (publicKey) {
  if (!isPublicKey(publicKey)) {
    return ''
  }

  var publicKeyHash = crypto.createHash('sha256').update(publicKey, 'hex').digest();
  var temp = Buffer.alloc(8);

  for (var i = 0; i < 8; i++) {
    temp[i] = publicKeyHash[7 - i];
  }

  return 'U' + bignum.fromBuffer(temp).toString();
};

accounts.makeKeypair = function (hash) {
  let keypair = sodium.crypto_sign_seed_keypair(hash);

  return {
    publicKey: keypair.publicKey,
    privateKey: keypair.secretKey
  };
};

accounts.createPassPhraseHash = function (passPhrase) {
  let secretMnemonic = new Mnemonic(passPhrase, Mnemonic.Words.ENGLISH);
  return crypto.createHash('sha256').update(secretMnemonic.toSeed().toString('hex'), 'hex').digest();
};

module.exports = accounts;
