'use strict';

const { expect } = require('chai');
const Mnemonic = require('bitcore-mnemonic');

const node = require('./../node.js');
const { postMessage, sendADM } = require('../common/api.js');

const transactionTypes = require('../../helpers/transactionTypes.js');

const { iAccount } = node;

function getTransactions (params, done) {
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
          expect(transaction.type).to.equal(transactionTypes.CHAT_MESSAGE)
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
            (transaction) => transaction.type === transactionTypes.CHAT_MESSAGE
        );
        const hasSend = response.body.transactions.some(
            (transaction) => transaction.type === transactionTypes.SEND
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
        '{}'
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
              expect(transaction.type).to.equal(transactionTypes.CHAT_MESSAGE)
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
          expect(transaction.type).to.equal(transactionTypes.CHAT_MESSAGE)
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
            (transaction) => transaction.type === transactionTypes.CHAT_MESSAGE
        );
        const hasSend = response.body.transactions.some(
            (transaction) => transaction.type === transactionTypes.SEND
        );

        expect(hasChatMessage).to.be.true;
        expect(hasSend).to.be.true;

        done();
      });
    });

    describe('should return transactions only with chat message type when', () => {
      const values = [
        0
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
              expect(transaction.type).to.equal(transactionTypes.CHAT_MESSAGE)
            );

            done();
          });
        });
      });
    });
  });

  describe('AND-only filters', () => {
    function transactionIds (body) {
      return body.transactions.map((transaction) => transaction.id).sort();
    }

    function getChatsQuery (params, done) {
      const query = Object.keys(params).map((key) => `${key}=${params[key]}`).join('&');
      node.get(`/api/chats/get?${query}`, done);
    }

    it('should apply and: filters the same way as plain filters', (done) => {
      getTransactions({ recipientId: recipient.address }, (err, plain) => {
        expect(err).not.to.exist;
        expect(plain.body).to.have.property('success').that.is.true;
        expect(plain.body.transactions).to.not.be.empty;

        getChatsQuery({ 'and:recipientId': recipient.address }, (prefixedErr, prefixed) => {
          expect(prefixedErr).not.to.exist;
          expect(prefixed.body).to.have.property('success').that.is.true;
          expect(transactionIds(prefixed.body)).to.deep.equal(transactionIds(plain.body));
          prefixed.body.transactions.forEach((transaction) => {
            expect(transaction.recipientId).to.equal(recipient.address);
          });
          done();
        });
      });
    });

    it('should apply senderId and recipientId together', (done) => {
      getTransactions({
        senderId: iAccount.address,
        recipientId: recipient.address
      }, (err, response) => {
        expect(err).not.to.exist;
        expect(response.body).to.have.property('success').that.is.true;
        expect(response.body.transactions).to.not.be.empty;

        getChatsQuery({
          'and:senderId': iAccount.address,
          'and:recipientId': recipient.address
        }, (prefixedErr, prefixed) => {
          expect(prefixedErr).not.to.exist;
          expect(prefixed.body).to.have.property('success').that.is.true;
          expect(transactionIds(prefixed.body)).to.deep.equal(transactionIds(response.body));
          prefixed.body.transactions.forEach((transaction) => {
            expect(transaction.senderId).to.equal(iAccount.address);
            expect(transaction.recipientId).to.equal(recipient.address);
          });
          done();
        });
      });
    });

    it('should apply and: pagination to the same page as plain pagination', (done) => {
      getTransactions({
        recipientId: recipient.address,
        includeDirectTransfers: 1,
        orderBy: 'timestamp:asc',
        limit: 1,
        offset: 1
      }, (err, plain) => {
        expect(err).not.to.exist;
        expect(plain.body).to.have.property('success').that.is.true;

        getChatsQuery({
          'and:recipientId': recipient.address,
          'and:includeDirectTransfers': 1,
          'and:orderBy': 'timestamp:asc',
          'and:limit': 1,
          'and:offset': 1
        }, (prefixedErr, prefixed) => {
          expect(prefixedErr).not.to.exist;
          expect(prefixed.body).to.have.property('success').that.is.true;
          expect(transactionIds(prefixed.body)).to.deep.equal(transactionIds(plain.body));
          expect(prefixed.body.count).to.equal(plain.body.count);
          expect(prefixed.body.transactions).to.have.lengthOf(1);
          done();
        });
      });
    });

    it('should apply toHeight and keep fromHeight exclusive of the lower bound', (done) => {
      getTransactions({ recipientId: recipient.address }, (err, response) => {
        expect(err).not.to.exist;
        const transaction = response.body.transactions[0];
        expect(transaction.height).to.be.above(1);

        getTransactions({
          recipientId: recipient.address,
          toHeight: transaction.height
        }, (includeErr, included) => {
          expect(includeErr).not.to.exist;
          expect(transactionIds(included.body)).to.include(transaction.id);

          getTransactions({
            recipientId: recipient.address,
            'and:toHeight': transaction.height - 1
          }, (excludeErr, excluded) => {
            expect(excludeErr).not.to.exist;
            expect(excluded.body).to.have.property('success').that.is.true;
            expect(transactionIds(excluded.body)).to.not.include(transaction.id);

            getTransactions({
              recipientId: recipient.address,
              fromHeight: transaction.height
            }, (fromErr, fromResponse) => {
              expect(fromErr).not.to.exist;
              expect(transactionIds(fromResponse.body)).to.not.include(transaction.id);
              done();
            });
          });
        });
      });
    });

    it('should reject nested filter values', (done) => {
      getChatsQuery({
        'returnUnconfirmed[nested]': 1
      }, (err, response) => {
        expect(err).not.to.exist;
        expect(response.body).to.have.property('success').that.is.false;
        expect(response.body.error).to.equal('Invalid value for parameter: returnUnconfirmed');
        done();
      });
    });

    it('should reject or: and filters the query does not apply', (done) => {
      getChatsQuery({ 'or:recipientId': recipient.address }, (err, response) => {
        expect(err).not.to.exist;
        expect(response.body).to.have.property('success').that.is.false;
        expect(response.body.error).to.equal('OR filters are not supported');

        getChatsQuery({
          recipientId: recipient.address,
          blockId: '1'
        }, (blockErr, blocked) => {
          expect(blockErr).not.to.exist;
          expect(blocked.body).to.have.property('success').that.is.false;
          expect(blocked.body.error).to.equal('Parameter is not supported: blockId');
          done();
        });
      });
    });
  });
});
