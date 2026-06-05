'use strict';

const crypto = require('crypto');
const ByteBuffer = require('bytebuffer');
const Mnemonic = require('bitcore-mnemonic');
const sodium = require('sodium-browserify-tweetnacl');

const accounts = require('../../helpers/accounts.js');
const bignum = require('../../helpers/bignum.js');
const constants = require('../../helpers/constants.js');
const transactionTypes = require('../../helpers/transactionTypes.js');

const FEES = constants.fees;

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
  return {
    type,
    amount: 0,
    timestamp: Math.floor((Date.now() - constants.epochTime.getTime()) / 1000),
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
 */
function createChatTransaction (account, recipientId) {
  const transaction = createBasicTransaction(transactionTypes.CHAT_MESSAGE, account);

  transaction.recipientId = recipientId;
  transaction.fee = FEES.chat_message;
  transaction.asset = {
    chat: {
      message: crypto.randomBytes(16).toString('hex'),
      own_message: crypto.randomBytes(16).toString('hex'),
      type: transactionTypes.CHAT_MESSAGE_TYPES.ORDINARY_MESSAGE
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
 */
function createStateTransaction (account, key, value) {
  const transaction = createBasicTransaction(transactionTypes.STATE, account);

  transaction.recipientId = null;
  transaction.fee = FEES.state_store;
  transaction.asset = {
    state: {
      key,
      value,
      type: 0
    }
  };
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
  const hash = crypto.createHash('sha256').update(getBytes(transaction)).digest();

  return sodium.crypto_sign_detached(hash, Buffer.from(keypair.privateKey, 'hex')).toString('hex');
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
 */
function getBytes (transaction) {
  let assetBytes = Buffer.alloc(0);

  // This mirrors test/node.js builders; it is intentionally local to the runner.
  if (transaction.type === transactionTypes.DELEGATE) {
    assetBytes = Buffer.from(transaction.asset.delegate.username, 'utf8');
  } else if (transaction.type === transactionTypes.VOTE) {
    assetBytes = Buffer.from(transaction.asset.votes.join(''), 'utf8');
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

  if (transaction.signature) {
    Buffer.from(transaction.signature, 'hex').forEach(function (byte) {
      bb.writeByte(byte);
    });
  }

  bb.flip();
  return Buffer.from(new Uint8Array(bb.toArrayBuffer()));
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
  createSendTransaction,
  createStateTransaction,
  createVoteTransaction,
  keypairFromSecret,
  publicFixtureAccount
};
