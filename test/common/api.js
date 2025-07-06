const node = require('./../node.js');

const apiUtils = {
  sendADM({ secret, amount, recipientId }, done) {
    const keyPair = node.createKeypairFromPassphrase(secret);
    const transaction = node.createSendTransaction({
      keyPair,
      recipientId,
      amount,
    });

    node.post('/api/transactions/process', { transaction }, done);
  },
  sendRandomAmountADM(address, done) {
    const randomAmount = node.randomADM();

    apiUtils.sendADM({
      secret: node.iAccount.password,
      amount: randomAmount,
      recipientId: address
    }, (err, res) => {
      node.expect(res.body).to.have.property('success').that.is.true;
      done(err, res);
    });
  },
  sendADMAndWaitUntilNextBlock(params, done) {
    apiUtils.sendADM(params, (err, res) => {
      node.expect(res.body).to.have.property('success').to.be.true;
      node.onNewBlock(function (err) {
        return done(err, res);
      });
    })
  },
  voteForDelegatesAndWaitUntilNextBlock({ secret, votes }, done) {
    const keyPair = node.createKeypairFromPassphrase(secret)
    const transaction = node.createVoteTransaction({
      keyPair,
      votes,
    });

    node.post('/api/accounts/delegates', transaction, function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.true;
      node.onNewBlock(function (err) {
        done();
      });
    });
  },
  sendADMasync(params) {
    return new Promise((resolve, reject) => {
      node.put('/api/transactions/', params, (err, data) => {
        if (err) {
          return reject(err);
        }

        resolve(data);
      });
    });
  },
  postMessage (transaction, done) {
    node.post('/api/transactions', { transaction: transaction }, done);
  },
  // openAccount(secret) {
  //   const hash = accounts.createPassPhraseHash(secret);
  //   const keypair = accounts.makeKeypair(hash);

  //   const publicKey = keypair.publicKey.toString('hex');
  //   const address = accounts.getAddressByPublicKey(publicKey);

  //   return {
  //     address,
  //     publicKey,
  //     u_balance: '0',
  //     balance: '0',
  //     u_secondSignature: 0,
  //     secondSignature: 0,
  //     secondPublicKey: null,
  //     multisignatures: null,
  //     u_multisignatures: null,
  //   };
  // }
};

module.exports = apiUtils;
