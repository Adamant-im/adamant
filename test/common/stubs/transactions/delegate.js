const { validSender } = require('./common.js');

const validTransactionData = {
  username: 'system',
  sender: validSender,
};

const validTransaction = {
  type: 2,
  amount: 0,
  fee: 0,
  recipientId: null,
  timestamp: 0,
  asset: {},
  senderId: 'U14384059672307251353',
  senderPublicKey:
    'cd67fb7bc27d727636b6fc725aa4a03a4dfcd68990f5aa10c98b8c97dd9ceeae',
  signature:
    'b8961823346bb9049536fbb3a5ce36b3e937fdcb80e75b0ae82a26d941663f802139c1991c9c259ff88abe33779400f7580d3564c938684dc38d6d43cd375f0c',
  id: '8869103705291559476',
};

const validUnconfirmedTransaction = {
  type: 2,
  timestamp: 0,
  amount: 0,
  senderPublicKey:
    'f4011a1360ac2769e066c789acaaeffa9d707690d4d3f6085a7d52756fbc30d0',
  senderId: 'U810656636599221322',
  asset: {
    delegate: {
      username: 'market',
      publicKey:
        'f4011a1360ac2769e066c789acaaeffa9d707690d4d3f6085a7d52756fbc30d0',
    },
  },
  signature:
    '1a4e3167185346f2cba0be57119670a0c737d63ca9e02ce3ff2a9a9e9dad0cccc53e4ced8c2b8a8fa32ce2e95c08c5e95f68a67b4040e75e339dfda6ed554b0a',
  id: '8786873494391552220',
  fee: 300000000000,
  relays: 1,
  receivedAt: '2022-12-16T07:45:53.717Z',
};

const rawValidTransaction = {
  d_username: 'market',
  t_senderPublicKey:
    'f4011a1360ac2769e066c789acaaeffa9d707690d4d3f6085a7d52756fbc30d0',
  t_senderId: 'U810656636599221322',
};

module.exports = {
  validTransaction,
  validTransactionData,
  validUnconfirmedTransaction,
  rawValidTransaction,
};
