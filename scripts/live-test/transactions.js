'use strict';

const crypto = require('crypto');
const ByteBuffer = require('bytebuffer');
const Mnemonic = require('bitcore-mnemonic');

const accounts = require('../../helpers/accounts.js');
const bignum = require('../../helpers/bignum.js');
const constants = require('../../helpers/constants.js');
const ed = require('../../helpers/ed.js');
const transactionTypes = require('../../helpers/transactionTypes.js');

const FEES = constants.fees;
const TRANSACTION_TYPE_LABELS = Object.keys(transactionTypes).reduce(function (labels, key) {
  if (typeof transactionTypes[key] === 'number') {
    labels[transactionTypes[key]] = key;
  }

  return labels;
}, {});
const CHAT_MESSAGE_TYPE_LABELS = Object.keys(transactionTypes.CHAT_MESSAGE_TYPES).reduce(function (labels, key) {
  labels[transactionTypes.CHAT_MESSAGE_TYPES[key]] = key;
  return labels;
}, {});

/**
 * Creates a random test account without exposing the passphrase to reports.
 */
function createAccount () {
  const secret = new Mnemonic(Mnemonic.Words.ENGLISH).toString();
  const keypair = keypairFromSecret(secret);
  const publicKey = keypair.publicKey.toString('hex');

  return {
    address: accounts.getAddressByPublicKey(publicKey),
    publicKey,
    secret,
    keypair
  };
}

/**
 * Creates a valid random ADAMANT address without generating a signing keypair.
 */
function createRandomAddress () {
  return accounts.getAddressByPublicKey(crypto.randomBytes(32).toString('hex'));
}

/**
 * Creates a keypair from a passphrase.
 * @param {string} secret - Passphrase.
 */
function keypairFromSecret (secret) {
  return accounts.makeKeypair(accounts.createPassPhraseHash(secret));
}

/**
 * Returns public fixture metadata only.
 * @param {object} fixture - Fixture account with secret/public fields.
 */
function publicFixtureAccount (fixture) {
  return {
    address: fixture.address,
    publicKey: fixture.publicKey,
    code: fixture.code,
    amount: fixture.amount
  };
}

/**
 * Creates the transaction fields common to all live-test transaction types.
 * @param {number} type - Transaction type.
 * @param {object} account - Sender account.
 */
function createBasicTransaction (type, account) {
  const timestampMs = Date.now() - constants.epochTime.getTime();

  return {
    type,
    amount: 0,
    timestamp: Math.floor(timestampMs / 1000),
    timestampMs,
    asset: {},
    senderPublicKey: account.publicKey,
    senderId: account.address
  };
}

/**
 * Creates a signed ADM send transaction.
 * @param {object} account - Sender account.
 * @param {string} recipientId - Recipient address.
 * @param {number} amount - Amount in internal ADM units.
 */
function createSendTransaction (account, recipientId, amount) {
  const transaction = createBasicTransaction(transactionTypes.SEND, account);

  transaction.recipientId = recipientId;
  transaction.amount = amount;
  transaction.fee = FEES.send;
  signAndId(transaction, account);

  return transaction;
}

/**
 * Creates a signed delegate registration transaction.
 * @param {object} account - Sender account.
 * @param {string} username - Delegate username.
 */
function createDelegateTransaction (account, username) {
  const transaction = createBasicTransaction(transactionTypes.DELEGATE, account);

  transaction.recipientId = null;
  transaction.fee = FEES.delegate;
  transaction.asset = {
    delegate: {
      username,
      publicKey: account.publicKey
    }
  };
  signAndId(transaction, account);

  return transaction;
}

/**
 * Creates a signed vote or unvote transaction.
 * @param {object} account - Sender account.
 * @param {Array<string>} votes - Vote operations, prefixed with `+` or `-`.
 */
function createVoteTransaction (account, votes) {
  const transaction = createBasicTransaction(transactionTypes.VOTE, account);

  transaction.recipientId = account.address;
  transaction.fee = FEES.vote;
  transaction.asset = {
    votes
  };
  signAndId(transaction, account);

  return transaction;
}

/**
 * Creates a signed chat message transaction.
 * @param {object} account - Sender account.
 * @param {string} recipientId - Recipient address.
 * @param {number} [messageType] - Chat message asset subtype.
 * @param {object} [payload] - Optional hex-encoded message fields.
 * @param {string} [payload.message] - Recipient message encoded as hex.
 * @param {string} [payload.ownMessage] - Sender message copy encoded as hex.
 */
function createChatTransaction (account, recipientId, messageType, payload) {
  const transaction = createBasicTransaction(transactionTypes.CHAT_MESSAGE, account);
  const chatPayload = payload || {};
  const message = chatPayload.message || crypto.randomBytes(16).toString('hex');

  transaction.recipientId = recipientId;
  transaction.fee = calculateChatFee(message, messageType);
  transaction.asset = {
    chat: {
      message,
      own_message: chatPayload.ownMessage === undefined ?
        crypto.randomBytes(16).toString('hex') :
        chatPayload.ownMessage,
      type: messageType === undefined ? transactionTypes.CHAT_MESSAGE_TYPES.ORDINARY_MESSAGE : messageType
    }
  };
  signAndId(transaction, account);

  return transaction;
}

/**
 * Calculates the protocol chat fee from the decoded message byte length.
 * @param {string} message - Hex-encoded recipient message.
 * @param {number} [messageType] - Chat message asset subtype.
 */
function calculateChatFee (message, messageType) {
  const messageBytes = Buffer.from(message, 'hex').length;
  const feeMultiplier = Math.max(Math.floor((messageBytes * 100 / 150) / 255), 1);
  const fee = messageType === transactionTypes.CHAT_MESSAGE_TYPES.LEGACY_MESSAGE ?
    FEES.old_chat_message :
    FEES.chat_message;

  return feeMultiplier * fee;
}

/**
 * Creates a signed second-signature registration transaction.
 * @param {object} account - Sender account.
 * @param {object} secondAccount - Account whose public key becomes the second public key.
 */
function createSignatureTransaction (account, secondAccount) {
  const transaction = createBasicTransaction(transactionTypes.SIGNATURE, account);

  transaction.recipientId = null;
  transaction.fee = FEES.secondsignature;
  transaction.asset = {
    signature: {
      publicKey: secondAccount.publicKey
    }
  };
  signAndId(transaction, account);

  return transaction;
}

/**
 * Creates a signed multisignature registration transaction.
 * @param {object} account - Sender account.
 * @param {Array<object>} members - Member accounts that must multisign the registration.
 */
function createMultisignatureTransaction (account, members) {
  const transaction = createBasicTransaction(transactionTypes.MULTI, account);

  transaction.recipientId = null;
  transaction.asset = {
    multisignature: {
      min: members.length,
      keysgroup: members.map(function (member) {
        return '+' + member.publicKey;
      }),
      lifetime: 1
    }
  };
  transaction.fee = (members.length + 1) * FEES.multisignature;
  transaction.signature = sign(transaction, account.keypair);
  transaction.signatures = members.map(function (member) {
    return multisign(transaction, member.keypair);
  });
  transaction.id = getId(transaction);

  return transaction;
}

/**
 * Creates a signed DApp registration transaction.
 * @param {object} account - Sender account.
 * @param {object} data - DApp asset data.
 */
function createDappTransaction (account, data) {
  const transaction = createBasicTransaction(transactionTypes.DAPP, account);

  transaction.recipientId = null;
  transaction.fee = FEES.dapp;
  transaction.asset = {
    dapp: {
      category: data.category,
      name: data.name,
      description: data.description,
      tags: data.tags,
      type: data.type,
      link: data.link,
      icon: data.icon
    }
  };
  signAndId(transaction, account);

  return transaction;
}

/**
 * Creates a signed DApp in-transfer transaction.
 * @param {object} account - Sender account.
 * @param {string} dappId - DApp transaction id.
 * @param {number} amount - Amount in internal ADM units.
 */
function createInTransferTransaction (account, dappId, amount) {
  const transaction = createBasicTransaction(transactionTypes.IN_TRANSFER, account);

  transaction.recipientId = null;
  transaction.amount = amount;
  transaction.fee = FEES.send;
  transaction.asset = {
    inTransfer: {
      dappId
    }
  };
  signAndId(transaction, account);

  return transaction;
}

/**
 * Creates a signed DApp out-transfer transaction.
 * @param {object} account - Sender account.
 * @param {string} recipientId - Recipient address.
 * @param {string} dappId - DApp transaction id.
 * @param {string} transactionId - DApp-side withdrawal transaction id.
 * @param {number} amount - Amount in internal ADM units.
 */
function createOutTransferTransaction (account, recipientId, dappId, transactionId, amount) {
  const transaction = createBasicTransaction(transactionTypes.OUT_TRANSFER, account);

  transaction.recipientId = recipientId;
  transaction.amount = amount;
  transaction.fee = FEES.send;
  transaction.asset = {
    outTransfer: {
      dappId,
      transactionId
    }
  };
  signAndId(transaction, account);

  return transaction;
}

/**
 * Creates a signed state transaction.
 * @param {object} account - Sender account.
 * @param {string} key - State key.
 * @param {string} value - State value.
 * @param {number} [stateType] - State asset subtype.
 */
function createStateTransaction (account, key, value, stateType) {
  const transaction = createBasicTransaction(transactionTypes.STATE, account);

  transaction.recipientId = null;
  transaction.fee = FEES.state_store;
  transaction.asset = {
    state: {
      key,
      value,
      type: stateType === undefined ? 0 : stateType
    }
  };
  signAndId(transaction, account);

  return transaction;
}

/**
 * Re-signs a transaction after a test mutates fields that participate in bytes.
 * @param {object} transaction - Transaction to mutate.
 * @param {object} account - Sender account.
 */
function resignTransaction (transaction, account) {
  delete transaction.signature;
  delete transaction.id;
  signAndId(transaction, account);
  return transaction;
}

/**
 * Signs a transaction and assigns its id.
 * @param {object} transaction - Transaction to mutate.
 * @param {object} account - Sender account.
 */
function signAndId (transaction, account) {
  transaction.signature = sign(transaction, account.keypair);
  transaction.id = getId(transaction);
}

/**
 * Signs a transaction with the sender keypair.
 * @param {object} transaction - Transaction to sign.
 * @param {object} keypair - Sender keypair.
 */
function sign (transaction, keypair) {
  const hash = crypto.createHash('sha256').update(getBytes(transaction, true, true)).digest();

  return ed.sign(hash, keypair).toString('hex');
}

/**
 * Creates a multisignature member signature.
 * @param {object} transaction - Transaction to sign.
 * @param {object} keypair - Member keypair.
 */
function multisign (transaction, keypair) {
  const hash = crypto.createHash('sha256').update(getBytes(transaction, true, true)).digest();

  return ed.sign(hash, keypair).toString('hex');
}

/**
 * Calculates an ADAMANT transaction id from serialized bytes.
 * @param {object} transaction - Transaction object.
 */
function getId (transaction) {
  const hash = crypto.createHash('sha256').update(getBytes(transaction)).digest();
  const temp = Buffer.alloc(8);

  for (let i = 0; i < 8; i++) {
    temp[i] = hash[7 - i];
  }

  return bignum.fromBuffer(temp).toString();
}

/**
 * Serializes a live-test transaction using the node's current test helper layout.
 * @param {object} transaction - Transaction object.
 * @param {boolean} [skipSignature] - Whether to omit the primary signature.
 * @param {boolean} [skipSecondSignature] - Whether to omit the second signature.
 */
function getBytes (transaction, skipSignature, skipSecondSignature) {
  let assetBytes = Buffer.alloc(0);

  // This mirrors test/node.js builders; it is intentionally local to the runner.
  if (transaction.type === transactionTypes.SIGNATURE) {
    assetBytes = Buffer.from(transaction.asset.signature.publicKey, 'hex');
  } else if (transaction.type === transactionTypes.DELEGATE) {
    assetBytes = Buffer.from(transaction.asset.delegate.username, 'utf8');
  } else if (transaction.type === transactionTypes.VOTE) {
    assetBytes = Buffer.from(transaction.asset.votes.join(''), 'utf8');
  } else if (transaction.type === transactionTypes.MULTI) {
    const keysgroupBuffer = Buffer.from(transaction.asset.multisignature.keysgroup.join(''), 'utf8');
    const bb = new ByteBuffer(2 + keysgroupBuffer.length, true);

    bb.writeByte(transaction.asset.multisignature.min);
    bb.writeByte(transaction.asset.multisignature.lifetime);
    keysgroupBuffer.forEach(function (byte) {
      bb.writeByte(byte);
    });
    bb.flip();
    assetBytes = Buffer.from(bb.toBuffer());
  } else if (transaction.type === transactionTypes.DAPP) {
    const bb = new ByteBuffer(8, true);
    let buffer = Buffer.from([]);

    buffer = Buffer.concat([buffer, Buffer.from(transaction.asset.dapp.name, 'utf8')]);
    if (transaction.asset.dapp.description) {
      buffer = Buffer.concat([buffer, Buffer.from(transaction.asset.dapp.description, 'utf8')]);
    }
    if (transaction.asset.dapp.tags) {
      buffer = Buffer.concat([buffer, Buffer.from(transaction.asset.dapp.tags, 'utf8')]);
    }
    if (transaction.asset.dapp.link) {
      buffer = Buffer.concat([buffer, Buffer.from(transaction.asset.dapp.link, 'utf8')]);
    }
    if (transaction.asset.dapp.icon) {
      buffer = Buffer.concat([buffer, Buffer.from(transaction.asset.dapp.icon, 'utf8')]);
    }

    bb.writeInt(transaction.asset.dapp.type);
    bb.writeInt(transaction.asset.dapp.category);
    bb.flip();
    assetBytes = Buffer.concat([buffer, Buffer.from(bb.toBuffer())]);
  } else if (transaction.type === transactionTypes.IN_TRANSFER) {
    assetBytes = Buffer.from(transaction.asset.inTransfer.dappId, 'utf8');
  } else if (transaction.type === transactionTypes.OUT_TRANSFER) {
    assetBytes = Buffer.concat([
      Buffer.from(transaction.asset.outTransfer.dappId, 'utf8'),
      Buffer.from(transaction.asset.outTransfer.transactionId, 'utf8')
    ]);
  } else if (transaction.type === transactionTypes.CHAT_MESSAGE) {
    const bb = new ByteBuffer(8, true);

    bb.writeInt(transaction.asset.chat.type);
    bb.flip();
    assetBytes = Buffer.concat([
      Buffer.from(transaction.asset.chat.message, 'hex'),
      Buffer.from(transaction.asset.chat.own_message || '', 'hex'),
      Buffer.from(bb.toBuffer())
    ]);
  } else if (transaction.type === transactionTypes.STATE) {
    const bb = new ByteBuffer(8, true);

    bb.writeInt(transaction.asset.state.type);
    bb.flip();
    assetBytes = Buffer.concat([
      Buffer.from(transaction.asset.state.value),
      Buffer.from(transaction.asset.state.key),
      Buffer.from(bb.toBuffer())
    ]);
  }

  const bb = new ByteBuffer(1 + 4 + 32 + 8 + 8 + assetBytes.length + 64, true);

  bb.writeByte(transaction.type);
  bb.writeInt(transaction.timestamp);
  Buffer.from(transaction.senderPublicKey, 'hex').forEach(function (byte) {
    bb.writeByte(byte);
  });

  writeRecipient(bb, transaction.recipientId);
  bb.writeLong(transaction.amount);
  assetBytes.forEach(function (byte) {
    bb.writeByte(byte);
  });

  if (!skipSignature && transaction.signature) {
    Buffer.from(transaction.signature, 'hex').forEach(function (byte) {
      bb.writeByte(byte);
    });
  }

  if (!skipSecondSignature && transaction.signSignature) {
    Buffer.from(transaction.signSignature, 'hex').forEach(function (byte) {
      bb.writeByte(byte);
    });
  }

  bb.flip();
  return Buffer.from(new Uint8Array(bb.toArrayBuffer()));
}

/**
 * Returns the stable name for a transaction type.
 * @param {number} type - Transaction type.
 */
function getTransactionTypeName (type) {
  return TRANSACTION_TYPE_LABELS[type] || 'UNKNOWN';
}

/**
 * Returns the stable name for a chat message subtype.
 * @param {number} type - Chat message asset subtype.
 */
function getChatMessageTypeName (type) {
  return CHAT_MESSAGE_TYPE_LABELS[type] || 'UNKNOWN';
}

/**
 * Writes the recipient id bytes expected by transaction serialization.
 * @param {ByteBuffer} bb - ByteBuffer instance.
 * @param {?string} recipientId - Recipient address, or null for recipientless transactions.
 */
function writeRecipient (bb, recipientId) {
  if (!recipientId) {
    for (let i = 0; i < 8; i++) {
      bb.writeByte(0);
    }
    return;
  }

  const recipient = new bignum(recipientId.slice(1)).toBuffer({ size: 8 });

  for (let i = 0; i < 8; i++) {
    bb.writeByte(recipient[i] || 0);
  }
}

module.exports = {
  createAccount,
  createChatTransaction,
  createDelegateTransaction,
  createDappTransaction,
  createInTransferTransaction,
  createMultisignatureTransaction,
  createOutTransferTransaction,
  createRandomAddress,
  createSendTransaction,
  createSignatureTransaction,
  createStateTransaction,
  createVoteTransaction,
  getChatMessageTypeName,
  getTransactionTypeName,
  keypairFromSecret,
  publicFixtureAccount,
  resignTransaction
};
