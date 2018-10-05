'use strict';

var node = require('./../../node.js'); 
var chai = require('chai');
var expect = require('chai').expect;
var async = require('async');
var sinon = require('sinon');
var modulesLoader = require('../../common/initModule').modulesLoader;
var Cache = require('../../../modules/cache.js');

var rawValidTransaction = {
    t_id: '17190511997607511181',
    b_height: 981,
    t_blockId: '6438017970172540087',
    t_type: 0,
    t_timestamp: 33363661,
    t_senderPublicKey: 'c094ebee7ec0c50ebee32918655e089f6e1a604b83bcaa760293c61e0f18ab6f',
    m_recipientPublicKey: null,
    t_senderId: 'U810656636599221322',
    t_recipientId: 'U7771441689362721578',
    t_amount: 490000000000000,
    t_fee: 10000000,
    t_signature: '85dc703a2b82698193ecbd86fd7aff1b057dfeb86e2a390ef42c1998bf1e9269c0048f42285e208a1e14a63843defbabece1bc96730f317f0cc16e23bb1b4d01',
    confirmations: 8343
};

var validTransaction = {
    id: '8413713814903125448',
    rowId: 133,
    blockId: '1523428076558779496',
    type: 2,
    timestamp: 33363661,
    senderPublicKey: 'f4011a1360ac2769e066c789acaaeffa9d707690d4d3f6085a7d52756fbc30d0',
    senderId: 'U6416794499161724697',
    recipientId: 'U13030924027576053821',
    amount: 100000000,
    fee: 50000000,
    signature: '85dc703a2b82698193ecbd86fd7aff1b057dfeb86e2a390ef42c1998bf1e9269c0048f42285e208a1e14a63843defbabece1bc96730f317f0cc16e23bb1b4d01',
    signSignature: null,
    requesterPublicKey: null,
    signatures: null,
    asset: {
    	username: 'testdelegate',
		publicKey: 'f4011a1360ac2769e066c789acaaeffa9d707690d4d3f6085a7d52756fbc30d0'
	},
};

describe('cache', function () {

	var cache;

	before(function (done) {
		node.config.cacheEnabled = true;
		done();
	});

	before(function (done) {
		modulesLoader.initCache(function (err, __cache) {
			cache = __cache;
			expect(err).to.not.exist;
			expect(__cache).to.be.an('object');
			cache = __cache;
			return done();
		});
	});

	after(function (done) {
		cache.quit(done);
	});

	afterEach(function (done) {
		cache.flushDb(function (err, status) {
			expect(err).to.not.exist;
			expect(status).to.equal('OK');
			done(err, status);
		});
	});

	describe('setJsonForKey', function () {

		it('should set the key value correctly', function (done) {
			var key = 'test_key';
			var value = {testObject: 'testValue'};

			cache.setJsonForKey(key, value, function (err, status) {
				expect(err).to.not.exist;
				expect(status).to.equal('OK');
				cache.getJsonForKey(key, function (err, res) {
					expect(err).to.not.exist;
					expect(res).to.eql(value);
					done(err, value);
				});
			});
		});

	});

	describe('getJsonForKey', function () {

		it('should return null for non-existent key', function (done) {
			var key = 'test_key';

			cache.getJsonForKey(key, function (err, value) {
				expect(err).to.not.exist;
				expect(value).to.equal(null);
				done(err, value);
			});
		});

		it('should get the correct value for the key', function (done) {
			var key = 'test_key';
			var value = {testObject: 'testValue'};

			cache.setJsonForKey(key, value, function (err, status) {
				expect(err).to.not.exist;
				expect(status).to.equal('OK');
				cache.getJsonForKey(key, function (err, res) {
					expect(err).to.not.exist;
					expect(res).to.eql(value);
					done(err, value);
				});
			});
		});
	});

	describe('flushDb', function () {

		it('should remove all keys from cache', function (done) {
			var key1 = 'test_key1';
			var key2 = 'test_key2';
			var dummyValue = { a: 'dummyValue' };
			async.series([
				// save new entries in cache
				function (callback) {
					async.map([key1, key2], function (key, cb) {
						cache.setJsonForKey(key, dummyValue, cb);
					}, function (err, result) {
						expect(err).to.not.exist;
						expect(result).to.be.an('array');
						return callback(err, result);
					});
				},
				// flush cache database
				function (callback) {
					cache.flushDb(function (err, status) {
						expect(err).to.not.exist;
						expect(status).to.equal('OK');
						return callback(err, status);
					});
				},
				// check if entries exist
				function (callback) {
					async.map([key1, key2], function (key, cb) {
						cache.getJsonForKey(key, cb);
					}, function (err, result) {
						expect(err).to.not.exist;
						expect(result).to.be.an('array');
						expect(result).to.have.length(2);
						result.forEach(function (value) {
							expect(value).to.eql(null);
						});
						return callback(err, result);
					});
				}],
				function (err) {
					done(err);
				}
			);
		});
	});

	describe('removeByPattern', function () {

		it('should remove keys matching the pattern', function (done) {
			var key = '/api/transactions?123';
			var value = {testObject: 'testValue'};
			var pattern = '/api/transactions*';

			cache.setJsonForKey(key, value, function (err, status) {
				expect(err).to.not.exist;
				expect(status).to.equal('OK');
				cache.removeByPattern(pattern, function (err) {
					expect(err).to.not.exist;
					cache.getJsonForKey(key, function (err, res) {
						expect(err).to.not.exist;
						expect(res).to.equal(null);
						done();
					});
				});
			});
		});

		it('should not remove keys that dont match pattern', function (done) {
			var key = '/api/transactions?123';
			var value = {testObject: 'testValue'};
			var pattern = '/api/delegate*';

			cache.setJsonForKey(key, value, function (err, status) {
				expect(err).to.not.exist;
				expect(status).to.equal('OK');
				cache.removeByPattern(pattern, function (err) {
					expect(err).to.not.exist;
					cache.getJsonForKey(key, function (err, res) {
						expect(err).to.not.exist;
						expect(res).to.eql(value);
						done();
					});
				});
			});
		});

	});
	
	describe('onNewBlock', function () {

		it('should remove all keys matching pattern /api/transactions', function (done) {
			var key = '/api/transactions?123';
			var value = {testObject: 'testValue'};
			cache.setJsonForKey(key, value, function (err, status) {
				expect(err).to.not.exist;
				expect(status).to.equal('OK');
				cache.onNewBlock(null, null, function (err) {
					expect(err).to.not.exist;
					cache.getJsonForKey(key, function (err, res) {
						expect(err).to.not.exist;
						expect(res).to.equal(null);
						done();
					});
				});
			});
		});

		it('should remove all keys matching pattern /api/blocks', function (done) {
			var key = '/api/blocks';
			var value = {testObject: 'testValue'};

			cache.setJsonForKey(key, value, function (err, status) {
				expect(err).to.not.exist;
				expect(status).to.equal('OK');

				cache.onNewBlock(null, null, function (err) {
					expect(err).to.not.exist;
					cache.getJsonForKey(key, function (err, res) {
						expect(err).to.not.exist;
						expect(res).to.equal(null);
						done();
					});
				});
			});
		});

		it('should not remove keys that dont match pattern /api/blocks or /api/transactions', function (done) {
			var key = '/api/delegates';
			var value = {testObject: 'testValue'};

			cache.setJsonForKey(key, value, function (err, status) {
				expect(err).to.not.exist;
				expect(status).to.equal('OK');

				cache.onNewBlock(null, null, function (err) {
					expect(err).to.not.exist;
					cache.getJsonForKey(key, function (err, res) {
						expect(err).to.not.exist;
						expect(res).to.eql(value);
						done();
					});
				});
			});
		});

		it('should not remove keys when cacheReady = false', function (done) {
			var key = '/api/transactions';
			var value = {testObject: 'testValue'};

			cache.setJsonForKey(key, value, function (err, status) {
				expect(err).to.not.exist;
				expect(status).to.equal('OK');

				cache.onSyncStarted();
				cache.onNewBlock(null, null, function (err) {
					expect(err).to.equal('Cache Unavailable');
					cache.onSyncFinished();
					cache.getJsonForKey(key, function (err, res) {
						expect(err).to.not.exist;
						expect(res).to.eql(value);
						done();
					});
				});
			});
		});
	});

	describe('onFinishRound', function (done) {

		it('should remove all keys matching pattern /api/delegates', function (done) {
			var key = '/api/delegates?123';
			var value = {testObject: 'testValue'};

			cache.setJsonForKey(key, value, function (err, status) {
				expect(err).to.not.exist;
				expect(status).to.equal('OK');
				cache.onFinishRound(null, function (err) {
					expect(err).to.not.exist;
					cache.getJsonForKey(key, function (err, res) {
						expect(err).to.not.exist;
						expect(res).to.equal(null);
						done();
					});
				});
			});
		});

		it('should not remove keys that dont match pattern /api/delegates', function (done) {
			var key = '/api/blocks';
			var value = {testObject: 'testValue'};

			cache.setJsonForKey(key, value, function (err, status) {
				expect(err).to.not.exist;
				expect(status).to.equal('OK');

				cache.onFinishRound(null, function (err) {
					expect(err).to.not.exist;
					cache.getJsonForKey(key, function (err, res) {
						expect(err).to.not.exist;
						expect(res).to.eql(value);
						done();
					});
				});
			});
		});

		it('should not remove keys when cacheReady = false', function (done) {
			var key = '/api/delegates';
			var value = {testObject: 'testValue'};

			cache.setJsonForKey(key, value, function (err, status) {
				expect(err).to.not.exist;
				expect(status).to.equal('OK');

				cache.onSyncStarted();
				cache.onFinishRound(null, function (err) {
					expect(err).to.equal('Cache Unavailable');
					cache.onSyncFinished();
					cache.getJsonForKey(key, function (err, res) {
						expect(err).to.not.exist;
						expect(res).to.eql(value);
						done();
					});
				});
			});
		});

	});

	describe('onTransactionsSaved', function (done) {

		it('shouldnt remove keys with pattern /api/delegate if there is no type 2 trs', function (done) {
			var key = '/api/delegates?123';
			var value = {testObject: 'testValue'};

			cache.setJsonForKey(key, value, function (err, status) {
				expect(err).to.not.exist;
				expect(status).to.equal('OK');
				cache.onTransactionsSaved([rawValidTransaction], function (err) {
					cache.getJsonForKey(key, function (err, res) {
						expect(err).to.not.exist;
						expect(res).to.eql(value);
						done();
					});
				});
			});
		});

		it('should remove keys that match pattern /api/delegate on type 2 trs', function (done) {
			var key = '/api/delegates?123';
			var value = {testObject: 'testValue'};

			cache.setJsonForKey(key, value, function (err, status) {
				expect(err).to.not.exist;
				expect(status).to.equal('OK');

				cache.onTransactionsSaved([validTransaction], function (err) {
					cache.getJsonForKey(key, function (err, res) {
						expect(err).to.not.exist;
						expect(res).to.equal(null);
						done();
					});
				});
			});
		});

		it('should not remove keys when cacheReady = false', function (done) {
			var key = '/api/delegates?123';
			var value = {testObject: 'testValue'};

			cache.setJsonForKey(key, value, function (err, status) {
				expect(err).to.not.exist;
				expect(status).to.equal('OK');

				cache.onSyncStarted();
				cache.onTransactionsSaved([validTransaction], function (err) {
					expect(err).to.equal('Cache Unavailable');
					cache.onSyncFinished();
					cache.getJsonForKey(key, function (err, res) {
						expect(err).to.not.exist;
						expect(res).to.eql(value);
						done();
					});
				});
			});
		});
	});
});
