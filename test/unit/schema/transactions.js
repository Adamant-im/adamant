var expect = require('chai').expect;

var node = require('../../node.js');
var ZSchema = require('../../../helpers/z_schema.js');
var schema = require('../../../schema/transactions.js');

var constants = require('../../../helpers/constants.js');
var validator = new ZSchema();

describe('transactions', function () {

	// TODO: Add tests for other transaction schemas
	describe('getTransaction', function () {
		it('tests for schema');
	});

	describe('getPooledTransaction', function () {
		it('tests for schema');
	});

	describe('getPooledTransactions', function () {
		it('tests for schema');
	});

	describe('addTransactions', function () {
		it('tests for schema');
	});

	describe('getTransactions', function () {
		// TODO: Add tests for other schemas properties
		var testBody;

		beforeEach(function () {
			// var account1PublicKey = node.lisk.crypto.getKeys(node.randomPassword()).publicKey;
			// var account2PublicKey = node.lisk.crypto.getKeys(node.randomPassword()).publicKey;

			testBody = {
				blockId: '1465651642158264047',
				type: 0,
				senderId: node.testSender.address,
				senderPublicKey: node.testSender.publicKey,
				ownerPublicKey: node.testSender.publicKey,
				ownerAddress: node.testSender.address,
				recipientId: node.marketDelegate.address,
				amount: 100,
				fee: 20,
				senderPublicKeys: [node.testSender.publicKey, node.marketDelegate.publicKey],
				recipientPublicKeys: [node.testSender.publicKey, node.marketDelegate.publicKey],
				senderIds: [node.testSender.address, node.marketDelegate.address],
				recipientIds: [node.testSender.address, node.marketDelegate.address],
				fromHeight: 1,
				toHeight: 2,
				fromTimestamp: 0,
				toTimestamp: 2,
				fromUnixTime: constants.epochTime.getTime() / 1000,
				toUnixTime: (constants.epochTime.getTime() / 1000 + 1),
				minAmount: 0,
				maxAmount: 1,
				minConfirmations: 1,
				orderBy: 'username',
				limit: 500,
				offset: 0 
			};
		});

		it('should return error when senderPublicKeys is not an array', function () {
			testBody.senderPublicKeys = '';
			validator.validate(testBody, schema.getTransactions);
			expect(validator.getLastErrors().map(function (e) {
				return e.message;
			})).to.eql(['Expected type array but found type string']);
		});

		it('should return error when senderPublicKeys length is less than minimum acceptable length', function () {
			testBody.senderPublicKeys = []; 
			validator.validate(testBody, schema.getTransactions);
			expect(validator.getLastErrors().map(function (e) {
				return e.message;
			})).to.eql(['Array is too short (0), minimum 1']);
		});

		it('should return error when recipientPublicKeys is not an array', function () {
			testBody.recipientPublicKeys = '';
			validator.validate(testBody, schema.getTransactions);
			expect(validator.getLastErrors().map(function (e) {
				return e.message;
			})).to.eql(['Expected type array but found type string']);
		});

		it('should return error when recipientPublicKeys length is less than minimum acceptable length', function () {
			testBody.recipientPublicKeys = []; 
			validator.validate(testBody, schema.getTransactions);
			expect(validator.getLastErrors().map(function (e) {
				return e.message;
			})).to.eql(['Array is too short (0), minimum 1']);
		});

		it('should return error when recipientIds is not an array', function () {
			testBody.recipientIds = '';
			validator.validate(testBody, schema.getTransactions);
			expect(validator.getLastErrors().map(function (e) {
				return e.message;
			})).to.eql(['Expected type array but found type string']);
		});

		it('should return error when recipientIds length is less than minimum acceptable length', function () {
			testBody.recipientIds = []; 
			validator.validate(testBody, schema.getTransactions);
			expect(validator.getLastErrors().map(function (e) {
				return e.message;
			})).to.eql(['Array is too short (0), minimum 1']);
		});

		it('should be ok when params field length valid', function () {
			validator.validate(testBody, schema.getTransactions);
			expect(validator.getLastErrors()).to.not.exist;
		});
	});
});
