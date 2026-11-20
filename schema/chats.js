'use strict';

var constants = require('../helpers/constants.js');

module.exports = {
  getTransactions: {
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
      inId: {
        type: 'string',
        format: 'address',
        minLength: 1,
        maxLength: 22
      },
      isIn: {
        type: 'string',
        format: 'address',
        minLength: 1,
        maxLength: 22
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
      returnUnconfirmed: {},
      includeDirectTransfers: {},
      withoutDirectTransfers: {}
    },
    additionalProperties: false
  },
  get: {
    id: 'dapps.get',
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
  list: {
    id: 'dapps.list',
    type: 'object',
    properties: {
      id: {
        type: 'string',
        format: 'id',
        minLength: 1,
        maxLength: 20
      },
      category: {
        type: 'string',
        minLength: 1
      },
      name: {
        type: 'string',
        minLength: 1,
        maxLength: 32
      },
      type: {
        type: 'integer',
        minimum: 0
      },
      link: {
        type: 'string',
        minLength: 1,
        maxLength: 2000
      },
      icon: {
        type: 'string',
        minLength: 1,
        maxLength: 2000
      },
      orderBy: {
        type: 'string',
        minLength: 1
      },
      limit: {
        type: 'integer',
        minimum: 1,
        maximum: 100
      },
      offset: {
        type: 'integer',
        minimum: 0
      }
    }
  },
  launch: {
    id: 'dapps.launch',
    type: 'object',
    properties: {
      params: {
        type: 'array',
        minItems: 1
      },
      id: {
        type: 'string',
        format: 'id',
        minLength: 1,
        maxLength: 20
      },
      master: {
        type: 'string',
        minLength: 0
      }
    },
    required: ['id']
  },
  sendWithdrawal: {
    id: 'dapps.sendWithdrawal',
    type: 'object',
    properties: {
      secret: {
        type: 'string',
        minLength: 1,
        maxLength: 100
      },
      amount: {
        type: 'integer',
        minimum: 1,
        maximum: constants.totalAmount
      },
      recipientId: {
        type: 'string',
        format: 'address',
        minLength: 1,
        maxLength: 22
      },
      secondSecret: {
        type: 'string',
        minLength: 1,
        maxLength: 100
      },
      dappId: {
        type: 'string',
        format: 'id',
        minLength: 1,
        maxLength: 20
      },
      transactionId: {
        type: 'string',
        format: 'id',
        minLength: 1,
        maxLength: 20
      },
      multisigAccountPublicKey: {
        type: 'string',
        format: 'publicKey'
      }
    },
    required: ['secret', 'recipientId', 'amount', 'dappId', 'transactionId']
  },
  search: {
    id: 'dapps.search',
    type: 'object',
    properties: {
      q: {
        type: 'string',
        minLength: 1
      },
      category: {
        type: 'integer',
        minimum: 0,
        maximum: 8
      },
      installed: {
        type: 'integer',
        minimum: 0,
        maximum: 1
      }
    },
    required: ['q']
  },
  install: {
    id: 'dapps.install',
    type: 'object',
    properties: {
      id: {
        type: 'string',
        format: 'id',
        minLength: 1,
        maxLength: 20
      },
      master: {
        type: 'string',
        minLength: 1
      }
    },
    required: ['id']
  },
  uninstall: {
    id: 'dapps.uninstall',
    type: 'object',
    properties: {
      id: {
        type: 'string',
        format: 'id',
        minLength: 1,
        maxLength: 20
      },
      master: {
        type: 'string',
        minLength: 1
      }
    },
    required: ['id']
  },
  stop: {
    id: 'dapps.stop',
    type: 'object',
    properties: {
      id: {
        type: 'string',
        format: 'id',
        minLength: 1,
        maxLength: 20
      },
      master: {
        type: 'string',
        minLength: 1
      }
    },
    required: ['id']
  }
};
