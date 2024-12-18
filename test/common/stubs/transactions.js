const unconfirmedTransactions = [
  {
    type: 8,
    amount: 9000000,
    senderId: "U11987698782411545765",
    senderPublicKey:
      "b87f9fe005c3533152230fdcbd7bf87a0cea83592c591f7e71be5b7a48bb6e44",
    asset: {
      chat: {
        message: "6e69d547ce31dbbe0a5aba78c516e91d71e3b2",
        own_message: "e1c00c2c8b8f59f49e176aef30915c6deba554f87c45951e",
        type: 1,
      },
    },
    recipientId: "U5885317311990438076",
    timestamp: 58880317,
    signature:
      "5ee972df476703492a667616eef428ed127e13fe5de8ba873b6579a806ddbd9fbd34147cf0321823d72e0d234466fc3dc89ebe7341e0b4a91a56b32d3bdb6a00",
    id: "2521078418148431420",
    fee: 50000000,
    relays: 1,
    receivedAt: "2019-07-16T04:38:38.492Z",
  },
];

const existingTransaction = {
  type: 2,
  amount: 0,
  fee: 0,
  recipientId: null,
  timestamp: 0,
  senderId: 'U810656636599221322',
  senderPublicKey:
    'f4011a1360ac2769e066c789acaaeffa9d707690d4d3f6085a7d52756fbc30d0',
  signature:
    '1a4e3167185346f2cba0be57119670a0c737d63ca9e02ce3ff2a9a9e9dad0cccc53e4ced8c2b8a8fa32ce2e95c08c5e95f68a67b4040e75e339dfda6ed554b0a',
  id: '8786873494391552220',
};

const existingTransactionWithAsset = {
  ...existingTransaction,
  asset: {
    delegate: {
      address: 'U810656636599221322',
      publicKey:
        'f4011a1360ac2769e066c789acaaeffa9d707690d4d3f6085a7d52756fbc30d0',
      username: 'market',
    },
  },
};

const unconfirmedTransaction = {
  type: 0,
  timestamp: 228144202,
  amount: 50000000,
  fee: 50000000,
  senderPublicKey:
    'f4011a1360ac2769e066c789acaaeffa9d707690d4d3f6085a7d52756fbc30d0',
  senderId: 'U810656636599221322',
  asset: {},
  recipientId: 'U12559234133690317086',
  signature:
    'd1f77e6d44b1b25138647aac3e1868b79df103d87ae272fa02f0e519dabf7714588ca9b4971da322cde4f0d717800b7a1a34bb42f2311c2977e22976c2c52808',
};

const unconfirmedTransactionId = '15096340494692671309';

const nonExistingTransactionId = '11111111111111111111';

module.exports = {
  unconfirmedTransactions,
  nonExistingTransactionId,
  existingTransaction,
  existingTransactionWithAsset,
  unconfirmedTransaction,
  unconfirmedTransactionId,
};
