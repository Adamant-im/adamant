'use strict';

const { expect } = require('chai');

const node = require('./../node.js');

const { iAccount } = require('../common/stubs/account.js');
const transactionTypes = require('../../helpers/transactionTypes.js');

function getTransactions(params, done) {
  const queryString = new URLSearchParams(params).toString();
  node.get(`/api/chats/get${queryString ? `?${queryString}` : ''}`, done);
}

const test = it;

describe('GET /api/chats/get', () => {
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
});
