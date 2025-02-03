'use strict';

const { io } = require('socket.io-client');
const Peer = require('../../logic/peer.js');

const maxReconnectDelay = 60000;
const defaultReconnectionDelay = 5000;

function TransportWsApi(modules, library, options) {
  this.modules = modules;
  this.library = library;
  this.peers = modules.peers;
  this.system = modules.system;
  this.transportModule = modules.transport;
  this.logger = library.logger;

  this.maxConnections = options.maxWsConnections;
  this.reconnectionDelay = defaultReconnectionDelay;

  this.connections = new Map();
}

TransportWsApi.prototype.initialize = function() {
  const self = this;

  // Clear existing connections
  self.connections.forEach((socket) => {
    socket.removeAllListeners();
    socket.disconnect();
  });
  self.connections.clear();

  // Connect to multiple peers
  self.getRandomPeers(self.maxConnections, (err, peers) => {
    if (err || !peers.length) {
      return self.scheduleReconnect();
    }

    this.reconnectionDelay = defaultReconnectionDelay;

    peers.forEach((peer) => self.connectToPeer(peer));
  });
};

TransportWsApi.prototype.connectToPeer = function(peer) {
  const self = this;
  const peerUrl = `wss://${peer.ip}:${peer.port}`;

  if (this.connections.has(peerUrl)) {
    return;
  }

  self.logger.error(`Connecting to WebSocket peer: ${peerUrl}`);

  const socket = io(peerUrl, {
    reconnection: false,
    transports: ['websocket'],
    auth: {
      nonce: this.system.getNonce(),
    },
  });

  socket.on('connect', () => self.handleConnect(socket, peer));
  socket.on('connect_error', (err) => self.handleConnectError(peer, err));
  socket.on('disconnect', (reason) => self.handleDisconnect(peer, reason));

  self.connections.set(peerUrl, { socket, peer });
};

TransportWsApi.prototype.handleConnect = function(socket, peer) {
  this.logger.debug(`WebSocket: Connected to peer WebSocket at ${peer.ip}:${peer.port}`);
  this.peers.recordRequest(peer.ip, peer.port, null);
  this.setupEventHandlers(socket, peer);
};

TransportWsApi.prototype.handleConnectError = function(peer, err) {
  this.logger.debug(`WebSocket: Connection error with ${peer.ip}:${peer.port}`, err.message);
  this.peers.recordRequest(peer.ip, peer.port, err);
  this.replacePeer(peer);
};

TransportWsApi.prototype.handleDisconnect = function(peer, reason) {
  this.logger.debug(`WebSocket: Disconnected from ${peer.ip}:${peer.port}`, reason);
  this.replacePeer(peer);
};

TransportWsApi.prototype.replacePeer = function(peer) {
  const self = this;

  // Remove the disconnected peer
  self.connections.delete(`wss://${peer.ip}:${peer.port}`);

  // Find a new peer to replace it
  self.getRandomPeer((err, newPeer) => {
    if (err || !newPeer) {
      self.logger.debug('WebSocket: Failed to find replacement peer');
      return;
    }

    self.connectToPeer(newPeer);
  });
};

TransportWsApi.prototype.scheduleReconnect = function() {
  if (this.reconnectTimeout) {
    clearTimeout(this.reconnectTimeout);
  }

  this.reconnectTimeout = setTimeout(() => {
    this.initialize();
  }, this.reconnectionDelay);

  this.reconnectionDelay = Math.min(
    this.reconnectionDelay * 2,
    maxReconnectDelay
  );
};

TransportWsApi.prototype.getRandomPeers = function(limit, callback) {
  this.peers.list({
    limit,
    allowedStates: [Peer.STATE.CONNECTED],
    broadhash: this.modules.system.getBroadhash()
  }, callback);
};

TransportWsApi.prototype.getRandomPeer = function(callback) {
  this.getRandomPeers(1, (err, peers) => {
    if (err || !peers.length) {
      return callback(err || new Error('No peers available'));
    }
    callback(null, peers[0]);
  });
};

TransportWsApi.prototype.setupEventHandlers = function(socket, peer) {
  const self = this;

  socket.on('transactions/change', (data) => {
    self.transportModule.internal.postTransactions({
      transaction: data
    }, peer, 'websocket /transactions', (err) => {
      if (err) {
        self.peers.recordRequest(peer.ip, peer.port, err);
      }
    });
  });

  socket.on('blocks/change', (data) => {
    self.transportModule.internal.postBlock(data, peer, 'websocket /blocks', (err) => {
      if (err) {
        self.peers.recordRequest(peer.ip, peer.port, err);
      }
    });
  });

  socket.on('signature/change', (data) => {
    self.transportModule.internal.postSignatures({
      signature: data
    }, (err) => {
      if (err) {
        self.peers.recordRequest(peer.ip, peer.port, err);
      }
    });
  });
};

module.exports = TransportWsApi;
