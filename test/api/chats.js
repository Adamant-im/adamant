'use strict';

const { expect } = require('chai');
const Mnemonic = require('bitcore-mnemonic');

const node = require('./../node.js');
const { postMessage, sendADM } = require('../common/api.js');

const transactionTypes = require('../../helpers/transactionTypes.js');

const { iAccount } = node;

function getTransactions(params, done) {
  const queryString = new URLSearchParams(params).toString();
  node.get(`/api/chats/get${queryString ? `?${queryString}` : ''}`, done);
}

const test = it;

describe('GET /api/chats/get', () => {
  const recipient = node.randomAccount();

  before(function (done) {
    const transaction = node.createChatTransaction({
      keyPair: iAccount.keypair,
      recipientId: recipient.address,
      message: new Mnemonic(Mnemonic.Words.ENGLISH).toString(),
      own_message: '',
      type: 1
    });
    postMessage(transaction, function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.true;
      node.expect(res.body).to.have.property('transactionId').that.is.not.empty;
      done();
    });
  });

  before(function (done) {
    sendADM({
      secret: iAccount.password,
      amount: node.fees.transactionFee,
      recipientId: recipient.address
    }, function () {
      done();
    });
  });

  before(function (done) {
    node.onNewBlock(function () {
      done();
    });
  });

  describe('?withoutDirectTransfers', () => {
    let options;

    beforeEach(() => {
      options = { senderId: iAccount.address };
    });

    it('should return transactions only with chat message type by default', (done) => {
      getTransactions(options, (err, response) => {
        expect(err).not.to.exist;
        expect(response.body)
          .to.have.property('transactions')
          .that.is.an('array')
          .that.is.not.empty;

        response.body.transactions.forEach((transaction) =>
          expect(transaction.type).to.equal(transactionTypes.CHAT_MESSAGE),
        );

        done();
      });
    });

    it('should return transactions of both chat message and transfer types when withoutDirectTransfers=0', (done) => {
      options.withoutDirectTransfers = 0;

      getTransactions(options, (err, response) => {
        expect(err).not.to.exist;
        expect(response.body)
          .to.have.property('transactions')
          .that.is.an('array')
          .that.is.not.empty;

        const hasChatMessage = response.body.transactions.some(
          (transaction) => transaction.type === transactionTypes.CHAT_MESSAGE,
        );
        const hasSend = response.body.transactions.some(
          (transaction) => transaction.type === transactionTypes.SEND,
        );

        expect(hasChatMessage).to.be.true;
        expect(hasSend).to.be.true;

        done();
      });
    });

    describe('should return transactions only with chat message type when', () => {
      const values = [
        1,
        123,
        'true',
        'Infinity',
        'string',
        '[]',
        '{}',
      ];

      values.forEach((value) => {
        test(`withoutDirectTransfers=${value}`, (done) => {
          options.withoutDirectTransfers = value;

          getTransactions(options, (err, response) => {
            expect(err).not.to.exist;
            expect(response.body)
              .to.have.property('transactions')
              .that.is.an('array')
              .that.is.not.empty;

            response.body.transactions.forEach((transaction) =>
              expect(transaction.type).to.equal(transactionTypes.CHAT_MESSAGE),
            );

            done();
          });
        });
      });
    });
  });

  describe('?includeDirectTransfers', () => {
    let options;

    beforeEach(() => {
      options = { senderId: iAccount.address };
    });

    it('should return transactions only with chat message type by default', (done) => {
      getTransactions(options, (err, response) => {
        expect(err).not.to.exist;
        expect(response.body)
          .to.have.property('transactions')
          .that.is.an('array')
          .that.is.not.empty;

        response.body.transactions.forEach((transaction) =>
          expect(transaction.type).to.equal(transactionTypes.CHAT_MESSAGE),
        );

        done();
      });
    });

    it('should return transactions of both chat message and transfer types when withoutDirectTransfers=0', (done) => {
      options.includeDirectTransfers = 1;

      getTransactions(options, (err, response) => {
        expect(err).not.to.exist;
        expect(response.body)
          .to.have.property('transactions')
          .that.is.an('array')
          .that.is.not.empty;

        const hasChatMessage = response.body.transactions.some(
          (transaction) => transaction.type === transactionTypes.CHAT_MESSAGE,
        );
        const hasSend = response.body.transactions.some(
          (transaction) => transaction.type === transactionTypes.SEND,
        );

        expect(hasChatMessage).to.be.true;
        expect(hasSend).to.be.true;

        done();
      });
    });

    describe('should return transactions only with chat message type when', () => {
      const values = [
        0,
      ];

      values.forEach((value) => {
        test(`includeDirectTransfers=${value}`, (done) => {
          options.includeDirectTransfers = value;

          getTransactions(options, (err, response) => {
            expect(err).not.to.exist;
            expect(response.body)
              .to.have.property('transactions')
              .that.is.an('array')
              .that.is.not.empty;

            response.body.transactions.forEach((transaction) =>
              expect(transaction.type).to.equal(transactionTypes.CHAT_MESSAGE),
            );

            done();
          });
        });
      });
    });
  });
});
