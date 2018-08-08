'use strict';

// Root object
var node = {};
var Rounds = require('../modules/rounds.js');
var slots = require('../helpers/slots.js');

let Mnemonic = require('bitcore-mnemonic');

// Requires
node.bignum = require('../helpers/bignum.js');
node.config = require('../config.json');
node.constants = require('../helpers/constants.js');
// node.dappCategories = require('../helpers/dappCategories.js');
// node.dappTypes = require('../helpers/dappTypes.js');
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
node.version = node.config.version; // Node version

// Transaction fees
node.fees = {
	voteFee: node.constants.fees.vote,
	transactionFee: node.constants.fees.send,
	secondPasswordFee: node.constants.fees.secondsignature,
	delegateRegistrationFee: node.constants.fees.delegate,
	multisignatureRegistrationFee: node.constants.fees.multisignature,
	dappAddFee: node.constants.fees.dapp
};

// Test application
// node.guestbookDapp = {
// 	icon: 'https://raw.githubusercontent.com/MaxKK/guestbookDapp/master/icon.png',
// 	link: 'https://github.com/MaxKK/guestbookDapp/archive/master.zip'
// };

// Existing delegate account
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

// Returns a random property from the given object
node.randomProperty = function (obj, needKey) {
	var keys = Object.keys(obj);

	if (!needKey) {
		return obj[keys[keys.length * Math.random() << 0]];
	} else {
		return keys[keys.length * Math.random() << 0];
	}
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
