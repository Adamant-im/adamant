'use strict';

var expect = require('chai').expect;
var async = require('async');
const _ = require('lodash');
const ed = require('../../../../helpers/ed');

var modulesLoader = require('../../../common/initModule').modulesLoader;
var BlockLogic = require('../../../../logic/block.js');
var exceptions = require('../../../../helpers/exceptions.js');
var clearDatabaseTable = require('../../../common/globalBefore').clearDatabaseTable;

var crypto = require('crypto');

// const previousBlock = {
//     "type": 2,
//     "amount": 0,
//     "fee": 0,
//     "recipientId": null,
//     "timestamp": 0,
//     "asset": {
//         "delegate": {
//             "username": "permit"
//         }
//     },
//     "senderId": "U8339394976025567725",
//     "senderPublicKey": "01c5079a2234f69feca1b00daf4ddbd8904e13dfb67ce47c21f26377468706fa",
//     "signature": "89165681db2fc7237d9ca45cadfe027fde94e4ee6efb33ef458f7ee2355a014c2ecb5178224d6f64f9c046c05822fe34edcd2cb59e13cd3350bde19853350405",
//     "id": "17388275898014608425"
// };

// const validBlock = {
//     "type": 2,
//     "amount": 0,
//     "fee": 0,
//     "recipientId": null,
//     "timestamp": 0,
//     "asset": {
//         "delegate": {
//             "username": "require"
//         }
//     },
//     "senderId": "U6503669570074878139",
//     "senderPublicKey": "853864965070bf1ae2572778cbcaa15f4808e0ff0df5fd2c7bf615175dd39d79",
//     "signature": "639a5acd99a702180524c62d9b09c51f5b99d03b9ac3e97fc36c911ffa9d130044a99a3380337ba7b848fb7ae1e9ffae82c0855f99443da9681d1e6e50a0b800",
//     "id": "6740239031861108626"
// };

// const validBlock = {
//
// };

var previousBlock = {
	blockSignature: 'a74cd53bebf9cf003cfd5fed8c053e1b64660e89a654078ff3341348145bbb0f34d1bde4a254b139ebae03117b346a2aab77fc8607eed9c7431db5eb4d4cbe0b',
	generatorPublicKey:'377bfcc233fdba3039d9fbb8c7d8d97e1087d52941e5661b9c55b59c57f8fafe',
	height: 42394,
	id: '1553572419982003786',
	numberOfTransactions: 0,
	payloadHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
	payloadLength: 0,
	previousBlock: '2541382865961110750',
	relays: 1,
	reward: 0,
	timestamp: 39674945,
	totalAmount: 0,
	totalFee: 0,
	transactions: [],
	version: 0,
};

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

let marketDelegate = _.defaults({
    address: 'U12559234133690317086',
    publicKey: 'd365e59c9880bd5d97c78475010eb6d96c7a3949140cda7e667f9513218f9089',
    isDelegate: 1,
    secret: 'rally clean ladder crane gadget century timber jealous shine scorpion beauty salon'
},validSender);

const marketDelegateHash = crypto.createHash('sha256').update(marketDelegate.secret, 'utf8').digest();
const marketDelegateKeypair = ed.makeKeypair(marketDelegateHash);


let testSender = _.defaults({
    address: 'U12559234133690317086',
    publicKey: 'd365e59c9880bd5d97c78475010eb6d96c7a3949140cda7e667f9513218f9089',
    secret: 'weather play vibrant large edge clean notable april fire smoke drift hidden',
    u_balance: 1000000000000000000,
    balance: 1000000000000000000
},validSender);
const testSenderHash = crypto.createHash('sha256').update(testSender.secret, 'utf8').digest();
const testSenderKeypair = ed.makeKeypair(testSenderHash);

var validBlock = {
	blockSignature: '08d70794b3fd90be5d14fd02f512c56485d4bac071ccf98188833242a7d84dfd9c98bc3cf6b7eecb6231dc94da82a275002d1913f60809e98d64f9892e98d303',
	generatorPublicKey: '747d370dc479a7d684e3b61d8c75716f3bc91afcf9e5d3eeaeb557753d757ac4',
	numberOfTransactions: 0,
	payloadHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
	payloadLength: 0,
	previousBlock: '1553572419982003786',
	reward: 0,
	timestamp: 39674950,
	totalAmount: 0,
	totalFee: 0,
	transactions: [],
	version: 0,
	id: '10000428847403166554'
};

var blockRewardInvalid = {
	blockSignature: 'd06c1a17c701e55aef78cefb8ce17340411d9a1a7b3bd9b6c66f815dfd7546e2ca81b3371646fcead908db57a6492e1d6910eafa0a96060760a2796aff637401',
	generatorPublicKey: '904c294899819cce0283d8d351cb10febfa0e9f0acd90a820ec8eb90a7084c37',
	numberOfTransactions: 2,
	payloadHash: 'be0df321b1653c203226add63ac0d13b3411c2f4caf0a213566cbd39edb7ce3b',
	payloadLength: 494,
	previousBlock: '11850828211026019525',
	reward: 35,
	timestamp: 32578370,
	totalAmount: 10000000000000000,
	totalFee: 0,
	transactions: [
		{
			'type': 0,
			'amount': 10000000000000000,
			'fee': 0,
			'timestamp': 0,
			'recipientId': '16313739661670634666L',
			'senderId': '1085993630748340485L',
			'senderPublicKey': 'c96dec3595ff6041c3bd28b76b8cf75dce8225173d1bd00241624ee89b50f2a8',
			'signature': 'd8103d0ea2004c3dea8076a6a22c6db8bae95bc0db819240c77fc5335f32920e91b9f41f58b01fc86dfda11019c9fd1c6c3dcbab0a4e478e3c9186ff6090dc05',
			'id': '1465651642158264047'
		},
		{
			'type': 3,
			'amount': 0,
			'fee': 0,
			'timestamp': 0,
			'recipientId': '16313739661670634666L',
			'senderId': '16313739661670634666L',
			'senderPublicKey': 'c094ebee7ec0c50ebee32918655e089f6e1a604b83bcaa760293c61e0f18ab6f',
			'asset': {
				'votes': [
					'+9d3058175acab969f41ad9b86f7a2926c74258670fe56b37c429c01fca9f2f0f',
					'+141b16ac8d5bd150f16b1caa08f689057ca4c4434445e56661831f4e671b7c0a',
					'-3ff32442bb6da7d60c1b7752b24e6467813c9b698e0f278d48c43580da972135',
					'-5d28e992b80172f38d3a2f9592cad740fd18d3c2e187745cd5f7badf285ed819'
				]
			},
			'signature': '9f9446b527e93f81d3fb8840b02fcd1454e2b6276d3c19bd724033a01d3121dd2edb0aff61d48fad29091e222249754e8ec541132032aefaeebc312796f69e08',
			'id': '9314232245035524467'
		}
	],
	version: 0,
	id: '15635779876149546284'
};

describe('blocks/verify', function () {

	var blocksVerify;
	var blocks;
	var blockLogic;
	var accounts;
	var delegates;

	before(function (done) {
		modulesLoader.initLogic(BlockLogic, modulesLoader.scope, function (err, __blockLogic) {
			if (err) {
				return done(err);
			}
			blockLogic = __blockLogic;

			modulesLoader.initModules([
				{blocks: require('../../../../modules/blocks')},
				{accounts: require('../../../../modules/accounts')},
				{delegates: require('../../../../modules/delegates')},
				{transactions: require('../../../../modules/transactions')},
				{transport: require('../../../../modules/transport')},
				{system: require('../../../../modules/system')},
			], [
				{'block': require('../../../../logic/block')},
				{'transaction': require('../../../../logic/transaction')},
				{'account': require('../../../../logic/account')},
			], {}, function (err, __modules) {
				if (err) {
					return done(err);
				}
				__modules.blocks.verify.onBind(__modules);
				__modules.delegates.onBind(__modules);
				__modules.transactions.onBind(__modules);
				__modules.blocks.chain.onBind(__modules);
				__modules.transport.onBind(__modules);
				blocks = __modules.blocks;
				blocksVerify = __modules.blocks.verify;
				accounts = __modules.accounts;
				delegates = __modules.delegates;

				done();
			});
		});
	});

	function testValid (functionName) {
		it('should be ok', function () {
			blocks.lastBlock.set(previousBlock);

			var result = blocksVerify[functionName](validBlock);

			expect(result.verified).to.be.true;
			expect(result.errors).to.be.an('array').that.is.empty;
		});

		it('should be ok when block is invalid but block id is excepted for having invalid block reward', function () {
			exceptions.blockRewards.push(blockRewardInvalid.id);

			var result = blocksVerify[functionName](blockRewardInvalid);

			expect(result.verified).to.be.true;
			expect(result.errors).to.be.an('array').that.is.empty;
		});
	}

	function testSetHeight (functionName) {
		it('should set height from lastBlock', function () {
			blocks.lastBlock.set(previousBlock);

			var result = blocksVerify[functionName](validBlock);

			expect(result.verified).to.be.true;
			expect(result.errors).to.be.an('array').that.is.empty;
			expect(validBlock.height).to.equal(previousBlock.height + 1);
		});
	}

	function testVerifySignature (functionName) {
		it('should fail when blockSignature property is not a hex string', function () {
			var blockSignature = validBlock.blockSignature;
			validBlock.blockSignature = 'invalidBlockSignature';

			var result = blocksVerify[functionName](validBlock);

			expect(result.errors).to.be.an('array').with.lengthOf(3);

			expect(result.errors[0]).to.equal('TypeError: Invalid hex string');
			expect(result.errors[1]).to.equal('Failed to verify block signature');
			expect(result.errors[2]).to.equal('TypeError: Invalid hex string');

			validBlock.blockSignature = blockSignature;
		});

		it('should fail when blockSignature property is an invalid hex string', function () {
			var blockSignature = validBlock.blockSignature;
			validBlock.blockSignature = 'bfaaabdc8612e177f1337d225a8a5af18cf2534f9e41b66c114850aa50ca2ea2621c4b2d34c4a8b62ea7d043e854c8ae3891113543f84f437e9d3c9cb24c0e05';

			var result = blocksVerify[functionName](validBlock);

			expect(result.errors).to.be.an('array').with.lengthOf(1);
			expect(result.errors[0]).to.equal('Failed to verify block signature');

			validBlock.blockSignature = blockSignature;
		});

		it('should fail when generatorPublicKey property is not a hex string', function () {
			var generatorPublicKey = validBlock.generatorPublicKey;
			validBlock.generatorPublicKey = 'invalidBlockSignature';

			var result = blocksVerify[functionName](validBlock);

			expect(result.errors).to.be.an('array').with.lengthOf(3);
			expect(result.errors[0]).to.equal('TypeError: Invalid hex string');
			expect(result.errors[1]).to.equal('Failed to verify block signature');
			expect(result.errors[2]).to.equal('TypeError: Invalid hex string');

			validBlock.generatorPublicKey = generatorPublicKey;
		});

		it('should fail when generatorPublicKey property is an invalid hex string', function () {
			var generatorPublicKey = validBlock.generatorPublicKey;
			validBlock.generatorPublicKey = '948b8b509579306694c00db2206ddb1517bfeca2b0dc833ec1c0f81e9644871b';

			var result = blocksVerify[functionName](validBlock);

			expect(result.errors).to.be.an('array').with.lengthOf(1);
			expect(result.errors[0]).to.equal('Failed to verify block signature');

			validBlock.generatorPublicKey = generatorPublicKey;
		});
	}

	function testPreviousBlock (functionName) {
		it('should fail when previousBlock property is missing', function () {
			var previousBlock = validBlock.previousBlock;
			delete validBlock.previousBlock;

			var result = blocksVerify[functionName](validBlock);

			expect(result.verified).to.be.false;
			expect(result.errors).to.be.an('array').with.lengthOf(2);
			expect(result.errors[0]).to.equal('Invalid previous block');
			expect(result.errors[1]).to.equal('Failed to verify block signature');

			validBlock.previousBlock = previousBlock;
		});
	}

	function testVerifyVersion (functionName) {
		it('should fail when block version != 0', function () {
			var version = validBlock.version;
			validBlock.version = 99;

			var result = blocksVerify[functionName](validBlock);

			expect(result.verified).to.be.false;
			expect(result.errors).to.be.an('array').with.lengthOf(2);
			expect(result.errors[0]).to.equal('Invalid block version');
			expect(result.errors[1]).to.equal('Failed to verify block signature');

			validBlock.version = version;
		});
	}

	function testVerifyReward (functionName) {
		it('should fail when block reward is invalid', function () {
			validBlock.reward = 99;

			var result = blocksVerify[functionName](validBlock);

			expect(result.errors).to.be.an('array').with.lengthOf(2);
			expect(result.errors[0]).to.equal(['Invalid block reward:', 99, 'expected:', 0].join(' '));

			validBlock.reward = 0;
		});
	}

	function testVerifyId (functionName) {
		it('should reset block id when block id is an invalid alpha-numeric string value', function () {
			var blockId = '884740302254229983';
			validBlock.id = 'invalid-block-id';

			var result = blocksVerify[functionName](validBlock);

			expect(validBlock.id).to.equal(blockId);
			expect(validBlock.id).to.not.equal('invalid-block-id');
		});

		it('should reset block id when block id is an invalid numeric string value', function () {
			var blockId = '884740302254229983';
			validBlock.id = '11850828211026019526';

			var result = blocksVerify[functionName](validBlock);

			expect(validBlock.id).to.equal(blockId);
			expect(validBlock.id).to.not.equal('11850828211026019526');
		});

		it('should reset block id when block id is an invalid integer value', function () {
			var blockId = '884740302254229983';
			validBlock.id = 11850828211026019526;

			var result = blocksVerify[functionName](validBlock);

			expect(validBlock.id).to.equal(blockId);
			expect(validBlock.id).to.not.equal(11850828211026019526);
		});

		it('should reset block id when block id is a valid integer value', function () {
			var blockId = '884740302254229983';
			validBlock.id = 11850828211026019525;

			var result = blocksVerify[functionName](validBlock);

			expect(validBlock.id).to.equal(blockId);
			expect(validBlock.id).to.not.equal(11850828211026019525);
		});
	}

	function testVerifyPayload (functionName) {
		it('should fail when payload length greater than maxPayloadLength constant value', function () {
			var payloadLength = validBlock.payloadLength;
			validBlock.payloadLength = 1024 * 1024 * 2;

			var result = blocksVerify[functionName](validBlock);

			expect(result.errors).to.be.an('array').with.lengthOf(2);
			expect(result.errors[0]).to.equal('Payload length is too long');
			expect(result.errors[1]).to.equal('Failed to verify block signature');

			validBlock.payloadLength = payloadLength;
		});

		it('should fail when transactions length is not equal to numberOfTransactions property', function () {
			validBlock.numberOfTransactions = validBlock.transactions.length + 1;

			var result = blocksVerify[functionName](validBlock);

			expect(result.errors).to.be.an('array').with.lengthOf(2);
			expect(result.errors[0]).to.equal('Included transactions do not match block transactions count');
			expect(result.errors[1]).to.equal('Failed to verify block signature');

			validBlock.numberOfTransactions = validBlock.transactions.length;
		});

		it('should fail when transactions length greater than maxTxsPerBlock constant value', function () {
			var transactions = validBlock.transactions;
			validBlock.transactions = new Array(26);
			validBlock.numberOfTransactions = validBlock.transactions.length;

			var result = blocksVerify[functionName](validBlock);

			expect(result.errors).to.be.an('array').with.lengthOf(4);
			expect(result.errors[0]).to.equal('Invalid total amount');
			expect(result.errors[1]).to.equal('Invalid payload hash');
			expect(result.errors[2]).to.equal('Number of transactions exceeds maximum per block');
			expect(result.errors[3]).to.equal('Failed to verify block signature');

			validBlock.transactions = transactions;
			validBlock.numberOfTransactions = transactions.length;
		});

		it('should fail when a transaction is of an unknown type', function () {
			var trsType = validBlock.transactions[0].type;
			validBlock.transactions[0].type = 555;

			var result = blocksVerify[functionName](validBlock);

			expect(result.errors).to.be.an('array').with.lengthOf(2);
			expect(result.errors[0]).to.equal('Invalid payload hash');
			expect(result.errors[1]).to.equal('Unknown transaction type ' + validBlock.transactions[0].type);

			validBlock.transactions[0].type = trsType;
		});

		it('should fail when a transaction is duplicated', function () {
			var secondTrs = validBlock.transactions[1];
			validBlock.transactions[1] = validBlock.transactions[0];

			var result = blocksVerify[functionName](validBlock);

			expect(result.errors).to.be.an('array').with.lengthOf(3);
			expect(result.errors[0]).to.equal('Invalid total amount');
			expect(result.errors[1]).to.equal('Invalid payload hash');
			expect(result.errors[2]).to.equal('Encountered duplicate transaction: ' + validBlock.transactions[1].id);

			validBlock.transactions[1] = secondTrs;
		});

		it('should fail when payload hash is invalid', function () {
			var payloadHash = validBlock.payloadHash;
			validBlock.payloadHash = 'invalidPayloadHash';

			var result = blocksVerify[functionName](validBlock);

			expect(result.errors).to.be.an('array').with.lengthOf(2);
			expect(result.errors[0]).to.equal('Invalid payload hash');
			expect(result.errors[1]).to.equal('Failed to verify block signature');

			validBlock.payloadHash = payloadHash;
		});

		it('should fail when summed transaction amounts do not match totalAmount property', function () {
			var totalAmount = validBlock.totalAmount;
			validBlock.totalAmount = 99;

			var result = blocksVerify[functionName](validBlock);

			expect(result.errors).to.be.an('array').with.lengthOf(2);
			expect(result.errors[0]).to.equal('Invalid total amount');
			expect(result.errors[1]).to.equal('Failed to verify block signature');

			validBlock.totalAmount = totalAmount;
		});

		it('should fail when summed transaction fees do not match totalFee property', function () {
			var totalFee = validBlock.totalFee;
			validBlock.totalFee = 99;

			var result = blocksVerify[functionName](validBlock);

			expect(result.errors).to.be.an('array').with.lengthOf(2);
			expect(result.errors[0]).to.equal('Invalid total fee');
			expect(result.errors[1]).to.equal('Failed to verify block signature');

			validBlock.totalFee = totalFee;
		});
	}

	function testVerifyForkOne (functionName) {
		it('should fail when previousBlock value is invalid', function () {
			var previousBlock = blocks.lastBlock.get().id;
			validBlock.previousBlock = '10937893559311260102';

			var result = blocksVerify[functionName](validBlock);

			expect(result.errors).to.be.an('array').with.lengthOf(2);
			expect(result.errors[0]).to.equal(['Invalid previous block:', validBlock.previousBlock, 'expected:', previousBlock].join(' '));
			expect(result.errors[1]).to.equal('Failed to verify block signature');

			validBlock.previousBlock = previousBlock;
		});
	}

	function testVerifyBlockSlot (functionName) {
		it('should fail when block timestamp is less than previousBlock timestamp', function () {
			var timestamp = validBlock.timestamp;
			validBlock.timestamp = 32578350;

			var result = blocksVerify[functionName](validBlock);

			expect(result.verified).to.be.false;
			expect(result.errors).to.be.an('array').with.lengthOf(2);
			expect(result.errors[0]).to.equal('Invalid block timestamp');
			expect(result.errors[1]).to.equal('Failed to verify block signature');

			validBlock.timestamp  = timestamp;
		});
	}

	describe('verifyReceipt() when block is valid', testValid.bind(null, 'verifyReceipt'));

	describe('verifyReceipt() when block is invalid', function () {

		describe('calling setHeight()', testSetHeight.bind(null, 'verifyReceipt'));

		describe('calling verifySignature()', testVerifySignature.bind(null, 'verifyReceipt'));

		describe('calling verifyPreviousBlock()', testPreviousBlock.bind(null, 'verifyReceipt'));

		describe('calling verifyVersion()', testVerifyVersion.bind(null, 'verifyReceipt'));

		describe('calling verifyReward()', testVerifyReward.bind(null, 'verifyReceipt'));

		describe('calling verifyId()', testVerifyId.bind(null, 'verifyReceipt'));

		describe('calling verifyPayload()', testVerifyPayload.bind(null, 'verifyReceipt'));

		describe.skip('calling verifyForkOne()', testVerifyForkOne);

		describe.skip('calling verifyBlockSlot()', testVerifyBlockSlot);
	});

	describe('verifyBlock() when block is valid', testValid.bind(null, 'verifyBlock'));

	describe('verifyBlock() when block is invalid', function () {

		describe('calling setHeight()', testSetHeight.bind(null, 'verifyBlock'));

		describe('calling verifySignature()', testVerifySignature.bind(null, 'verifyBlock'));

		describe('calling verifyPreviousBlock()', testPreviousBlock.bind(null, 'verifyBlock'));

		describe('calling verifyVersion()', testVerifyVersion.bind(null, 'verifyBlock'));

		describe('calling verifyReward()', testVerifyReward.bind(null, 'verifyBlock'));

		describe('calling verifyId()', testVerifyId.bind(null, 'verifyBlock'));

		describe('calling verifyPayload()', testVerifyPayload.bind(null, 'verifyBlock'));

		describe('calling verifyForkOne()', testVerifyForkOne.bind(null, 'verifyBlock'));

		describe('calling verifyBlockSlot()', testVerifyBlockSlot.bind(null, 'verifyBlock'));
	});
});
