const { Server } = require('socket.io');
const AbuseWindow = require('../../helpers/abuse-window');
const ipLimitKey = AbuseWindow.ipLimitKey;
const normalizeIp = AbuseWindow.normalizeIp;
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
    this.io = new Server(server, {
      allowEIO3: true,
      cors: appConfig.cors
    });

    this.enabled = appConfig.wsNode.enabled;
    this.max = appConfig.wsNode.maxBroadcastConnections;
    this.address = appConfig.address;
    this.port = appConfig.port;
    this.handshake = normalizeHandshakeLimits(appConfig.wsNode);

    this.logger = logger;

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

    this.ipHandshakes = new AbuseWindow(this.handshake.handshakeLimit, this.handshake.handshakeWindowMs);
    this.nonceHandshakes = new AbuseWindow(
        this.handshake.handshakeLimitPerNonce,
        this.handshake.handshakeWindowMs
    );

    this.io.on('connection', (socket) => {
      const peerIp = socket.handshake.address || socket.request.socket.remoteAddress;
      const normalizedIp = normalizeIp(peerIp);

      self.logger.debug('ws-node-server', `WebSocket peer ${peerIp} is connecting…`, { direction: 'inbound' });

      if (!this.ipHandshakes.allow(ipLimitKey(peerIp))) {
        self.logger.trace('ws-node-server', `WebSocket peer ${peerIp} is not allowed to connect`, 'Too many connection attempts');
        socket.emit('disconnect_reason', 'Too many connection attempts');
        socket.disconnect(true);
        return;
      }

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

      if (existingPeer.isBroadcastingViaSocket) {
        const reason = 'Peer is already connected';

        self.logger.trace('ws-node-server', `WebSocket peer ${peerIp} is not allowed to connect`, reason);
        socket.emit('disconnect_reason', reason);
        socket.disconnect(true);
        return;
      }

      if (logic.peers.getSocketCount() >= this.max) {
        const reason = 'Server connection limit exceeded';

        self.logger.trace('ws-node-server', `WebSocket peer ${peerIp} is not allowed to connect`, reason);

        socket.emit('disconnect_reason', reason);
        socket.disconnect(true);
        return;
      }

      existingPeer.isBroadcastingViaSocket = true;

      self.logger.info('ws-node-server', `WebSocket peer ${peerIp} is connected to the node`, { direction: 'inbound' });

      socket.on('disconnect', () => {
        self.logger.debug('ws-node-server', `WebSocket peer ${existingPeer.ip} is disconnecting…`);
        existingPeer.isBroadcastingViaSocket = false;
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
