'use strict';

var constants = require('../helpers/constants.js');

module.exports = {
    getTransactions: {
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
	addTransactions: {
		id: 'dapps.addTransactions',
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
			publicKey: {
				type: 'string',
				format: 'publicKey'
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
			multisigAccountPublicKey: {
				type: 'string',
				format: 'publicKey'
			}
		},
		required: ['secret', 'amount', 'dappId']
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
