'use strict';

var constants = require('../helpers/constants.js');

module.exports = {
    getTransactions: {
        id: 'states.getTransactions',
        type: 'object',
        properties: {
            blockId: {
                type: 'string',
                format: 'id',
                minLength: 1,
                maxLength: 20
            },
            type: {
                type: 'integer',
                minimum: 0,
                maximum: 10
            },
            senderId: {
                type: 'string',
                format: 'address',
                minLength: 1,
                maxLength: 22
            },
            senderPublicKey: {
                type: 'string',
                format: 'publicKey'
            },
            ownerPublicKey: {
                type: 'string',
                format: 'publicKey'
            },
            ownerAddress: {
                type: 'string',
                format: 'address',
                minLength: 1,
                maxLength: 22
            },
            senderPublicKeys: {
                type: 'array',
                minItems: 1,
                'items': {
                    type: 'string',
                    format: 'publicKey'
                }
            },
            senderIds: {
                type: 'array',
                minItems: 1,
                'items': {
                    type: 'string',
                    format: 'address',
                    minLength: 1,
                    maxLength: 22
                }
            },
            fromHeight: {
                type: 'integer',
                minimum: 1
            },
            toHeight: {
                type: 'integer',
                minimum: 1
            },
            fromTimestamp: {
                type: 'integer',
                minimum: 0
            },
            toTimestamp: {
                type: 'integer',
                minimum: 1
            },
            fromUnixTime: {
                type: 'integer',
                minimum: (constants.epochTime.getTime() / 1000)
            },
            toUnixTime: {
                type: 'integer',
                minimum: (constants.epochTime.getTime() / 1000 + 1)
            },
            minConfirmations: {
                type: 'integer',
                minimum: 0
            },
            orderBy: {
                type: 'string'
            },
            limit: {
                type: 'integer',
                minimum: 1,
                maximum: 1000
            },
            offset: {
                type: 'integer',
                minimum: 0
            }
        }
    },
	get: {
		id: 'states.get',
		type: 'object',
		properties: {
			id: {
				type: 'string',
				format: 'id',
				minLength: 1,
				maxLength: 20
			}
		},
		required: ['id']
	},
    normalize: {
        id: 'states.normalize',
        type: 'object',
        properties: {
            value: {
                type: 'string',
                minLength: 1
            },
            key: {
                type: 'string',
                minLength: 0
            },
            recipientId: {
                type: 'string',
                format: 'address',
                minLength: 1,
                maxLength: 40
            },
            publicKey: {
                type: 'string',
                format: 'publicKey'
            }
        },
        required: ['value', 'publicKey']
    },
    store: {
        id: 'states.store',
        type: 'object',
        properties: {
            signature: {
                type: 'string',
                format: 'signature'
            }
        },
        required: ['signature']
    }
};
