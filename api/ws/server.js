const { Server } = require('socket.io');
const Peer = require('../../logic/peer');

function WebSocketServer(server, appConfig) {
  this.io = new Server(server, {
    allowEIO3: true,
    cors: appConfig.cors,
  });
}

WebSocketServer.prototype.linkPeers = function (logic) {
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

    logic.peers.upsert({ ip, port, viaSocket: true });

    socket.on('disconnect', () => {
      logic.peers.upsert({ ip, port, viaSocket: false });
    });
  });
};

module.exports = WebSocketServer;
