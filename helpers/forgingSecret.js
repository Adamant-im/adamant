'use strict';

var crypto = require('crypto');

var accounts = require('./accounts.js');
var ed = require('./ed.js');

/**
 * Self-describing prefix for an encrypted delegate passphrase.
 * A config value is encrypted if and only if it starts with this prefix.
 * @type {string}
 */
var ENCRYPTED_PREFIX = 'admnode-enc-v1.';

var MIN_OPERATOR_PASSWORD_LENGTH = 12;

/**
 * scrypt parameters. N is 2^17. The key is 32 bytes for AES-256.
 * maxmem is raised above the 128 MiB working-set requirement. Decrypt accepts
 * only these values, so a config file cannot downgrade the KDF or request a
 * huge cost. Any future parameter change requires a new encrypted prefix.
 */
var KDF = {
  name: 'scrypt',
  N: 1 << 17,
  r: 8,
  p: 1,
  keylen: 32,
  maxmem: 192 * 1024 * 1024
};

var CIPHER = 'aes-256-gcm';
var SALT_LENGTH = 16;
var IV_LENGTH = 12;
var TAG_LENGTH = 16;
var MAX_BLOB_LENGTH = 8192;
var MAX_CIPHERTEXT_BYTES = 1024;

/**
 * Reports whether a forging.secret entry is an encrypted passphrase blob.
 * Detection is the prefix only. Length and character-set guesses are not used.
 * @param {*} value - Config value to test.
 * @return {boolean} True when the value uses the encrypted passphrase prefix.
 */
function isEncrypted (value) {
  return typeof value === 'string' && value.indexOf(ENCRYPTED_PREFIX) === 0;
}

/**
 * Splits forging secrets into plaintext entries and encrypted blobs.
 * Plaintext entries are returned unchanged so existing configs keep working.
 * @param {Array|string} secrets - forging.secret value from config.
 * @return {{plaintext: Array, encrypted: Array<string>}} Partitioned entries.
 */
function partitionForgingSecrets (secrets) {
  var list = [];

  if (Array.isArray(secrets)) {
    list = secrets;
  } else if (secrets) {
    list = [secrets];
  }

  var plaintext = [];
  var encrypted = [];

  list.forEach(function (secret) {
    if (isEncrypted(secret)) {
      encrypted.push(secret);
    } else {
      plaintext.push(secret);
    }
  });

  return {
    plaintext: plaintext,
    encrypted: encrypted
  };
}

/**
 * Derives the public key and address for a delegate passphrase.
 * The private key and seed hash are wiped before returning.
 * @param {string} passphrase - Plain ADAMANT passphrase.
 * @return {{publicKey: string, address: string}} Public identity.
 */
function deriveIdentity (passphrase) {
  var hash = ed.createPassPhraseHash(passphrase);
  var keypair;

  try {
    keypair = ed.makeKeypair(hash);
    var publicKey = keypair.publicKey.toString('hex');
    var address = accounts.getAddressByPublicKey(publicKey);

    if (!address) {
      throw new Error('Failed to derive a delegate address.');
    }

    return {
      publicKey: publicKey,
      address: address
    };
  } finally {
    hash.fill(0);
    wipePrivateKey(keypair);
  }
}

/**
 * Wipes a temporary private key returned by the ED helper.
 * @param {object} keypair - Derived keypair.
 */
function wipePrivateKey (keypair) {
  if (keypair && Buffer.isBuffer(keypair.privateKey)) {
    keypair.privateKey.fill(0);
  }
}

/**
 * Derives the AES-256 key for the offline CLI encryption command.
 * @param {string} password - Operator password.
 * @param {Buffer} salt - scrypt salt.
 * @return {Buffer} 32-byte key. The caller must wipe it.
 */
function deriveKeySync (password, salt) {
  return crypto.scryptSync(password, salt, KDF.keylen, {
    N: KDF.N,
    r: KDF.r,
    p: KDF.p,
    maxmem: KDF.maxmem
  });
}

/**
 * Derives the AES-256 key without blocking a running node's event loop.
 * @param {string} password - Operator password.
 * @param {Buffer} salt - scrypt salt.
 * @param {function} cb - Callback `(err, key)`. The caller must wipe the key.
 */
function deriveKeyAsync (password, salt, cb) {
  crypto.scrypt(password, salt, KDF.keylen, {
    N: KDF.N,
    r: KDF.r,
    p: KDF.p,
    maxmem: KDF.maxmem
  }, cb);
}

/**
 * Encrypts one delegate passphrase with the operator password.
 * The result embeds the public key and address so a locked node can name the
 * delegate without decrypting. Those values are already public on chain.
 * @param {string} passphrase - Plain ADAMANT delegate passphrase.
 * @param {string} password - Operator password.
 * @return {string} Self-describing encrypted config value.
 */
function encrypt (passphrase, password) {
  if (typeof passphrase !== 'string' || passphrase.length === 0) {
    throw new Error('Passphrase is required.');
  }

  if (typeof password !== 'string' || password.length === 0) {
    throw new Error('Operator password is required.');
  }

  if (Array.from(password).length < MIN_OPERATOR_PASSWORD_LENGTH) {
    throw new Error(
        'Operator password must be at least ' +
        MIN_OPERATOR_PASSWORD_LENGTH +
        ' characters.'
    );
  }

  if (password === passphrase) {
    throw new Error('Operator password must differ from the delegate passphrase.');
  }

  if (!ed.isValidPassphrase(passphrase)) {
    throw new Error('Delegate passphrase must be a valid BIP39 mnemonic.');
  }

  var identity = deriveIdentity(passphrase);
  var salt = crypto.randomBytes(SALT_LENGTH);
  var iv = crypto.randomBytes(IV_LENGTH);
  var key = deriveKeySync(password, salt);
  var tag;
  var ciphertext;

  try {
    var cipher = crypto.createCipheriv(CIPHER, key, iv);
    ciphertext = Buffer.concat([
      cipher.update(passphrase, 'utf8'),
      cipher.final()
    ]);
    tag = cipher.getAuthTag();
  } finally {
    key.fill(0);
  }

  var header = {
    kdf: KDF.name,
    N: KDF.N,
    r: KDF.r,
    p: KDF.p,
    cipher: CIPHER,
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    ct: ciphertext.toString('base64'),
    publicKey: identity.publicKey,
    address: identity.address
  };
  var blob = ENCRYPTED_PREFIX + Buffer.from(JSON.stringify(header), 'utf8').toString('base64url');

  if (blob.length > MAX_BLOB_LENGTH) {
    throw new Error('Encrypted passphrase blob is too large.');
  }

  return blob;
}

/**
 * Decodes a base64 field and requires an exact byte length.
 * @param {string} value - Base64 field.
 * @param {number} length - Required decoded length.
 * @return {Buffer} Decoded bytes.
 */
function decodeExact (value, length) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) {
    throw new Error('Encrypted passphrase blob is malformed.');
  }

  var decoded = Buffer.from(value, 'base64');

  if (decoded.length !== length) {
    throw new Error('Encrypted passphrase blob is malformed.');
  }

  return decoded;
}

/**
 * Decodes ciphertext and rejects empty or oversized payloads.
 * @param {string} value - Base64 ciphertext.
 * @return {Buffer} Ciphertext bytes.
 */
function decodeCiphertext (value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) {
    throw new Error('Encrypted passphrase blob is malformed.');
  }

  var decoded = Buffer.from(value, 'base64');

  if (decoded.length === 0 || decoded.length > MAX_CIPHERTEXT_BYTES) {
    throw new Error('Encrypted passphrase blob is malformed.');
  }

  return decoded;
}

/**
 * Checks that a blob uses the only KDF and cipher this node implements.
 * @param {object} header - Parsed blob header.
 */
function assertSupportedHeader (header) {
  if (
    !header ||
    Array.isArray(header) ||
    typeof header !== 'object' ||
    header.kdf !== KDF.name ||
    header.N !== KDF.N ||
    header.r !== KDF.r ||
    header.p !== KDF.p ||
    header.cipher !== CIPHER
  ) {
    throw new Error('Encrypted passphrase blob uses unsupported parameters.');
  }

  if (typeof header.publicKey !== 'string' || !/^[0-9a-fA-F]{64}$/.test(header.publicKey)) {
    throw new Error('Encrypted passphrase blob is malformed.');
  }

  if (typeof header.address !== 'string' || header.address.length < 2) {
    throw new Error('Encrypted passphrase blob is malformed.');
  }

  var derivedAddress;

  try {
    derivedAddress = accounts.getAddressByPublicKey(header.publicKey);
  } catch (err) {
    throw new Error('Encrypted passphrase blob is malformed.');
  }

  if (derivedAddress !== header.address) {
    throw new Error('Encrypted passphrase blob is malformed.');
  }
}

/**
 * Parses an encrypted passphrase blob without decrypting it.
 * @param {string} blob - Encrypted config value.
 * @return {object} Header fields. Salt, IV, tag, and ciphertext are not secret,
 * but the caller must not log the raw blob.
 */
function parseHeader (blob) {
  if (!isEncrypted(blob)) {
    throw new Error('Value is not an encrypted passphrase blob.');
  }

  if (blob.length > MAX_BLOB_LENGTH) {
    throw new Error('Encrypted passphrase blob is malformed.');
  }

  var header;
  var encoded = blob.slice(ENCRYPTED_PREFIX.length);

  if (!encoded || !/^[A-Za-z0-9_-]+$/.test(encoded)) {
    throw new Error('Encrypted passphrase blob is malformed.');
  }

  try {
    header = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
  } catch (err) {
    throw new Error('Encrypted passphrase blob is malformed.');
  }

  assertSupportedHeader(header);
  decodeExact(header.salt, SALT_LENGTH);
  decodeExact(header.iv, IV_LENGTH);
  decodeExact(header.tag, TAG_LENGTH);
  decodeCiphertext(header.ct);

  return header;
}

/**
 * Decrypts an encrypted delegate passphrase and checks the embedded identity.
 * @param {string} blob - Encrypted config value.
 * @param {string} password - Operator password.
 * @param {function} cb - Callback `(err, result)`.
 */
function decrypt (blob, password, cb) {
  if (typeof cb !== 'function') {
    throw new Error('Decrypt callback is required.');
  }

  if (typeof password !== 'string' || password.length === 0) {
    return setImmediate(cb, new Error('Operator password is required.'));
  }

  var header;
  var salt;
  var iv;
  var tag;
  var ciphertext;

  try {
    header = parseHeader(blob);
    salt = decodeExact(header.salt, SALT_LENGTH);
    iv = decodeExact(header.iv, IV_LENGTH);
    tag = decodeExact(header.tag, TAG_LENGTH);
    ciphertext = decodeCiphertext(header.ct);
  } catch (err) {
    return setImmediate(cb, err);
  }

  deriveKeyAsync(password, salt, function (keyErr, key) {
    if (keyErr) {
      return cb(new Error('Failed to derive the operator password key.'));
    }

    var plaintext;
    var update;
    var final;
    var passphrase;
    var derived;

    try {
      var decipher = crypto.createDecipheriv(CIPHER, key, iv);
      decipher.setAuthTag(tag);
      update = decipher.update(ciphertext);
      final = decipher.final();
      plaintext = Buffer.concat([update, final]);
      passphrase = plaintext.toString('utf8');
    } catch (err) {
      return cb(new Error('Wrong operator password or corrupted encrypted passphrase.'));
    } finally {
      key.fill(0);
      if (plaintext) {
        plaintext.fill(0);
      }
      if (update) {
        update.fill(0);
      }
      if (final) {
        final.fill(0);
      }
    }

    try {
      derived = deriveIdentity(passphrase);
    } catch (err) {
      return cb(new Error('Decrypted passphrase does not match the embedded public key.'));
    }

    var expected = Buffer.from(header.publicKey, 'hex');
    var actual = Buffer.from(derived.publicKey, 'hex');

    if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
      return cb(new Error('Decrypted passphrase does not match the embedded public key.'));
    }

    if (derived.address !== header.address) {
      return cb(new Error('Decrypted passphrase does not match the embedded address.'));
    }

    return cb(null, {
      passphrase: passphrase,
      publicKey: derived.publicKey,
      address: derived.address
    });
  });
}

module.exports = {
  ENCRYPTED_PREFIX: ENCRYPTED_PREFIX,
  MIN_OPERATOR_PASSWORD_LENGTH: MIN_OPERATOR_PASSWORD_LENGTH,
  KDF: {
    name: KDF.name,
    N: KDF.N,
    r: KDF.r,
    p: KDF.p
  },
  isEncrypted: isEncrypted,
  partitionForgingSecrets: partitionForgingSecrets,
  encrypt: encrypt,
  decrypt: decrypt,
  parseHeader: parseHeader
};
