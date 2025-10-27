'use strict';

const { expect } = require('chai');
const crypto = require('crypto');
const ed = require('../../../helpers/ed.js');

describe('ed', () => {
  let passphrase;
  let hash;
  let keypair;
  let message;

  beforeEach(() => {
    passphrase = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
    hash = ed.createPassPhraseHash(passphrase);
    keypair = ed.makeKeypair(hash);
    message = Buffer.from('adamant is good');
  });

  describe('isValidPassphrase()', () => {
    it('should return true for a valid BIP39 mnemonic', () => {
      expect(ed.isValidPassphrase(passphrase)).to.be.true;
    });

    it('should return false for an invalid mnemonic', () => {
      expect(ed.isValidPassphrase('not a real mnemonic phrase')).to.be.false;
    });
  });

  describe('generatePassphrase()', () => {
    it('should generate a valid mnemonic', () => {
      const generated = ed.generatePassphrase();
      expect(ed.isValidPassphrase(generated)).to.be.true;
    });

    it('should generate a different mnemonic each time', () => {
      const a = ed.generatePassphrase();
      const b = ed.generatePassphrase();
      expect(a).to.not.equal(b);
    });
  });

  describe('createPassPhraseHash()', () => {
    it('should create a SHA256 hash buffer', () => {
      const h = ed.createPassPhraseHash(passphrase);
      expect(Buffer.isBuffer(h)).to.be.true;
      expect(h.length).to.equal(32);
    });

    it('should produce deterministic output for same input', () => {
      const h1 = ed.createPassPhraseHash(passphrase);
      const h2 = ed.createPassPhraseHash(passphrase);
      expect(h1.equals(h2)).to.be.true;
    });
  });

  describe('makeKeypair()', () => {
    it('should produce valid public and private key buffers', () => {
      expect(Buffer.isBuffer(keypair.publicKey)).to.be.true;
      expect(Buffer.isBuffer(keypair.privateKey)).to.be.true;
      expect(keypair.publicKey.length).to.equal(32);
      expect(keypair.privateKey.length).to.equal(64);
    });

    it('should produce deterministic keypair for same seed', () => {
      const second = ed.makeKeypair(hash);
      expect(second.publicKey.equals(keypair.publicKey)).to.be.true;
      expect(second.privateKey.equals(keypair.privateKey)).to.be.true;
    });
  });

  describe('sign()', () => {
    it('should return a valid signature buffer', () => {
      const sig = ed.sign(message, keypair);
      expect(Buffer.isBuffer(sig)).to.be.true;
      expect(sig.length).to.equal(64);
    });
  });

  describe('verify()', () => {
    it('should verify a valid signature', () => {
      const sig = ed.sign(message, keypair);
      const verified = ed.verify(message, sig, keypair.publicKey);
      expect(verified).to.be.true;
    });

    it('should fail verification for modified message', () => {
      const sig = ed.sign(message, keypair);
      const tampered = Buffer.from('adamant is bad');
      const verified = ed.verify(tampered, sig, keypair.publicKey);
      expect(verified).to.be.false;
    });

    it('should fail verification with wrong public key', () => {
      const sig = ed.sign(message, keypair);
      const other = ed.makeKeypair(crypto.randomBytes(32));
      const verified = ed.verify(message, sig, other.publicKey);
      expect(verified).to.be.false;
    });
  });
});
