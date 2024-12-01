const accounts = require('../../../helpers/accounts.js')

// Account, holding 19.6 mln ADM, received from Genesis
const iAccount = {
  address: 'U5338684603617333081',
  publicKey: '9184c87b846dec0dc4010def579fecf5dad592a59b37a013c7e6975597681f58',
  password: 'floor myself rather hidden pepper make isolate vintage review flight century label',
  balance: '1960000000000000'
};

const nonExistingAccount = {
  address: 'U123456789012345678',
  publicKey: 'a1234567bcde8f9abcd01e2345fa67bcd8e901f2345a6bc7d89e0123f45abc67'
}

const validAccount = {
  address: 'U777355171330060015',
  unconfirmedBalance: '4509718944753',
  balance: '4509718944753',
  publicKey: 'a9407418dafb3c8aeee28f3263fd55bae0f528a5697a9df0e77e6568b19dfe34',
  unconfirmedSignature: 0,
  secondSignature: 0,
  secondPublicKey: null,
};

const testAccount = {
  username: 'market',
  address: 'U810656636599221322',
  publicKey: 'f4011a1360ac2769e066c789acaaeffa9d707690d4d3f6085a7d52756fbc30d0',
  secret:
    'rally clean ladder crane gadget century timber jealous shine scorpion beauty salon',
};

const testAccountHash = accounts.createPassPhraseHash(testAccount.secret);
const testAccountKeypair = accounts.makeKeypair(testAccountHash);

const genesisAccount = {
  secret:
    'neck want coast appear army smile palm major crumble upper void warm',
  publicKey: 'b80bb6459608dcdeb9a98d1f2b0111b2bf11e53ef2933e6769bb0198e3a97aae',
  address: 'U15365455923155964650',
};

const genesisHash = accounts.createPassPhraseHash(genesisAccount.secret);
const genesisKeypair = accounts.makeKeypair(genesisHash);

const delegateAccount = {
  address: 'U12559234133690317086',
  publicKey: 'd365e59c9880bd5d97c78475010eb6d96c7a3949140cda7e667f9513218f9089',
  secret: 'weather play vibrant large edge clean notable april fire smoke drift hidden',
  u_balance: 10000000000000,
  balance: 100000000000000
}

const delegateAccountHash = accounts.createPassPhraseHash(delegateAccount.secret);
const delegateAccountKeypair = accounts.makeKeypair(delegateAccountHash);

const nonExistingAddress = 'U1234567890';
const notAMnemonicPassphrase = 'not a mnemonic passphrase';

const invalidPublicKey = 'bd330166898377fb';
const invalidAddress = 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kygt080';

module.exports = {
  iAccount,
  delegateAccount,
  delegateAccountHash,
  delegateAccountKeypair,
  nonExistingAccount,
  nonExistingAddress,
  genesisAccount,
  genesisHash,
  genesisKeypair,
  testAccount,
  testAccountHash,
  testAccountKeypair,
  validAccount,
  notAMnemonicPassphrase,
  invalidPublicKey,
  invalidAddress,
};
