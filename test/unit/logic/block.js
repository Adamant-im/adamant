"use strict";

const chai = require("chai");
const expect = chai.expect;

const Block = require("../../../logic/block.js");
const { modulesLoader } = require("../../common/initModule.js");

const transactionTypes = require("../../../helpers/transactionTypes.js");
const Transfer = require("../../../logic/transfer.js");
const Chat = require("../../../logic/chat.js");

const ed = require("../../../helpers/ed.js");

const {
  validBlock,
  validPreviousBlock,
  firstTransfer,
  secondTransfer,
  firstMessage,
  secondMessage,
} = require("../../common/stubs/blocks.js");
const { delegateKeyPair } = require("../../common/stubs/delegate.js");

describe("Block", function () {
  let block;

  beforeEach(function (done) {
    modulesLoader.initLogic(
      Block,
      {
        db: {},
        ed: ed,
        schema: modulesLoader.scope.schema,
        genesisBlock: {},
        logger: {},
      },
      function (err, result) {
        block = result;

        const { transaction } = block.scope;
        const transfer = new Transfer();
        const chat = new Chat();
        transaction.attachAssetType(transactionTypes.SEND, transfer);
        transaction.attachAssetType(transactionTypes.CHAT_MESSAGE, chat);

        done();
      }
    );
  });

  describe("create", function () {
    it("should create a new block with sorted transactions", function () {
      const newBlock = block.create({
        transactions: [
          firstMessage,
          secondTransfer,
          firstTransfer,
          secondMessage,
        ],
        previousBlock: validPreviousBlock,
        timestamp: validBlock.timestamp,
        keypair: delegateKeyPair,
      });

      const propertiesToCheck = [
        "numberOfTransactions",
        "totalAmount",
        "totalFee",
        "payloadLength",
        "previousBlock",
        "generatorPublicKey",
        "blockSignature",
      ];

      propertiesToCheck.forEach((property) => {
        expect(newBlock).to.have.property(property, validBlock[property]);
      });

      expect(newBlock.transactions).to.deep.equal([
        firstTransfer,
        secondTransfer,
        firstMessage,
        secondMessage,
      ]);
    });

    it("should create a new block with no transactions", () => {
      const newBlock = block.create({
        transactions: [],
        previousBlock: validPreviousBlock,
        timestamp: validBlock.timestamp,
        keypair: delegateKeyPair,
      });

      expect(newBlock.numberOfTransactions).to.equal(0);
      expect(newBlock.totalAmount).to.equal(0);
      expect(newBlock.totalFee).to.equal(0);
      expect(newBlock.previousBlock).to.equal(validPreviousBlock.id);
      expect(newBlock.payloadLength).to.equal(0);
      expect(newBlock.generatorPublicKey).to.equal(
        "f4011a1360ac2769e066c789acaaeffa9d707690d4d3f6085a7d52756fbc30d0"
      );
      expect(newBlock.blockSignature).to.equal(
        "d4ba6d52a3ff583eae43fdff1e1e8f34603f84a1385fe765c1ebd89158560a4df1bd82f3de17ff09841c16651b8afafb1c8fa99b7c1f9e4bd2a61b6780ea6200"
      );
      expect(newBlock.transactions).to.deep.equal([]);
    });
  });

  describe("verifySignature", () => {
    it("should return true for a valid block with reward and total fee", () => {
      const validBlock = {
        id: "11114690216332606721",
        version: 0,
        timestamp: 61741820,
        height: 10873829,
        previousBlock: "11483763337863654141",
        numberOfTransactions: 1,
        totalAmount: 10000000,
        totalFee: 50000000,
        reward: 45000000,
        payloadLength: 117,
        payloadHash:
          "f7c0fa338a3a848119cad999d8035ab3fcb3d274a4555e141ebeb86205e41345",
        generatorPublicKey:
          "134a5de88c7da1ec71e75b5250d24168c6c6e3965ff16bd71497bd015d40ea6a",
        generatorId: "U3238410389688281135",
        blockSignature:
          "18607b15417a6b0a56b4c74cacd713ad7a10df16ec3ab45a697fa72b6f811f9213d895b7e0fbca71cf74323d60148d0991668e5368386408f4d841496ed2280d",
        confirmations: 1093,
        totalForged: "95000000",
      };
      const hasValidSignature = block.verifySignature(validBlock);
      expect(hasValidSignature).to.equal(true);
    });

    it("should return true for a valid block with many transactions", () => {
      const validBlock = {
        id: "6438017970172540087",
        version: 0,
        timestamp: 0,
        height: 1,
        previousBlock: null,
        numberOfTransactions: 205,
        totalAmount: 9800000000000000,
        totalFee: 0,
        reward: 0,
        payloadLength: 687606,
        payloadHash:
          "38f153a81332dea86751451fd992df26a9249f0834f72f58f84ac31cceb70f43",
        generatorPublicKey:
          "b80bb6459608dcdeb9a98d1f2b0111b2bf11e53ef2933e6769bb0198e3a97aae",
        generatorId: "U15365455923155964650",
        blockSignature:
          "108db6fed83519acf9f8ea3521d73b0b1496317bd9e9f00bc21ddf3a7338f1941bd20a60118e90f407a1b955d5ff36a81252645cd76d77466f52bd0d1434fe0a",
        confirmations: 75213,
        totalForged: "0",
      };
      const hasValidSignature = block.verifySignature(validBlock);
      expect(hasValidSignature).to.equal(true);
    });

    it("should return true for a valid block with 0 transactions", () => {
      const validBlock = {
        id: "12886437182438275909",
        version: 0,
        timestamp: 223763900,
        height: 2,
        previousBlock: "6438017970172540087",
        numberOfTransactions: 0,
        totalAmount: 0,
        totalFee: 0,
        reward: 0,
        payloadLength: 0,
        payloadHash:
          "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        generatorPublicKey:
          "1936631c26631ccc22b93238c387058fc2be6b915234aa4a035c069803e9a15a",
        generatorId: "U5090748236497587482",
        blockSignature:
          "3f4feaf57fb297d97ebf2ba0dcf3c91b1ebd42e2d8b370c5b11a7b6cb5b798f930e8445056e2b67f173340a55db65b97a6cd953e11ffda93c7009fdd0f076902",
        confirmations: 75212,
        totalForged: "0",
      };
      const hasValidSignature = block.verifySignature(validBlock);
      expect(hasValidSignature).to.equal(true);
    });

    it("should return false for a block with false amount of transactions", () => {
      const validBlock = {
        id: "6438017970172540087",
        version: 0,
        timestamp: 0,
        height: 1,
        previousBlock: null,
        numberOfTransactions: 5,
        totalAmount: 9800000000000000,
        totalFee: 0,
        reward: 0,
        payloadLength: 687606,
        payloadHash:
          "38f153a81332dea86751451fd992df26a9249f0834f72f58f84ac31cceb70f43",
        generatorPublicKey:
          "b80bb6459608dcdeb9a98d1f2b0111b2bf11e53ef2933e6769bb0198e3a97aae",
        generatorId: "U15365455923155964650",
        blockSignature:
          "108db6fed83519acf9f8ea3521d73b0b1496317bd9e9f00bc21ddf3a7338f1941bd20a60118e90f407a1b955d5ff36a81252645cd76d77466f52bd0d1434fe0a",
        confirmations: 75213,
        totalForged: "0",
      };
      const hasValidSignature = block.verifySignature(validBlock);
      expect(hasValidSignature).to.equal(false);
    });

    it("should return false for a block with wrong signature", () => {
      const validBlock = {
        id: "6438017970172540087",
        version: 0,
        timestamp: 0,
        height: 1,
        previousBlock: null,
        numberOfTransactions: 205,
        totalAmount: 9800000000000000,
        totalFee: 0,
        reward: 0,
        payloadLength: 687606,
        payloadHash:
          "38f153a81332dea86751451fd992df26a9249f0834f72f58f84ac31cceb70f43",
        generatorPublicKey:
          "b80bb6459608dcdeb9a98d1f2b0111b2bf11e53ef2933e6769bb0198e3a97aae",
        generatorId: "U15365455923155964650",
        blockSignature:
          "3f4feaf57fb297d97ebf2ba0dcf3c91b1ebd42e2d8b370c5b11a7b6cb5b798f930e8445056e2b67f173340a55db65b97a6cd953e11ffda93c7009fdd0f076902",
        confirmations: 75213,
        totalForged: "0",
      };
      const hasValidSignature = block.verifySignature(validBlock);
      expect(hasValidSignature).to.equal(false);
    });

    it("should return false for a block with wrong generatorPublicKey", () => {
      const validBlock = {
        id: "6438017970172540087",
        version: 0,
        timestamp: 0,
        height: 1,
        previousBlock: null,
        numberOfTransactions: 205,
        totalAmount: 9800000000000000,
        totalFee: 0,
        reward: 0,
        payloadLength: 687606,
        payloadHash:
          "38f153a81332dea86751451fd992df26a9249f0834f72f58f84ac31cceb70f43",
        generatorPublicKey:
          "1936631c26631ccc22b93238c387058fc2be6b915234aa4a035c069803e9a15a",
        generatorId: "U15365455923155964650",
        blockSignature:
          "108db6fed83519acf9f8ea3521d73b0b1496317bd9e9f00bc21ddf3a7338f1941bd20a60118e90f407a1b955d5ff36a81252645cd76d77466f52bd0d1434fe0a",
        confirmations: 75213,
        totalForged: "0",
      };
      const hasValidSignature = block.verifySignature(validBlock);
      expect(hasValidSignature).to.equal(false);
    });

    it("should return false for a block with wrong timestamp", () => {
      const validBlock = {
        id: "12886437182438275909",
        version: 0,
        timestamp: 23000000,
        height: 2,
        previousBlock: "6438017970172540087",
        numberOfTransactions: 0,
        totalAmount: 0,
        totalFee: 0,
        reward: 0,
        payloadLength: 0,
        payloadHash:
          "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        generatorPublicKey:
          "1936631c26631ccc22b93238c387058fc2be6b915234aa4a035c069803e9a15a",
        generatorId: "U5090748236497587482",
        blockSignature:
          "3f4feaf57fb297d97ebf2ba0dcf3c91b1ebd42e2d8b370c5b11a7b6cb5b798f930e8445056e2b67f173340a55db65b97a6cd953e11ffda93c7009fdd0f076902",
        confirmations: 75212,
        totalForged: "0",
      };
      const hasValidSignature = block.verifySignature(validBlock);
      expect(hasValidSignature).to.equal(false);
    });

    it("should return false for a block with wrong total amount", () => {
      const validBlock = {
        id: "6438017970172540087",
        version: 0,
        timestamp: 0,
        height: 1,
        previousBlock: null,
        numberOfTransactions: 205,
        totalAmount: 0,
        totalFee: 0,
        reward: 0,
        payloadLength: 687606,
        payloadHash:
          "38f153a81332dea86751451fd992df26a9249f0834f72f58f84ac31cceb70f43",
        generatorPublicKey:
          "b80bb6459608dcdeb9a98d1f2b0111b2bf11e53ef2933e6769bb0198e3a97aae",
        generatorId: "U15365455923155964650",
        blockSignature:
          "108db6fed83519acf9f8ea3521d73b0b1496317bd9e9f00bc21ddf3a7338f1941bd20a60118e90f407a1b955d5ff36a81252645cd76d77466f52bd0d1434fe0a",
        confirmations: 75213,
        totalForged: "0",
      };
      const hasValidSignature = block.verifySignature(validBlock);
      expect(hasValidSignature).to.equal(false);
    });

    it("should return false for a block with wrong total fee", () => {
      const validBlock = {
        id: "6438017970172540087",
        version: 0,
        timestamp: 0,
        height: 1,
        previousBlock: null,
        numberOfTransactions: 205,
        totalAmount: 9800000000000000,
        totalFee: 10,
        reward: 0,
        payloadLength: 687606,
        payloadHash:
          "38f153a81332dea86751451fd992df26a9249f0834f72f58f84ac31cceb70f43",
        generatorPublicKey:
          "b80bb6459608dcdeb9a98d1f2b0111b2bf11e53ef2933e6769bb0198e3a97aae",
        generatorId: "U15365455923155964650",
        blockSignature:
          "108db6fed83519acf9f8ea3521d73b0b1496317bd9e9f00bc21ddf3a7338f1941bd20a60118e90f407a1b955d5ff36a81252645cd76d77466f52bd0d1434fe0a",
        confirmations: 75213,
        totalForged: "0",
      };
      const hasValidSignature = block.verifySignature(validBlock);
      expect(hasValidSignature).to.equal(false);
    });

    it("should return false for a block with wrong reward amount", () => {
      const validBlock = {
        id: "6438017970172540087",
        version: 0,
        timestamp: 0,
        height: 1,
        previousBlock: null,
        numberOfTransactions: 205,
        totalAmount: 9800000000000000,
        totalFee: 0,
        reward: 100,
        payloadLength: 687606,
        payloadHash:
          "38f153a81332dea86751451fd992df26a9249f0834f72f58f84ac31cceb70f43",
        generatorPublicKey:
          "b80bb6459608dcdeb9a98d1f2b0111b2bf11e53ef2933e6769bb0198e3a97aae",
        generatorId: "U15365455923155964650",
        blockSignature:
          "108db6fed83519acf9f8ea3521d73b0b1496317bd9e9f00bc21ddf3a7338f1941bd20a60118e90f407a1b955d5ff36a81252645cd76d77466f52bd0d1434fe0a",
        confirmations: 75213,
        totalForged: "0",
      };
      const hasValidSignature = block.verifySignature(validBlock);
      expect(hasValidSignature).to.equal(false);
    });
  });

  describe("objectNormalize", () => {
    it("should remove values with null and undefined properties", () => {
      const normalizedBlock = block.objectNormalize({
        ...validBlock,
        transactions: [],
        amount: null,
        confirmations: undefined,
      });
      expect(Object.keys(normalizedBlock)).to.not.include([
        "amount",
        "confirmations",
      ]);
    });

    it("should throw error on invalid block", () => {
      const transaction = firstTransfer;
      expect(() => block.objectNormalize(transaction)).to.throw(
        "Failed to validate block"
      );
    });

    it("should throw error on invalid transactions", () => {
      const blockWithInvalidTransactions = {
        ...validBlock,
        transactions: [
          {
            ...firstTransfer,
            amount: "Invalid value",
          },
        ],
      };

      expect(() =>
        block.objectNormalize(blockWithInvalidTransactions)
      ).to.throw("Failed to validate transaction");
    });
  });

  describe("getId", () => {
    it("should throw an error with no param", function () {
      expect(block.getId).to.throw();
    });

    it("should generate the id of the valid block", function () {
      expect(block.getId(validBlock))
        .to.be.a("string")
        .which.is.equal(validBlock.id);
    });

    it("should update id if a field in block value changes", function () {
      expect(
        block.getId({ ...validBlock, totalAmount: validBlock.totalAmount + 1 })
      ).to.not.equal(validBlock.id);
    });
  });

  describe("sign", () => {
    it("should throw an error with no param", function () {
      expect(block.sign).to.throw();
    });

    it("should generate the signature of the valid block", function () {
      expect(
        block.sign(
          { ...validBlock, blockSignature: undefined },
          delegateKeyPair
        )
      )
        .to.be.a("string")
        .which.is.equal(validBlock.blockSignature);
    });

    it("should update signature if a field in block value changes", function () {
      expect(
        block.sign(
          { ...validBlock, totalAmount: validBlock.totalAmount + 1 },
          delegateKeyPair
        )
      ).to.not.equal(validBlock.blockSignature);
    });
  });
});
