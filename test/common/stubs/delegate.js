const ed = require('../../../helpers/ed.js');

// 'market' delegate
const delegatePassphrase = 'rally clean ladder crane gadget century timber jealous shine scorpion beauty salon';
const delegateHash = ed.createPassPhraseHash(delegatePassphrase);
const delegateKeyPair = ed.makeKeypair(delegateHash);

module.exports = {
  delegatePassphrase,
  delegateHash,
  delegateKeyPair
};
