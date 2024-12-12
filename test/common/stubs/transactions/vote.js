const { testAccount, testAccountKeypair } = require('../account.js');

const transactionVotes = [
  '-9d3058175acab969f41ad9b86f7a2926c74258670fe56b37c429c01fca9f2f0f',
];

const validTransactionData = {
  type: 3,
  amount: 8067474861277,
  sender: testAccount,
  senderId: 'U810656636599221322',
  fee: 10000000,
  keypair: testAccountKeypair,
  publicKey: 'f4011a1360ac2769e066c789acaaeffa9d707690d4d3f6085a7d52756fbc30d0',
  votes: transactionVotes,
};

const validTransaction = {
  type: 3,
  amount: 0,
  senderPublicKey:
    'f4011a1360ac2769e066c789acaaeffa9d707690d4d3f6085a7d52756fbc30d0',
  requesterPublicKey: null,
  timestamp: 34253582,
  asset: {
    votes: [
      '-9d3058175acab969f41ad9b86f7a2926c74258670fe56b37c429c01fca9f2f0f',
    ],
  },
  data: undefined,
  recipientId: 'U810656636599221322',
  signature:
    'de668e2722fbc2fd02bac1bb66ff1238d75354f64ca0adc5b1967f5f4e67038336cee6a85af43ed9fa5f3a091890738de14c857bd7b1f9bade7ff1da1c395a0e',
  id: '5962289265698105102',
  fee: 100000000,
  senderId: 'U810656636599221322',
};

const existedDelegateKey =
  '81dd616f47bda681c929b9035aa1cbc9c41ba9d4af91f04744d1325e1b1af099';
const invalidDelegateKey =
  'f4011a1360ac2769e066c789acaaeffa9d707690d4d3f6085a7d52756fbc30fg';

module.exports = {
  transactionVotes,
  validTransactionData,
  validTransaction,
  existedDelegateKey,
  invalidDelegateKey,
};
