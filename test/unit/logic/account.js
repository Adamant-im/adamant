'use strict';

const { expect } = require('chai');
const sinon = require('sinon');

const Account = require('../../../logic/account.js');

const { modulesLoader } = require('../../common/initModule.js');
const { validAccount, nonExistingAccount } = require('../../common/stubs/account.js');
const { validBlock } = require('../../common/stubs/blocks.js');

describe('account', () => {
  /**
   * @type {Account}
   */
  let account;
  let db;

  beforeEach((done) => {
    db = {
      none: sinon.fake.returns(Promise.resolve()),
      query: sinon.fake.returns(Promise.resolve()),
    };

    modulesLoader.initLogic(
      Account,
      {
        db,
        schema: modulesLoader.scope.schema,
        logger: modulesLoader.scope.logger,
      },
      (error, instance) => {
        if (error) {
          return done(error);
        }

        account = instance;
        done();
      }
    );
  });

  describe('merge()', () => {
    const { address } = nonExistingAccount;

    const delegate1 = 'system';
    const delegate2 = 'minecraft';

    let diff;
    let round = 1;

    beforeEach(() => {
      diff = {
        round,
      };
      diff.publicKey = nonExistingAccount.publicKey;
      diff.blockId = validBlock.id

      round += 1;
    })

    it('should update the account with a positive balance', () => {
      diff.balance = 150;

      const { address } = nonExistingAccount;
      const result = account.merge(address, diff);

      expect(result).to.equal(
        `update "mem_accounts" set "balance" = "balance" + ${diff.balance}, "blockId" = '${diff.blockId}' where "address" = '${address}';INSERT INTO mem_round ("address", "amount", "delegate", "blockId", "round") SELECT '${address}', (${diff.balance})::bigint, "dependentId", '${diff.blockId}', 1 FROM mem_accounts2delegates WHERE "accountId" = '${address}';`
      );
    });

    it('should update the account with a negative balance', () => {
      diff.balance = -50;

      const result = account.merge(address, diff);

      expect(result).to.equal(
        `update "mem_accounts" set "balance" = "balance" - ${Math.abs(diff.balance)}, "blockId" = '${diff.blockId}' where "address" = '${address}';INSERT INTO mem_round ("address", "amount", "delegate", "blockId", "round") SELECT '${address}', (${diff.balance})::bigint, "dependentId", '${diff.blockId}', 2 FROM mem_accounts2delegates WHERE "accountId" = '${address}';`
      );
    });

    it('should insert new delegates to the account', () => {
      diff.delegates = [`+${delegate1}`, `+${delegate2}`];

      const result = account.merge(address, diff);

      expect(result).to.equal(
        `insert into "mem_accounts2delegates" ("accountId", "dependentId") values ('${address}', '${delegate1}');insert into "mem_accounts2delegates" ("accountId", "dependentId") values ('${address}', '${delegate2}');update "mem_accounts" set "blockId" = '${diff.blockId}' where "address" = '${address}';INSERT INTO mem_round ("address", "amount", "delegate", "blockId", "round") SELECT '${address}', (balance)::bigint, '${delegate1}', '${diff.blockId}', 3 FROM mem_accounts WHERE address = '${address}';INSERT INTO mem_round ("address", "amount", "delegate", "blockId", "round") SELECT '${address}', (balance)::bigint, '${delegate2}', '${diff.blockId}', 3 FROM mem_accounts WHERE address = '${address}';`
      );
    });

    it('should remove delegates from the account', () => {
      diff.delegates = [`-${delegate1}`, `-${delegate2}`];

      const result = account.merge(address, diff);

      expect(result).to.equal(
        `delete from "mem_accounts2delegates" where "dependentId" in ('${delegate1}', '${delegate2}') and "accountId" = '${address}';update "mem_accounts" set "blockId" = '${diff.blockId}' where "address" = '${address}';INSERT INTO mem_round ("address", "amount", "delegate", "blockId", "round") SELECT '${address}', (-balance)::bigint, '${delegate1}', '${diff.blockId}', 4 FROM mem_accounts WHERE address = '${address}';INSERT INTO mem_round ("address", "amount", "delegate", "blockId", "round") SELECT '${address}', (-balance)::bigint, '${delegate2}', '${diff.blockId}', 4 FROM mem_accounts WHERE address = '${address}';`
      );
    });

    it('should handle an unsafe number for balance', (done) => {
      diff.balance = NaN;

      account.merge(address, diff, (error) => {
        expect(error).to.equal('Encountered unsane number: NaN');
        done();
      });
    });

    it('should insert multiple complex objects', () => {
      diff.delegates = [
        { action: '+', value: delegate1 },
        { action: '+', value: delegate2 },
      ];

      const result = account.merge(address, diff);

      expect(result).to.equal(
        `insert into "mem_accounts2delegates" ("value") values ('${delegate1}'), ('${delegate2}');insert into "mem_accounts2delegates" ("value") values ('${delegate1}'), ('${delegate2}');update "mem_accounts" set "blockId" = '${diff.blockId}' where "address" = '${address}';`
      );
    });

    it('should remove multiple complex objects', () => {
      diff.delegates = [
        { action: '-', value: delegate1 },
        { action: '-', value: delegate2 },
      ];

      const result = account.merge(address, diff);

      expect(result).to.equal(
        `delete from "mem_accounts2delegates" where "value" = '${delegate1}' and "value" = '${delegate2}';update "mem_accounts" set "blockId" = '${diff.blockId}' where "address" = '${address}';`
      );
    });

    it('should remove and insert complex objects', () => {
      diff.delegates = [
        { action: '-', value: delegate1 },
        { action: '+', value: delegate2 },
      ];
      delete diff.blockId;

      const result = account.merge(address, diff);

      expect(result).to.equal(
        `delete from "mem_accounts2delegates" where "value" = '${delegate1}';insert into "mem_accounts2delegates" ("value") values ('${delegate2}');`
      );
    });
  });

  describe('createTables()', () => {
    it('should read sql/memoryTables.sql file and execute the queries without errors', () => {
      account.createTables(() => {
        const called = db.query.calledWithMatch(
          sinon.match({ error: sinon.match.typeOf('undefined') })
        );

        expect(called).to.be.true;
      });
    });
  });

  describe('removeTables()', () => {
    it('should execute the sql query to remove the tables', () => {
      account.removeTables(() => {
        const called = db.query.calledWithMatch(
          'delete from "mem_accounts";delete from "mem_round";delete from "mem_accounts2delegates";delete from "mem_accounts2u_delegates";delete from "mem_accounts2multisignatures";delete from "mem_accounts2u_multisignatures";'
        );

        expect(called).to.be.true;
      });
    });
  });

  describe('verifyPublicKey()', () => {
    it('should ignore if `publicKey` was not provided', () => {
      expect(account.verifyPublicKey).to.not.throw();
    });

    it('should not throw an error for a valid public key', () => {
      expect(() =>
        account.verifyPublicKey(validAccount.publicKey)
      ).to.not.throw();
    });

    it('should throw an error for buffer public key', () => {
      expect(() =>
        account.verifyPublicKey(Buffer.from(validAccount.publicKey, 'hex'))
      ).to.throw('must be a string');
    });

    it('should throw an error for number instead of string', () => {
      expect(() => account.verifyPublicKey(0)).to.throw('must be a string');
    });

    it('should throw an error for null', () => {
      expect(() => account.verifyPublicKey(null)).to.throw('must be a string');
    });

    it('should throw an error for object', () => {
      expect(() => account.verifyPublicKey({})).to.throw('must be a string');
    });

    it('should throw an error for NaN', () => {
      expect(() => account.verifyPublicKey(NaN)).to.throw('must be a string');
    });

    it('should throw an error when a too short string has been passed', () => {
      expect(() => account.verifyPublicKey('a9407418dafb3c8ae')).to.throw(
        'must be 64 characters long'
      );
    });

    it('should throw an error when the provided public key is not a hex string', () => {
      expect(() =>
        account.verifyPublicKey(
          'g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0e1f2u2g3h4i5j6k7'
        )
      ).to.throw('must be a hex string');
    });

    it('should throw an error when the provided public key can be trimmed to a zero length string', () => {
      expect(() => account.verifyPublicKey(' '.repeat(64))).to.throw(
        'must be a hex string'
      );
    });
  });

  describe('toDB()', () => {
    it('should convert public key to buffer', () => {
      const normalizedAccount = account.toDB({
        publicKey: validAccount.publicKey,
        secondPublicKey: null,
        address: validAccount.address,
      });

      expect(Buffer.isBuffer(normalizedAccount.publicKey)).to.be.true;
      expect(normalizedAccount.secondPublicKey).to.equal(null);
      expect(normalizedAccount.address).to.equal(validAccount.address);
    });

    it('should convert address to upper case', () => {
      const normalizedAccount = account.toDB({
        address: nonExistingAccount.address.toLowerCase(),
      });

      expect(normalizedAccount.address).to.equal(nonExistingAccount.address);
    });
  });

  describe('getAll()', () => {
    it('should apply limit filter', (done) => {
      account.getAll({ limit: 1 }, ['username'], () => {
        const matched = db.query.calledWithMatch(sinon.match(/limit 1/));

        expect(matched).to.be.true;
        done();
      });
    });

    it('should apply offset', (done) => {
      account.getAll({ offset: 100 }, ['username'], () => {
        const matched = db.query.calledWithMatch(sinon.match(/offset 100/));

        expect(matched).to.be.true;
        done();
      });
    });

    it('should apply desc sorting by balance', (done) => {
      account.getAll({ sort: { balance: -1 } }, ['username'], () => {
        const matched = db.query.calledWithMatch(
          sinon.match(/order by "balance" desc/)
        );

        expect(matched).to.be.true;
        done();
      });
    });

    it('should apply asc sorting by balance', (done) => {
      account.getAll({ sort: { balance: 1 } }, ['username'], () => {
        const matched = db.query.calledWithMatch(
          sinon.match(/order by "balance" asc/)
        );

        expect(matched).to.be.true;
        done();
      });
    });

    it('should search by address in uppercase', (done) => {
      account.getAll({ address: validAccount.address }, ['username'], () => {
        const matched = db.query.calledWithMatch(
          sinon.match(/upper\("address"\) = upper\(/)
        );

        expect(matched).to.be.true;
        done();
      });
    });

    it('should filter out non existing fields', (done) => {
      const nonExistingFields = [
        'reward',
        'totalFee',
        'confirmations',
        'blockSignature',
      ];
      const actualFields = [
        'username',
        'isDelegate',
        'address',
        'publicKey',
        'balance',
        'virgin',
      ];
      const fields = [...nonExistingFields, ...actualFields];

      account.getAll({ address: validAccount.address }, fields, () => {
        const matched = db.query.calledWithMatch(
          'select "username", "isDelegate", UPPER("address") as "address", ENCODE("publicKey", \'hex\') as "publicKey", ("balance")::bigint as "balance", "virgin" from "mem_accounts" as "a" where upper("address") = upper(${p1});'
        );

        expect(matched).to.be.true;
        done();
      });
    });

    it('should make query with both filters and fields', (done) => {
      account.getAll(
        {
          limit: 1,
          offset: -23,
          sort: { virgin: 1 },
          address: validAccount.address,
        },
        ['username', 'nonexistingfield'],
        () => {
          const matched = db.query.calledWithMatch(
            'select "username" from "mem_accounts" as "a" where upper("address") = upper(${p1}) order by "virgin" asc limit 1;'
          );

          expect(matched).to.be.true;
          done();
        }
      );
    });
  });

  describe('set()', () => {
    it('should set balance to 100000', (done) => {
      account.set(validAccount.address, { balance: 100000 }, () => {
        const matched = db.none.calledWithMatch(/"balance" = 100000/);

        expect(matched).to.be.true;
        done();
      });
    });
  });

  describe('remove()', () => {
    it('should remove the account based on address', (done) => {
      account.remove(validAccount.address, () => {
        const matched = db.none.calledWithMatch(
          /^delete from "mem_accounts" where "address" = /
        );

        expect(matched).to.be.true;
        done();
      });
    });
  });
});
