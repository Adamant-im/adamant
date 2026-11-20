'use strict';

var PeersSql = {

  getAll: 'SELECT ip, port, state, os, version, ENCODE(broadhash, \'hex\') AS broadhash, height, clock FROM peers',

  clearDapps: 'DELETE FROM peers_dapp',

  clear: 'DELETE FROM peers',

  removeByAddress: 'DELETE FROM peers WHERE ip = ${ip} AND port = ${port}',

  truncate: 'TRUNCATE peers CASCADE'
};

module.exports = PeersSql;
