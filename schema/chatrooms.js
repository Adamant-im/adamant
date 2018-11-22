'use strict';

const constants = require('../helpers/constants.js');

module.exports = {
    getChats: {
        id: 'chats.getTransactions',
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
            recipientId: {
                type: 'string',
                format: 'address',
                minLength: 1,
                maxLength: 22
            },
            amount: {
                type: 'integer',
                minimum: 0,
                maximum: constants.fixedPoint
            },
            fee: {
                type: 'integer',
                minimum: 0,
                maximum: constants.fixedPoint
            },
            senderPublicKeys: {
                type: 'array',
                minItems: 1,
                'items': {
                    type: 'string',
                    format: 'publicKey'
                }
            },
            recipientPublicKeys: {
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
            recipientIds: {
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
            minAmount: {
                type: 'integer',
                minimum: 0
            },
            maxAmount: {
                type: 'integer',
                minimum: 1
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
    normalize: {
        id: 'chats.normalize',
        type: 'object',
        properties: {
            message: {
                type: 'string',
                minLength: 1
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
        required: ['message', 'recipientId', 'publicKey']
    },
    process: {
        id: 'chats.process',
        type: 'object',
        properties: {
            signature: {
                type: 'string',
                format: 'signature'
            }
        },
        required: ['signature']
    },
};