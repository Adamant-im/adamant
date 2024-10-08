"use strict";

const chai = require("chai");
const expect = chai.expect;
const sinon = require("sinon");

const Block = require("../../../logic/block.js");
const Transaction = require('../../../logic/transaction.js');
const {modulesLoader} = require('../../common/initModule.js')

const crypto = require("crypto");
const transactionTypes = require("../../../helpers/transactionTypes.js");
const Transfer = require("../../../logic/transfer.js");
const Chat = require("../../../logic/chat.js");

const ed = require('../../../helpers/ed.js');

const {validBlock, validPreviousBlock, validBlockTransactions} = require('../../common/stubs/blocks.js');
const { delegateKeyPair } = require('../../common/stubs/delegate.js');

describe("Block", function () {
  let block;
  let mockTransaction;

  beforeEach(function (done) {
    modulesLoader.initLogic(Block, {
      db: {},
      ed: ed,
      schema: {
        validate: () => true
      },
      genesisBlock: {},
      logger: {}
    }, function(err, result) {
      block = result;

      const {transaction} = block.scope;
      const transfer = new Transfer();
      const chat = new Chat();
      transaction.attachAssetType(transactionTypes.SEND, transfer);
      transaction.attachAssetType(transactionTypes.CHAT_MESSAGE, chat);

      done();
    });
  });

  describe("create", function () {
    const transactionsWithWrongOrder = [...validBlockTransactions].reverse();
    const createBlockData = {
      transactions: transactionsWithWrongOrder,
      previousBlock: validPreviousBlock,
      timestamp: validBlock.timestamp,
      keypair: delegateKeyPair
    };

    it("should create a new block with sorted transactions", function () {
      const newBlock = block.create(createBlockData);

      const propertiesToCheck = [
        'numberOfTransactions',
        'totalAmount',
        'totalFee',
        'payloadLength',
        'previousBlock',
        'generatorPublicKey',
        'blockSignature',
      ];

      propertiesToCheck.forEach((property) => {
        expect(newBlock).to.have.property(property, validBlock[property]);
      });

      expect(newBlock.transactions).to.deep.equal(validBlockTransactions);
    });
  });
});
