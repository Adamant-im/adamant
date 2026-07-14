'use strict';

const { expect } = require('chai');

const { modulesLoader } = require('../../common/initModule.js');

describe('blocks SQL indexes', function () {
  let db;

  before(function (done) {
    modulesLoader.getDbConnection(function (err, connection) {
      db = connection;
      done(err);
    });
  });

  it('indexes generatorPublicKey together with height using btree', async function () {
    const rows = await db.query([
      'SELECT am.amname AS method, pg_get_indexdef(i.indexrelid) AS definition',
      'FROM pg_index i',
      'JOIN pg_class c ON c.oid = i.indexrelid',
      'JOIN pg_am am ON am.oid = c.relam',
      'WHERE c.relname = \'blocks_generator_public_key_height\''
    ].join(' '));

    expect(rows).to.have.length(1);
    expect(rows[0].method).to.equal('btree');
    expect(rows[0].definition).to.include('(\"text_generatorPublicKey\", height DESC)');
  });

  it('removes the obsolete generatorPublicKey hash index', async function () {
    const rows = await db.query([
      'SELECT 1',
      'FROM pg_class',
      'WHERE relname = \'blocks_b_generator_public_key\''
    ].join(' '));

    expect(rows).to.eql([]);
  });
});
