"use strict";

var chai = require("chai");
var expect = require("chai").expect;

const sinon = require("sinon");
var Account = require("../../../logic/account.js");

describe("account", function () {
  let account;

  beforeEach(function () {
    return new Promise((resolve) => {
      new Account(
        {
          db: {
            none: sinon.fake(),
            query: sinon.fake(),
          },
        },
        {},
        {},
        function (err, instance) {
          if (err) {
            return reject(err);
          }
          account = instance;
          resolve();
        }
      );
    });
  });

  describe("merge", function () {
    it("should update the account with a positive balance", function () {
      const result = account.merge("U1234", {
        balance: 150,
        publicKey:
          "a9407418dafb3c8aeee28f3263fd55bae0f528a5697a9df0e77e6568b19dfe34",
        blockId: "5808058151912629759",
        round: 1,
      });

      expect(result).to.equal(
        `update "mem_accounts" set "balance" = "balance" + 150, "blockId" = '5808058151912629759' where "address" = 'U1234';INSERT INTO mem_round ("address", "amount", "delegate", "blockId", "round") SELECT 'U1234', (150)::bigint, "dependentId", '5808058151912629759', 1 FROM mem_accounts2delegates WHERE "accountId" = 'U1234';`
      );
    });

    it("should update the account with a negative balance", function () {
      const result = account.merge("U1234", {
        balance: -50,
        publicKey:
          "a9407418dafb3c8aeee28f3263fd55bae0f528a5697a9df0e77e6568b19dfe34",
        blockId: "5808058151912629759",
        round: 2,
      });

      expect(result).to.equal(
        `update "mem_accounts" set "balance" = "balance" - 50, "blockId" = '5808058151912629759' where "address" = 'U1234';INSERT INTO mem_round ("address", "amount", "delegate", "blockId", "round") SELECT 'U1234', (-50)::bigint, "dependentId", '5808058151912629759', 2 FROM mem_accounts2delegates WHERE "accountId" = 'U1234';`
      );
    });

    it("should insert new delegates to the account", function () {
      const result = account.merge("U5678", {
        delegates: ["+delegate1", "+delegate2"],
        publicKey:
          "b7507418dafb3c8aeee28f3263fd55bae0f528a5697a9df0e77e6568b19dfe34",
        blockId: "5808058151912629759",
        round: 3,
      });

      expect(result).to.equal(
        `insert into "mem_accounts2delegates" ("accountId", "dependentId") values ('U5678', 'delegate1');insert into "mem_accounts2delegates" ("accountId", "dependentId") values ('U5678', 'delegate2');update "mem_accounts" set "blockId" = '5808058151912629759' where "address" = 'U5678';INSERT INTO mem_round ("address", "amount", "delegate", "blockId", "round") SELECT 'U5678', (balance)::bigint, 'delegate1', '5808058151912629759', 3 FROM mem_accounts WHERE address = 'U5678';INSERT INTO mem_round ("address", "amount", "delegate", "blockId", "round") SELECT 'U5678', (balance)::bigint, 'delegate2', '5808058151912629759', 3 FROM mem_accounts WHERE address = 'U5678';`
      );
    });

    it("should remove delegates from the account", function () {
      const result = account.merge("U5678", {
        delegates: ["-delegate1", "-delegate2"],
        publicKey:
          "c8507418dafb3c8aeee28f3263fd55bae0f528a5697a9df0e77e6568b19dfe34",
        blockId: "5808058151912629759",
        round: 4,
      });

      expect(result).to.equal(
        `delete from "mem_accounts2delegates" where "dependentId" in ('delegate1', 'delegate2') and "accountId" = 'U5678';update "mem_accounts" set "blockId" = '5808058151912629759' where "address" = 'U5678';INSERT INTO mem_round ("address", "amount", "delegate", "blockId", "round") SELECT 'U5678', (-balance)::bigint, 'delegate1', '5808058151912629759', 4 FROM mem_accounts WHERE address = 'U5678';INSERT INTO mem_round ("address", "amount", "delegate", "blockId", "round") SELECT 'U5678', (-balance)::bigint, 'delegate2', '5808058151912629759', 4 FROM mem_accounts WHERE address = 'U5678';`
      );
    });

    it("should handle an unsane number for balance", function () {
      account.get = sinon.fake();

      return new Promise((resolve) => {
        account.merge(
          "U5678",
          {
            balance: NaN,
            publicKey:
              "d9507418dafb3c8aeee28f3263fd55bae0f528a5697a9df0e77e6568b19dfe34",
          },
          function (error, _) {
            expect(error).to.equal("Encountered unsane number: NaN");
            expect(account.get.called).to.be.true;
            resolve();
          }
        );
      });
    });

    it("should insert multiple complex objects", function () {
      const result = account.merge("U9999", {
        delegates: [
          { action: "+", value: "system" },
          { action: "+", value: "minecraft" },
        ],
        publicKey:
          "e9607418dafb3c8aeee28f3263fd55bae0f528a5697a9df0e77e6568b19dfe34",
      });

      expect(result).to.equal(
        `insert into "mem_accounts2delegates" ("value") values ('system'), ('minecraft');insert into "mem_accounts2delegates" ("value") values ('system'), ('minecraft');`
      );
    });

    it("should remove multiple complex objects", function () {
      const result = account.merge("U9999", {
        delegates: [
          { action: "-", value: "system" },
          { action: "-", value: "minecraft" },
        ],
        publicKey:
          "f9607418dafb3c8aeee28f3263fd55bae0f528a5697a9df0e77e6568b19dfe34",
      });

      expect(result).to.equal(
        `delete from "mem_accounts2delegates" where "value" = 'system' and "value" = 'minecraft';`
      );
    });

    it("should remove and insert complex objects", function () {
      const result = account.merge("U9999", {
        delegates: [
          { action: "-", value: "system" },
          { action: "+", value: "minecraft" },
        ],
        publicKey:
          "f9607418dafb3c8aeee28f3263fd55bae0f528a5697a9df0e77e6568b19dfe34",
      });

      expect(result).to.equal(
        `delete from "mem_accounts2delegates" where "value" = 'system';insert into "mem_accounts2delegates" ("value") values ('minecraft');`
      );
    });
  });
});
