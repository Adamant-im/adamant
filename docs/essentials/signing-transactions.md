# Signing Transactions

All transactions in ADAMANT blockchain are being signed with robust cryptosigning algorithm [Ed25519 EdDSA](https://tools.ietf.org/html/rfc8032).

## Transaction

Transaction is represented by JSON object with fields indicating its parameters like sender, recipient and amount to transfer.

Every transaction, regardless of the [type](/api-types/transaction-types.md), must be signed by the sender prior to being accepted by the network. The process of signing the transaction is identical for every transaction. First, a data block representing the transaction must be generated. Each data block contains a specific set of standardized information. Additional information contained in the data block will differ depending on the type of the transaction.

The following fields must be present in all types of transactions:

- An 8-bit integer identifying the type of the transaction
- A 32-bit epoch timestamp of when the transaction has been created
- The 256-bit public key of the issuer of the transaction
- A 64-bit integer representing the amount of tokens to be transferred

The other fields will be added to this schema depending on the [transaction type](/api-types/transaction-types.md). Once the data block has been generated, it is hashed using the SHA-256 algorithm, and this hash is signed using the [key pair](/essentials/generating-account.md) of the issuer. The transaction ID is generated from the data block. In order to compute the transaction ID the system takes the data block with the completed signature information and hashes this block using SHA-256 and the first 8 bytes of the hash are reversed and which is then used as the transaction ID.

A signed transaction uses the following flow:

<img src="/images/sign.png"/>

Finally, a transaction signature must be included to transaction object before it's broadcasted to the network.

## Signing transaction algorithm

A transaction **must be** signed locally in application and then broadcasted to the network.

Implementation example of transaction signing can be found in [adamant-api-jsclient](https://github.com/Adamant-im/adamant-api-jsclient/blob/master/src/helpers/transactions/hash.ts). Below are some parts of the code and explanation.

- **Step 1**

  Generate transaction's data block:

  ```ts
  function getBytes(
    transaction: PossiblySignedTransaction,
    skipSignature = true
  ) {
    const result = getAssetBytes(transaction);

    if (!result) {
      throw new Error('Transaction type is not supported');
    }

    const { assetSize, assetBytes } = result;

    const bb = new ByteBuffer(1 + 4 + 32 + 8 + 8 + 64 + 64 + assetSize, true);

    bb.writeByte(transaction.type);
    bb.writeInt(transaction.timestamp);

    const senderPublicKeyBuffer = Buffer.from(
      transaction.senderPublicKey,
      'hex'
    );

    for (const buf of senderPublicKeyBuffer) {
      bb.writeByte(buf);
    }

    if ('recipientId' in transaction && transaction.recipientId) {
      const bignum = new BigNumber(transaction.recipientId.slice(1));
      const recipient = toBuffer(bignum, { size: 8 });

      for (let i = 0; i < 8; i++) {
        bb.writeByte(recipient[i] || 0);
      }
    } else {
      for (let i = 0; i < 8; i++) {
        bb.writeByte(0);
      }
    }

    bb.writeLong(transaction.amount);

    if (assetBytes && assetSize > 0) {
      for (const assetByte of assetBytes) {
        bb.writeByte(assetByte);
      }
    }

    if (!skipSignature && transaction.signature) {
      const signatureBuffer = Buffer.from(transaction.signature, 'hex');
      for (let i = 0; i < signatureBuffer.length; i++) {
        bb.writeByte(signatureBuffer[i]);
      }
    }

    bb.flip();

    const arrayBuffer = new Uint8Array(bb.toArrayBuffer());
    const buffer: number[] = [];

    for (let i = 0; i < arrayBuffer.length; i++) {
      buffer[i] = arrayBuffer[i];
    }

    return Buffer.from(buffer);
  }
  ```

- **Step 2**

  Calculate transaction's SHA-256 hash:

  ```js
  function getHash(
    trs: PossiblySignedTransaction,
    options = { skipSignature: true }
  ) {
    const hash = crypto
      .createHash('sha256')
      .update(getBytes(trs, options.skipSignature))
      .digest();

    return hash;
  }
  ```

  You can also reuse the `getHash` function to generate a transaction ID locally if needed before broadcasting the transaction:

  ```ts
  const getTransactionId = (transaction: SignedTransaction) => {
    if (!transaction.signature) {
      throw new Error('Transaction Signature is required');
    }

    const hash = getHash(transaction, { skipSignature: false });

    const temp = Buffer.alloc(8);
    for (let i = 0; i < 8; i++) {
      temp[i] = hash[7 - i];
    }

    return fromBuffer(temp).toString();
  };
  ```

- **Step 3**

  Calculate transaction's signature:

  ```ts
  function signTransaction(trs: SomeTransaction, keypair: KeyPair) {
    const hash = getHash(trs);

    return sign(hash, keypair).toString('hex');
  }

  function sign(hash: Buffer, keypair: KeyPair) {
    const sign = sodium.crypto_sign_detached(
      hash,
      Buffer.from(keypair.privateKey)
    );

    return sign;
  }
  ```

## Broadcasting transactions

When transaction is formed and signed, it can be broadcasted to the network using [POST endpoint](/api-endpoints/transactions.md#register-transaction).
