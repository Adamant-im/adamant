const { Server } = require('socket.io');
const Peer = require('../../logic/peer');

/**
 * Creates a WebSocket server to broadcast transactions/blocks/signature changes
 */
class WebSocketServer {
  constructor(server, appConfig, logger) {
    this.io = new Server(server, {
      allowEIO3: true,
      cors: appConfig.cors,
    });

    this.enabled = appConfig.wsNode.enabled;
    this.max = appConfig.wsNode.maxBroadcastConnections;

    this.logger = logger;

    const self = this;
    self.logger.info(`[WsNodeServer] Created WebSocketServer`);
  }

  /**
   * Initializes the server and authorizes connections
   * @param {{ peers: Peers }} logic logic modules
   */
  initialize(logic) {
    const self = this;

    if (!this.enabled) {
      return;
    }

    this.io.on('connection', (socket) => {
      const peerIp = socket.handshake.address || socket.request.socket.remoteAddress;

      self.logger.debug(`[WsNodeServer] WebSocket peer ${peerIp} is connecting…`);

      const { nonce } = socket.handshake.auth;

      if (!nonce) {
        self.logger.trace(`[WsNodeServer] WebSocket peer ${peerIp} is not allowed to connect`, 'Wrong peer nonce');

        socket.disconnect(true);
        return;
      }

      const existingPeer = logic.peers.getByNonce(nonce);

      // Handle IPv6-mapped IPv4 addresses
      const normalizeIp = (ip) => ip.replace(/^::ffff:/, '');

      if (
        !existingPeer ||
        normalizeIp(peerIp) !== normalizeIp(existingPeer.ip) ||
        existingPeer.state === Peer.STATE.BANNED
      ) {
        self.logger.trace(`[WsNodeServer] WebSocket peer ${peerIp} is not allowed to connect`, 'Unknown or banned peer');

        socket.disconnect(true);
        return;
      }

      if (logic.peers.getSocketCount() >= this.max) {
        const reason = 'Server connection limit exceeded';

        self.logger.trace(`[WsNodeServer] WebSocket peer ${peerIp} is not allowed to connect`, reason);

        socket.emit('disconnect_reason', reason);
        socket.disconnect(true);
        return;
      }

      existingPeer.isBroadcastingViaSocket = true;

      socket.on('disconnect', () => {
        const disconnectedPeer = logic.peers.getByNonce(nonce);

        self.logger.debug(`[WsNodeServer] WebSocket peer ${disconnectedPeer.ip} is disconnecting…`);

        if (disconnectedPeer) {
          disconnectedPeer.isBroadcastingViaSocket = false;
        }
      });
    });
  }

  /**
   * Emits data to all socket connections
   * @param {string} eventName emitting event name
   * @param {any} data data to emit
   */
  emit(eventName, data) {
    if (this.enabled) {
      this.io.sockets.emit(eventName, data);
    }
  }
}

module.exports = WebSocketServer;
