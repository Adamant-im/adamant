# Generating Account

All transactions in ADAMANT blockchain are [signed](/essentials/signing-transactions.md) by their senders, [ADAMANT accounts](/api-endpoints/accounts.md), using public and private keys — a key pair, and can be validated knowing public key only.

## What is a Key Pair?

A key pair consists of two parts:

- **Private key** — a string of numbers and letters only known to the owner of the key
- **Public key** — derived from the private key and can be used to validate that the private key belongs to the owner without providing access to their private key

Elliptic curve cryptography is used to generate cryptographically secure key pairs.

The process used to generate the key pair operates in the following manner:

<img src="/images/keypair.png"/>

When a user creates an account, a [BIP39 mnemonics](https://github.com/bitcoin/bips/blob/master/bip-0039.mediawiki) (the passphrase) is generated for the user. This passphrase is hashed using the SHA-256 hash function into a 256-bit string. This hash is subsequently used as a seed in [Ed25519](https://ed25519.cr.yp.to/) to generate the private key _k<sub>s</sub>_ and derive its public key _k<sub>p</sub>_.

With this private key, the user is able to sign transactions into a transaction object and broadcast that object to the network. The public key is included as part of the transaction and the nodes that receive the transaction are able to verify the validity of the signature using _k<sub>p</sub>_. This provides effective security for both the user and the network since _k<sub>s</sub>_ is known only to the user and _k<sub>p</sub>_ can validate that the signature is valid.

## Account Generation Algorithm

ADAMANT accounts **MUST BE** generated locally within the application. The public key can then optionally be [broadcasted to ADAMANT network](/api-endpoints/accounts.md#create-new-account). Account generation scheme:

<img src="/images/account_flow.png"/>

- **Step 1**

  Generate a random seed and a mnemonic phrase compatible with [BIP-39](https://github.com/bitcoin/bips/blob/master/bip-0039.mediawiki) based on this seed.

  Example:

  ```js
  import Mnemonic from 'bitcore-mnemonic';

  const generatePassPhrase = () =>
    new Mnemonic(Mnemonic.Words.ENGLISH).toString();
  ```

- **Step 2**

  Generate a key pair using SHA-256 hash of the pass phrase.

  Example:

  ```js
  import * as bip39 from 'bip39';
  import crypto from 'crypto';

  const createPassPhraseHash = (passPhrase) => {
    const seedHex = bip39.mnemonicToSeedSync(passPhrase).toString('hex');
    return crypto.createHash('sha256').update(seedHex, 'hex').digest();
  };
  ```

  ```js
  import sodium from 'sodium-browserify-tweetnacl';

  const makeKeypair = (hash) => {
    var keypair = sodium.crypto_sign_seed_keypair(hash);
    return {
      publicKey: keypair.publicKey,
      privateKey: keypair.secretKey,
    };
  };
  ```

- **Step 3**

  Generate user's ADAMANT address from the public key's SHA-256 hash.

  An ADAMANT address or the wallet ID is derived from the public key. The public key is hashed using SHA-256, at which point the first 8 bytes of the hash are reversed. The account ID is the numerical representation of those 8 bytes, with the leading ’U’ character. ADAMANT address is a part of [ADAMANT account](/api-endpoints/accounts.md).

  Example:

  ```js
  import crypto from 'crypto';

  const getAddressFromPublicKey = (publicKey) => {
    const publicKeyHash = crypto
      .createHash('sha256')
      .update(publicKey, 'hex')
      .digest();
    const temp = Buffer.alloc(8);
    for (var i = 0; i < 8; i++) {
      temp[i] = publicKeyHash[7 - i];
    }
    return 'U' + bignum.fromBuffer(temp).toString();
  };
  ```
