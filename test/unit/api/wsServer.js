'use strict';

const http = require('http');
const { expect } = require('chai');
const { io } = require('socket.io-client');
const sinon = require('sinon');

const Peer = require('../../../logic/peer.js');
const WebSocketServer = require('../../../api/ws/server.js');

function createLogger () {
  return {
    info: sinon.spy(),
    debug: sinon.spy(),
    trace: sinon.spy(),
    warn: sinon.spy()
  };
}

function connect (port, auth) {
  const socket = io('http://127.0.0.1:' + port, {
    forceNew: true,
    reconnection: false,
    timeout: 2000,
    transports: ['websocket'],
    auth: auth
  });

  socket.outcome = new Promise((resolve) => {
    let connected = false;
    const timer = setTimeout(() => resolve(socket.connected ? 'open' : 'timeout'), 1000);

    socket.on('connect', () => {
      connected = true;
      setTimeout(() => {
        if (socket.connected) {
          clearTimeout(timer);
          resolve('open');
        }
      }, 150);
    });
    socket.on('disconnect', () => {
      clearTimeout(timer);
      resolve('closed');
    });
    socket.on('connect_error', () => {
      clearTimeout(timer);
      resolve('error');
    });
  });

  return socket;
}

describe('node WebSocket handshake limits', function () {
  this.timeout(5000);

  let server;
  let wsServer;
  let sockets;
  let peers;
  let logger;

  async function listen (wsNode, peerMap) {
    peers = peerMap;
    logger = createLogger();
    server = http.createServer();
    wsServer = new WebSocketServer(server, {
      address: '127.0.0.1',
      port: 0,
      cors: { origin: '*' },
      wsNode: Object.assign({
        enabled: true,
        maxBroadcastConnections: 15,
        maxReceiveConnections: 25
      }, wsNode)
    }, logger);

    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    wsServer.initialize({
      peers: {
        getByNonce: function (nonce) {
          return peers[nonce] || null;
        },
        getSocketCount: function () {
          return Object.values(peers).filter(function (peer) {
            return peer.isBroadcastingViaSocket;
          }).length;
        }
      }
    });

    return server.address().port;
  }

  beforeEach(function () {
    sockets = [];
  });

  afterEach(async function () {
    sockets.forEach((socket) => socket.close());
    sockets = [];

    if (wsServer) {
      await new Promise((resolve) => wsServer.io.close(resolve));
      wsServer = null;
    }

    if (server) {
      await new Promise((resolve) => server.close(resolve));
      server = null;
    }
  });

  it('should keep nonce, address, and banned-peer rejection in front of an accepted peer', async function () {
    const good = {
      ip: '127.0.0.1',
      state: Peer.STATE.CONNECTED,
      isBroadcastingViaSocket: false
    };
    const banned = {
      ip: '127.0.0.1',
      state: Peer.STATE.BANNED,
      isBroadcastingViaSocket: false
    };
    const remote = {
      ip: '8.8.8.8',
      state: Peer.STATE.CONNECTED,
      isBroadcastingViaSocket: false
    };
    const port = await listen({
      handshakeLimit: 100,
      handshakeLimitPerNonce: 100,
      handshakeWindowMs: 60000
    }, {
      good: good,
      banned: banned,
      remote: remote
    });

    const missing = connect(port, {});
    const unknown = connect(port, { nonce: 'missing' });
    const wrongIp = connect(port, { nonce: 'remote' });
    const bannedSocket = connect(port, { nonce: 'banned' });
    const accepted = connect(port, { nonce: 'good' });
    sockets.push(missing, unknown, wrongIp, bannedSocket, accepted);

    expect(await missing.outcome).to.not.equal('open');
    expect(await unknown.outcome).to.not.equal('open');
    expect(await wrongIp.outcome).to.not.equal('open');
    expect(await bannedSocket.outcome).to.not.equal('open');
    expect(await accepted.outcome).to.equal('open');
    expect(good.isBroadcastingViaSocket).to.equal(true);
    expect(banned.isBroadcastingViaSocket).to.equal(false);
    expect(remote.isBroadcastingViaSocket).to.equal(false);
    expect(logger.trace.calledWith(
        'ws-node-server',
        sinon.match.string,
        'Wrong peer nonce'
    )).to.equal(true);
    expect(logger.trace.calledWith(
        'ws-node-server',
        sinon.match.string,
        'Unknown or banned peer'
    )).to.equal(true);
  });

  it('should throttle repeated handshakes from one address without accepting the extra peer', async function () {
    const firstPeer = {
      ip: '127.0.0.1',
      state: Peer.STATE.CONNECTED,
      isBroadcastingViaSocket: false
    };
    const secondPeer = {
      ip: '127.0.0.1',
      state: Peer.STATE.CONNECTED,
      isBroadcastingViaSocket: false
    };
    const port = await listen({
      handshakeLimit: 2,
      handshakeLimitPerNonce: 10,
      handshakeWindowMs: 60000
    }, {
      a: firstPeer,
      b: secondPeer
    });
    const first = connect(port, { nonce: 'a' });
    const second = connect(port, { nonce: 'b' });
    const third = connect(port, { nonce: 'a' });
    sockets.push(first, second, third);

    expect(await first.outcome).to.equal('open');
    expect(await second.outcome).to.equal('open');
    expect(await third.outcome).to.not.equal('open');
    expect(logger.trace.calledWith(
        'ws-node-server',
        sinon.match.string,
        'Too many connection attempts'
    )).to.equal(true);
  });

  it('should throttle repeated handshakes for one nonce', async function () {
    const peer = {
      ip: '127.0.0.1',
      state: Peer.STATE.CONNECTED,
      isBroadcastingViaSocket: false
    };
    const port = await listen({
      handshakeLimit: 100,
      handshakeLimitPerNonce: 2,
      handshakeWindowMs: 60000
    }, {
      good: peer
    });
    const first = connect(port, { nonce: 'good' });
    sockets.push(first);

    expect(await first.outcome).to.equal('open');

    first.close();
    await new Promise((resolve) => setTimeout(resolve, 50));

    const second = connect(port, { nonce: 'good' });
    sockets.push(second);
    expect(await second.outcome).to.equal('open');

    second.close();
    await new Promise((resolve) => setTimeout(resolve, 50));

    const third = connect(port, { nonce: 'good' });
    sockets.push(third);
    expect(await third.outcome).to.not.equal('open');
  });

  it('should reject a duplicate socket for an already connected nonce', async function () {
    const peer = {
      ip: '127.0.0.1',
      state: Peer.STATE.CONNECTED,
      isBroadcastingViaSocket: false
    };
    const port = await listen({
      handshakeLimit: 100,
      handshakeLimitPerNonce: 100,
      handshakeWindowMs: 60000
    }, {
      good: peer
    });
    const first = connect(port, { nonce: 'good' });
    const second = connect(port, { nonce: 'good' });
    sockets.push(first, second);

    expect(await first.outcome).to.equal('open');
    expect(await second.outcome).to.not.equal('open');
    expect(peer.isBroadcastingViaSocket).to.equal(true);
    expect(logger.trace.calledWith(
        'ws-node-server',
        sinon.match.string,
        'Peer is already connected'
    )).to.equal(true);
  });
});
