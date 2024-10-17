"use strict";

var chai = require("chai");
var expect = require("chai").expect;

const sinon = require("sinon");
var Account = require("../../../logic/account.js");
const { modulesLoader } = require('../../common/initModule.js');

const { validAccount} = require('../../common/stubs/account.js')

describe("account", function () {
  let db;
  let account;

  beforeEach(function (done) {
    db = {
      none: sinon.fake.returns(Promise.resolve()),
      query: sinon.fake.returns(Promise.resolve()),
    }

    modulesLoader.initLogic(Account, {
      db,
      schema: modulesLoader.scope.schema,
      logger: {}
    }, (err, instance) => {
      account = instance;
      done()
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

  describe('createTables', function() {
    it('should read memoryTables file and execute queries without error', () => {
      account.createTables(() => {
        const called = db.query.calledWithMatch(
          sinon.match({ error: sinon.match.typeOf('undefined') })
        );

        expect(called).to.equal(true);
      })
    })
  })

  describe('removeTables', () => {
    it('should execute the right sql query', () => {
      account.removeTables(() => {
        const called = db.query.calledWithMatch(
          'delete from "mem_accounts";delete from "mem_round";delete from "mem_accounts2delegates";delete from "mem_accounts2u_delegates";delete from "mem_accounts2multisignatures";delete from "mem_accounts2u_multisignatures";'
        );

        expect(called).to.equal(true);
      })
    })
  })

  describe('verifyPublicKey', () => {
    it('should ignore if no publicKey was provided', () => {
      expect(account.verifyPublicKey).to.not.throw()
    })

    it('should not throw an error for a valid public key', () => {
      expect(() => account.verifyPublicKey(validAccount.publicKey)).to.not.throw()
    })

    it('should throw an error for buffer public key', () => {
      expect(() => account.verifyPublicKey(Buffer.from(validAccount.publicKey, 'hex'))).to.throw('must be a string')
    })

    it('should throw an error for number instead of string', () => {
      expect(() => account.verifyPublicKey(0)).to.throw('must be a string')
    })

    it('should throw an error for null', () => {
      expect(() => account.verifyPublicKey(null)).to.throw('must be a string')
    })

    it('should throw an error for object', () => {
      expect(() => account.verifyPublicKey({})).to.throw('must be a string')
    })

    it('should throw an error for NaN', () => {
      expect(() => account.verifyPublicKey(NaN)).to.throw('must be a string')
    })

    it('should throw an error when a too short string has been passed', () => {
      expect(() => account.verifyPublicKey('a9407418dafb3c8ae')).to.throw('must be 64 characters long')
    })

    it('should throw an error when the provided public key is not a hex string', () => {
      expect(() => account.verifyPublicKey('g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0e1f2u2g3h4i5j6k7')).to.throw('must be a hex string')
    })

    it('should throw an error when the provided public key can be trimmed to a zero length string', () => {
      expect(() => account.verifyPublicKey(' '.repeat(64))).to.throw('must be a hex string')
    })
  })

  describe('toDB', () => {
    it('should convert public key to buffer', () => {
      const normalizedAccount = account.toDB({
        publicKey: validAccount.publicKey,
        secondPublicKey: null,
        address: 'U777355171330060015'
      })

      expect(Buffer.isBuffer(normalizedAccount.publicKey)).to.equal(true)
      expect(normalizedAccount.secondPublicKey).to.equal(null)
      expect(normalizedAccount.address).to.equal('U777355171330060015')
    })

    it('should convert address to upper case', () => {
      const normalizedAccount = account.toDB({
        address: 'u777355171330060015'
      })

      expect(normalizedAccount.address).to.equal('U777355171330060015')
    })
  })

  describe('getAll', () => {
    it('should apply limit filter', (done) => {
      account.getAll({ limit: 1 }, ['username'], () => {
        const matched = db.query.calledWithMatch(
          sinon.match(/limit 1/)
        )

        expect(matched).to.equal(true)
        done()
      })
    })

    it('should apply offset', (done) => {
      account.getAll({ offset: 100 }, ['username'], () => {
        const matched = db.query.calledWithMatch(
          sinon.match(/offset 100/)
        )

        expect(matched).to.equal(true)
        done()
      })
    })

    it('should apply desc sorting by balance', (done) => {
      account.getAll({ sort: { balance: -1 } }, ['username'], () => {
        const matched = db.query.calledWithMatch(
          sinon.match(/order by "balance" desc/)
        )

        expect(matched).to.equal(true)
        done()
      })
    })

    it('should apply asc sorting by balance', (done) => {
      account.getAll({ sort: { balance: 1 } }, ['username'], () => {
        const matched = db.query.calledWithMatch(
          sinon.match(/order by "balance" asc/)
        )

        expect(matched).to.equal(true)
        done()
      })
    })

    it('should search by address in uppercase', (done) => {
      account.getAll({ address: validAccount.address }, ['username'], () => {
        const matched = db.query.calledWithMatch(
          sinon.match(/upper\("address"\) = upper\(/)
        )

        expect(matched).to.equal(true)
        done()
      })
    })

    it('should filter out non existing fields', (done) => {
      const nonExistingFields = ['reward', 'totalFee', 'confirmations', 'blockSignature'];
      const actualFields = ['username', 'isDelegate', 'address', 'publicKey', 'balance', 'virgin'];
      const fields = [
        ...nonExistingFields,
        ...actualFields
      ]

      account.getAll({ address: validAccount.address }, fields, () => {
        const matched = db.query.calledWithMatch(
          'select "username", "isDelegate", UPPER("address") as "address", ENCODE("publicKey", \'hex\') as "publicKey", ("balance")::bigint as "balance", "virgin" from "mem_accounts" as "a" where upper("address") = upper(${p1});'
        )

        expect(matched).to.equal(true)
        done()
      })
    })

    it('should make query with both filters and fields', (done) => {
      account.getAll({ limit: 1, offset: -23, sort: { virgin: 1 }, address: validAccount.address }, ['username', 'nonexistingfield'], () => {
        const matched = db.query.calledWithMatch(
          'select "username" from "mem_accounts" as "a" where upper("address") = upper(${p1}) order by "virgin" asc limit 1;'
        )

        expect(matched).to.equal(true)
        done()
      })
    })
  })
});
