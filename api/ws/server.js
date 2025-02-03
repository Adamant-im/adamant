const { Server } = require('socket.io');
const Peer = require('../../logic/peer');

function WebSocketServer(server, appConfig) {
  this.io = new Server(server, {
    allowEIO3: true,
    cors: appConfig.cors,
  });

  this.enabled = appConfig.wsNode.enabled;
  this.max = appConfig.wsNode.maxConnections;
}

WebSocketServer.prototype.linkPeers = function (logic) {
  if (!this.enabled) {
    return;
  }

  this.io.on('connection', (socket) => {
    const peerIp = socket.handshake.address || socket.request.socket.remoteAddress;
    const { nonce } = socket.handshake.auth;

    if (!nonce) {
      socket.disconnect(true);
      return;
    }

    const existingPeer = logic.peers.getByNonce(nonce);

    // Handle IPv6-mapped IPv4 addresses
    const normalizeIp = (ip) => ip.replace(/^::ffff:/, '');

    if (
      !existingPeer
      || normalizeIp(peerIp) !== normalizeIp(existingPeer.ip)
      || existingPeer.state === Peer.STATE.BANNED
    ) {
      socket.disconnect(true);
      return;
    }

    if (logic.peers.getSocketCount() >= this.max) {
      socket.disconnect(true);
      return;
    }

    logic.peers.upsert({ ip, port, viaSocket: true });

    socket.on('disconnect', () => {
      logic.peers.upsert({ ip, port, viaSocket: false });
    });
  });
};

WebSocketServer.prototype.emit = function (eventName, data) {
  if (this.enabled) {
    this.io.sockets.emit(eventName, data);
  }
}

module.exports = WebSocketServer;
