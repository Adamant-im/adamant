'use strict';

/**
 * @namespace constants
 * @memberof module:helpers
 * @property {number} activeDelegates - The default number of delegates.
 * @property {number} maxVotesPerTransaction - The maximum number of votes in vote type transaction.
 * @property {number} addressLength - The default address length.
 * @property {number} blockHeaderLength - The default block header length.
 * @property {number} blockReceiptTimeOut
 * @property {number} confirmationLength
 * @property {Date} epochTime
 * @property {number} fairSystemActivateBlock
 * @property {object} fees - The default values for fees.
 * @property {number} fees.send
 * @property {number} fees.vote
 * @property {number} fees.secondsignature
 * @property {number} fees.delegate
 * @property {number} fees.multisignature
 * @property {number} fees.dapp
 * @property {number} feeStart
 * @property {number} feeStartVolume
 * @property {number} fixedPoint
 * @property {number} maxAddressesLength
 * @property {number} maxAmount
 * @property {number} maxConfirmations
 * @property {number} maxPayloadLength
 * @property {number} maxPeers
 * @property {number} maxRequests
 * @property {number} maxSharedTxs
 * @property {number} maxSignaturesLength
 * @property {number} maxTxsPerBlock
 * @property {number} minBroadhashConsensus
 * @property {string[]} nethashes - Mainnet and Testnet.
 * @property {number} numberLength
 * @property {number} requestLength
 * @property {object} rewards
 * @property {number[]} rewards.milestones - Initial 5, and decreasing until 1.
 * @property {number} rewards.offset - Start rewards at block (n).
 * @property {number} rewards.distance - Distance between each milestone
 * @property {number} signatureLength
 * @property {number} totalAmount
 * @property {number} unconfirmedTransactionTimeOut - 1080 blocks
 */
module.exports = {
	activeDelegates: 101,
	maxVotesPerTransaction: 33,
	addressLength: 208,
	blockHeaderLength: 248,
	blockReceiptTimeOut: 20, // 2 blocks
	confirmationLength: 77,
	epochTime: new Date(Date.UTC(2017, 8, 2, 17, 0, 0, 0)),
	fairSystemActivateBlock: 4359464,
	fees: {
		send: 50000000,
		vote: 5000000000,
		secondsignature: 500000000,
		delegate: 300000000000,
		multisignature: 500000000,
		dapp: 2500000000,
        old_chat_message: 500000,
		chat_message: 100000,
        state_store: 100000,
    	profile_update:  5000000,
		avatar_upload: 10000000
	},
	feeStart: 1,
	feeStartVolume: 10000 * 100000000,
	fixedPoint: Math.pow(10, 8),
	maxAddressesLength: 208 * 128,
	maxAmount: 20000000000000000,
	maxConfirmations: 77 * 100,
	maxPayloadLength: 1024 * 1024,
	maxPeers: 100,
	maxRequests: 10000 * 12,
	maxSharedTxs: 100,
	maxSignaturesLength: 196 * 256,
	maxTxsPerBlock: 25,
	minBroadhashConsensus: 51,
	nethashes: [
		// Mainnet
		'77265cf40a806763bc1e3ff0d899a1c0582b46e84ce8808b445dd9b95aa86da5',
		// Testnet
		'38f153a81332dea86751451fd992df26a9249f0834f72f58f84ac31cceb70f43'
	],
	numberLength: 100000000,
	requestLength: 104,
	// WARNING: When changing rewards you also need to change getBlockRewards(int) SQL function!
	rewards: {
		milestones: [
		    50000000, // Initial Reward
            45000000, // Milestone 1
            40000000, // Milestone 2
            35000000, // Milestone 3
            30000000,  // Milestone 4
            25000000,  // Milestone 5
            20000000,  // Milestone 6
            15000000,  // Milestone 7
            10000000  // Milestone 8
		],
		offset: 2000000,   // Start rewards at block (n)
		distance: 6300000 // Distance between each milestone
	},
	signatureLength: 196,
	// WARNING: When changing totalAmount you also need to change getBlockRewards(int) SQL function!
	totalAmount: 9800000000000000,
	unconfirmedTransactionTimeOut: 10800, // 1080 blocks
	multisigConstraints: {
		min: {
			minimum: 1,
			maximum: 15
		},
		lifetime: {
			minimum: 1,
			maximum: 72
		},
		keysgroup: {
			minItems: 1,
			maxItems: 15
		}
	}
};
