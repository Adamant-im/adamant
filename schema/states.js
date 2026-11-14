'use strict';

module.exports = {
  getTransactions: {
    id: 'states.getTransactions',
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
      key: {
        type: 'string',
        format: 'key',
        minLength: 0,
        maxLength: 20
      },
      keyIds: {
        type: 'array',
        minItems: 1,
        'items': {
          type: 'string',
          format: 'key',
          minLength: 0,
          maxLength: 20
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
      returnUnconfirmed: {}
    },
    additionalProperties: false
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
