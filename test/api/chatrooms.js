'use strict';

const node = require('./../node.js');
const Mnemonic = require('bitcore-mnemonic');

function sendADM (params, done) {
    node.put('/api/transactions/', params, function (err, res) {
        done(err, res);
    });
}

function postMessage (transaction, done) {
    node.post('/api/transactions', { transaction: transaction }, done);
}

function getChats (senderId, done) {
    node.get( `/api/chatrooms/${senderId}`, done);
}

function getMessages (authorId, companionId, done) {
    node.get( `/api/chatrooms/${authorId}/${companionId}`, done);
}

describe('GET /api/chatrooms/:ID/:ID', function () {
    const sender = node.randomAccount();
    const recipient1 = node.randomAccount();
    const recipient2 = node.randomAccount();

    // send ADM to message sender
    before(function (done) {
        sendADM({
            secret: node.gAccount.password,
            amount: 100000000000,
            recipientId: sender.address
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

    it('should return the chats list for a valid transaction', function (done) {
        getChats(sender.address, function (err, res) {
            node.expect(res.body).to.have.property('success').to.be.ok;
            node.expect(res.body).to.have.property('count');
            node.expect(res.body).to.have.property('chats').to.have.lengthOf(2);
            done();
        });
    });

    it('should return the messages list for a valid transaction', function (done) {
        getMessages(sender.address, recipient1.address, function (err, res) {
            node.expect(res.body).to.have.property('success').to.be.ok;
            node.expect(res.body).to.have.property('count');
            node.expect(res.body).to.have.property('messages').to.have.lengthOf(2);
            node.expect(res.body).to.have.property('participants').to.have.lengthOf(2);
            done();
        });
    });
});