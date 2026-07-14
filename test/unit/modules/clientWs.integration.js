'use strict';

const { expect } = require('chai');
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
  let clientWs;

  afterEach(async function () {
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
});
