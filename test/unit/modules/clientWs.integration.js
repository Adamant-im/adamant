'use strict';

const { expect } = require('chai');
const { Socket: EngineSocket } = require('engine.io-client');
const { io } = require('socket.io-client');
const sinon = require('sinon');

const ClientWs = require('../../../modules/clientWs');

function waitFor (predicate, timeout = 2000) {
  const started = Date.now();

  return new Promise((resolve, reject) => {
    function check () {
      if (predicate()) {
        return resolve();
      }
      if (Date.now() - started >= timeout) {
        return reject(new Error('Timed out waiting for WebSocket state'));
      }
      setTimeout(check, 5);
    }

    check();
  });
}

describe('ClientWs Socket.IO integration', function () {
  this.timeout(5000);

  let client;
  let extraClient;
  let engineClient;
  let clientWs;

  afterEach(async function () {
    if (extraClient) {
      extraClient.close();
      extraClient = null;
    }
    if (engineClient) {
      engineClient.close();
      engineClient = null;
    }
    if (client) {
      client.close();
      client = null;
    }
    if (clientWs) {
      await new Promise((resolve) => clientWs.close(resolve));
      clientWs = null;
    }
  });

  it('should deliver block and balance subscriptions over a real connection', async function () {
    clientWs = new ClientWs(
        { enabled: true, portWS: 0, cors: { origin: '*' } },
        { debug: sinon.spy() }
    );

    await waitFor(() => clientWs.io.httpServer.address());
    const port = clientWs.io.httpServer.address().port;
    client = io(`http://127.0.0.1:${port}`, {
      forceNew: true,
      reconnection: false,
      transports: ['websocket']
    });

    await new Promise((resolve, reject) => {
      client.once('connect', resolve);
      client.once('connect_error', reject);
    });

    client.emit('blocks', true);
    client.emit('balances', ['balance', 'unconfirmedBalance']);
    client.emit('address', 'u123456');

    await waitFor(() =>
      clientWs.blockSubscriptions.size === 1 &&
      clientWs.balanceSubscriptions.has('U123456')
    );

    const blockEvent = new Promise((resolve) => client.once('newBlock', resolve));
    const balanceEvent = new Promise((resolve) => client.once('balances/change', resolve));
    const block = {
      id: 'integration-block',
      height: 2,
      timestamp: 5,
      generatorPublicKey: 'a'.repeat(64),
      numberOfTransactions: 0,
      totalAmount: 0,
      totalFee: 0,
      reward: 10000000
    };

    clientWs.emitBlock(block);
    clientWs.emitBalanceChange('U123456', ['balance', 'u_balance'], function (cb) {
      cb(null, { balance: '100', u_balance: '90' });
    });

    expect(await blockEvent).to.deep.equal(block);
    expect(await balanceEvent).to.deep.equal({
      address: 'U123456',
      balance: '100',
      unconfirmedBalance: '90'
    });
  });

  it('should disconnect a second socket from the same address when the per-IP cap is 1', async function () {
    clientWs = new ClientWs({
      enabled: true,
      portWS: 0,
      cors: { origin: '*' },
      limits: {
        maxConnections: 10,
        maxConnectionsPerIp: 1,
        maxSubscriptionEvents: 10,
        windowMs: 10000
      }
    }, { debug: sinon.spy() });

    await waitFor(() => clientWs.io.httpServer.address());
    const admittedTransports = sinon.spy();
    clientWs.io.engine.on('connection', admittedTransports);
    const port = clientWs.io.httpServer.address().port;
    const url = `http://127.0.0.1:${port}`;
    const options = {
      forceNew: true,
      reconnection: false,
      transports: ['websocket']
    };

    client = io(url, options);
    await new Promise((resolve, reject) => {
      client.once('connect', resolve);
      client.once('connect_error', reject);
    });

    extraClient = io(url, options);
    const outcome = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Timed out waiting for the extra socket to close')), 2000);
      extraClient.once('disconnect', () => {
        clearTimeout(timer);
        resolve('closed');
      });
      extraClient.once('connect_error', () => {
        clearTimeout(timer);
        resolve('error');
      });
    });

    expect(['closed', 'error']).to.include(outcome);
    expect(clientWs.connectionCount).to.equal(1);
    expect(client.connected).to.equal(true);
    expect(admittedTransports.calledOnce).to.equal(true);
  });

  ['polling', 'upgrade'].forEach(function (mode) {
    it('should reject a second ' + mode + ' transport before Engine.IO allocates it', async function () {
      clientWs = new ClientWs({
        enabled: true,
        portWS: 0,
        cors: { origin: '*' },
        limits: {
          maxConnections: 10,
          maxConnectionsPerIp: 1,
          maxSubscriptionEvents: 10,
          windowMs: 10000
        }
      }, { debug: sinon.spy() });

      await waitFor(() => clientWs.io.httpServer.address());
      const admittedTransports = sinon.spy();
      clientWs.io.engine.on('connection', admittedTransports);
      const url = `http://127.0.0.1:${clientWs.io.httpServer.address().port}`;
      const options = {
        forceNew: true,
        reconnection: false,
        transports: mode === 'polling' ? ['polling'] : ['polling', 'websocket'],
        upgrade: mode === 'upgrade'
      };

      client = io(url, options);
      await new Promise((resolve, reject) => {
        client.once('connect', resolve);
        client.once('connect_error', reject);
      });

      if (mode === 'upgrade') {
        await waitFor(() => client.io.engine.transport.name === 'websocket');
      }

      extraClient = io(url, options);
      const outcome = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Timed out waiting for rejected transport')), 2000);
        extraClient.once('connect_error', () => {
          clearTimeout(timer);
          resolve('error');
        });
      });

      expect(outcome).to.equal('error');
      expect(admittedTransports.calledOnce).to.equal(true);
      expect(clientWs.transportAdmission.connectionCount).to.equal(1);
    });
  });

  it('should reserve the budget for an Engine.IO session without a namespace connection', async function () {
    clientWs = new ClientWs({
      enabled: true,
      portWS: 0,
      cors: { origin: '*' },
      limits: {
        maxConnections: 1,
        maxConnectionsPerIp: 1,
        maxSubscriptionEvents: 10,
        windowMs: 10000
      }
    }, { debug: sinon.spy() });

    await waitFor(() => clientWs.io.httpServer.address());
    const url = `http://127.0.0.1:${clientWs.io.httpServer.address().port}`;

    engineClient = new EngineSocket(url, {
      path: '/socket.io/',
      transports: ['polling']
    });
    await new Promise((resolve, reject) => {
      engineClient.once('open', resolve);
      engineClient.once('error', reject);
    });

    expect(clientWs.connectionCount).to.equal(0);
    expect(clientWs.transportAdmission.connectionCount).to.equal(1);

    extraClient = io(url, {
      forceNew: true,
      reconnection: false,
      transports: ['websocket']
    });
    const error = await new Promise((resolve, reject) => {
      extraClient.once('connect_error', resolve);
      extraClient.once('connect', () => reject(new Error('Socket.IO client bypassed transport admission')));
    });

    expect(error).to.exist;
    expect(clientWs.io.engine.clientsCount).to.equal(1);
  });
});
