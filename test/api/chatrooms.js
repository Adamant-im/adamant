'use strict';

const node = require('./../node.js');
const Mnemonic = require('bitcore-mnemonic');
const _ = require('lodash');

function sendADM (params, done) {
  node.put('/api/transactions/', params, function (err, res) {
    done(err, res);
  });
}

function postMessage (transaction, done) {
  node.post('/api/transactions', { transaction: transaction }, done);
}

function getChats (senderId, done, params) {
  const args = _.keys(params).map((key) => `${key}=${params[key]}`);
  node.get(`/api/chatrooms/${senderId}${args.length > 0 ? '?' + args.join('&') : ''}`, done);
}

function getMessages (authorId, companionId, done, params) {
  const args = _.keys(params).map((key) => `${key}=${params[key]}`);
  node.get(`/api/chatrooms/${authorId}/${companionId}${args.length > 0 ? '?' + args.join('&') : ''}`, done);
}

describe('GET /api/chatrooms/:ID/:ID', function () {
  const sender = node.randomAccount();
  const recipient1 = node.randomAccount();
  const recipient2 = node.randomAccount();

  // send ADM to message sender
  before(function (done) {
    sendADM({
      secret: node.iAccount.password,
      amount: node.fees.messageFee * 3 + node.fees.transactionFee * 2,
      recipientId: sender.address
    }, function () {
      done();
    });
  });

  // send ADM to recipient1
  before(function (done) {
    sendADM({
      secret: node.iAccount.password,
      amount: node.fees.messageFee,
      recipientId: recipient1.address
    }, function () {
      done();
    });
  });

  // send ADM to recipient2
  before(function (done) {
    sendADM({
      secret: node.iAccount.password,
      amount: node.fees.messageFee,
      recipientId: recipient2.address
    }, function () {
      done();
    });
  });

  before(function (done) {
    node.onNewBlock(function () {
      done();
    });
  });

  // send a message from a sender to recipient1
  before(function (done) {
    const transaction = node.createChatTransaction({
      keyPair: sender.keypair,
      recipientId: recipient1.address,
      message: new Mnemonic(Mnemonic.Words.ENGLISH).toString(),
      own_message: '',
      type: 1
    });
    postMessage(transaction, function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.ok;
      node.expect(res.body).to.have.property('transactionId').that.is.not.empty;
      done();
    });
  });

  before(function (done) {
    node.onNewBlock(function () {
      done();
    });
  });

  // send a message from a recipient1 to recipient2
  before(function (done) {
    const transaction = node.createChatTransaction({
      keyPair: recipient1.keypair,
      recipientId: recipient2.address,
      message: new Mnemonic(Mnemonic.Words.ENGLISH).toString(),
      own_message: '',
      type: 1
    });
    postMessage(transaction, function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.ok;
      node.expect(res.body).to.have.property('transactionId').that.is.not.empty;
      done();
    });
  });

  before(function (done) {
    node.onNewBlock(function () {
      done();
    });
  });

  // send a message from a recipient2 to recipient1
  before(function (done) {
    const transaction = node.createChatTransaction({
      keyPair: recipient2.keypair,
      recipientId: recipient1.address,
      message: new Mnemonic(Mnemonic.Words.ENGLISH).toString(),
      own_message: '',
      type: 1
    });
    postMessage(transaction, function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.ok;
      node.expect(res.body).to.have.property('transactionId').that.is.not.empty;
      done();
    });
  });

  before(function (done) {
    node.onNewBlock(function () {
      done();
    });
  });

  // send a message from a sender to recipient2
  before(function (done) {
    const transaction = node.createChatTransaction({
      keyPair: sender.keypair,
      recipientId: recipient2.address,
      message: new Mnemonic(Mnemonic.Words.ENGLISH).toString(),
      own_message: '',
      type: 1
    });
    postMessage(transaction, function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.ok;
      node.expect(res.body).to.have.property('transactionId').that.is.not.empty;
      done();
    });
  });

  // send ADM from sender to recipient1
  before(function (done) {
    sendADM({
      secret: sender.password,
      amount: node.fees.transactionFee,
      recipientId: recipient1.address
    }, function () {
      done();
    });
  });

  before(function (done) {
    node.onNewBlock(function () {
      done();
    });
  });

  // send a second message from a sender to recipient1
  before(function (done) {
    const transaction = node.createChatTransaction({
      keyPair: sender.keypair,
      recipientId: recipient1.address,
      message: new Mnemonic(Mnemonic.Words.ENGLISH).toString(),
      own_message: '',
      type: 1
    });
    postMessage(transaction, function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.ok;
      node.expect(res.body).to.have.property('transactionId').that.is.not.empty;
      done();
    });
  });

  before(function (done) {
    node.onNewBlock(function () {
      done();
    });
  });

  it('should return the chat list for sender with no parameters', function (done) {
    getChats(sender.address, function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.ok;
      node.expect(res.body).to.have.property('count').to.equal('3'); // 2 chats and 1 direct transfer from iAccount
      node.expect(res.body).to.have.property('chats').to.have.lengthOf(3);
      for (let i = 0; i < res.body.chats.length; i++) {
        node.expect(res.body.chats[i]).to.have.property('participants').to.have.lengthOf(2);
        if (res.body.chats[i].participants[0].address !== node.iAccount.address) { // if it's a message
          node.expect(res.body.chats[i].participants[0].address).to.equal(sender.address);
          node.expect(res.body.chats[i].participants[0].publicKey).to.equal(sender.publicKey.toString('hex'));
          node.expect(res.body.chats[i].lastTransaction.asset).to.have.property('chat').to.be.an('object');
          node.expect(res.body.chats[i].lastTransaction.asset.chat).to.have.property('message').to.not.equal(null);
          node.expect(res.body.chats[i].lastTransaction.asset.chat).to.have.property('own_message').to.not.equal(null);
          node.expect(res.body.chats[i].lastTransaction.asset.chat).to.have.property('type').to.not.equal(null);
        } else { // if it is a direct transfer from node.iAccount.address
          node.expect(res.body.chats[i].participants[0].address).to.equal(node.iAccount.address);
          node.expect(res.body.chats[i].participants[0].publicKey).to.equal(node.iAccount.publicKey);
          node.expect(res.body.chats[i].participants[1].address).to.equal(sender.address);
          node.expect(res.body.chats[i].participants[1].publicKey).to.equal(sender.publicKey.toString('hex'));
        }
        node.expect(res.body.chats[i].participants[1].publicKey).to.not.equal(null);
        node.expect(res.body.chats[i]).to.have.property('lastTransaction').to.be.an('object');
        node.expect(res.body.chats[i].lastTransaction.timestamp).to.not.equal(null);
        node.expect(res.body.chats[i].lastTransaction.fee).to.not.equal(null);
        node.expect(res.body.chats[i].lastTransaction.amount).to.not.equal(null);
        node.expect(res.body.chats[i].lastTransaction).to.have.property('asset').to.be.an('object');
      }
      done();
    });
  });

  it('should return the chat list for recipient1', function (done) {
    getChats(recipient1.address, function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.ok;
      node.expect(res.body).to.have.property('count').to.equal('3'); // 2 chats and 1 direct transfer from iAccount
      node.expect(res.body).to.have.property('chats').to.have.lengthOf(3);
      for (let i = 0; i < res.body.chats.length; i++) {
        node.expect(res.body.chats[i]).to.have.property('participants').to.have.lengthOf(2);
        node.expect(res.body.chats[i].participants[0].publicKey).to.not.equal(null);
        node.expect(res.body.chats[i].participants[1].publicKey).to.not.equal(null);
        node.expect(res.body.chats[i]).to.have.property('lastTransaction').to.be.an('object');
        node.expect(res.body.chats[i].lastTransaction.timestamp).to.not.equal(null);
        node.expect(res.body.chats[i].lastTransaction.fee).to.not.equal(null);
        node.expect(res.body.chats[i].lastTransaction.amount).to.not.equal(null);
      }
      let pTimestamp = res.body.chats[0].lastTransaction.timestamp;
      for (let i = 1; i < res.body.chats.length; i++) {
        node.expect(res.body.chats[i].lastTransaction).to.have.property('timestamp').to.be.below(pTimestamp);
      }
      done();
    }, { orderBy: 'timestamp:desc' });
  });

  it('should return the chat list for recipient2', function (done) {
    getChats(recipient2.address, function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.ok;
      node.expect(res.body).to.have.property('count').to.equal('3'); // 2 chats and 1 direct transfer from iAccount
      node.expect(res.body).to.have.property('chats').to.have.lengthOf(3);
      for (let i = 0; i < res.body.chats.length; i++) {
        node.expect(res.body.chats[i]).to.have.property('participants').to.have.lengthOf(2);
        node.expect(res.body.chats[i].participants[0].publicKey).to.not.equal(null);
        node.expect(res.body.chats[i].participants[1].publicKey).to.not.equal(null);
        node.expect(res.body.chats[i]).to.have.property('lastTransaction').to.be.an('object');
        node.expect(res.body.chats[i].lastTransaction.timestamp).to.not.equal(null);
        node.expect(res.body.chats[i].lastTransaction.fee).to.not.equal(null);
        node.expect(res.body.chats[i].lastTransaction.amount).to.not.equal(null);
      }
      done();
    });
  });

  it('should return the chat list for sender with limit', function (done) {
    getChats(sender.address, function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.ok;
      node.expect(res.body).to.have.property('count').to.equal('3');
      node.expect(res.body).to.have.property('chats').to.have.lengthOf(1);
      for (let i = 0; i < res.body.chats.length; i++) {
        node.expect(res.body.chats[i]).to.have.property('participants').to.have.lengthOf(2);
        for (let y = 0; y < res.body.chats[i].participants.length; y++) {
          node.expect(res.body.chats[i].participants[y].publicKey).to.not.equal(null);
        }
      }
      done();
    }, { limit: 1 });
  });

  it('should return the chat list for sender with offset', function (done) {
    getChats(sender.address, function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.ok;
      node.expect(res.body).to.have.property('count').to.equal('3');
      node.expect(res.body).to.have.property('chats').to.have.lengthOf(2);
      for (let i = 0; i < res.body.chats.length; i++) {
        node.expect(res.body.chats[i]).to.have.property('participants').to.have.lengthOf(2);
        for (let y = 0; y < res.body.chats[i].participants.length; y++) {
          node.expect(res.body.chats[i].participants[y].publicKey).to.not.equal(null);
        }
      }
      done();
    }, { offset: 1 });
  });

  it('should return the chat list for sender with both limit and offset', function (done) {
    getChats(sender.address, function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.ok;
      node.expect(res.body).to.have.property('count').to.equal('3');
      node.expect(res.body).to.have.property('chats').to.have.lengthOf(1);
      for (let i = 0; i < res.body.chats.length; i++) {
        node.expect(res.body.chats[i]).to.have.property('participants').to.have.lengthOf(2);
        for (let y = 0; y < res.body.chats[i].participants.length; y++) {
          node.expect(res.body.chats[i].participants[y].publicKey).to.not.equal(null);
        }
      }
      done();
    }, { limit: 1, offset: 1 });
  });

  it('should return the chat list for sender with orderBy=timestamp:desc', function (done) {
    getChats(sender.address, function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.ok;
      node.expect(res.body).to.have.property('count').to.equal('3');
      node.expect(res.body).to.have.property('chats').to.have.lengthOf(3);
      for (let i = 0; i < res.body.chats.length; i++) {
        node.expect(res.body.chats[i]).to.have.property('participants').to.have.lengthOf(2);
        for (let y = 0; y < res.body.chats[i].participants.length; y++) {
          node.expect(res.body.chats[i].participants[y].publicKey).to.not.equal(null);
        }
      }
      let pTimestamp = res.body.chats[0].lastTransaction.timestamp;
      for (let i = 1; i < res.body.chats.length; i++) {
        node.expect(res.body.chats[i].lastTransaction).to.have.property('timestamp').to.be.below(pTimestamp);
      }
      done();
    }, { orderBy: 'timestamp:desc' });
  });

  it('should return the chat list for sender with orderBy=timestamp:asc', function (done) {
    getChats(sender.address, function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.ok;
      node.expect(res.body).to.have.property('count').to.equal('3');
      node.expect(res.body).to.have.property('chats').to.have.lengthOf(3);
      for (let i = 0; i < res.body.chats.length; i++) {
        node.expect(res.body.chats[i]).to.have.property('participants').to.have.lengthOf(2);
        for (let y = 0; y < res.body.chats[i].participants.length; y++) {
          node.expect(res.body.chats[i].participants[y].publicKey).to.not.equal(null);
        }
      }
      let pTimestamp = res.body.chats[0].lastTransaction.timestamp;
      for (let i = 1; i < res.body.chats.length; i++) {
        node.expect(res.body.chats[i].lastTransaction).to.have.property('timestamp').to.be.above(pTimestamp);
      }
      done();
    }, { orderBy: 'timestamp:asc' });
  });

  it('should return the chat list for recipient1', function (done) {
    getChats(recipient1.address, function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.ok;
      node.expect(res.body).to.have.property('count').to.equal('3');
      node.expect(res.body).to.have.property('chats').to.have.lengthOf(3);
      for (let i = 0; i < res.body.chats.length; i++) {
        node.expect(res.body.chats[i]).to.have.property('participants').to.have.lengthOf(2);
        for (let y = 0; y < res.body.chats[i].participants.length; y++) {
          node.expect(res.body.chats[i].participants[y].publicKey).to.not.equal(null);
        }
      }
      done();
    });
  });

  it('should return the messages between sender and recipient1', function (done) {
    getMessages(sender.address, recipient1.address, function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.ok;
      node.expect(res.body).to.have.property('count').to.equal('3'); // 2 messages and 1 direct transfer
      node.expect(res.body).to.have.property('messages').to.have.lengthOf(3);
      node.expect(res.body).to.have.property('participants').to.have.lengthOf(2);
      node.expect(res.body.participants[0].address).to.equal(sender.address);
      node.expect(res.body.participants[0].publicKey).to.equal(sender.publicKey.toString('hex'));
      node.expect(res.body.participants[1].address).to.equal(recipient1.address);
      node.expect(res.body.participants[1].publicKey).to.equal(recipient1.publicKey.toString('hex'));
      done();
    });
  });

  it('should return the messages between sender and recipient1 with a limit', function (done) {
    getMessages(sender.address, recipient1.address, function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.ok;
      node.expect(res.body).to.have.property('count').to.equal('3');
      node.expect(res.body).to.have.property('messages').to.have.lengthOf(1);
      node.expect(res.body).to.have.property('participants').to.have.lengthOf(2);
      node.expect(res.body.participants[0].address).to.equal(sender.address);
      node.expect(res.body.participants[0].publicKey).to.equal(sender.publicKey.toString('hex'));
      node.expect(res.body.participants[1].address).to.equal(recipient1.address);
      node.expect(res.body.participants[1].publicKey).to.equal(recipient1.publicKey.toString('hex'));
      done();
    }, {
      limit: 1
    });
  });

  it('should return the messages between sender and recipient1 with an offset', function (done) {
    getMessages(sender.address, recipient1.address, function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.ok;
      node.expect(res.body).to.have.property('count').to.equal('3');
      node.expect(res.body).to.have.property('messages').to.have.lengthOf(2);
      node.expect(res.body).to.have.property('participants').to.have.lengthOf(2);
      node.expect(res.body.participants[0].address).to.equal(sender.address);
      node.expect(res.body.participants[0].publicKey).to.equal(sender.publicKey.toString('hex'));
      node.expect(res.body.participants[1].address).to.equal(recipient1.address);
      node.expect(res.body.participants[1].publicKey).to.equal(recipient1.publicKey.toString('hex'));
      done();
    }, {
      offset: 1
    });
  });

  it('should return the messages between sender and recipient1 with an orderBy=timestamp:desc', function (done) {
    getMessages(sender.address, recipient1.address, function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.ok;
      node.expect(res.body).to.have.property('count').to.equal('3');
      node.expect(res.body).to.have.property('messages').to.have.lengthOf(3);
      node.expect(res.body).to.have.property('participants').to.have.lengthOf(2);
      node.expect(res.body.participants[0].address).to.equal(sender.address);
      node.expect(res.body.participants[0].publicKey).to.equal(sender.publicKey.toString('hex'));
      node.expect(res.body.participants[1].address).to.equal(recipient1.address);
      node.expect(res.body.participants[1].publicKey).to.equal(recipient1.publicKey.toString('hex'));
      let pTimestamp = res.body.messages[0].timestamp;
      for (let i = 1; i < res.body.messages.length; i++) {
        node.expect(res.body.messages[i]).to.have.property('timestamp').to.be.below(pTimestamp);
      }
      done();
    }, {
      orderBy: 'timestamp:desc'
    });
  });

  it('should return the messages between sender and recipient1 with an orderBy=timestamp:asc', function (done) {
    getMessages(sender.address, recipient1.address, function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.ok;
      node.expect(res.body).to.have.property('count').to.equal('3');
      node.expect(res.body).to.have.property('messages').to.have.lengthOf(3);
      node.expect(res.body).to.have.property('participants').to.have.lengthOf(2);
      node.expect(res.body.participants[0].address).to.equal(sender.address);
      node.expect(res.body.participants[0].publicKey).to.equal(sender.publicKey.toString('hex'));
      node.expect(res.body.participants[1].address).to.equal(recipient1.address);
      node.expect(res.body.participants[1].publicKey).to.equal(recipient1.publicKey.toString('hex'));
      let pTimestamp = res.body.messages[0].timestamp;
      for (let i = 1; i < res.body.messages.length; i++) {
        node.expect(res.body.messages[i]).to.have.property('timestamp').to.be.above(pTimestamp);
      }
      done();
    }, {
      orderBy: 'timestamp:asc'
    });
  });

  it('should return the messages between sender and recipient1 without direct transfers', function (done) {
    getMessages(sender.address, recipient1.address, function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.ok;
      node.expect(res.body).to.have.property('count').to.equal('2');
      node.expect(res.body).to.have.property('messages').to.have.lengthOf(2);
      node.expect(res.body).to.have.property('participants').to.have.lengthOf(2);
      node.expect(res.body.participants[0].address).to.equal(sender.address);
      node.expect(res.body.participants[0].publicKey).to.equal(sender.publicKey.toString('hex'));
      node.expect(res.body.participants[1].address).to.equal(recipient1.address);
      node.expect(res.body.participants[1].publicKey).to.equal(recipient1.publicKey.toString('hex'));
      done();
    }, {
      withoutDirectTransfers: true
    });
  });

  it('should return the messages between sender and recipient1 without direct transfers with a limit', function (done) {
    getMessages(sender.address, recipient1.address, function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.ok;
      node.expect(res.body).to.have.property('count').to.equal('2');
      node.expect(res.body).to.have.property('messages').to.have.lengthOf(1);
      node.expect(res.body).to.have.property('participants').to.have.lengthOf(2);
      node.expect(res.body.participants[0].address).to.equal(sender.address);
      node.expect(res.body.participants[0].publicKey).to.equal(sender.publicKey.toString('hex'));
      node.expect(res.body.participants[1].address).to.equal(recipient1.address);
      node.expect(res.body.participants[1].publicKey).to.equal(recipient1.publicKey.toString('hex'));
      done();
    }, {
      withoutDirectTransfers: true,
      limit: 1
    });
  });

  it('should return the messages between sender and recipient1 without direct transfers with an offset', function (done) {
    getMessages(sender.address, recipient1.address, function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.ok;
      node.expect(res.body).to.have.property('count').to.equal('2');
      node.expect(res.body).to.have.property('messages').to.have.lengthOf(1);
      node.expect(res.body).to.have.property('participants').to.have.lengthOf(2);
      node.expect(res.body.participants[0].address).to.equal(sender.address);
      node.expect(res.body.participants[0].publicKey).to.equal(sender.publicKey.toString('hex'));
      node.expect(res.body.participants[1].address).to.equal(recipient1.address);
      node.expect(res.body.participants[1].publicKey).to.equal(recipient1.publicKey.toString('hex'));
      done();
    }, {
      withoutDirectTransfers: true,
      offset: 1
    });
  });

  it('should return the messages between sender and recipient1 without direct transfers with an orderBy=timestamp:desc', function (done) {
    getMessages(sender.address, recipient1.address, function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.ok;
      node.expect(res.body).to.have.property('count').to.equal('2');
      node.expect(res.body).to.have.property('messages').to.have.lengthOf(2);
      node.expect(res.body).to.have.property('participants').to.have.lengthOf(2);
      node.expect(res.body.participants[0].address).to.equal(sender.address);
      node.expect(res.body.participants[0].publicKey).to.equal(sender.publicKey.toString('hex'));
      node.expect(res.body.participants[1].address).to.equal(recipient1.address);
      node.expect(res.body.participants[1].publicKey).to.equal(recipient1.publicKey.toString('hex'));
      let pTimestamp = res.body.messages[0].timestamp;
      for (let i = 1; i < res.body.messages.length; i++) {
        node.expect(res.body.messages[i]).to.have.property('timestamp').to.be.below(pTimestamp);
      }
      done();
    }, {
      withoutDirectTransfers: true,
      orderBy: 'timestamp:desc'
    });
  });

  it('should return the messages between sender and recipient1 without direct transfers with an orderBy=timestamp:asc', function (done) {
    getMessages(sender.address, recipient1.address, function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.ok;
      node.expect(res.body).to.have.property('count').to.equal('2');
      node.expect(res.body).to.have.property('messages').to.have.lengthOf(2);
      node.expect(res.body).to.have.property('participants').to.have.lengthOf(2);
      node.expect(res.body.participants[0].address).to.equal(sender.address);
      node.expect(res.body.participants[0].publicKey).to.equal(sender.publicKey.toString('hex'));
      node.expect(res.body.participants[1].address).to.equal(recipient1.address);
      node.expect(res.body.participants[1].publicKey).to.equal(recipient1.publicKey.toString('hex'));
      let pTimestamp = res.body.messages[0].timestamp;
      for (let i = 1; i < res.body.messages.length; i++) {
        node.expect(res.body.messages[i]).to.have.property('timestamp').to.be.above(pTimestamp);
      }
      done();
    }, {
      withoutDirectTransfers: true,
      orderBy: 'timestamp:asc'
    });
  });
});
