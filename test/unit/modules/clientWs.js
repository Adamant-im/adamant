'use strict';

var expect = require('chai').expect;
const TransactionType = require('../../../helpers/transactionTypes');

var TransactionSubscription = require('../../../modules/clientWs/transactionSubscription');

describe('TransactionSubscription', function () {
  /**
   * @type {TransactionSubscription}
   */
  let sub;

  beforeEach(function () {
    sub = new TransactionSubscription();
  });

  describe('subscribeToAddresses', function () {
    it('should ignore numbers', function () {
      const subscribed = sub.subscribeToAddresses(
        NaN,
        0,
        -1,
        8,
        Number.MAX_SAFE_INTEGER,
        Infinity,
        -Infinity
      );
      expect(subscribed).to.equal(false);
      expect(sub.addresses).to.deep.equal(new Set());
    });

    it('should ignore objects', function () {
      const subscribed = sub.subscribeToAddresses(
        {},
        [],
        new Set(),
        new Map()
      );
      expect(subscribed).to.equal(false);
      expect(sub.addresses).to.deep.equal(new Set());
    });

    it('should ignore boolean, undefined and null', function () {
      const subscribed = sub.subscribeToAddresses(
        true,
        false,
        undefined,
        null
      );
      expect(subscribed).to.equal(false);
      expect(sub.addresses).to.deep.equal(new Set());
    });

    it('should ignore invalid addresses', function () {
      const subscribed = sub.subscribeToAddresses(
        '',
        '777355171330060015',
        'U',
        'Uundefined',
        'u[object Object]',
        'Y777355171330060015'
      );
      expect(subscribed).to.equal(false);
      expect(sub.addresses).to.deep.equal(new Set());
    });

    it('should subscribe to valid addresses', function () {
      const subscribed = sub.subscribeToAddresses(
        'U777355171330060015',
        'U123456',
        'u4697606961271319613'
      );
      expect(subscribed).to.equal(true);
      expect(sub.addresses).to.deep.equal(
        new Set(['U777355171330060015', 'U123456', 'U4697606961271319613'])
      );
    });

    it('should not subscribe to duplicate addresses', function () {
      sub.subscribeToAddresses(
        'U777355171330060015',
        'u777355171330060015'
      );
      sub.subscribeToAddresses(
        'U777355171330060015'
      );
      expect(sub.addresses).to.deep.equal(
        new Set(['U777355171330060015'])
      );
    });
  });

  describe('subscribeToTypes', function() {
    it('should ignore invalid numbers', function () {
      const subscribed = sub.subscribeToTypes(
        NaN,
        -1,
        Number.MAX_SAFE_INTEGER,
        Infinity,
        -Infinity
      );
      expect(subscribed).to.equal(false);
      expect(sub.types).to.deep.equal(new Set());
    });

    it('should ignore objects', function () {
      const subscribed = sub.subscribeToTypes(
        {},
        [],
        new Set(),
        new Map()
      );
      expect(subscribed).to.equal(false);
      expect(sub.types).to.deep.equal(new Set());
    });

    it('should ignore boolean, undefined and null', function () {
      const subscribed = sub.subscribeToTypes(
        true,
        false,
        undefined,
        null
      );
      expect(subscribed).to.equal(false);
      expect(sub.types).to.deep.equal(new Set());
    });

    it('should ignore strings', function () {
      const subscribed = sub.subscribeToTypes(
        '',
        '8',
        'U777355171330060015',
        'undefined',
        '[object Object]',
      );
      expect(subscribed).to.equal(false);
      expect(sub.types).to.deep.equal(new Set());
    });

    it('should subscribe to valid types', function () {
      const subscribed = sub.subscribeToTypes(
        TransactionType.SEND,
        TransactionType.SIGNATURE,
        TransactionType.DELEGATE,
        TransactionType.VOTE,
        TransactionType.MULTI,
        TransactionType.DAPP,
        TransactionType.IN_TRANSFER,
        TransactionType.OUT_TRANSFER,
        TransactionType.CHAT_MESSAGE,
        TransactionType.STATE,
      );
      expect(subscribed).to.equal(true);
      expect(sub.types).to.deep.equal(
        new Set([
          TransactionType.SEND,
          TransactionType.SIGNATURE,
          TransactionType.DELEGATE,
          TransactionType.VOTE,
          TransactionType.MULTI,
          TransactionType.DAPP,
          TransactionType.IN_TRANSFER,
          TransactionType.OUT_TRANSFER,
          TransactionType.CHAT_MESSAGE,
          TransactionType.STATE,
        ])
      );
    });

    it('should not subscribe to duplicate types', function () {
      sub.subscribeToTypes(
        TransactionType.CHAT_MESSAGE,
        TransactionType.CHAT_MESSAGE,
      );
      sub.subscribeToTypes(
        TransactionType.CHAT_MESSAGE,
      );
      expect(sub.types).to.deep.equal(
        new Set([TransactionType.CHAT_MESSAGE])
      );
    });
  });

  describe('impliesTransaction', function () {
    const transaction = {
      id: '12154642911137703318',
      height: 3245671,
      blockId: '13885000778367150465',
      type: 8,
      block_timestamp: 23284520,
      timestamp: 23284514,
      senderPublicKey:
        'cdab95b082b9774bd975677c868261618c7ce7bea97d02e0f56d483e30c077b6',
      senderId: 'U15423595369615486571',
      recipientId: 'U12777528161244463452',
      recipientPublicKey:
        '738a15db24bd055d65a449dee27508708a2c6b8457c3033fb5f389ac0e3b4c9e',
      amount: 0,
      fee: 100000,
      signature:
        '8c846fbd41b84635283096bb5833745886760776a433bb050505aaf045efb0f97ce69cd9f108dc4e58392bb507848e1e75d6ea203e7c7904881c44d0f61e2901',
      signatures: [],
      confirmations: 8001268,
      asset: {
        chat: {
          message:
            '6ef39d1034b368bd731c7bcbaa820f0e501bbfb1d1b15e2ffa4bd8421836fe87be10e32342e183d3',
          own_message: 'a23419efa40a9e340741325d0f5db508959c330af51e37fe',
          type: 1,
        },
      },
    }

    it('should return true when subscribed only to the transaction type', function() {
      sub.subscribeToTypes(TransactionType.CHAT_MESSAGE);

      const implies = sub.impliesTransaction(transaction);

      expect(implies).to.equal(true);
    });

    it('should return false when subscribed to the unrelated transaction types', function() {
      sub.subscribeToTypes(
        TransactionType.SEND,
        TransactionType.SIGNATURE,
        TransactionType.DELEGATE,
        TransactionType.VOTE,
        TransactionType.MULTI,
        TransactionType.DAPP,
        TransactionType.IN_TRANSFER,
        TransactionType.OUT_TRANSFER,
        TransactionType.STATE,
      );

      const implies = sub.impliesTransaction(transaction);

      expect(implies).to.equal(false);
    });

    it('should return true when subscribed to the transaction recipientId address', function() {
      sub.subscribeToAddresses(transaction.recipientId);

      const implies = sub.impliesTransaction(transaction);

      expect(implies).to.equal(true);
    });

    it('should return true when subscribed to the transaction senderId address', function() {
      sub.subscribeToAddresses(transaction.senderId);

      const implies = sub.impliesTransaction(transaction);

      expect(implies).to.equal(true);
    });

    it('should return false when subscribed to the wrong address', function() {
      sub.subscribeToAddresses('U0');

      const implies = sub.impliesTransaction(transaction);

      expect(implies).to.equal(false);
    });

    it('should return true when subscribed to the transaction recipientId address and type', function() {
      sub.subscribeToAddresses(transaction.recipientId);
      sub.subscribeToTypes(TransactionType.CHAT_MESSAGE);

      const implies = sub.impliesTransaction(transaction);

      expect(implies).to.equal(true);
    });

    it('should return false when subscribed to the transaction type but wrong address', function() {
      sub.subscribeToTypes(TransactionType.CHAT_MESSAGE);
      sub.subscribeToAddresses('U0');

      const implies = sub.impliesTransaction(transaction);

      expect(implies).to.equal(false);
    });

    it('should return false when subscribed to the transaction recipientId but wrong type', function() {
      sub.subscribeToTypes(TransactionType.DELEGATE);
      sub.subscribeToAddresses(transaction.recipientId);

      const implies = sub.impliesTransaction(transaction);

      expect(implies).to.equal(false);
    });
  });
});
