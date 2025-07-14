const { expect } = require('chai');
const { removeQueuedJobs } = require('../../common/globalAfter.js');

const TransactionPool = require('../../../logic/transactionPool.js');

describe('TransactionPool', () => {
  let transactionPool;

  const singleTransaction = {
    id: '17190511997607511181',
    senderPublicKey:
      '108f664525da4610f54d6c366a1533fef081ca0eb322c470efb29c0bd250d0a0',
    receivedAt: new Date(),
  };

  const someTransactions = [
    {
      id: '16207561138663598511',
      senderPublicKey:
        'b80bb6459608dcdeb9a98d1f2b0111b2bf11e53ef2933e6769bb0198e3a97aae',
      receivedAt: new Date(),
    },
    {
      id: '8787084714365585523',
      senderPublicKey:
        'b0b4d346382aa07b23c0b733d040424532201b9eb22004b66a79d4b44e9d1449',
      receivedAt: new Date(),
    },
    {
      id: '14422771217432719682',
      senderPublicKey:
        'cef765962b59710195fe09f1f7fa6968dd0f12324447c0ce62779c8f7fefd5fb',
      receivedAt: new Date(),
    },
  ];

  beforeEach(() => removeQueuedJobs());

  beforeEach(() => {
    transactionPool = new TransactionPool(
      1000,
      10,
      {},
      1000,
      { message: () => {} },
      console
    );
  });

  afterEach(() => removeQueuedJobs());

  describe('addUnconfirmedTransaction()', () => {
    it('should add a new transaction in empty list', () => {
      expect(transactionPool.getUnconfirmedTransactionList()).to.be.empty;

      transactionPool.addUnconfirmedTransaction(singleTransaction);
      expect(transactionPool.getUnconfirmedTransactionList()).to.eql([
        singleTransaction,
      ]);
    });

    it('should add new transactions and not duplicate them', () => {
      transactionPool.addUnconfirmedTransaction(singleTransaction);
      transactionPool.addUnconfirmedTransaction(singleTransaction);
      expect(transactionPool.getUnconfirmedTransactionList()).to.have.lengthOf(
        1
      );

      someTransactions.forEach((trx) =>
        transactionPool.addUnconfirmedTransaction(trx)
      );
      expect(transactionPool.getUnconfirmedTransactionList()).to.have.lengthOf(
        1 + someTransactions.length
      );
    });
  });

  describe('removeUnconfirmedTransaction()', () => {
    it('should remove an existing transaction by ID', () => {
      transactionPool.addUnconfirmedTransaction(singleTransaction);
      expect(
        transactionPool.getUnconfirmedTransaction(singleTransaction.id)
      ).to.eql(singleTransaction);

      transactionPool.removeUnconfirmedTransaction(singleTransaction.id);
      expect(transactionPool.getUnconfirmedTransaction(singleTransaction.id)).to
        .be.undefined;
      expect(transactionPool.getUnconfirmedTransactionList()).to.be.empty;
    });

    it('should remove just one transaction from a bigger list', () => {
      [singleTransaction, ...someTransactions].forEach((trx) =>
        transactionPool.addUnconfirmedTransaction(trx)
      );
      expect(transactionPool.getUnconfirmedTransactionList()).to.have.lengthOf(
        1 + someTransactions.length
      );

      transactionPool.removeUnconfirmedTransaction(someTransactions[1].id);

      const remaining = transactionPool.getUnconfirmedTransactionList();
      expect(remaining).to.not.include(someTransactions[1]);
      expect(remaining).to.include(someTransactions[0]);
      expect(remaining).to.include(singleTransaction);
    });
  });

  describe('transactionInPool()', () => {
    it('should return false when the pool is empty', () => {
      expect(transactionPool.transactionInPool(singleTransaction.id)).to.be
        .false;
    });

    it('should return true for unconfirmed transactions in the pool', () => {
      transactionPool.addUnconfirmedTransaction(singleTransaction);
      expect(transactionPool.transactionInPool(singleTransaction.id)).to.be
        .true;
    });

    it('should return true for bundled transactions in the pool', () => {
      transactionPool.addBundledTransaction(singleTransaction);
      expect(transactionPool.transactionInPool(singleTransaction.id)).to.be
        .true;
    });

    it('should return true for queued transactions in the pool', () => {
      transactionPool.addQueuedTransaction(singleTransaction);
      expect(transactionPool.transactionInPool(singleTransaction.id)).to.be
        .true;
    });

    it('should return true for multisignature transactions in the pool', () => {
      transactionPool.addMultisignatureTransaction(singleTransaction);
      expect(transactionPool.transactionInPool(singleTransaction.id)).to.be
        .true;
    });
  });

  describe('Bundled transactions', () => {
    describe('addBundledTransaction()', () => {
      it('should add a bundled transaction', () => {
        expect(transactionPool.countBundled()).to.equal(0);
        transactionPool.addBundledTransaction(singleTransaction);
        expect(transactionPool.countBundled()).to.equal(1);
        expect(transactionPool.getBundledTransactionList()).to.eql([
          singleTransaction,
        ]);
      });

      it('should not add the same bundled transaction twice', () => {
        transactionPool.addBundledTransaction(singleTransaction);
        transactionPool.addBundledTransaction(singleTransaction);
        expect(transactionPool.countBundled()).to.equal(1);
      });
    });

    describe('removeBundledTransaction()', () => {
      it('should remove an existing bundled transaction by ID', () => {
        transactionPool.addBundledTransaction(singleTransaction);
        expect(transactionPool.countBundled()).to.equal(1);

        transactionPool.removeBundledTransaction(singleTransaction.id);
        expect(transactionPool.countBundled()).to.equal(0);
        expect(transactionPool.getBundledTransactionList()).to.eql([]);
      });
    });

    describe('getBundledTransactionList()', () => {
      it('should return an empty list if none are bundled', () => {
        expect(transactionPool.getBundledTransactionList()).to.be.empty;
      });

      it('should retrieve a reversed sub-list', () => {
        someTransactions.forEach((tx) =>
          transactionPool.addBundledTransaction(tx)
        );

        const normalOrder = transactionPool.getBundledTransactionList(false);
        expect(normalOrder).to.eql(someTransactions);

        const reversed = transactionPool.getBundledTransactionList(true);
        expect(reversed).to.eql([...someTransactions].reverse());

        const limited = transactionPool.getBundledTransactionList(false, 2);
        expect(limited).to.have.lengthOf(2);
        expect(limited).to.eql(someTransactions.slice(0, 2));
      });
    });
  });

  describe('Queued transactions', () => {
    describe('addQueuedTransaction()', () => {
      it('should add a queued transaction', () => {
        expect(transactionPool.countQueued()).to.equal(0);
        transactionPool.addQueuedTransaction(singleTransaction);
        expect(transactionPool.countQueued()).to.equal(1);
        expect(transactionPool.getQueuedTransactionList()).to.eql([
          singleTransaction,
        ]);
      });

      it('should not add the same queued transaction twice', () => {
        transactionPool.addQueuedTransaction(singleTransaction);
        transactionPool.addQueuedTransaction(singleTransaction);
        expect(transactionPool.countQueued()).to.equal(1);
      });
    });

    describe('removeQueuedTransaction()', () => {
      it('should remove the queued transaction by ID', () => {
        transactionPool.addQueuedTransaction(singleTransaction);
        expect(transactionPool.countQueued()).to.equal(1);

        transactionPool.removeQueuedTransaction(singleTransaction.id);
        expect(transactionPool.countQueued()).to.equal(0);
      });
    });

    describe('getQueuedTransactionList()', () => {
      it('should return an empty list if none are queued', () => {
        expect(transactionPool.getQueuedTransactionList()).to.be.empty;
      });

      it('should retrieve a reversed sub-list', () => {
        someTransactions.forEach((tx) =>
          transactionPool.addQueuedTransaction(tx)
        );

        const normalOrder = transactionPool.getQueuedTransactionList(false);
        expect(normalOrder).to.eql(someTransactions);

        const reversed = transactionPool.getQueuedTransactionList(true);
        expect(reversed).to.eql([...someTransactions].reverse());

        const limited = transactionPool.getQueuedTransactionList(false, 2);
        expect(limited).to.have.lengthOf(2);
        expect(limited).to.eql(someTransactions.slice(0, 2));
      });
    });
  });

  describe('Multisignature transactions', () => {
    describe('addMultisignatureTransaction()', () => {
      it('should add a multisignature transaction', () => {
        expect(transactionPool.countMultisignature()).to.equal(0);
        transactionPool.addMultisignatureTransaction(singleTransaction);
        expect(transactionPool.countMultisignature()).to.equal(1);
      });

      it('should not add the same multisignature transaction twice', () => {
        transactionPool.addMultisignatureTransaction(singleTransaction);
        transactionPool.addMultisignatureTransaction(singleTransaction);
        expect(transactionPool.countMultisignature()).to.equal(1);
      });
    });

    describe('removeMultisignatureTransaction()', () => {
      it('should remove the multisignature transaction by ID', () => {
        transactionPool.addMultisignatureTransaction(singleTransaction);
        expect(transactionPool.countMultisignature()).to.equal(1);

        transactionPool.removeMultisignatureTransaction(singleTransaction.id);
        expect(transactionPool.countMultisignature()).to.equal(0);
      });
    });

    describe('getMultisignatureTransactionList()', () => {
      it('should return an empty list if none are multisignature', () => {
        expect(transactionPool.getMultisignatureTransactionList(false, false))
          .to.be.empty;
      });

      it('should retrieve a reversed sub-list', () => {
        someTransactions.forEach((tx) =>
          transactionPool.addMultisignatureTransaction(tx)
        );

        const normalOrder = transactionPool.getMultisignatureTransactionList(
          false,
          false
        );
        expect(normalOrder).to.eql(someTransactions);

        const reversed = transactionPool.getMultisignatureTransactionList(
          true,
          false
        );
        expect(reversed).to.eql([...someTransactions].reverse());
      });

      it('should filter out only `ready` multisignature transactions', () => {
        const multiTxs = [
          { id: someTransactions[0].id, ready: false },
          { id: someTransactions[1].id, ready: true },
          { id: someTransactions[2].id, ready: true },
        ];
        multiTxs.forEach((tx) =>
          transactionPool.addMultisignatureTransaction(tx)
        );

        const readyOnly = transactionPool.getMultisignatureTransactionList(
          false,
          true
        );
        expect(readyOnly).to.have.lengthOf(2);
        expect(readyOnly.map((t) => t.id)).to.eql([
          someTransactions[1].id,
          someTransactions[2].id,
        ]);
      });
    });
  });

  describe('countUnconfirmed()', () => {
    it('should return 0 when there are no unconfirmed transactions', () => {
      expect(transactionPool.countUnconfirmed()).to.equal(0);
    });

    it('should return correct count for unconfirmed transactions', () => {
      someTransactions.forEach((tx) =>
        transactionPool.addUnconfirmedTransaction(tx)
      );
      expect(transactionPool.countUnconfirmed()).to.equal(
        someTransactions.length
      );
    });
  });
});
