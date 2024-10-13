const validBlock = {
  id: "2970021393187988089",
  version: 0,
  timestamp: 224138470,
  height: 74916,
  previousBlock: "1859555445278782254",
  numberOfTransactions: 4,
  totalAmount: 10000000000,
  totalFee: 100200000,
  reward: 0,
  payloadLength: 569,
  payloadHash:
    "2fcb011cb7540594ada9bb88e40c602257c21477c701f1b729573f5171165a74",
  generatorPublicKey:
    "f4011a1360ac2769e066c789acaaeffa9d707690d4d3f6085a7d52756fbc30d0",
  generatorId: "U7821895274052553465",
  blockSignature:
    "2efc3964ff1bfe5913ccdac97aefa88514091557011760d29de28abb36a8345533dfbe28f407fd8d2a5f75af87d2bd342f913ef527bacb9537c0a4714fe0b30b",
  confirmations: 13,
  totalForged: "100200000",
};

const firstTransfer = {
  id: "11011291491598217343",
  height: 74916,
  blockId: "1343081691583438166",
  type: 0,
  block_timestamp: 224138470,
  timestamp: 224138454,
  senderPublicKey:
    "b0b4d346382aa07b23c0b733d040424532201b9eb22004b66a79d4b44e9d1449",
  senderId: "U9781760580710719871",
  recipientId: "U3189897341701072645",
  recipientPublicKey:
    "5da4a51dc0cdf2908b2bd63ef788604205f87531697cd978407fd15a6c358bff",
  amount: 100000000,
  fee: 50000000,
  signature:
    "1e21c8a786b802794e137fd964a72b17618a720e85e7df98244bfee854950ece5e3c9fe8bdf23b2ef27cbf1ed3ecaa7e7829a6cfd8b3a4d51e45ecdc5c716905",
  signatures: [],
  confirmations: 61,
  asset: {},
};

const secondTransfer = {
  id: "6518067615780126",
  height: 74916,
  blockId: "1343081691583438166",
  type: 0,
  block_timestamp: 224138470,
  timestamp: 224138455,
  senderPublicKey:
    "b0b4d346382aa07b23c0b733d040424532201b9eb22004b66a79d4b44e9d1449",
  senderId: "U9781760580710719871",
  recipientId: "U3189897341701072645",
  recipientPublicKey:
    "5da4a51dc0cdf2908b2bd63ef788604205f87531697cd978407fd15a6c358bff",
  amount: 9900000000,
  fee: 50000000,
  signature:
    "d4d9ae872ae30a35ef5f0c0fc5cb0b9098dcc71b15b287d7e890c9d9c9d5493348dfaf3ad14f7ccae25214dc987e5a0f5440ebdfb0e2e93b6798b2aedc0f8a04",
  signatures: [],
  confirmations: 61,
  asset: {},
};

const firstMessage = {
  id: "449774133478944478",
  height: 74916,
  blockId: "1343081691583438166",
  type: 8,
  block_timestamp: 224138470,
  timestamp: 224138456,
  senderPublicKey:
    "b0b4d346382aa07b23c0b733d040424532201b9eb22004b66a79d4b44e9d1449",
  senderId: "U9781760580710719871",
  recipientId: "U3189897341701072645",
  recipientPublicKey:
    "5da4a51dc0cdf2908b2bd63ef788604205f87531697cd978407fd15a6c358bff",
  amount: 0,
  fee: 100000,
  signature:
    "f9f17e8e8935464c50ffa2a619321c25f3a7913a01ff547c54d419ff45a11d2466ed0dc6109dcc482051e3be410cdb68a169d44c42dc16ed62a4ff81393fd30f",
  signatures: [],
  confirmations: 61,
  asset: {
    chat: {
      message: "fd38e525f10ff6980cab97d7edb8a78f6b12b445480f",
      own_message: "44738b0599ff450d0d3d4ac86aa6c0f859fb033a8a74fb4a",
      type: 1,
    },
  },
};

const secondMessage = {
  id: "8266147080308035705",
  height: 74916,
  blockId: "1343081691583438166",
  type: 8,
  block_timestamp: 224138470,
  timestamp: 224138458,
  senderPublicKey:
    "b0b4d346382aa07b23c0b733d040424532201b9eb22004b66a79d4b44e9d1449",
  senderId: "U9781760580710719871",
  recipientId: "U3189897341701072645",
  recipientPublicKey:
    "5da4a51dc0cdf2908b2bd63ef788604205f87531697cd978407fd15a6c358bff",
  amount: 0,
  fee: 100000,
  signature:
    "13ab79bdc259f1fa2d1d0a73ccf7ca53abb603d2f56c96a1fe9dc46303acce10158ad88b79c5872a952d3bbf661e97393258356c1c0968427762203e27ac820e",
  signatures: [],
  confirmations: 61,
  asset: {
    chat: {
      message: "b5e490e0e284cd779e8e86e638a0d9497fcd396abe934a",
      own_message: "2f58bb7bcbe7cc5f6c1e1d9a7c7b81fdc5513f96cc8c1a0f",
      type: 1,
    },
  },
};

const validBlockTransactions = [
  firstTransfer,
  secondTransfer,
  firstMessage,
  secondMessage,
];

const validPreviousBlock = {
  id: "1859555445278782254",
  version: 0,
  timestamp: 224138465,
  height: 74915,
  previousBlock: "15739298621941223523",
  numberOfTransactions: 0,
  totalAmount: 0,
  totalFee: 0,
  reward: 0,
  payloadLength: 0,
  payloadHash:
    "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  generatorPublicKey:
    "2e6331291833dee33649f2e0b1c864f9bd8d2618faa144d36e9b4bec65209f6a",
  generatorId: "U123464595396329758",
  blockSignature:
    "f8c1e2b69c78fa3aa242879db25c40b19f70393f3a3408a78de4db986c157646df6ab5d9a4beeac8d184036254684b7cffbc22f470c3733324f9375b33787301",
  confirmations: 169,
  totalForged: "0",
};

const validPreviousBlockTransactions = [];

module.exports = {
  validBlock,
  validBlockTransactions,
  validPreviousBlock,
  validPreviousBlockTransactions,
  firstTransfer,
  secondTransfer,
  firstMessage,
  secondMessage
};
