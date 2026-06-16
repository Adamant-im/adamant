'use strict';

var crypto = require('crypto');

var bignum = require('./bignum.js');
var ed = require('./ed.js');

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
    return '';
  }

  var publicKeyHash = crypto.createHash('sha256').update(publicKey, 'hex').digest();
  var temp = Buffer.alloc(8);

  for (var i = 0; i < 8; i++) {
    temp[i] = publicKeyHash[7 - i];
  }

  return 'U' + bignum.fromBuffer(temp).toString();
};

accounts.makeKeypair = function (hash) {
  return ed.makeKeypair(hash);
};

accounts.createPassPhraseHash = function (passPhrase) {
  let secretMnemonic = new Mnemonic(passPhrase, Mnemonic.Words.ENGLISH);
  return crypto.createHash('sha256').update(secretMnemonic.toSeed().toString('hex'), 'hex').digest();
};

module.exports = accounts;
