'use strict';

const { expect } = require('chai');

const node = require('./../node.js');

const { iAccount } = require('../common/stubs/account.js');
const transactionTypes = require('../../helpers/transactionTypes.js');

function getTransactions (params, done) {
  const args = Object.keys(params).map((key) => `${key}=${params[key]}`);
  node.get(`/api/chats/get${args.length > 0 ?'?' + args.join('&') : ''}`, done);
}

const test = it;

describe('GET /api/chats/get', () => {
  describe('?withoutDirectTransfers', () => {
    it('should return transactions only with chat message type by default', (done) => {
      getTransactions({ senderId: iAccount.address }, (err, response) => {
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
      getTransactions({ senderId: iAccount.address, withoutDirectTransfers: 0 }, (err, response) => {
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
          getTransactions({ senderId: iAccount.address, withoutDirectTransfers: value }, (err, response) => {
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
