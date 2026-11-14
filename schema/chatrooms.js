'use strict';

module.exports = {
  getChats: {
    id: 'chats.getTransactions',
    type: 'object',
    properties: {
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
      recipientId: {
        type: 'string',
        format: 'address',
        minLength: 1,
        maxLength: 22
      },
      userId: {
        type: 'string',
        format: 'address',
        minLength: 1,
        maxLength: 22
      },
      companionId: {
        type: 'string',
        format: 'address',
        minLength: 1,
        maxLength: 22
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
      },
      returnUnconfirmed: {},
      includeDirectTransfers: {},
      withoutDirectTransfers: {}
    },
    additionalProperties: false
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
  }
};
