'use strict';
/**
 * @namespace exceptions
 * @memberof module:helpers
 * @property {object} genesisPublicKey
 * @property {string} genesisPublicKey.mainnet
 * @property {string} genesisPublicKey.testnet
 * @property {String[]} senderPublicKey
 * @property {String[]} signatures
 * @property {String[]} multisignatures
 * @property {String[]} votes
 */	
module.exports = {
	blockRewards: [],
	genesisPublicKey: {
		mainnet: '2efef768fc41949aaf5124d7a3663ae843fec87c930494ce37a54d83383b634d',
		testnet: 'b80bb6459608dcdeb9a98d1f2b0111b2bf11e53ef2933e6769bb0198e3a97aae'
	},
	rounds: {
		'27040': {rewards_factor: 2, fees_factor: 2, fees_bonus: 10000000}
	},
	fee: [
		'8641230861933359277', //1900178
		'10507274037528725945',//1900186
		'7235642948145568840', //1900186
		'14946390314703104642', //1900186
		'7249658269503790510' //1900187
	],
	senderPublicKey: [

	],
	signatures: [

	],
	multisignatures: [

	],
	votes: [

	]
};
