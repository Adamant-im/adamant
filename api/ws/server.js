const { Server } = require('socket.io');
const AbuseWindow = require('../../helpers/abuse-window');
const normalizeIp = AbuseWindow.normalizeIp;
const SocketAdmission = require('../../helpers/socket-admission.js');
const Peer = require('../../logic/peer');

const HANDSHAKE_DEFAULTS = {
  handshakeLimit: 60,
  handshakeLimitPerNonce: 30,
  handshakeWindowMs: 60000
};

/**
 * Creates a WebSocket server to broadcast transactions/blocks/signature changes
 */
class WebSocketServer {
  constructor (server, appConfig, logger) {
    this.enabled = appConfig.wsNode.enabled;
    this.max = appConfig.wsNode.maxBroadcastConnections;
    this.address = appConfig.address;
    this.port = appConfig.port;
    this.handshake = normalizeHandshakeLimits(appConfig.wsNode);
    this.logger = logger;
    this.nonceHandshakes = new AbuseWindow(
        this.handshake.handshakeLimitPerNonce,
        this.handshake.handshakeWindowMs
    );
    this.admittedSockets = new Set();
    this.socketsByNonce = new Map();
    this.transportAdmission = new SocketAdmission({
      maxConnections: this.enabled ? this.max : 0,
      maxConnectionsPerIp: null,
      maxConnectionAttempts: this.handshake.handshakeLimit,
      connectionWindowMs: this.handshake.handshakeWindowMs,
      trustProxy: false,
      onReject: (reason, address) => {
        this.logger.trace(
            'ws-node-server',
            `WebSocket peer ${address} is not allowed to connect`,
            reason
        );
      }
    });
    this.io = new Server(server, {
      allowEIO3: true,
      cors: appConfig.cors,
      allowRequest: this.transportAdmission.allowRequest.bind(this.transportAdmission)
    });
    this.transportAdmission.bind(this.io.engine);

    const self = this;
    self.logger.info('ws-node-server', 'Created WebSocketServer');
  }

  /**
   * Initializes the server and authorizes connections
   * @param {{ peers: Peers }} logic logic modules
   */
  initialize (logic) {
    const self = this;

    if (!this.enabled) {
      return;
    }

    self.logger.info('ws-node-server', `WebSocketServer enabled; awaiting inbound peers on ${this.address}:${this.port}…`);

    this.io.on('connection', (socket) => {
      const peerIp = socket.handshake.address || socket.request.socket.remoteAddress;
      const normalizedIp = normalizeIp(peerIp);

      self.logger.debug('ws-node-server', `WebSocket peer ${peerIp} is connecting…`, { direction: 'inbound' });

      const { nonce } = socket.handshake.auth;

      if (!nonce) {
        self.logger.trace('ws-node-server', `WebSocket peer ${peerIp} is not allowed to connect`, 'Wrong peer nonce');

        socket.disconnect(true);
        return;
      }

      const existingPeer = logic.peers.getByNonce(nonce);

      if (
        !existingPeer ||
        normalizedIp !== normalizeIp(existingPeer.ip) ||
        existingPeer.state === Peer.STATE.BANNED
      ) {
        self.logger.trace('ws-node-server', `WebSocket peer ${peerIp} is not allowed to connect`, 'Unknown or banned peer');

        socket.disconnect(true);
        return;
      }

      if (!this.nonceHandshakes.allow(String(nonce))) {
        self.logger.trace('ws-node-server', `WebSocket peer ${peerIp} is not allowed to connect`, 'Too many connection attempts');
        socket.emit('disconnect_reason', 'Too many connection attempts');
        socket.disconnect(true);
        return;
      }

      if (this.socketsByNonce.has(String(nonce))) {
        const reason = 'Peer is already connected';

        self.logger.trace('ws-node-server', `WebSocket peer ${peerIp} is not allowed to connect`, reason);
        socket.emit('disconnect_reason', reason);
        socket.disconnect(true);
        return;
      }

      if (this.admittedSockets.size >= this.max) {
        const reason = 'Server connection limit exceeded';

        self.logger.trace('ws-node-server', `WebSocket peer ${peerIp} is not allowed to connect`, reason);

        socket.emit('disconnect_reason', reason);
        socket.disconnect(true);
        return;
      }

      existingPeer.isBroadcastingViaSocket = true;
      this.admittedSockets.add(socket);
      this.socketsByNonce.set(String(nonce), socket);

      self.logger.info('ws-node-server', `WebSocket peer ${peerIp} is connected to the node`, { direction: 'inbound' });

      socket.on('disconnect', () => {
        self.logger.debug('ws-node-server', `WebSocket peer ${existingPeer.ip} is disconnecting…`);
        this.admittedSockets.delete(socket);
        if (this.socketsByNonce.get(String(nonce)) === socket) {
          this.socketsByNonce.delete(String(nonce));
          existingPeer.isBroadcastingViaSocket = false;
        }
      });
    });
  }

  /**
   * Emits data to all socket connections
   * @param {string} eventName emitting event name
   * @param {any} data data to emit
   */
  emit (eventName, data) {
    if (this.enabled) {
      this.io.sockets.emit(eventName, data);
    }
  }
}

module.exports = WebSocketServer;
module.exports.handshakeDefaults = HANDSHAKE_DEFAULTS;

/**
 * Fills omitted handshake limits from the production defaults.
 * Zero disables that handshake cap.
 * @param {object} wsNode - Node WebSocket config.
 * @return {object} Normalized handshake limits.
 */
function normalizeHandshakeLimits (wsNode) {
  const source = wsNode && typeof wsNode === 'object' ? wsNode : {};
  const normalized = {};

  Object.keys(HANDSHAKE_DEFAULTS).forEach(function (key) {
    if (!Object.prototype.hasOwnProperty.call(source, key)) {
      normalized[key] = HANDSHAKE_DEFAULTS[key];
      return;
    }

    const value = Math.floor(Number(source[key]));
    normalized[key] = Number.isFinite(value) && value >= 0 ? value : HANDSHAKE_DEFAULTS[key];
  });

  if (normalized.handshakeWindowMs === 0) {
    normalized.handshakeWindowMs = HANDSHAKE_DEFAULTS.handshakeWindowMs;
  }

  return normalized;
}
