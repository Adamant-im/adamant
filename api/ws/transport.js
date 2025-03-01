'use strict';

const { io } = require('socket.io-client');
const Peer = require('../../logic/peer.js');

const maxReconnectDelay = 60000;
const defaultReconnectionDelay = 5000;

/**
 * Connects to random peers via WebSocket to receive transactions/blocks/signature changes
 */
class TransportWsApi {
  constructor(modules, library, options) {
    this.modules = modules;
    this.library = library;
    this.peers = modules.peers;
    this.system = modules.system;
    this.transportModule = modules.transport;
    this.logger = library.logger;

    this.maxConnections = options.maxWsConnections;
    this.reconnectionDelay = defaultReconnectionDelay;

    this.connections = new Map();

    // Update connections when peer list changes
    this.peers.events.on('peers:update', () => this.updatePeers());

    // Schedule rotation
    this.startRotation();
  }

  /**
   * Clear connection list and connect to random peers
   */
  initialize() {
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
  }

  /**
   * Connect to the peer and save the socket connection
   * @param {Peer} peer peer to connect to
   * @returns
   */
  connectToPeer(peer) {
    const self = this;
    const peerUrl = `ws://${peer.ip}:${peer.port}`;

    if (this.connections.has(peerUrl)) {
      return;
    }

    self.logger.debug(`Connecting to WebSocket peer: ${peerUrl}`);

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
    socket.on('disconnect_reason', (reason) => {
      this.logger.debug(`WebSocket: ${peer.ip}:${peer.port} rejected connection`, reason);
    });

    self.connections.set(peerUrl, { socket, peer });
  }

  /**
   * Setup event handlers for the peer and change its connection type
   * @param {Socket} socket socket.io socket instance
   * @param {Peer} peer target peer
   */
  handleConnect(socket, peer) {
    this.logger.debug(`WebSocket: Connected to peer WebSocket at ${peer.ip}:${peer.port}`);

    this.peers.switchToWs(peer);
    this.peers.recordRequest(peer.ip, peer.port, null);

    this.setupEventHandlers(socket, peer);
  }

  handleConnectError(peer, err) {
    this.logger.debug(`WebSocket: Connection error with ${peer.ip}:${peer.port}`, err.message);

    this.peers.switchToHttp(peer);
    this.peers.recordRequest(peer.ip, peer.port, err);

    this.replacePeer(peer);
  }

  handleDisconnect(peer, reason) {
    this.logger.debug(`WebSocket: Disconnected from ${peer.ip}:${peer.port}`, reason);
    this.peers.switchToHttp(peer);
    this.replacePeer(peer);
  }

  replacePeer(peer) {
    const self = this;

    // Remove the disconnected peer
    self.connections.delete(`ws://${peer.ip}:${peer.port}`);

    // Find a new peer to replace it
    self.getRandomPeer((err, newPeer) => {
      if (err || !newPeer) {
        self.logger.debug('WebSocket: Failed to find replacement peer');
        return;
      }

      self.connectToPeer(newPeer);
    });
  }

  scheduleReconnect() {
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
  }

  getRandomPeers(limit, callback) {
    this.peers.list({
      limit,
      allowedStates: [Peer.STATE.CONNECTED],
      syncProtocol: 'http',
      broadhash: this.modules.system.getBroadhash()
    }, callback);
  }

  getRandomPeer(callback) {
    this.getRandomPeers(1, (err, peers) => {
      if (err || !peers.length) {
        return callback(err || new Error('No peers available'));
      }
      callback(null, peers[0]);
    });
  }

  setupEventHandlers(socket, peer) {
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
  }

  updatePeers() {
    const self = this;

    this.connections.forEach(({ peer }) => {
      if (self.peers.isBanned(peer)) {
        self.cleanupConnection(peer);
      }
    });

    const availableSlots = this.maxConnections - this.connections.size;

    if (availableSlots <= 0) {
      return;
    }

    this.getRandomPeers(availableSlots, (err, candidates) => {
      if (err || !candidates.length) {
        return;
      }

      candidates.forEach(peer => {
        self.connectToPeer(peer);
      });
    });
  }

  cleanupConnection(peer) {
    const peerUrl = `ws://${peer.ip}:${peer.port}`;
    const connection = this.connections.get(peerUrl);

    if (connection) {
      connection.socket.removeAllListeners();
      connection.socket.disconnect();
      this.connections.delete(peerUrl);
    }
  }

  rotatePeers() {
    const self = this;

    const totalConnections = self.connections.size;

    if (totalConnections === 0) {
      return;
    }

    const countToRotate = Math.ceil(totalConnections * 0.2); // rotate 20%
    const connectionsArray = Array.from(self.connections.values());

    const shuffled = connectionsArray.sort(() => Math.random() - 0.5);

    self.getRandomPeers(countToRotate, (err, newPeers) => {
      if (err || !newPeers.length) {
        return;
      }

      self.logger.debug(`Rotating ${newPeers.length} out of ${totalConnections} peers.`);

      const peersToRotate = shuffled.slice(0, newPeers.length).map((connection) => connection.peer);

      peersToRotate.forEach(peer => {
        self.logger.debug(`Rotating peer ${peer.ip}:${peer.port}`);
        self.cleanupConnection(peer);
      });

      newPeers.forEach(newPeer => {
        self.connectToPeer(newPeer);
      });
    });
  }

  startRotation() {
    this.rotationInterval = setInterval(() => {
      this.rotatePeers();
    }, 1000 * 60 * 30); // 30 minutes
  }

  stopRotation() {
    if (this.rotationInterval) {
      clearInterval(this.rotationInterval);
      this.rotationInterval = null;
    }
  }
}


module.exports = TransportWsApi;
