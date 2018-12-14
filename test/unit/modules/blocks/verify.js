// 'use strict';
//
// var expect = require('chai').expect;
// var modulesLoader = require('../../../common/initModule').modulesLoader;
// var BlockLogic = require('../../../../logic/block.js');
// var exceptions = require('../../../../helpers/exceptions.js');
//
// var previousBlock = {
// 	blockSignature: 'a74cd53bebf9cf003cfd5fed8c053e1b64660e89a654078ff3341348145bbb0f34d1bde4a254b139ebae03117b346a2aab77fc8607eed9c7431db5eb4d4cbe0b',
// 	generatorPublicKey:'377bfcc233fdba3039d9fbb8c7d8d97e1087d52941e5661b9c55b59c57f8fafe',
// 	height: 42394,
// 	id: '1553572419982003786',
// 	numberOfTransactions: 0,
// 	payloadHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
// 	payloadLength: 0,
// 	previousBlock: '2541382865961110750',
// 	relays: 1,
// 	reward: 0,
// 	timestamp: 39674945,
// 	totalAmount: 0,
// 	totalFee: 0,
// 	transactions: [],
// 	version: 0,
// };
//
// var validBlock = {
// 	blockSignature: '08d70794b3fd90be5d14fd02f512c56485d4bac071ccf98188833242a7d84dfd9c98bc3cf6b7eecb6231dc94da82a275002d1913f60809e98d64f9892e98d303',
// 	generatorPublicKey: '747d370dc479a7d684e3b61d8c75716f3bc91afcf9e5d3eeaeb557753d757ac4',
// 	numberOfTransactions: 0,
// 	payloadHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
// 	payloadLength: 0,
// 	previousBlock: '1553572419982003786',
// 	reward: 0,
// 	timestamp: 39674950,
// 	totalAmount: 0,
// 	totalFee: 0,
// 	transactions: [],
// 	version: 0,
// 	id: '10000428847403166564'
// };
//
// var blockRewardInvalid = {
//     blockSignature: '08d70794b3fd90be5d14fd02f512c56485d4bac071ccf98188833242a7d84dfd9c98bc3cf6b7eecb6231dc94da82a275002d1913f60809e98d64f9892e98d303',
//     generatorPublicKey: '747d370dc479a7d684e3b61d8c75716f3bc91afcf9e5d3eeaeb557753d757ac4',
//     numberOfTransactions: 0,
//     payloadHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
//     payloadLength: 0,
//     previousBlock: '1553572419982003786',
//     reward: 0,
//     timestamp: 39674950,
//     totalAmount: 0,
//     totalFee: 0,
//     transactions: [],
//     version: 0,
//     id: '10000428847403166564'
// };
//
// var validBlockWithPayload = {
//     blockSignature: '25ea76424044e76a47ab2f1854d553f3aa24437f37af7acbabeb50ce27c42f340ad890103d1c96862224dbd4590c787cf47497131214842c57a0cc8801366e0a',
//     generatorPublicKey: '7c7b92b7d2159e5652bc942fdb9d6dbee77d1b120f488960966ce0850d819b05',
//     numberOfTransactions: 3,
// 	height: 24134,
//     payloadHash: '81de7bd1606eaca88b8f835b11682668afba47439a5468fce5288b5b7b6280d4',
//     payloadLength: 364,
//     previousBlock: '8741947515519892818',
//     reward: 0,
//     timestamp: 39555010,
//     totalAmount: 0,
//     totalFee: 300000,
//     transactions: [
//         {
// 			type: 8,
// 			amount: 0,
// 			fee: 100000,
// 			timestamp: 39555007,
// 			recipientId: 'U6891492430527629853',
// 			senderId: 'U2967613837320252358',
// 			senderPublicKey: 'f7f46c3c8b4a21ef50613565a3c4b0289fcb304af57638c12d218ef9463a1b48',
// 			signature: 'e4429551a936430477e16e7d6b98420f8e8cf180105658f9306c1948bfcb1083a87dfa3610dac4e5bc73ce43b061ac20de3c456b217258e6f85a85880e5bc000',
// 			id: '14322431483774644897',
// 			asset: {
// 				chat: {
// 					message: 'end remove mansion next task say dynamic woman response feature ceiling mixed'
// 				}
// 			}
// 		}
// 	],
//     version: 0,
//     id: '15642998233669588601'
// };
//
// describe('blocks/verify', function () {
//
// 	var blocksVerify;
// 	var blocks;
// 	var blockLogic;
// 	var accounts;
// 	var delegates;
//
// 	before(function (done) {
// 		modulesLoader.initLogic(BlockLogic, modulesLoader.scope, function (err, __blockLogic) {
// 			if (err) {
// 				return done(err);
// 			}
// 			blockLogic = __blockLogic;
//
// 			modulesLoader.initModules([
// 				{blocks: require('../../../../modules/blocks')},
// 				{accounts: require('../../../../modules/accounts')},
// 				{delegates: require('../../../../modules/delegates')},
// 				{transactions: require('../../../../modules/transactions')},
// 				{transport: require('../../../../modules/transport')},
// 				{system: require('../../../../modules/system')},
// 			], [
// 				{'block': require('../../../../logic/block')},
// 				{'transaction': require('../../../../logic/transaction')},
// 				{'account': require('../../../../logic/account')},
// 			], {}, function (err, __modules) {
// 				if (err) {
// 					return done(err);
// 				}
// 				__modules.blocks.verify.onBind(__modules);
// 				__modules.delegates.onBind(__modules);
// 				__modules.transactions.onBind(__modules);
// 				__modules.blocks.chain.onBind(__modules);
// 				__modules.transport.onBind(__modules);
// 				blocks = __modules.blocks;
// 				blocksVerify = __modules.blocks.verify;
// 				accounts = __modules.accounts;
// 				delegates = __modules.delegates;
//
// 				done();
// 			});
// 		});
// 	});
//
// 	function testValid (functionName) {
// 		it('should be ok', function () {
// 			blocks.lastBlock.set(previousBlock);
//
// 			var result = blocksVerify[functionName](validBlock);
//
// 			expect(result.verified).to.be.true;
// 			expect(result.errors).to.be.an('array').that.is.empty;
// 		});
//
// 		it('should be ok when block is invalid but block id is excepted for having invalid block reward', function () {
// 			exceptions.blockRewards.push(blockRewardInvalid.id);
//
// 			var result = blocksVerify[functionName](blockRewardInvalid);
//
// 			expect(result.verified).to.be.true;
// 			expect(result.errors).to.be.an('array').that.is.empty;
// 		});
// 	}
//
// 	function testSetHeight (functionName) {
// 		it('should set height from lastBlock', function () {
// 			blocks.lastBlock.set(previousBlock);
//
// 			var result = blocksVerify[functionName](validBlock);
//
// 			expect(result.verified).to.be.true;
// 			expect(result.errors).to.be.an('array').that.is.empty;
// 			expect(validBlock.height).to.equal(previousBlock.height + 1);
// 		});
// 	}
//
// 	function testVerifySignature (functionName) {
// 		it('should fail when blockSignature property is not a hex string', function () {
// 			var blockSignature = validBlock.blockSignature;
// 			validBlock.blockSignature = 'invalidBlockSignature';
//
// 			var result = blocksVerify[functionName](validBlock);
//
// 			expect(result.errors).to.be.an('array').with.lengthOf(2);
//
// 			expect(result.errors[1]).to.equal('Error: argument signature must be 64U bytes long, but got a different value');
// 			expect(result.errors[0]).to.equal('Failed to verify block signature');
//
// 			validBlock.blockSignature = blockSignature;
// 		});
//
// 		it('should fail when blockSignature property is an invalid hex string', function () {
// 			var blockSignature = validBlock.blockSignature;
// 			validBlock.blockSignature = 'bfaaabdc8612e177f1337d225a8a5af18cf2534f9e41b66c114850aa50ca2ea2621c4b2d34c4a8b62ea7d043e854c8ae3891113543f84f437e9d3c9cb24c0e05';
//
// 			var result = blocksVerify[functionName](validBlock);
//
// 			expect(result.errors).to.be.an('array').with.lengthOf(1);
// 			expect(result.errors[0]).to.equal('Failed to verify block signature');
//
// 			validBlock.blockSignature = blockSignature;
// 		});
//
// 		it('should fail when generatorPublicKey property is not a hex string', function () {
// 			var generatorPublicKey = validBlock.generatorPublicKey;
// 			validBlock.generatorPublicKey = 'invalidBlockSignature';
//
// 			var result = blocksVerify[functionName](validBlock);
//
// 			expect(result.errors).to.be.an('array').with.lengthOf(2);
// 			expect(result.errors[1]).to.equal('Error: argument publicKey must be 32U bytes long, but got a different value');
// 			expect(result.errors[0]).to.equal('Failed to verify block signature');
//
// 			validBlock.generatorPublicKey = generatorPublicKey;
// 		});
//
// 		it('should fail when generatorPublicKey property is an invalid hex string', function () {
// 			var generatorPublicKey = validBlock.generatorPublicKey;
// 			validBlock.generatorPublicKey = '948b8b509579306694c00db2206ddb1517bfeca2b0dc833ec1c0f81e9644871b';
//
// 			var result = blocksVerify[functionName](validBlock);
//
// 			expect(result.errors).to.be.an('array').with.lengthOf(1);
// 			expect(result.errors[0]).to.equal('Failed to verify block signature');
//
// 			validBlock.generatorPublicKey = generatorPublicKey;
// 		});
// 	}
//
// 	function testPreviousBlock (functionName) {
// 		it('should fail when previousBlock property is missing', function () {
// 			var previousBlock = validBlock.previousBlock;
// 			delete validBlock.previousBlock;
//
// 			var result = blocksVerify[functionName](validBlock);
//
// 			expect(result.verified).to.be.false;
// 			expect(result.errors).to.be.an('array').with.lengthOf(2);
// 			expect(result.errors[0]).to.equal('Invalid previous block');
// 			expect(result.errors[1]).to.equal('Failed to verify block signature');
//
// 			validBlock.previousBlock = previousBlock;
// 		});
// 	}
//
// 	function testVerifyVersion (functionName) {
// 		it('should fail when block version != 0', function () {
// 			var version = validBlock.version;
// 			validBlock.version = 99;
//
// 			var result = blocksVerify[functionName](validBlock);
//
// 			expect(result.verified).to.be.false;
// 			expect(result.errors).to.be.an('array').with.lengthOf(2);
// 			expect(result.errors[0]).to.equal('Invalid block version');
// 			expect(result.errors[1]).to.equal('Failed to verify block signature');
//
// 			validBlock.version = version;
// 		});
// 	}
//
// 	function testVerifyReward (functionName) {
// 		it('should fail when block reward is invalid', function () {
// 			validBlock.reward = 99;
//
// 			var result = blocksVerify[functionName](validBlock);
//
// 			expect(result.errors).to.be.an('array').with.lengthOf(2);
// 			expect(result.errors[0]).to.equal(['Invalid block reward:', 99, 'expected:', 0].join(' '));
//
// 			validBlock.reward = 0;
// 		});
// 	}
//
// 	function testVerifyId (functionName) {
// 		it('should reset block id when block id is an invalid alpha-numeric string value', function () {
// 			validBlock.id = 'invalid-block-id';
// 			var result = blocksVerify[functionName](validBlock);
// 			expect(validBlock.id).to.not.equal('invalid-block-id');
// 		});
//
// 		it('should reset block id when block id is an invalid numeric string value', function () {
// 			validBlock.id = '11850828211026019526';
// 			var result = blocksVerify[functionName](validBlock);
// 			expect(validBlock.id).to.not.equal('11850828211026019526');
// 		});
//
// 		it('should reset block id when block id is an invalid integer value', function () {
// 			validBlock.id = 11850828211026019526;
// 			var result = blocksVerify[functionName](validBlock);
// 			expect(validBlock.id).to.not.equal(11850828211026019526);
// 		});
//
// 		it('should reset block id when block id is a valid integer value', function () {
// 			validBlock.id = 11850828211026019525;
// 			var result = blocksVerify[functionName](validBlock);
// 			expect(validBlock.id).to.not.equal(11850828211026019525);
// 		});
// 	}
//
// 	function testVerifyPayload (functionName) {
// 		it('should fail when payload length greater than maxPayloadLength constant value', function () {
// 			var payloadLength = validBlock.payloadLength;
// 			validBlock.payloadLength = 1024 * 1024 * 2;
//
// 			var result = blocksVerify[functionName](validBlock);
//
// 			expect(result.errors).to.be.an('array').with.lengthOf(2);
// 			expect(result.errors[0]).to.equal('Payload length is too long');
// 			expect(result.errors[1]).to.equal('Failed to verify block signature');
//
// 			validBlock.payloadLength = payloadLength;
// 		});
//
// 		it('should fail when transactions length is not equal to numberOfTransactions property', function () {
// 			validBlock.numberOfTransactions = validBlock.transactions.length + 1;
//
// 			var result = blocksVerify[functionName](validBlock);
//
// 			expect(result.errors).to.be.an('array').with.lengthOf(2);
// 			expect(result.errors[0]).to.equal('Included transactions do not match block transactions count');
// 			expect(result.errors[1]).to.equal('Failed to verify block signature');
//
// 			validBlock.numberOfTransactions = validBlock.transactions.length;
// 		});
//
// 		it('should fail when transactions length greater than maxTxsPerBlock constant value', function () {
// 			var transactions = validBlock.transactions;
// 			validBlock.transactions = new Array(26);
// 			validBlock.numberOfTransactions = validBlock.transactions.length;
//
// 			var result = blocksVerify[functionName](validBlock);
//
// 			expect(result.errors).to.be.an('array').with.lengthOf(2);
// 			expect(result.errors[0]).to.equal('Number of transactions exceeds maximum per block');
// 			expect(result.errors[1]).to.equal('Failed to verify block signature');
//
// 			validBlock.transactions = transactions;
// 			validBlock.numberOfTransactions = transactions.length;
// 		});
//
// 		// it('should fail when a transaction is of an unknown type', function () {
// 		// 	var trsType = validBlock.transactions[0].type;
// 		// 	validBlock.transactions[0].type = 555;
// 		//
// 		// 	var result = blocksVerify[functionName](validBlock);
// 		//
// 		// 	expect(result.errors).to.be.an('array').with.lengthOf(2);
// 		// 	expect(result.errors[0]).to.equal('Invalid payload hash');
// 		// 	expect(result.errors[1]).to.equal('Unknown transaction type ' + validBlock.transactions[0].type);
// 		//
// 		// 	validBlock.transactions[0].type = trsType;
// 		// });
// 		//
// 		// it('should fail when a transaction is duplicated', function () {
// 		// 	var secondTrs = validBlock.transactions[1];
// 		// 	validBlock.transactions[1] = validBlock.transactions[0];
// 		//
// 		// 	var result = blocksVerify[functionName](validBlock);
// 		//
// 		// 	expect(result.errors).to.be.an('array').with.lengthOf(3);
// 		// 	expect(result.errors[0]).to.equal('Invalid total amount');
// 		// 	expect(result.errors[1]).to.equal('Invalid payload hash');
// 		// 	expect(result.errors[2]).to.equal('Encountered duplicate transaction: ' + validBlock.transactions[1].id);
// 		//
// 		// 	validBlock.transactions[1] = secondTrs;
// 		// });
//
// 		it('should fail when payload hash is invalid', function () {
// 			var payloadHash = validBlock.payloadHash;
// 			validBlock.payloadHash = 'invalidPayloadHash';
//
// 			var result = blocksVerify[functionName](validBlock);
//
// 			expect(result.errors).to.be.an('array').with.lengthOf(2);
// 			expect(result.errors[0]).to.equal('Invalid payload hash');
// 			expect(result.errors[1]).to.equal('Failed to verify block signature');
//
// 			validBlock.payloadHash = payloadHash;
// 		});
//
// 		it('should fail when summed transaction amounts do not match totalAmount property', function () {
// 			var totalAmount = validBlock.totalAmount;
// 			validBlock.totalAmount = 99;
//
// 			var result = blocksVerify[functionName](validBlock);
//
// 			expect(result.errors).to.be.an('array').with.lengthOf(2);
// 			expect(result.errors[0]).to.equal('Invalid total amount');
// 			expect(result.errors[1]).to.equal('Failed to verify block signature');
//
// 			validBlock.totalAmount = totalAmount;
// 		});
//
// 		it('should fail when summed transaction fees do not match totalFee property', function () {
// 			var totalFee = validBlock.totalFee;
// 			validBlock.totalFee = 99;
//
// 			var result = blocksVerify[functionName](validBlock);
//
// 			expect(result.errors).to.be.an('array').with.lengthOf(2);
// 			expect(result.errors[0]).to.equal('Invalid total fee');
// 			expect(result.errors[1]).to.equal('Failed to verify block signature');
//
// 			validBlock.totalFee = totalFee;
// 		});
// 	}
//
// 	function testVerifyForkOne (functionName) {
// 		it('should fail when previousBlock value is invalid', function () {
// 			var previousBlock = blocks.lastBlock.get().id;
// 			validBlock.previousBlock = '10937893559311260102';
//
// 			var result = blocksVerify[functionName](validBlock);
//
// 			expect(result.errors).to.be.an('array').with.lengthOf(2);
// 			expect(result.errors[0]).to.equal(['Invalid previous block:', validBlock.previousBlock, 'expected:', previousBlock].join(' '));
// 			expect(result.errors[1]).to.equal('Failed to verify block signature');
//
// 			validBlock.previousBlock = previousBlock;
// 		});
// 	}
//
// 	function testVerifyBlockSlot (functionName) {
// 		it('should fail when block timestamp is less than previousBlock timestamp', function () {
// 			var timestamp = validBlock.timestamp;
// 			validBlock.timestamp = 32578350;
//
// 			var result = blocksVerify[functionName](validBlock);
//
// 			expect(result.verified).to.be.false;
// 			expect(result.errors).to.be.an('array').with.lengthOf(2);
// 			expect(result.errors[0]).to.equal('Invalid block timestamp');
// 			expect(result.errors[1]).to.equal('Failed to verify block signature');
//
// 			validBlock.timestamp  = timestamp;
// 		});
// 	}
//
// 	describe('verifyReceipt() when block is valid', testValid.bind(null, 'verifyReceipt'));
//
// 	describe('verifyReceipt() when block is invalid', function () {
//
// 		describe('calling setHeight()', testSetHeight.bind(null, 'verifyReceipt'));
//
// 		describe('calling verifySignature()', testVerifySignature.bind(null, 'verifyReceipt'));
//
// 		describe('calling verifyPreviousBlock()', testPreviousBlock.bind(null, 'verifyReceipt'));
//
// 		describe('calling verifyVersion()', testVerifyVersion.bind(null, 'verifyReceipt'));
//
// 		describe('calling verifyReward()', testVerifyReward.bind(null, 'verifyReceipt'));
//
// 		describe('calling verifyId()', testVerifyId.bind(null, 'verifyReceipt'));
//
// 		describe('calling verifyPayload()', testVerifyPayload.bind(null, 'verifyReceipt'));
//
// 		describe.skip('calling verifyForkOne()', testVerifyForkOne);
//
// 		describe.skip('calling verifyBlockSlot()', testVerifyBlockSlot);
// 	});
//
// 	describe('verifyBlock() when block is valid', testValid.bind(null, 'verifyBlock'));
//
// 	describe('verifyBlock() when block is invalid', function () {
//
// 		describe('calling setHeight()', testSetHeight.bind(null, 'verifyBlock'));
//
// 		describe('calling verifySignature()', testVerifySignature.bind(null, 'verifyBlock'));
//
// 		describe('calling verifyPreviousBlock()', testPreviousBlock.bind(null, 'verifyBlock'));
//
// 		describe('calling verifyVersion()', testVerifyVersion.bind(null, 'verifyBlock'));
//
// 		describe('calling verifyReward()', testVerifyReward.bind(null, 'verifyBlock'));
//
// 		describe('calling verifyId()', testVerifyId.bind(null, 'verifyBlock'));
//
// 		describe('calling verifyPayload()', testVerifyPayload.bind(null, 'verifyBlock'));
//
// 		describe('calling verifyForkOne()', testVerifyForkOne.bind(null, 'verifyBlock'));
//
// 		describe('calling verifyBlockSlot()', testVerifyBlockSlot.bind(null, 'verifyBlock'));
// 	});
// });
