'use strict';

const { expect } = require('chai');
const fs = require('fs');
const sinon = require('sinon');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const accounts = require('../../../helpers/accounts.js');
const Config = require('../../../helpers/config.js');
const ed = require('../../../helpers/ed.js');
const forgingSecret = require('../../../helpers/forgingSecret.js');

const PASSPHRASE = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const PASSWORD = 'correct horse battery staple';
const EXPECTED_PUBLIC_KEY = '58032e75cd5ee0bbcacbed1e38c3da4bf0f162aba2d7513d2d2fba2184327bd3';

function decrypt (blob, password) {
  return new Promise((resolve, reject) => {
    forgingSecret.decrypt(blob, password, (err, result) => {
      if (err) {
        return reject(err);
      }

      return resolve(result);
    });
  });
}

async function expectDecryptError (blob, password, pattern) {
  try {
    await decrypt(blob, password);
    throw new Error('decrypt should have failed');
  } catch (err) {
    expect(err.message).to.match(pattern);
  }
}

describe('forgingSecret', () => {
  describe('isEncrypted()', () => {
    it('detects an encrypted blob only by its prefix', () => {
      const blob = forgingSecret.encrypt(PASSPHRASE, PASSWORD);

      expect(forgingSecret.isEncrypted(blob)).to.equal(true);
      expect(blob.indexOf(forgingSecret.ENCRYPTED_PREFIX)).to.equal(0);
      expect(forgingSecret.isEncrypted(PASSPHRASE)).to.equal(false);
      expect(forgingSecret.isEncrypted('')).to.equal(false);
      expect(forgingSecret.isEncrypted(undefined)).to.equal(false);
    });
  });

  describe('partitionForgingSecrets()', () => {
    it('keeps plaintext entries and separates encrypted blobs', () => {
      const blob = forgingSecret.encrypt(PASSPHRASE, PASSWORD);
      const partitioned = forgingSecret.partitionForgingSecrets([PASSPHRASE, blob, '']);

      expect(partitioned.plaintext).to.deep.equal([PASSPHRASE, '']);
      expect(partitioned.encrypted).to.deep.equal([blob]);
    });
  });

  describe('encrypt() and decrypt()', () => {
    it('round-trips a passphrase and embeds the public identity', async () => {
      const blob = forgingSecret.encrypt(PASSPHRASE, PASSWORD);
      const decrypted = await decrypt(blob, PASSWORD);
      const header = forgingSecret.parseHeader(blob);

      expect(decrypted.passphrase).to.equal(PASSPHRASE);
      expect(decrypted.publicKey).to.equal(EXPECTED_PUBLIC_KEY);
      expect(header.publicKey).to.equal(EXPECTED_PUBLIC_KEY);
      expect(header.address).to.equal(accounts.getAddressByPublicKey(EXPECTED_PUBLIC_KEY));
      expect(header.address.charAt(0)).to.equal('U');
      expect(header.N).to.equal(forgingSecret.KDF.N);
      expect(header.N).to.equal(1 << 17);
    });

    it('uses a fresh salt and IV for each encryption', () => {
      expect(forgingSecret.encrypt(PASSPHRASE, PASSWORD)).to.not.equal(
          forgingSecret.encrypt(PASSPHRASE, PASSWORD)
      );
    });

    it('rejects a wrong password without echoing it', async () => {
      const blob = forgingSecret.encrypt(PASSPHRASE, PASSWORD);
      const wrongPassword = 'wrong-password';

      await expectDecryptError(
          blob,
          wrongPassword,
          /Wrong operator password or corrupted encrypted passphrase/
      );
    });

    it('rejects a tampered ciphertext', async () => {
      const blob = forgingSecret.encrypt(PASSPHRASE, PASSWORD);
      const header = forgingSecret.parseHeader(blob);
      const tamperedCt = Buffer.from(header.ct, 'base64');

      tamperedCt[0] ^= 0xff;
      header.ct = tamperedCt.toString('base64');

      const tampered = forgingSecret.ENCRYPTED_PREFIX +
        Buffer.from(JSON.stringify(header), 'utf8').toString('base64url');

      await expectDecryptError(
          tampered,
          PASSWORD,
          /Wrong operator password or corrupted encrypted passphrase/
      );
    });

    it('rejects a tampered embedded public key', async () => {
      const blob = forgingSecret.encrypt(PASSPHRASE, PASSWORD);
      const header = forgingSecret.parseHeader(blob);

      header.publicKey = 'aa'.repeat(32);
      header.address = accounts.getAddressByPublicKey(header.publicKey);

      const tampered = forgingSecret.ENCRYPTED_PREFIX +
        Buffer.from(JSON.stringify(header), 'utf8').toString('base64url');

      await expectDecryptError(tampered, PASSWORD, /does not match the embedded public key/);
    });

    it('rejects an address that does not belong to the embedded public key', () => {
      const blob = forgingSecret.encrypt(PASSPHRASE, PASSWORD);
      const header = forgingSecret.parseHeader(blob);

      header.address = accounts.getAddressByPublicKey('bb'.repeat(32));

      const tampered = forgingSecret.ENCRYPTED_PREFIX +
        Buffer.from(JSON.stringify(header), 'utf8').toString('base64url');

      expect(() => forgingSecret.parseHeader(tampered)).to.throw(/malformed/);
    });

    it('rejects non-base64url blob payloads', () => {
      expect(() => forgingSecret.parseHeader(forgingSecret.ENCRYPTED_PREFIX + '%%%')).to.throw(
          /malformed/
      );
    });

    it('rejects unsupported KDF parameters before deriving a key', async () => {
      const blob = forgingSecret.encrypt(PASSPHRASE, PASSWORD);
      const header = forgingSecret.parseHeader(blob);

      header.N = 2;

      const weakened = forgingSecret.ENCRYPTED_PREFIX +
        Buffer.from(JSON.stringify(header), 'utf8').toString('base64url');

      await expectDecryptError(weakened, PASSWORD, /unsupported parameters/);
    });

    it('does not include the rejected passphrase in the error', () => {
      const invalid = 'not a real mnemonic phrase';

      try {
        forgingSecret.encrypt(invalid, PASSWORD);
        throw new Error('encrypt should have failed');
      } catch (err) {
        expect(err.message).to.match(/valid BIP39 mnemonic/);
        expect(err.message).to.not.include(invalid);
      }
    });

    it('requires a passphrase and an operator password', () => {
      expect(() => forgingSecret.encrypt('', PASSWORD)).to.throw(/Passphrase is required/);
      expect(() => forgingSecret.encrypt(PASSPHRASE, '')).to.throw(/Operator password is required/);
    });

    it('requires a strong operator password distinct from the passphrase', () => {
      expect(() => forgingSecret.encrypt(PASSPHRASE, 'short')).to.throw(/at least 12 characters/);
      expect(() => forgingSecret.encrypt(PASSPHRASE, PASSPHRASE)).to.throw(
          /differ from the delegate passphrase/
      );
    });
  });

  describe('config loading', () => {
    const configPath = path.join(os.tmpdir(), 'adamant-forging-secret-' + process.pid + '.json');
    let exitStub;

    afterEach(() => {
      if (exitStub) {
        exitStub.restore();
      }

      if (fs.existsSync(configPath)) {
        fs.unlinkSync(configPath);
      }
    });

    it('keeps plaintext and encrypted forging secrets unchanged', () => {
      const blob = forgingSecret.encrypt(PASSPHRASE, PASSWORD);

      fs.writeFileSync(configPath, JSON.stringify({
        forging: {
          secret: [PASSPHRASE, blob]
        }
      }));

      exitStub = sinon.stub(process, 'exit');

      const config = Config(configPath);

      expect(exitStub.called).to.equal(false);
      expect(config.forging.secret).to.deep.equal([PASSPHRASE, blob]);
      expect(config.forging.controlSocket).to.equal('');
      expect(ed.isValidPassphrase(config.forging.secret[0])).to.equal(true);
      expect(forgingSecret.isEncrypted(config.forging.secret[1])).to.equal(true);
    });
  });
});

describe('adm-node forging encrypt', () => {
  const cli = path.join(__dirname, '../../../tools/adm-node.js');

  /**
   * Runs the encrypt command with piped answers.
   * @param {string} input - Stdin lines.
   * @return {Promise<{code: number, stdout: string, stderr: string}>}
   */
  function runEncrypt (input) {
    return new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [cli, 'forging', 'encrypt'], {
        stdio: ['pipe', 'pipe', 'pipe']
      });
      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (chunk) => {
        stdout += chunk.toString('utf8');
      });
      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString('utf8');
      });
      child.on('error', reject);
      child.on('close', (code) => {
        resolve({ code, stdout, stderr });
      });

      child.stdin.end(input);
    });
  }

  it('prints an encrypted config value and does not echo the passphrase', async () => {
    const result = await runEncrypt(PASSPHRASE + '\n' + PASSWORD + '\n' + PASSWORD + '\n');
    const blob = result.stdout.trim();

    expect(result.code).to.equal(0);
    expect(forgingSecret.isEncrypted(blob)).to.equal(true);
    expect((await decrypt(blob, PASSWORD)).passphrase).to.equal(PASSPHRASE);
    expect(result.stdout).to.not.include(PASSPHRASE);
    expect(result.stderr).to.not.include(PASSPHRASE);
    expect(result.stderr).to.not.include(PASSWORD);
    expect(result.stdout).to.not.include(PASSWORD);
  });

  it('rejects a mismatched operator password before writing a blob', async () => {
    const result = await runEncrypt(PASSPHRASE + '\none-password\nother-password\n');

    expect(result.code).to.equal(1);
    expect(result.stdout).to.equal('');
    expect(result.stderr).to.match(/do not match/);
    expect(result.stderr).to.not.include(PASSPHRASE);
  });

  it('rejects an operator password shorter than 12 characters', async () => {
    const result = await runEncrypt(PASSPHRASE + '\nshort\nshort\n');

    expect(result.code).to.equal(1);
    expect(result.stdout).to.equal('');
    expect(result.stderr).to.match(/at least 12 characters/);
    expect(result.stderr).to.not.include(PASSPHRASE);
  });
});
