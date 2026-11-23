# Encrypting & Decrypting Messages

Transaction assets for [Messages](/api-types/message-types.md) and [KVS](./storing-data-in-kvs.md) records are encrypted before being packed into transactions.

- **Messages** (type 8) use NaCl box (public-key encryption), which relies on Curve25519 for key exchange and Salsa20 for encryption.
- **KVS records** (type 9) use NaCl secretbox (symmetric encryption), which relies on Salsa20 for encryption.

Both use **Poly1305** for authentication.

After encryption, they are included in transactions, which are then [signed](./signing-transactions.md) and broadcasted to the ADAMANT network.

## Encrypting messages

An encrypted message uses the following flow:

<img src="/images/message_flow.png"/>

1. Generate a **random nonce** (24 bytes)
2. Convert the sender’s **Ed25519 private key** to a **Curve25519 secret key**
3. Retrieve the recipient’s public key from the ADAMANT network

   - Use [`GET /api/accounts`](/api-endpoints/accounts#get-account-by-address) endpoint

     ::: info
     If the public key can’t be retrieved, it likely means the recipient’s account hasn’t been initialized yet.

     Learn about [Account Initialization](https://news.adamant.im/chats-and-uninitialized-accounts-in-adamant-5035438e2fcd).
     :::

4. Convert the recipient’s **Ed25519 public key** to a **Curve25519 public key**
5. Encrypt the message using [NaCl box](https://nacl.cr.yp.to/box.html) algorithm, with:
   - The plaintext message
   - The nonce
   - The recipient’s **Curve25519 public key**
   - The sender’s **Curve25519 secret key**
6. Return the **encrypted message** and **nonce**
   - The nonce must be stored alongside the encrypted message for decryption

::: details Example using TypeScript

```ts
import nacl from 'tweetnacl/nacl-fast';
import ed2curve from 'ed2curve';
import sodium from 'sodium-browserify-tweetnacl';

const bytesToHex = (bytes: Uint8Array) => {
  let hex = '';

  for (const byte of bytes) {
    hex += (byte >>> 4).toString(16);
    hex += (byte & 0xf).toString(16);
  }

  return hex;
};

const encodeMessage = (
  msg: string,
  keypair: KeyPair,
  recipientPublicKey: Uint8Array | string
) => {
  const nonce = Buffer.allocUnsafe(24);
  sodium.randombytes(nonce);

  const plainText = Buffer.from(msg.toString());
  const DHSecretKey = ed2curve.convertSecretKey(keypair.privateKey);

  let publicKey = recipientPublicKey;

  if (typeof publicKey === 'string') {
    publicKey = hexToBytes(publicKey);
  }

  const DHPublicKey = ed2curve.convertPublicKey(publicKey);

  if (!DHPublicKey) {
    throw new Error('encodeMessage: invalid key');
  }

  const encrypted = nacl.box(plainText, nonce, DHPublicKey, DHSecretKey);

  return {
    message: bytesToHex(encrypted),
    own_message: bytesToHex(nonce),
  };
};
```

:::

## Decrypting messages

To decrypt a message follow the algorithm:

1. Convert **your Ed25519 private key** to a **Curve25519 secret key**.
2. Convert **other party's Ed25519 public key** to a **Curve25519 public key**.
3. Decrypt the message using the [NaCl box](https://nacl.cr.yp.to/box.html) algorithm with:
   - The encrypted message
   - The nonce
   - The other party's **Curve25519 public key**
   - Your Curve25519 secret key

::: details Example using TypeScript

```ts
import nacl from 'tweetnacl';
import ed2curve from 'ed2curve';
import { decode } from '@stablelib/utf8';

const hexToBytes = (hex: string) => {
  const bytes: number[] = [];

  for (let c = 0; c < hex.length; c += 2) {
    bytes.push(parseInt(hex.slice(c, c + 2), 16));
  }

  return Uint8Array.from(bytes);
};

const decodeMessage = (
  message: string,
  senderPublicKey: string,
  keypair: KeyPair,
  nonce: string
) => {
  const publicKey = hexToBytes(senderPublicKey);
  const DHPublicKey = ed2curve.convertPublicKey(publicKey);

  if (!DHPublicKey) {
    throw new Error('decodeMessage: invalid key');
  }

  const DHSecretKey = ed2curve.convertSecretKey(keypair.privateKey);

  const decryptedMessage = nacl.box.open(
    hexToBytes(message),
    hexToBytes(nonce),
    DHPublicKey,
    DHSecretKey
  );

  return decryptedMessage ? decode(decryptedMessage) : '';
};
```

:::

## Encrypting KVS records

If `value` needs to be encrypted, the following steps are applied:

1. Wrap the content to be encrypted into a JSON object: `{ "payload": <your value> }`
2. Convert the JSON to a string and **prefix/suffix** it with a random string
   - The random string should be alphanumeric (ASCII), **excluding `{` and `}`**
3. Compute the **secret key** as the SHA-256 hash of your ADAMANT **private key**.
4. Encrypt the resulting string using [NaCl.secretbox](https://nacl.cr.yp.to/secretbox.html) with:
   - The plaintext message
   - A randomly generated **nonce** (24 bytes)
   - The **secret key**
5. Store the **encrypted message** and **nonce** in JSON format:
   `{ "message": <encrypted message>, "nonce": <nonce> }`, which is then saved into the KVS.

::: details Example using JavaScript

```js
/**
 * Encodes a secret value (available for the owner only)
 * @param {string} value value to encode
 * @param {Uint8Array} privateKey private key
 * @returns {{message: string, nonce: string}} encoded value and nonce (both as HEX-strings)
 */
const encodeValue = function (value, privateKey) {
  const randomString = () =>
    Math.random()
      .toString(36)
      .replace(/[^a-z]+/g, '')
      .substr(0, Math.ceil(Math.random() * 10));

  const nonce = Buffer.allocUnsafe(24);
  sodium.randombytes(nonce);

  const padded =
    randomString() + JSON['stringify']({ payload: value }) + randomString();

  const plainText = Buffer.from(padded);
  const secretKey = ed2curve.convertSecretKey(
    sodium.crypto_hash_sha256(privateKey)
  );

  const encrypted = nacl.secretbox(plainText, nonce, secretKey);

  return {
    message: bytesToHex(encrypted),
    nonce: bytesToHex(nonce),
  };
};
```

:::

## Decrypting KVS records

To decrypt a `value` stored in the KVS:

1. Retrieve the **encrypted message** and **nonce** from the transaction data
2. Compute the **secret key** as the SHA-256 hash of your ADAMANT **private key**
3. Decrypt the message using [NaCl.secretbox](https://nacl.cr.yp.to/secretbox.html) with:
   - The encrypted message
   - The nonce
   - The **secret key**

:::details Example using JavaScript

```js
/**
 * Decodes a secret value
 * @param {string|Uint8Array} source source to decrypt
 * @param {Uint8Array} privateKey private key
 * @param {string|Uint8Array} nonce nonce
 * @returns {string} decoded value
 */
adamant.decodeValue = function (source, privateKey, nonce) {
  if (typeof source === 'string') {
    source = hexToBytes(source);
  }

  if (typeof nonce === 'string') {
    nonce = hexToBytes(nonce);
  }

  const secretKey = ed2curve.convertSecretKey(
    sodium.crypto_hash_sha256(privateKey)
  );
  const decrypted = nacl.secretbox.open(source, nonce, secretKey);

  const strValue = decrypted ? decode(decrypted) : '';
  if (!strValue) return null;

  const from = strValue.indexOf('{');
  const to = strValue.lastIndexOf('}');

  if (from < 0 || to < 0) {
    throw new Error('Could not determine JSON boundaries in the encoded value');
  }

  const json = JSON.parse(strValue.substr(from, to - from + 1));
  return json.payload;
};
```

:::
