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

const genesisAccount = {
  secret:
    'neck want coast appear army smile palm major crumble upper void warm',
  publicKey: 'b80bb6459608dcdeb9a98d1f2b0111b2bf11e53ef2933e6769bb0198e3a97aae',
  address: 'U15365455923155964650',
};

const nonExistingAddress = 'U1234567890';
const notAMnemonicPassphrase = 'not a mnemonic passphrase';

const invalidPublicKey = 'bd330166898377fb';
const invalidAddress = 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kygt080';

module.exports = {
  nonExistingAddress,
  genesisAccount,
  testAccount,
  validAccount,
  notAMnemonicPassphrase,
  invalidPublicKey,
  invalidAddress,
};
