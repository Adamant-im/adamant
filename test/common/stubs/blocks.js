const validBlock = {
  id: "13394160158042289473",
  version: 0,
  timestamp: 224016785,
  height: 50579,
  previousBlock: "15690482649871332345",
  numberOfTransactions: 3,
  totalAmount: 17200000000,
  totalFee: 150000000,
  reward: 0,
  payloadLength: 351,
  payloadHash:
    "eb2d86b92e5802ba441e0de4778ef31a9fb026249eaeb20c6d8547bd0d5c8c35",
  generatorPublicKey:
    "f4011a1360ac2769e066c789acaaeffa9d707690d4d3f6085a7d52756fbc30d0",
  generatorId: "U4908312589287434795",
  blockSignature:
    "338b24cfc468968cadfd4bcf864990c48edc6d6c028971f16215331945d374e2262c642b31b9b49750d65b507c87eca956c8524b6d553ee80d3e703c676b600e",
  confirmations: 34,
  totalForged: "150000000",
};

const validBlockTransactions = [
  {
    id: "5297693971011755674",
    height: 50579,
    blockId: "13394160158042289473",
    type: 0,
    block_timestamp: 224016785,
    timestamp: 224016749,
    senderPublicKey:
      "b0b4d346382aa07b23c0b733d040424532201b9eb22004b66a79d4b44e9d1449",
    senderId: "U9781760580710719871",
    recipientId: "U3189897341701072645",
    recipientPublicKey:
      "5da4a51dc0cdf2908b2bd63ef788604205f87531697cd978407fd15a6c358bff",
    amount: 100000000,
    fee: 50000000,
    signature:
      "c50e4ecf21b03885852c5bcbfed73a85551497177dc67f7ffae9be9a5e981c37f281574e0658ed5c6eabe0be0b1f8f87d2bf9bb4c16ffd63ab878bb290c91206",
    signatures: [],
    confirmations: 53,
    asset: {},
  },
  {
    id: "16262602235575857323",
    height: 50579,
    blockId: "13394160158042289473",
    type: 0,
    block_timestamp: 224016785,
    timestamp: 224016749,
    senderPublicKey:
      "b0b4d346382aa07b23c0b733d040424532201b9eb22004b66a79d4b44e9d1449",
    senderId: "U9781760580710719871",
    recipientId: "U3189897341701072645",
    recipientPublicKey:
      "5da4a51dc0cdf2908b2bd63ef788604205f87531697cd978407fd15a6c358bff",
    amount: 7200000000,
    fee: 50000000,
    signature:
      "8aabaec2d5d86927129b595dee9b3489e964294edb5a1de0a5d66854e59b800616dd20b3613f14e9d71445e425d4e8270f79ecac86d1fcf23f3116ff08c6890b",
    signatures: [],
    confirmations: 53,
    asset: {},
  },
  {
    id: "11781240535390040329",
    height: 50579,
    blockId: "13394160158042289473",
    type: 0,
    block_timestamp: 224016785,
    timestamp: 224016749,
    senderPublicKey:
      "b0b4d346382aa07b23c0b733d040424532201b9eb22004b66a79d4b44e9d1449",
    senderId: "U9781760580710719871",
    recipientId: "U3189897341701072645",
    recipientPublicKey:
      "5da4a51dc0cdf2908b2bd63ef788604205f87531697cd978407fd15a6c358bff",
    amount: 9900000000,
    fee: 50000000,
    signature:
      "09d47337667e6bebec90f2075d8b8d2ee5ff9158c84592256691396dc5164ae73de862c33908ce2b7b5da57dea6e62a0fa92405bd2d51c8f07f9785123fa9906",
    signatures: [],
    confirmations: 53,
    asset: {},
  },
];

const validPreviousBlock = {
  id: "15690482649871332345",
  version: 0,
  timestamp: 224016780,
  height: 50578,
  previousBlock: "8797881592268859480",
  numberOfTransactions: 0,
  totalAmount: 0,
  totalFee: 0,
  reward: 0,
  payloadLength: 0,
  payloadHash:
    "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  generatorPublicKey:
    "a76a215a0dfdd118a90825f9d2c8575acce4e5999c0ba6dc0c2871067ebe2e94",
  generatorId: "U17815939743590182258",
  blockSignature:
    "62b6bbdebf314d7e7813ef16fb14d4a1b6a5efb0686aed887d74c21754e40da95eeac3f4b7c3fbfc623bb166f5d416075fab1ecc23a2939604a1acd7c0c11307",
  confirmations: 87,
  totalForged: "0",
};

const validPreviousBlockTransactions = [];

module.exports = {
  validBlock,
  validBlockTransactions,
  validPreviousBlock,
  validPreviousBlockTransactions,
};
