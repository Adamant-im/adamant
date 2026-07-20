'use strict';

const { expect } = require('chai');
const sinon = require('sinon');
const EventEmitter = require('events');

const TransportWsApi = require('../../../../api/ws/transport');

describe('TransportWsApi peer syncProtocol lifecycle', function () {
  let clock;
  let peers;
  let transport;

  beforeEach(function () {
    clock = sinon.useFakeTimers();
    peers = {
      events: new EventEmitter(),
      switchToHttp: sinon.spy(),
      switchToWs: sinon.spy(),
      list: sinon.stub(),
      isBanned: sinon.stub().returns(false),
      recordRequest: sinon.spy()
    };

    transport = new TransportWsApi(
        {
          peers,
          system: { getNonce: () => 'test-nonce', getBroadhash: () => 'bh' },
          transport: { internal: {} }
        },
        { logger: { info: sinon.spy(), log: sinon.spy(), debug: sinon.spy(), warn: sinon.spy() } },
        { maxReceiveConnections: 25 }
    );
  });

  afterEach(function () {
    transport.stopRotation();
    peers.events.removeAllListeners();
    clock.restore();
  });

  function fakeSocket () {
    return {
      removeAllListeners: sinon.spy(),
      disconnect: sinon.spy(),
      on: sinon.spy()
    };
  }

  it('should reset syncProtocol to http when cleaning up a connection', function () {
    const peer = { ip: '1.2.3.4', port: 36666 };
    const socket = fakeSocket();

    transport.connections.set('ws://1.2.3.4:36666', { socket, peer });
    transport.cleanupConnection(peer);

    expect(peers.switchToHttp.calledOnceWith(peer)).to.equal(true);
    expect(socket.removeAllListeners.calledOnce).to.equal(true);
    expect(socket.disconnect.calledOnce).to.equal(true);
    expect(peers.switchToHttp.calledBefore(socket.removeAllListeners)).to.equal(true);
    expect(transport.connections.has('ws://1.2.3.4:36666')).to.equal(false);
  });

  it('should reset syncProtocol to http for every peer during initialize()', function () {
    const peerA = { ip: '1.1.1.1', port: 36666 };
    const peerB = { ip: '2.2.2.2', port: 36666 };
    const socketA = fakeSocket();
    const socketB = fakeSocket();

    transport.connections.set('ws://1.1.1.1:36666', { socket: socketA, peer: peerA });
    transport.connections.set('ws://2.2.2.2:36666', { socket: socketB, peer: peerB });

    peers.list.callsFake(function (options, cb) {
      cb(null, []);
    });

    transport.initialize();

    expect(peers.switchToHttp.calledWith(peerA)).to.equal(true);
    expect(peers.switchToHttp.calledWith(peerB)).to.equal(true);
    expect(socketA.removeAllListeners.calledOnce).to.equal(true);
    expect(socketB.removeAllListeners.calledOnce).to.equal(true);
    expect(transport.connections.size).to.equal(0);
  });

  it('should reset syncProtocol via cleanupConnection during rotatePeers()', function () {
    const peer = { ip: '1.2.3.4', port: 36666 };
    const replacement = { ip: '9.9.9.9', port: 36666 };
    const socket = fakeSocket();

    transport.connections.set('ws://1.2.3.4:36666', { socket, peer });
    peers.list.callsFake(function (options, cb) {
      cb(null, [replacement]);
    });
    sinon.stub(transport, 'connectToPeer');

    transport.rotatePeers();

    expect(peers.switchToHttp.calledWith(peer)).to.equal(true);
    expect(socket.removeAllListeners.calledOnce).to.equal(true);
    expect(socket.disconnect.calledOnce).to.equal(true);
    expect(transport.connections.has('ws://1.2.3.4:36666')).to.equal(false);
    expect(transport.connectToPeer.calledOnceWith(replacement)).to.equal(true);
  });
});
