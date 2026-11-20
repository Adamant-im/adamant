'use strict';

const http = require('http');
const { Socket: EngineSocket } = require('engine.io-client');
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

function connect (port, auth, transports) {
  const socket = io('http://127.0.0.1:' + port, {
    forceNew: true,
    reconnection: false,
    timeout: 2000,
    transports: transports || ['websocket'],
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
  let engineClient;
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
    if (engineClient) {
      engineClient.close();
      engineClient = null;
    }

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

  ['polling', 'upgrade', 'websocket'].forEach(function (mode) {
    it('should enforce the authenticated cap after a ' + mode + ' transport is allocated', async function () {
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
        maxBroadcastConnections: 1,
        handshakeLimit: 100,
        handshakeLimitPerNonce: 100,
        handshakeWindowMs: 60000
      }, {
        first: firstPeer,
        second: secondPeer
      });
      const admittedTransports = sinon.spy();
      const transports = mode === 'polling' ?
        ['polling'] :
        mode === 'upgrade' ?
          ['polling', 'websocket'] :
          ['websocket'];

      wsServer.io.engine.on('connection', admittedTransports);

      const first = connect(port, { nonce: 'first' }, transports);
      sockets.push(first);
      expect(await first.outcome).to.equal('open');

      const second = connect(port, { nonce: 'second' }, transports);
      sockets.push(second);
      expect(await second.outcome).to.not.equal('open');
      expect(admittedTransports.calledTwice).to.equal(true);
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(wsServer.transportAdmission.pendingConnectionCount).to.equal(0);
      expect(wsServer.admittedSockets.size).to.equal(1);
    });
  });

  it('should count admitted sockets after the peer record is removed', async function () {
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
      maxBroadcastConnections: 1,
      handshakeLimit: 100,
      handshakeLimitPerNonce: 100,
      handshakeWindowMs: 60000
    }, {
      first: firstPeer,
      second: secondPeer
    });
    const first = connect(port, { nonce: 'first' });
    sockets.push(first);

    expect(await first.outcome).to.equal('open');
    delete peers.first;

    const blocked = connect(port, { nonce: 'second' });
    sockets.push(blocked);
    expect(await blocked.outcome).to.not.equal('open');
    expect(wsServer.admittedSockets.size).to.equal(1);

    first.close();
    await new Promise((resolve) => setTimeout(resolve, 50));

    const accepted = connect(port, { nonce: 'second' });
    sockets.push(accepted);
    expect(await accepted.outcome).to.equal('open');
    expect(wsServer.admittedSockets.size).to.equal(1);
  });

  it('should allow a healthy peer while an unauthenticated transport is pending', async function () {
    const peer = {
      ip: '127.0.0.1',
      state: Peer.STATE.CONNECTED,
      isBroadcastingViaSocket: false
    };
    const port = await listen({
      maxBroadcastConnections: 1,
      maxPendingConnections: 2,
      maxPendingConnectionsPerIp: 2,
      pendingTimeoutMs: 1000,
      handshakeLimit: 100,
      handshakeLimitPerNonce: 100,
      handshakeWindowMs: 60000
    }, {
      known: peer
    });
    const url = `http://127.0.0.1:${port}`;

    engineClient = new EngineSocket(url, {
      path: '/socket.io/',
      transports: ['polling']
    });
    await new Promise((resolve, reject) => {
      engineClient.once('open', resolve);
      engineClient.once('error', reject);
    });

    expect(wsServer.admittedSockets.size).to.equal(0);
    expect(wsServer.transportAdmission.pendingConnectionCount).to.equal(1);

    const accepted = connect(port, { nonce: 'known' });
    sockets.push(accepted);
    expect(await accepted.outcome).to.equal('open');
    expect(wsServer.transportAdmission.pendingConnectionCount).to.equal(1);
    expect(wsServer.io.engine.clientsCount).to.equal(2);
    expect(wsServer.admittedSockets.size).to.equal(1);
  });
});
