'use strict';

var crypto = require('crypto');

var bignum = require('./bignum.js');

var accounts = {};

/**
 * Gets address by public
 * @private
 * @implements {crypto.createHash}
 * @implements {bignum.fromBuffer}
 * @param {publicKey} publicKey
 * @return {address} address
 */
accounts.getAddressByPublicKey = function (publicKey) {
    var publicKeyHash = crypto.createHash('sha256').update(publicKey, 'hex').digest();
    var temp = Buffer.alloc(8);

    for (var i = 0; i < 8; i++) {
        temp[i] = publicKeyHash[7 - i];
    }

    return 'U' + bignum.fromBuffer(temp).toString();
};

module.exports = accounts;