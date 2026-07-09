'use strict';

module.exports = {
  new: {
    id: 'accounts.newAccount',
    type: 'object',
    properties: {
      publicKey: {
        type: 'string',
        format: 'publicKey'
      }
    },
    required: ['publicKey']
  },
  getBalance: {
    id: 'accounts.getBalance',
    type: 'object',
    properties: {
      address: {
        type: 'string',
        format: 'address',
        minLength: 1,
        maxLength: 22
      }
    },
    required: ['address']
  },
  getPublicKey: {
    id: 'accounts.getPublickey',
    type: 'object',
    properties: {
      address: {
        type: 'string',
        format: 'address',
        minLength: 1,
        maxLength: 22
      }
    },
    required: ['address']
  },
  getDelegates: {
    id: 'accounts.getDelegates',
    type: 'object',
    properties: {
      address: {
        type: 'string',
        format: 'address',
        minLength: 1,
        maxLength: 22
      }
    },
    required: ['address']
  },
  voteForDelegates: {
    id: 'accounts.voteForDelegates',
    type: 'object',
    properties: {
      senderPublicKey: {
        type: 'string',
        format: 'publicKey'
      }
    },
    required: ['senderPublicKey']
  },
  getAccount: {
    id: 'accounts.getAccount',
    type: 'object',
    properties: {
      address: {
        type: 'string',
        format: 'address',
        minLength: 1,
        maxLength: 22
      },
      publicKey: {
        type: 'string',
        format: 'publicKey'
      }
    }
  },
  top: {
    id: 'accounts.top',
    type: 'object',
    properties: {
      limit: {
        format: 'parsedInt'
      },
      offset: {
        format: 'parsedInt'
      },
      isDelegate: {
        format: 'parsedInt'
      }
    }
  }
};
