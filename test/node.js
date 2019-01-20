'use strict';

/*global Uint8Array*/

// Root object
var node = {};
var slots = require('../helpers/slots.js');
const _ = require('lodash');
const sodium = require('sodium-browserify-tweetnacl');
const crypto = require('crypto');
const bignum = require('../helpers/bignum.js');
const ByteBuffer = require('bytebuffer');
const Mnemonic = require('bitcore-mnemonic');
const transactionTypes = require('../helpers/transactionTypes.js');
var packageJson = require('../package.json');

// Requires
node.bignum = require('../helpers/bignum.js');
node.config = require('../config.json');
node.constants = require('../helpers/constants.js');
node.txTypes = require('../helpers/transactionTypes.js');
node.accounts = require('../helpers/accounts.js');

node._ = require('lodash');
node.async = require('async');
node.popsicle = require('popsicle');
node.expect = require('chai').expect;
node.chai = require('chai');
node.chai.config.includeStack = true;
node.chai.use(require('chai-bignumber')(node.bignum));
// node.lisk = require('./lisk-js');
node.supertest = require('supertest');
require('colors');

// Node configuration
node.baseUrl = 'http://' + node.config.address + ':' + node.config.port;
node.api = node.supertest(node.baseUrl);

node.normalizer = 100000000; // Use this to convert LISK amount to normal value
node.blockTime = 10000; // Block time in miliseconds
node.blockTimePlus = 12000; // Block time + 2 seconds in miliseconds
node.version = packageJson.version; // Node version

// Transaction fees
node.fees = {
	voteFee: node.constants.fees.vote,
	transactionFee: node.constants.fees.send,
	secondPasswordFee: node.constants.fees.secondsignature,
	delegateRegistrationFee: node.constants.fees.delegate,
	multisignatureRegistrationFee: node.constants.fees.multisignature,
	dappAddFee: node.constants.fees.dapp,
    messageFee: node.constants.fees.chat_message
};

// Test application
// node.guestbookDapp = {
// 	icon: 'https://raw.githubusercontent.com/MaxKK/guestbookDapp/master/icon.png',
// 	link: 'https://github.com/MaxKK/guestbookDapp/archive/master.zip'
// };

const validSender = {
    username: null,
    isDelegate: 0,
    secondSignature: 0,
    // address: 'U810656636599221322',
    // publicKey: 'f4011a1360ac2769e066c789acaaeffa9d707690d4d3f6085a7d52756fbc30d0',
    secondPublicKey: null,
    // balance: 9850458911801508,
    // u_balance: 9850458911801508,
    vote: 0,
    multisignatures: null,
    multimin: 0,
    multilifetime: 0,
    // blockId: '8505659485551877884',
    nameexist: 0,
    producedblocks: 0,
    missedblocks: 0,
    fees: 0,
    rewards: 0,
    virgin: 0
};

node.testSender = _.defaults({
    address: 'U12559234133690317086',
    publicKey: 'd365e59c9880bd5d97c78475010eb6d96c7a3949140cda7e667f9513218f9089',
    secret: 'weather play vibrant large edge clean notable april fire smoke drift hidden',
    u_balance: 1000000000000000000,
    balance: 1000000000000000000
},validSender);


node.marketDelegate = _.defaults({
    address: 'U12559234133690317086',
    publicKey: 'd365e59c9880bd5d97c78475010eb6d96c7a3949140cda7e667f9513218f9089',
    isDelegate: 1,
    secret: 'rally clean ladder crane gadget century timber jealous shine scorpion beauty salon'
},validSender);

// Existing delegate account
// TODO: replace me with a market delegate
node.eAccount = {
	address: 'U12559234133690317086',
	publicKey: 'd365e59c9880bd5d97c78475010eb6d96c7a3949140cda7e667f9513218f9089',
	password: 'weather play vibrant large edge clean notable april fire smoke drift hidden',
	code: 'kind'
};

// Genesis account, initially holding 100M total supply
node.gAccount = {
	address: 'U15365455923155964650',
	publicKey: 'b80bb6459608dcdeb9a98d1f2b0111b2bf11e53ef2933e6769bb0198e3a97aae',
	password: 'neck want coast appear army smile palm major crumble upper void warm'
};

node.iAccount = {
	address: 'U5338684603617333081',
	publicKey: '9184c87b846dec0dc4010def579fecf5dad592a59b37a013c7e6975597681f58',
	password: 'floor myself rather hidden pepper make isolate vintage review flight century label',
	balance: '1960000000000000'
};

node.gAccount = node.iAccount;



// Optional logging
if (process.env.SILENT === 'true') {
	node.debug = function () {};
} else {
	node.debug = console.log;
}

// Random LSK amount
node.LISK = Math.floor(Math.random() * (100000 * 100000000)) + 1;

// Returns a random delegate name
node.randomDelegateName = function () {
	var size = node.randomNumber(1, 20); // Min. delegate name size is 1, Max. delegate name is 20
	var delegateName = '';
	var possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@$&_.';

	for (var i = 0; i < size; i++) {
		delegateName += possible.charAt(Math.floor(Math.random() * possible.length));
	}

	return delegateName;
};

// return an ADM address from a public key
node.createAddressFromPublicKey = function (publicKey) {
    const publicKeyHash = crypto.createHash('sha256').update(publicKey, 'hex').digest();
    let temp = Buffer.alloc(8);

    for (var i = 0; i < 8; i++) {
        temp[i] = publicKeyHash[7 - i];
    }

    return 'U' + bignum.fromBuffer(temp).toString();
};

// sign transaction
node.transactionSign = function (trs, keypair) {
    const hash = this.getHash(trs);
    return sodium.crypto_sign_detached(hash, Buffer.from(keypair.privateKey, 'hex')).toString('hex');
};

// return a basic transaction
node.createBasicTransaction = function (data) {
    return {
    	type: data.transactionType,
		amount: 0,
		timestamp: Math.floor((Date.now() - this.constants.epochTime.getTime()) / 1000),
		asset: {},
		senderPublicKey: data.keyPair.publicKey.toString('hex'),
		senderId: this.createAddressFromPublicKey(data.keyPair.publicKey)};
};

// return a delegate transaction
node.createDelegateTransaction = function (data) {
    data.transactionType = transactionTypes.DELEGATE;
    let transaction = this.createBasicTransaction(data);
    transaction.asset = {
    	delegate: {
    		username: data.username,
			publicKey: data.keyPair.publicKey.toString('hex')}
    };
    transaction.recipientId= null;
    transaction.signature = this.transactionSign(transaction, data.keyPair);
    return transaction;
};

node.createSignatureTransaction = function (data) {
    data.transactionType = transactionTypes.SIGNATURE;
    let transaction = this.createBasicTransaction(data);
    transaction.asset = {};
    transaction.recipientId= null;
    transaction.keyPair = data.keyPair;
    transaction.secret = data.secret;
    transaction.publicKey = data.keyPair.publicKey.toString('hex');
    transaction.signature = this.transactionSign(transaction, data.keyPair);
    return transaction;
};

node.createChatTransaction = function (data) {
    data.transactionType = this.txTypes.CHAT_MESSAGE;
    let transaction = this.createBasicTransaction(data);
    transaction.asset = {'chat' : {
            message: data.message,
            own_message: data.own_message,
            type : data.message_type || 1
        }};
    transaction.recipientId = data.recipientId;
    transaction.amount = 0;
    transaction.signature = this.transactionSign(transaction, data.keyPair);
    transaction.fee = this.constants.fees.chat_message;
    return transaction;
};

node.createSendTransaction = function (data) {
    data.transactionType = transactionTypes.SEND;
    let transaction = this.createBasicTransaction(data);
    transaction.asset = {};
    transaction.recipientId= data.recipientId;
    transaction.amount = data.amount;
    transaction.signature = this.transactionSign(transaction, data.keyPair);
    transaction.id = this.getId(transaction);
    return transaction;
};

node.createVoteTransaction = function (data) {
    data.transactionType = transactionTypes.VOTE;
    let transaction = this.createBasicTransaction(data);
    transaction.asset = {'votes': data.votes};
    transaction.recipientId= transaction.senderId;
    transaction.signature = this.transactionSign(transaction, data.keyPair);
    transaction.id = this.getId(transaction);
    return transaction;
};

// Returns a random property from the given object
node.randomProperty = function (obj, needKey) {
	var keys = Object.keys(obj);

	if (!needKey) {
		return obj[keys[keys.length * Math.random() << 0]];
	} else {
		return keys[keys.length * Math.random() << 0];
	}
};

node.getBytes = function (transaction) {
    var skipSignature = false;
    var skipSecondSignature = true;
    var assetSize = 0;
    var assetBytes = null;

    switch (transaction.type) {
        case transactionTypes.SEND:
            break;
        case transactionTypes.DELEGATE:
            assetBytes = this.delegatesGetBytes(transaction);
            assetSize = assetBytes.length;
            break;
        case transactionTypes.STATE:
            assetBytes = this.statesGetBytes(transaction);
            assetSize = assetBytes.length;
            break;
        case transactionTypes.VOTE:
            assetBytes = this.voteGetBytes(transaction);
            assetSize = assetBytes.length;
            break;
        case transactionTypes.CHAT_MESSAGE:
            assetBytes = this.chatGetBytes(transaction);
            assetSize = assetBytes.length;
            break;
		case transactionTypes.SIGNATURE:
			assetBytes = this.signatureGetBytes(transaction);
            assetSize = assetBytes.length;
            break;
        default:
        	throw `Transaction type ${transaction.type} is not supported yet`;
    }

    var bb = new ByteBuffer(1 + 4 + 32 + 8 + 8 + 64 + 64 + assetSize, true);

    bb.writeByte(transaction.type);
    bb.writeInt(transaction.timestamp);

    var senderPublicKeyBuffer = Buffer.from(transaction.senderPublicKey, 'hex');
    for (var i = 0; i < senderPublicKeyBuffer.length; i++) {
        bb.writeByte(senderPublicKeyBuffer[i]);
    }

    if (transaction.requesterPublicKey) {
        var requesterPublicKey =  Buffer.from(transaction.requesterPublicKey, 'hex');

        for (var i = 0; i < requesterPublicKey.length; i++) {
            bb.writeByte(requesterPublicKey[i]);
        }
    }

    if (transaction.recipientId) {
        var recipient = transaction.recipientId.slice(1);
        recipient = new bignum(recipient).toBuffer({size: 8});

        for (i = 0; i < 8; i++) {
            bb.writeByte(recipient[i] || 0);
        }
    } else {
        for (i = 0; i < 8; i++) {
            bb.writeByte(0);
        }
    }

    bb.writeLong(transaction.amount);

    if (assetSize > 0) {
        for (let i = 0; i < assetSize; i++) {
            bb.writeByte(assetBytes[i]);
        }
    }

    if (!skipSignature && transaction.signature) {
        var signatureBuffer =  Buffer.from(transaction.signature, 'hex');
        for (let i = 0; i < signatureBuffer.length; i++) {
            bb.writeByte(signatureBuffer[i]);
        }
    }

    if (!skipSecondSignature && transaction.signSignature) {
        var signSignatureBuffer =  Buffer.from(transaction.signSignature, 'hex');
        for (var i = 0; i < signSignatureBuffer.length; i++) {
            bb.writeByte(signSignatureBuffer[i]);
        }
    }

    bb.flip();
    var arrayBuffer = new Uint8Array(bb.toArrayBuffer());
    var buffer = [];

    for (var i = 0; i < arrayBuffer.length; i++) {
        buffer[i] = arrayBuffer[i];
    }

    return Buffer.from(buffer);
};

node.voteGetBytes = function (trs) {
    var buf;
    try {
        buf = trs.asset.votes ? Buffer.from(trs.asset.votes.join(''), 'utf8') : null;
    } catch (e) {
        throw e;
    }
    return buf;
};

node.delegatesGetBytes = function (trs) {
    if (!trs.asset.delegate.username) {
        return null;
    }
    var buf;

    try {
        buf = Buffer.from(trs.asset.delegate.username, 'utf8');
    } catch (e) {
        throw e;
    }
    return buf;
};

node.statesGetBytes = function (trs) {
    if (!trs.asset.state.value) {
        return null;
    }
    var buf;

    try {
        buf = Buffer.from([]);
        var stateBuf = Buffer.from(trs.asset.state.value);
        buf = Buffer.concat([buf, stateBuf]);
        if (trs.asset.state.key) {
            var keyBuf = Buffer.from(trs.asset.state.key);
            buf = Buffer.concat([buf, keyBuf]);
        }

        var bb = new ByteBuffer(4 + 4, true);
        bb.writeInt(trs.asset.state.type);
        bb.flip();

        buf = Buffer.concat([buf, bb.toBuffer()]);
    } catch (e) {
        throw e;
    }

    return buf;
};

node.chatGetBytes = function (trs) {
    var buf;

    try {
        buf = Buffer.from([]);
        var messageBuf = Buffer.from(trs.asset.chat.message, 'hex');
        buf = Buffer.concat([buf, messageBuf]);

        if (trs.asset.chat.own_message) {
            var ownMessageBuf = Buffer.from(trs.asset.chat.own_message, 'hex');
            buf = Buffer.concat([buf, ownMessageBuf]);
        }
        var bb = new ByteBuffer(4 + 4, true);
        bb.writeInt(trs.asset.chat.type);
        bb.flip();
        buf = Buffer.concat([buf, Buffer.from(bb.toBuffer())]);
    } catch (e) {
        throw e;
    }

    return buf;
};

node.signatureGetBytes = function (signature) {
    var bb = new ByteBuffer(32, true);
    var publicKeyBuffer = new Buffer(signature.keyPair.publicKey, 'hex');

    for (var i = 0; i < publicKeyBuffer.length; i++) {
        bb.writeByte(publicKeyBuffer[i]);
    }

    bb.flip();
    return new Uint8Array(bb.toArrayBuffer());
};

node.getHash = function (trs) {
    return crypto.createHash('sha256').update(this.getBytes(trs)).digest();
};

node.getId = function (trs) {
    var hash = this.getHash(trs);
    var temp = Buffer.alloc(8);
    for (var i = 0; i < 8; i++) {
        temp[i] = hash[7 - i];
    }

    var id = bignum.fromBuffer(temp).toString();
    return id;
};

// Returns random LSK amount
node.randomLISK = function () {
	return Math.floor(Math.random() * (10000 * 100000000)) + (1000 * 100000000);
};

// Returns current block height
node.getHeight = function (cb) {
	var request = node.popsicle.get(node.baseUrl + '/api/blocks/getHeight');

	request.use(node.popsicle.plugins.parse(['json']));

	request.then(function (res) {
		if (res.status !== 200) {
			return setImmediate(cb, ['Received bad response code', res.status, res.url].join(' '));
		} else {
			return setImmediate(cb, null, res.body.height);
		}
	});

	request.catch(function (err) {
		return setImmediate(cb, err);
	});
};

// Run callback on new round
node.onNewRound = function (cb) {
	node.getHeight(function (err, height) {
		if (err) {
			return cb(err);
		} else {
			var nextRound = Math.ceil(height / slots.delegates);
			var blocksToWait = nextRound * slots.delegates - height;
			node.debug('blocks to wait: '.grey, blocksToWait);
			node.waitForNewBlock(height, blocksToWait, cb);
		}
	});
};

// Upon detecting a new block, do something
node.onNewBlock = function (cb) {
	node.getHeight(function (err, height) {
		if (err) {
			return cb(err);
		} else {
			node.waitForNewBlock(height, 2, cb);
		}
	});
};

// Waits for (n) blocks to be created
node.waitForBlocks = function (blocksToWait, cb) {
	node.getHeight(function (err, height) {
		if (err) {
			return cb(err);
		} else {
			node.waitForNewBlock(height, blocksToWait, cb);
		}
	});
};

// Waits for a new block to be created
node.waitForNewBlock = function (height, blocksToWait, cb) {
	if (blocksToWait === 0) {
		return setImmediate(cb, null, height);
	}

	var actualHeight = height;
	var counter = 1;
	var target = height + blocksToWait;

	node.async.doWhilst(
		function (cb) {
			var request = node.popsicle.get(node.baseUrl + '/api/blocks/getHeight');

			request.use(node.popsicle.plugins.parse(['json']));

			request.then(function (res) {
				if (res.status !== 200) {
					return cb(['Received bad response code', res.status, res.url].join(' '));
				}

				node.debug('	Waiting for block:'.grey, 'Height:'.grey, res.body.height, 'Target:'.grey, target, 'Second:'.grey, counter++);

				if (target === res.body.height) {
					height = res.body.height;
				}

				setTimeout(cb, 1000);
			});

			request.catch(function (err) {
				return cb(err);
			});
		},
		function () {
			return actualHeight === height;
		},
		function (err) {
			if (err) {
				return setImmediate(cb, err);
			} else {
				return setImmediate(cb, null, height);
			}
		}
	);
};

// Adds peers to local node
node.addPeers = function (numOfPeers, ip, cb) {
	var operatingSystems = ['win32','win64','ubuntu','debian', 'centos'];
	var port = 9999; // Frozen peer port
	var os, version;
	var i = 0;

	node.async.whilst(function () {
		return i < numOfPeers;
	}, function (next) {
		os = operatingSystems[node.randomizeSelection(operatingSystems.length)];
		version = node.version;

		var request = node.popsicle.get({
			url: node.baseUrl + '/peer/height',
			headers: {
				broadhash: node.config.nethash,
				height: 1,
				nethash: node.config.nethash,
				os: os,
				ip: ip,
				port: port,
				version: version,
				nonce: 'randomNonce'
			}
		});

		request.use(node.popsicle.plugins.parse(['json']));

		request.then(function (res) {
			if (res.status !== 200) {
				return next(['Received bad response code', res.status, res.url].join(' '));
			} else {
				i++;
				next();
			}
		});

		request.catch(function (err) {
			return next(err);
		});
	}, function (err) {
		// Wait for peer to be swept to db
		setTimeout(function () {
			return cb(err, {os: os, version: version, port: port});
		}, 3000);
	});
};

// Returns a random index for an array
node.randomizeSelection = function (length) {
	return Math.floor(Math.random() * length);
};

// Returns a random number between min (inclusive) and max (exclusive)
node.randomNumber = function (min, max) {
	return	Math.floor(Math.random() * (max - min) + min);
};

// Returns the expected fee for the given amount
node.expectedFee = function (amount) {
	return parseInt(node.fees.transactionFee);
};

// Returns a random username
node.randomUsername = function () {
	var size = node.randomNumber(1, 16); // Min. username size is 1, Max. username size is 16
	var username = '';
	var possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@$&_.';

	for (var i = 0; i < size; i++) {
		username += possible.charAt(Math.floor(Math.random() * possible.length));
	}

	return username;
};

// Returns a random capitialized username
node.randomCapitalUsername = function () {
	var size = node.randomNumber(1, 16); // Min. username size is 1, Max. username size is 16
	var username = 'A';
	var possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@$&_.';

	for (var i = 0; i < size - 1; i++) {
		username += possible.charAt(Math.floor(Math.random() * possible.length));
	}

	return username;
};

// Returns a random application name
node.randomApplicationName = function () {
	var size = node.randomNumber(1, 32); // Min. username size is 1, Max. username size is 32
	var name = 'A';
	var possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

	for (var i = 0; i < size - 1; i++) {
		name += possible.charAt(Math.floor(Math.random() * possible.length));
	}

	return name;
};

// Returns a basic random account
node.randomAccount = function () {
	var account = {
		balance: '1000'
	};

	account.password = new Mnemonic(Mnemonic.Words.ENGLISH).toString();
	account.secondPassword = new Mnemonic(Mnemonic.Words.ENGLISH).toString();
	account.username = node.randomDelegate;
	const keypair = node.accounts.makeKeypair(node.accounts.createPassPhraseHash(account.password));
	account.publicKey = keypair.publicKey; //node.lisk.crypto.getKeys(account.password).publicKey;
	account.address = node.accounts.getAddressByPublicKey(account.publicKey); //node.lisk.crypto.getAddress(account.publicKey);
	account.keypair = keypair;
	return account;
};

// Returns an extended random account
node.randomTxAccount = function () {
	return node._.defaults(node.randomAccount(), {
		sentAmount:'',
		paidFee: '',
		totalPaidFee: '',
		transactions: []
	});
};

// Returns a random password
node.randomPassword = function () {
	return Math.random().toString(36).substring(7);
};

// Abstract request
function abstractRequest (options, done) {
	var request = node.api[options.verb.toLowerCase()](options.path);

	request.set('Accept', 'application/json');
	request.set('version', node.version);
	request.set('nethash', node.config.nethash);
	request.set('ip', '0.0.0.0');
	request.set('port', node.config.port);

	request.expect('Content-Type', /json/);
	request.expect(200);

	if (options.params) {
		request.send(options.params);
	}

	var verb = options.verb.toUpperCase();
	node.debug(['> Path:'.grey, verb, options.path].join(' '));
	if (verb === 'POST' || verb === 'PUT') {
		node.debug(['> Data:'.grey, JSON.stringify(options.params)].join(' '));
	}

	if (done) {
		request.end(function (err, res) {
			node.debug('> Response:'.grey, JSON.stringify(res.body));
			done(err, res);
		});
	} else {
		return request;
	}
}

// Get the given path
node.get = function (path, done) {
	return abstractRequest({ verb: 'GET', path: path, params: null }, done);
};

// Post to the given path
node.post = function (path, params, done) {
	return abstractRequest({ verb: 'POST', path: path, params: params }, done);
};

// Put to the given path
node.put = function (path, params, done) {
	return abstractRequest({ verb: 'PUT', path: path, params: params }, done);
};

before(function (done) {
	require('./common/globalBefore').waitUntilBlockchainReady(done);
});

// Exports
module.exports = node;
