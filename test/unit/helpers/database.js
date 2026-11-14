'use strict';

const { expect } = require('chai');
const { Client } = require('pg');

const database = require('../../../helpers/database.js');

describe('helpers/database', () => {
  describe('isLostConnectionError()', () => {
    it('recognizes driver codes and libpq text from a restarted server', () => {
      expect(database.isLostConnectionError(Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }))).to.equal(true);
      expect(database.isLostConnectionError(Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' }))).to.equal(true);
      expect(database.isLostConnectionError(Object.assign(new Error('admin shutdown'), { code: '57P01' }))).to.equal(true);
      expect(database.isLostConnectionError(Object.assign(new Error('connection failure'), { code: '08006' }))).to.equal(true);
      expect(database.isLostConnectionError(new Error('connection to server at "::1", port 5432 failed: Connection refused'))).to.equal(true);
      expect(database.isLostConnectionError(new Error('server closed the connection unexpectedly'))).to.equal(true);
      expect(database.isLostConnectionError(new Error('Client has encountered a connection error and is not queryable'))).to.equal(true);
      expect(database.isLostConnectionError(new Error('Query read timeout'))).to.equal(true);
    });

    it('leaves ordinary query failures and cancellations on the same connection', () => {
      expect(database.isLostConnectionError(null)).to.equal(false);
      expect(database.isLostConnectionError(Object.assign(new Error('duplicate key'), { code: '23505' }))).to.equal(false);
      expect(database.isLostConnectionError(Object.assign(new Error('canceling statement due to user request'), { code: '57014' }))).to.equal(false);
      expect(database.isLostConnectionError(Object.assign(new Error('protocol violation'), { code: '08P01' }))).to.equal(false);
      expect(database.isLostConnectionError(new Error('column "height" does not exist'))).to.equal(false);
    });
  });

  describe('markLostClient()', () => {
    it('records the connectivity error so the pool destroys the client on release', () => {
      const client = {};
      const err = new Error('server closed the connection unexpectedly');

      database.markLostClient(err, client);

      expect(client.$connectionError).to.equal(err);
    });

    it('does not replace an error already recorded for that client', () => {
      const first = new Error('Connection terminated');
      const client = { $connectionError: first };

      database.markLostClient(new Error('Query read timeout'), client);

      expect(client.$connectionError).to.equal(first);
    });

    it('does not mark a client for a normal SQL error', () => {
      const client = {};

      database.markLostClient(Object.assign(new Error('duplicate key'), { code: '23505' }), client);

      expect(client.$connectionError).to.equal(undefined);
    });
  });

  describe('preparePoolConfig()', () => {
    it('maps the legacy pool settings and arms connect recovery without a query timeout', () => {
      const source = {
        host: 'localhost',
        port: 5432,
        database: 'adamant_test',
        user: 'adamanttest',
        password: 'password',
        poolSize: 95,
        poolIdleTimeout: 30000,
        reapIntervalMillis: 1000,
        logEvents: ['error']
      };

      const prepared = database.preparePoolConfig(source);

      expect(source.poolSize).to.equal(95);
      expect(prepared.max).to.equal(95);
      expect(prepared.poolSize).to.equal(undefined);
      expect(prepared.idleTimeoutMillis).to.equal(30000);
      expect(prepared.connectionTimeoutMillis).to.equal(database.CONNECTION_TIMEOUT_MS);
      expect(prepared.keepAlive).to.equal(true);
      expect(prepared.keepAliveInitialDelayMillis).to.equal(database.KEEPALIVE_INITIAL_DELAY_MS);
      expect(prepared.query_timeout).to.equal(undefined);
      expect(prepared.password).to.equal('password');
    });

    it('keeps an explicit connect timeout and keepalive delay', () => {
      const prepared = database.preparePoolConfig({
        user: 'adamanttest',
        poolSize: 4,
        connectionTimeoutMillis: 2500,
        keepAlive: false,
        keepAliveInitialDelayMillis: 1500,
        query_timeout: 1000
      });

      expect(prepared.connectionTimeoutMillis).to.equal(2500);
      expect(prepared.keepAlive).to.equal(false);
      expect(prepared.keepAliveInitialDelayMillis).to.equal(1500);
      expect(prepared.query_timeout).to.equal(undefined);
    });
  });

  describe('enableQueryTimeout()', () => {
    it('sets the timeout on the pool and on clients already checked out for migrations', () => {
      const client = { connectionParameters: {} };
      const pool = {
        options: {},
        _clients: [client, null]
      };

      database.enableQueryTimeout(pool, database.QUERY_TIMEOUT_MS);

      expect(pool.options.query_timeout).to.equal(database.QUERY_TIMEOUT_MS);
      expect(client.connectionParameters.query_timeout).to.equal(database.QUERY_TIMEOUT_MS);
    });
  });

  describe('connection recovery', () => {
    const { modulesLoader } = require('../../common/initModule.js');
    let db;

    before(function (done) {
      modulesLoader.getDbConnection(function (err, connection) {
        db = connection;
        done(err);
      });
    });

    it('serves a query after PostgreSQL terminates the pooled backends', async function () {
      const first = await db.one('SELECT 1 AS ok');
      expect(Number(first.ok)).to.equal(1);

      expect(db.$pool.options.query_timeout).to.equal(database.QUERY_TIMEOUT_MS);
      expect(db.$pool.options.connectionTimeoutMillis).to.equal(database.CONNECTION_TIMEOUT_MS);
      expect(db.$pool.options.keepAlive).to.equal(true);
      expect(db.$pool.listenerCount('error')).to.be.at.least(1);

      db.$pool._clients.forEach(function (client) {
        expect(client.connectionParameters.query_timeout).to.equal(database.QUERY_TIMEOUT_MS);
      });

      const terminated = await terminatePooledBackends(modulesLoader.scope.config.db);
      expect(terminated).to.be.at.least(1);

      let lastError;

      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          const recovered = await db.one('SELECT 1 AS ok');
          expect(Number(recovered.ok)).to.equal(1);
          return;
        } catch (err) {
          lastError = err;
          await delay(50);
        }
      }

      throw lastError;
    });
  });
});

/**
 * Asks PostgreSQL to drop every other backend of this test database.
 * @param {object} dbConfig
 * @return {Promise<number>}
 */
async function terminatePooledBackends (dbConfig) {
  const client = new Client({
    host: dbConfig.host,
    port: dbConfig.port,
    database: dbConfig.database,
    user: dbConfig.user,
    password: dbConfig.password
  });

  await client.connect();

  try {
    const result = await client.query(
        'SELECT pid FROM pg_stat_activity WHERE datname = $1 AND usename = $2 AND pid <> pg_backend_pid()',
        [dbConfig.database, dbConfig.user]
    );

    for (const row of result.rows) {
      await client.query('SELECT pg_terminate_backend($1::int)', [row.pid]);
    }

    return result.rows.length;
  } finally {
    await client.end();
  }
}

/**
 * @param {number} ms
 * @return {Promise<void>}
 */
function delay (ms) {
  return new Promise(function (resolve) {
    setTimeout(resolve, ms);
  });
}
