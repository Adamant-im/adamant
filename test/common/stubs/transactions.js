const testUnconfirmedTransactions = [
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
  {
    type: 0,
    timestamp: 231352260,
    amount: 100000000,
    senderPublicKey:
      "1ed651ec1c686c23249dadb2cb656edd5f8e7d35076815d8a81c395c3eed1a85",
    senderId: "U3716604363012166999",
    asset: {},
    recipientId: "U2185870976635709603",
    signature:
      "33d582918606c7d95c0e4090acfb60d2d787fb7389d292855dfc2e15ed065fca323edd8e3fec13ae2c271dfbc21d2605c0b12a4a8a530e2698860e261b581f0e",
    id: "778030905016394402",
    fee: 50000000,
    relays: 1,
    receivedAt: "2025-01-01T09:31:00.872Z",
  },
  {
    type: 0,
    timestamp: 231352260,
    amount: 10000000,
    senderPublicKey:
      "1ed651ec1c686c23249dadb2cb656edd5f8e7d35076815d8a81c395c3eed1a85",
    senderId: "U3716604363012166999",
    asset: {},
    recipientId: "U2185870976635709603",
    signature:
      "1b4199d8d97d8956536c8759f3d2d24352606f6415a58998e5efa398ca9eccd5b432c715e28921405cb89106f63966a071b51edef582e84f713fb89077e39308",
    id: "9465891170552043284",
    fee: 50000000,
    relays: 1,
    receivedAt: "2025-01-01T09:31:00.885Z",
  },
  {
    type: 8,
    timestamp: 231352260,
    amount: 0,
    senderPublicKey:
      "99f7be2f7144ef922827dc481658cf0539e60b97eea0fe5c54c86160f5df31c8",
    senderId: "U17569530934631988492",
    asset: {
      chat: {
        message: "3aaea94e9036ffa11b0a4902a8fa4bcf77d6",
        own_message: "bfbbb939d042c8e44c40bba8540d35085bfac8ed4f732c63",
        type: 1,
      },
    },
    recipientId: "U1747430300387568664",
    signature:
      "812f8b9afb9f6b6bd3e58e50334ec554b63dab736672817d7c3314d232751762d0e4f0a589ed784c7e677374edf810d948701f161580adfa139ecb1559f4bb00",
    id: "9751445941920612023",
    fee: 100000,
    relays: 1,
    receivedAt: "2025-01-01T09:31:01.018Z",
  },
  {
    type: 8,
    timestamp: 231352260,
    amount: 0,
    senderPublicKey:
      "1ed651ec1c686c23249dadb2cb656edd5f8e7d35076815d8a81c395c3eed1a85",
    senderId: "U3716604363012166999",
    asset: {
      chat: {
        message: "2ac84297bfdb9532ffbf58cff9f2e31f88c6",
        own_message: "87f43866243c69ac70a668393ff12d33a9c7b8f630189b51",
        type: 1,
      },
    },
    recipientId: "U1747430300387568664",
    signature:
      "33f07bc0c298e3026050a4ba2fe2aded4ea5fd441597eaf813c1cadc11888efb9937f85057e452d393dad509a04319c0776d67b3cf62f5231b468642f799c506",
    id: "18108655393207107894",
    fee: 100000,
    relays: 1,
    receivedAt: "2025-01-01T09:31:01.042Z",
  },
  {
    type: 8,
    timestamp: 231352261,
    amount: 0,
    senderPublicKey:
      "1ed651ec1c686c23249dadb2cb656edd5f8e7d35076815d8a81c395c3eed1a85",
    senderId: "U3716604363012166999",
    asset: {
      chat: {
        message: "fca925c143be68eb238be480b7cc4ae8ff54",
        own_message: "83ad380da5d7a5e5ecb569499557c333ed54023e9e0e29af",
        type: 1,
      },
    },
    recipientId: "U2185870976635709603",
    signature:
      "55125a881584b8938f5335a49a9db43d4906ecdb394342cccc16d921179e3660f844238ad1f1af9989177b3a81bb2042d87a699aa5a15a9cc34edff83689890d",
    id: "6502572590189761565",
    fee: 100000,
    relays: 1,
    receivedAt: "2025-01-01T09:31:01.078Z",
  },
  {
    type: 8,
    timestamp: 231352261,
    amount: 0,
    senderPublicKey:
      "99f7be2f7144ef922827dc481658cf0539e60b97eea0fe5c54c86160f5df31c8",
    senderId: "U17569530934631988492",
    asset: {
      chat: {
        message: "9de41abb9cd9e78243cc5a89f8545c7619f6",
        own_message: "25e334fdaeb49c8e64548bf65c908817ad073bda7cf3ffb4",
        type: 1,
      },
    },
    recipientId: "U2185870976635709603",
    signature:
      "9ca953b4434616666a474f90364af5373e59604c80999436f9e9ba3b9297c13355fcca31fb9c62158c7ebf551b63feacc86a376a9cdd17dffd4f4c61bf72fe0f",
    id: "10816391510452339284",
    fee: 100000,
    relays: 1,
    receivedAt: "2025-01-01T09:31:01.112Z",
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
  testUnconfirmedTransactions,
  nonExistingTransactionId,
  existingTransaction,
  existingTransactionWithAsset,
  unconfirmedTransaction,
  unconfirmedTransactionId,
};
