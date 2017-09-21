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
    var temp = Buffer.alloc(10);

    for (var i = 0; i < 10; i++) {
        temp[i] = publicKeyHash[9 - i];
    }

    var address = 'U' + bignum.fromBuffer(temp).toString();
    return address;
};

module.exports = accounts;