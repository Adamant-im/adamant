'use strict';

const { expect } = require('chai');
const sinon = require('sinon');

const ClientWs = require('../../../modules/clientWs');

function createSocket (id, emit) {
  const handlers = {};
  const socket = {
    id,
    emit: emit || sinon.spy(),
    on: function (event, handler) {
      handlers[event] = handler;
    }
  };

  return { handlers, socket };
}

describe('ClientWs server', function () {
  it('should ignore all event types when disabled', function () {
    const clientWs = new ClientWs({ enabled: false });

    expect(function () {
      clientWs.emit({ id: 'disabled-transaction' });
      clientWs.emitBlock({ id: 'disabled-block' });
      clientWs.emitBalanceChange('U1', ['balance'], sinon.spy());
    }).to.not.throw();
  });

  it('should emit matching transactions and remove disconnected subscriptions', function () {
    const { handlers, socket } = createSocket('socket-transaction');
    const clientWs = new ClientWs({ enabled: false }, { debug: sinon.spy() });
    const transaction = { id: 'server-transaction', type: 0 };

    clientWs.handleConnection(socket);
    handlers.types(0);
    clientWs.enabled = true;
    clientWs.emit(transaction);

    expect(socket.emit.calledOnceWith('newTrans', transaction)).to.equal(true);
    expect(clientWs.describes).to.have.property(socket.id);

    handlers.disconnect();

    expect(clientWs.describes).not.to.have.property(socket.id);
  });

  it('should accept scalar and array parameters for every list subscription', function () {
    const { handlers, socket } = createSocket('socket-parameters');
    const clientWs = new ClientWs({ enabled: false }, { debug: sinon.spy() });

    clientWs.handleConnection(socket);
    handlers.address(['U123456', 'u4697606961271319613']);
    handlers.types(0);
    handlers.assetChatTypes([0, 1]);
    handlers.balances(['balance', 'unconfirmedBalance']);
    handlers.blocks(true);

    const subscription = clientWs.describes[socket.id];
    expect(subscription.addresses).to.deep.equal(
        new Set(['U123456', 'U4697606961271319613'])
    );
    expect(subscription.types).to.deep.equal(new Set([0]));
    expect(subscription.assetChatTypes).to.deep.equal(new Set([0, 1]));
    expect(subscription.balanceFields).to.deep.equal(
        new Set(['balance', 'unconfirmedBalance'])
    );
    expect(subscription.blocks).to.equal(true);

    handlers.blocks([false]);
    expect(subscription.blocks).to.equal(true);
  });

  it('should emit one compact block event only to opted-in sockets', function () {
    const subscribed = createSocket('socket-blocks');
    const transactionOnly = createSocket('socket-no-blocks');
    const clientWs = new ClientWs({ enabled: false }, { debug: sinon.spy() });
    const block = {
      id: 'server-block-1',
      height: 53532078,
      timestamp: 278966175,
      generatorPublicKey: 'a'.repeat(64),
      numberOfTransactions: 2,
      totalAmount: 10000000,
      totalFee: 100000,
      reward: 10000000,
      transactions: [{ id: 'not-public' }],
      blockSignature: 'not-public'
    };

    clientWs.handleConnection(subscribed.socket);
    clientWs.handleConnection(transactionOnly.socket);
    subscribed.handlers.blocks(true);
    transactionOnly.handlers.types(0);
    clientWs.enabled = true;

    expect(
        clientWs.transactionSubscriptions.has(clientWs.describes[subscribed.socket.id])
    ).to.equal(false);

    clientWs.emitBlock(block);
    clientWs.emitBlock(block);

    expect(subscribed.socket.emit.calledOnce).to.equal(true);
    expect(subscribed.socket.emit.firstCall.args).to.deep.equal([
      'newBlock',
      {
        id: block.id,
        height: block.height,
        timestamp: block.timestamp,
        generatorPublicKey: block.generatorPublicKey,
        numberOfTransactions: block.numberOfTransactions,
        totalAmount: block.totalAmount,
        totalFee: block.totalFee,
        reward: block.reward
      }
    ]);
    expect(transactionOnly.socket.emit.called).to.equal(false);

    subscribed.handlers.blocks(false);
    clientWs.emitBlock(Object.assign({}, block, { id: 'server-block-2' }));
    expect(subscribed.socket.emit.calledOnce).to.equal(true);
  });

  it('should index balance subscriptions regardless of parameter order', function () {
    const { handlers, socket } = createSocket('socket-balance-order');
    const clientWs = new ClientWs({ enabled: false }, { debug: sinon.spy() });
    const getAccount = sinon.spy(function (cb) {
      cb(null, { balance: 12, u_balance: 10 });
    });

    clientWs.handleConnection(socket);
    handlers.balances('unconfirmedBalance');
    handlers.address('u123456');
    clientWs.enabled = true;
    clientWs.emitBalanceChange('U123456', ['u_balance'], getAccount);

    expect(getAccount.calledOnce).to.equal(true);
    expect(socket.emit.calledOnceWith('balances/change', {
      address: 'U123456',
      unconfirmedBalance: '10'
    })).to.equal(true);
  });

  it('should fetch once and emit only requested changed balance fields', function () {
    const confirmed = createSocket('socket-confirmed-balance');
    const unconfirmed = createSocket('socket-unconfirmed-balance');
    const unrelated = createSocket('socket-unrelated-balance');
    const clientWs = new ClientWs({ enabled: false }, { debug: sinon.spy() });
    const getAccount = sinon.spy(function (cb) {
      cb(null, { balance: 100000000, u_balance: 99900000 });
    });

    for (const client of [confirmed, unconfirmed, unrelated]) {
      clientWs.handleConnection(client.socket);
    }
    confirmed.handlers.address('U123456');
    confirmed.handlers.balances('balance');
    unconfirmed.handlers.address('U123456');
    unconfirmed.handlers.balances('unconfirmedBalance');
    unrelated.handlers.address('U654321');
    unrelated.handlers.balances(['balance', 'unconfirmedBalance']);
    clientWs.enabled = true;

    clientWs.emitBalanceChange(
        'u123456',
        ['balance', 'u_balance'],
        getAccount
    );

    expect(getAccount.calledOnce).to.equal(true);
    expect(confirmed.socket.emit.calledOnceWith('balances/change', {
      address: 'U123456',
      balance: '100000000'
    })).to.equal(true);
    expect(unconfirmed.socket.emit.calledOnceWith('balances/change', {
      address: 'U123456',
      unconfirmedBalance: '99900000'
    })).to.equal(true);
    expect(unrelated.socket.emit.called).to.equal(false);
  });

  it('should batch transient balance mutations into one final account read', function () {
    const { handlers, socket } = createSocket('socket-balance-batch');
    const clientWs = new ClientWs({ enabled: false }, { debug: sinon.spy() });
    const firstGetAccount = sinon.spy();
    const finalGetAccount = sinon.spy(function (cb) {
      cb(null, { balance: 75, u_balance: 70 });
    });

    clientWs.handleConnection(socket);
    handlers.address('U123456');
    handlers.balances(['balance', 'unconfirmedBalance']);
    clientWs.enabled = true;

    clientWs.beginBalanceBatch();
    clientWs.beginBalanceBatch();
    clientWs.emitBalanceChange('U123456', ['balance'], firstGetAccount);
    clientWs.emitBalanceChange('U123456', ['u_balance'], finalGetAccount);
    clientWs.endBalanceBatch();

    expect(firstGetAccount.called).to.equal(false);
    expect(finalGetAccount.called).to.equal(false);
    expect(socket.emit.called).to.equal(false);

    clientWs.endBalanceBatch();

    expect(firstGetAccount.called).to.equal(false);
    expect(finalGetAccount.calledOnce).to.equal(true);
    expect(socket.emit.calledOnceWith('balances/change', {
      address: 'U123456',
      balance: '75',
      unconfirmedBalance: '70'
    })).to.equal(true);
  });

  it('should skip account reads without a matching balance subscription', function () {
    const invalid = createSocket('socket-invalid-balance');
    const clientWs = new ClientWs({ enabled: false }, { debug: sinon.spy() });
    const getAccount = sinon.spy();

    clientWs.handleConnection(invalid.socket);
    invalid.handlers.address('U123456');
    invalid.handlers.balances(['votes', 'u_balance']);
    clientWs.enabled = true;

    clientWs.emitBalanceChange('U123456', ['balance'], getAccount);

    expect(getAccount.called).to.equal(false);
    expect(invalid.socket.emit.called).to.equal(false);
  });

  it('should remove balance indexes when a socket disconnects', function () {
    const { handlers, socket } = createSocket('socket-balance-disconnect');
    const clientWs = new ClientWs({ enabled: false }, { debug: sinon.spy() });
    const getAccount = sinon.spy();

    clientWs.handleConnection(socket);
    handlers.address('U123456');
    handlers.balances('balance');
    handlers.disconnect();
    clientWs.enabled = true;

    clientWs.emitBalanceChange('U123456', ['balance'], getAccount);

    expect(getAccount.called).to.equal(false);
    expect(clientWs.balanceSubscriptions.has('U123456')).to.equal(false);
  });

  it('should isolate socket emit failures from other subscribers', function () {
    const logger = { debug: sinon.spy() };
    const broken = createSocket('socket-broken', function () {
      throw new Error('socket failed');
    });
    const healthy = createSocket('socket-healthy');
    const clientWs = new ClientWs({ enabled: false }, logger);

    clientWs.handleConnection(broken.socket);
    clientWs.handleConnection(healthy.socket);
    broken.handlers.blocks(true);
    healthy.handlers.blocks(true);
    clientWs.enabled = true;

    expect(function () {
      clientWs.emitBlock({
        id: 'server-block-failure',
        height: 1,
        timestamp: 0,
        generatorPublicKey: 'a'.repeat(64),
        numberOfTransactions: 0,
        totalAmount: 0,
        totalFee: 0,
        reward: 0
      });
    }).to.not.throw();

    expect(healthy.socket.emit.calledOnce).to.equal(true);
    expect(logger.debug.calledOnce).to.equal(true);
  });
});
