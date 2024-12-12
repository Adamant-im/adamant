const { delegateAccountKeypair, delegateAccount } = require('../account');

const validTransactionData = {
  type: 0,
  amount: 8067474861277,
  keypair: delegateAccountKeypair,
  sender: delegateAccount,
  senderId: delegateAccount.address,
  senderPublicKey: delegateAccount.publicKey,
  recipientId: 'U7771441689362721578',
  fee: 50000000,
  timestamp: 1000,
};

const validTransaction = {
  id: '17190511997607511181',
  blockId: '6438017970172540087',
  type: 0,
  block_timestamp: null,
  timestamp: 0,
  senderPublicKey:
    'b80bb6459608dcdeb9a98d1f2b0111b2bf11e53ef2933e6769bb0198e3a97aae',
  senderId: 'U15365455923155964650',
  recipientId: 'U9781760580710719871',
  amount: 490000000000000,
  fee: 0,
  signature:
    '85dc703a2b82698193ecbd86fd7aff1b057dfeb86e2a390ef42c1998bf1e9269c0048f42285e208a1e14a63843defbabece1bc96730f317f0cc16e23bb1b4d01',
  signatures: [],
  asset: {},
};

const rawValidTransaction = {
  t_id: '17190511997607511181',
  b_height: 981,
  t_blockId: '6438017970172540087',
  t_type: 0,
  t_timestamp: 33363661,
  t_senderPublicKey:
    'c094ebee7ec0c50ebee32918655e089f6e1a604b83bcaa760293c61e0f18ab6f',
  m_recipientPublicKey: null,
  t_senderId: 'U810656636599221322',
  t_recipientId: 'U7771441689362721578',
  t_amount: 490000000000000,
  t_fee: 0,
  t_signature:
    '85dc703a2b82698193ecbd86fd7aff1b057dfeb86e2a390ef42c1998bf1e9269c0048f42285e208a1e14a63843defbabece1bc96730f317f0cc16e23bb1b4d01',
  confirmations: 8343,
};

const validUnconfirmedTransaction = {
  type: 0,
  amount: 100,
  senderId: delegateAccount.address,
  senderPublicKey: delegateAccount.publicKey,
  recipientId: 'U7771441689362721578',
  fee: 50000000,
  timestamp: 1000,
  asset: {}
};

module.exports = {
  validUnconfirmedTransaction,
  rawValidTransaction,
  validTransaction,
  validTransactionData,
};
