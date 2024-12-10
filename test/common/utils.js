const Mnemonic = require('bitcore-mnemonic');
const accounts = require('../../helpers/accounts.js');

exports.randomAccount = function () {
  const account = {
    balance: '1000'
  };

  const passphrase = new Mnemonic(Mnemonic.Words.ENGLISH).toString()
  const keypair = accounts.makeKeypair(accounts.createPassPhraseHash(account.password));

  account.password = passphrase;
  account.publicKey = keypair.publicKey;
  account.publicKeyHex = keypair.publicKey.toString('hex');
  account.address = accounts.getAddressByPublicKey(account.publicKey);
  account.keypair = keypair;

  return account;
};
