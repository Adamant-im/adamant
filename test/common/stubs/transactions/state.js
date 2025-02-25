
const validTransactionData = {
  value: '0x84609a38fedbcd02b657233340e6a8cb09db61a8',
  key: 'eth:address',
  state_type: 0,
};

const validTransaction = {
  type: 9,
  timestamp: 226647468,
  amount: 0,
  senderPublicKey:
    'f4011a1360ac2769e066c789acaaeffa9d707690d4d3f6085a7d52756fbc30d0',
  senderId: 'U810656636599221322',
  asset: {},
  recipientId: null,
  signature:
    'e3d569ec587dd0a47ff3c7fffa85506f98f5dd3ce56deb1e1108db3ac6c3c77c404f399cb8d1d712cbceb82e83fe8c9c818e76e3e2734d1f821b78496af91904',
  height: 6361977,
  blockId: '14557933175886918347',
  block_timestamp: 39015790,
  timestamp: 39015780,
  requesterPublicKey: null,
  recipientPublicKey: null,
  fee: 100000,
  signSignature: null,
  signatures: [],
  confirmations: null,
  asset: {},
};

const rawValidTransaction = {
  st_stored_value: '0x84609a38fedbcd02b657233340e6a8cb09db61a8',
  st_stored_key: 'eth:address',
  st_type: 0,
};

module.exports = {
  validTransactionData,
  validTransaction,
  rawValidTransaction
}
