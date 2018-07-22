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
	commentTransfers: [
        '8641230861933359277',
        '10507274037528725945',
        '7235642948145568840',
        '14946390314703104642',
        '7249658269503790510',
        '14162701694028292835',
        '16427543247907609679',
        '18017833051900207372',
        '10472823779960469421',
        '9357583226439783592',
        '14960034546638267768',
        '18236690536623530817',
        '8825640246122242020',
        '1684406432082646965',
        '13298202744985628048',
        '5695513007348788766',
        '2356215295967522487',
        '14732568540226894720',
        '4355509966380545994',
        '56849833991487113',
        '1292459093278109347',
        '14827684078269063586',
        '7978312845511798180'
	],
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
