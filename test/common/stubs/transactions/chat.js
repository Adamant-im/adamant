const rawValidTransaction = {
  srt: 'U15365455923155964650U5338684603617333081',
  t_id: '2459326385388619210',
  t_senderPublicKey:
    '9184c87b846dec0dc4010def579fecf5dad592a59b37a013c7e6975597681f58',
  m_recipientPublicKey:
    'b80bb6459608dcdeb9a98d1f2b0111b2bf11e53ef2933e6769bb0198e3a97aae',
  t_senderId: 'U5338684603617333081',
  t_recipientId: 'U15365455923155964650',
  t_timestamp: 226474809,
  timestamp: 226474809,
  block_timestamp: 226474815,
  t_amount: '0',
  t_fee: '100000',
  c_message: '1451787721dd28b69ec768825b2f9e5473b580347f42',
  c_own_message: '543ee6e48b4348439b2d839d5cab876938c7e 42b6f8d9587',
  c_type: 1,
  t_type: 8,
  b_height: 541701,
  confirmations: 18,
  b_id: '17768103885289794518',
};

const validTransactionData = {
  message_type: 1,
  recipientId: 'U2707535059340134112',
  message:
    '9ae819297240f00bdc3627133c2e41efd27b022fcd0d011dfdda0941ba08399697f3e3bb5c46a43aff714ae1bac616b84617ce446d808523a14f278e5d88909837848e7aa69d9d4f9a95baae56df6ad4c274248d3d01a2cfccae51367dfab265a055d5ce991af654ee418839f94885876638863d172226b0369cd488c5727e6b1a42ba46fed014c1bf586dd2cab3afe7f10cb54864c099a680d5963778c9c4052df305497edc43082a7d60193650c331c6db9c9d9c0c8bbc004e53ac56586331453164b984c57a495810d709c9b984e4f367888d8a8ce1b26f528c1abdec08747e',
  own_message: '6802a9e744aa3ba570d7e48fce5fe0f49184d0ce38ea40f7',
};

const validTransaction = {
  id: '9175562912139726777',
  height: 10288885,
  blockId: '10475460465898092643',
  type: 8,
  block_timestamp: 58773245,
  timestamp: 58773228,
  senderPublicKey:
    '2ac5eef60303003c90f662d89e60570d8661c8ba569e667296f5c7c97a0413ee',
  senderId: 'U8916295525136600565',
  recipientPublicKey:
    '5a3c1da429ae925422892e69dc4f0ab6d7ac00cef229d2d992242dcfeca27b91',
  recipientId: 'U2707535059340134112',
  fee: 100000,
  signature:
    '287dc2554025d8074d674d50ec785d530588e2b828f2d3f29687a4f05c8afc623e185896abc739ea2af8db199ec6e31c57426937343ff5ec154341cee8f72f0a',
  signatures: [],
  confirmations: 32801518,
  asset: {},
};

const validUnconfirmedTransaction = {
  type: 8,
  amount: 0,
  senderId: 'U7771441689362721578',
  senderPublicKey:
    'e16e624fd0a5123294b448c21f30a07a0435533c693b146b14e66830e4e20404',
  asset: {
    chat: {
      message: '75582d940f2c4093929c99a6c1911b4753',
      own_message: '58dceaa227b3fb1dd1c7d3fbf3eb5db6aeb6a03cb7e2ec91',
      type: 1,
    },
  },
  recipientId: 'U810656636599221322',
  timestamp: 63137661,
  signature:
    'e25f1aba994c7f07c03099edcbe0ada19df371ddf1a829dae8dee36ab809ce8a438111bf65056c813e9dc832a890a081ba1cd295d37e509f62f042149e62e30d',
  id: '8958126469643732641',
  fee: 100000,
  relays: 1,
  receivedAt: '2019-09-03T11:14:22.638Z',
};

module.exports = {
  rawValidTransaction,
  validTransactionData,
  validTransaction,
  validUnconfirmedTransaction,
};
