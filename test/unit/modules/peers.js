'use strict';

var chai = require('chai');
var expect = require('chai').expect;
var express = require('express');
var sinon = require('sinon');
var randomString = require('randomstring');
var _ = require('lodash');

var config = require('../../config.json');

const { removeQueuedJob } = require('../../common/globalAfter.js');
const { validPeer } = require('../../common/stubs/peers.js');
var modulesLoader = require('../../common/initModule').modulesLoader;

var currentPeers = [];

describe('peers', function () {
  var peers, modules;

  var NONCE = randomString.generate(16);

  function getPeers (cb) {
    peers.list({ broadhash: config.nethash }, function (err, __peers) {
      expect(err).to.not.exist;
      expect(__peers).to.be.an('array');
      return cb(err, __peers);
    });
  }

  before(function (done) {
    modulesLoader.initModules([
      { system: require('../../../modules/system.js') },
      { peers: require('../../../modules/peers.js') },
      { transport: require('../../../modules/transport.js') },
    ], [
      { 'peers': require('../../../logic/peers.js') }
    ], { nonce: NONCE }, (err, __modules) => {
      if (err) {
        return done(err);
      }
      peers = __modules.peers;
      modules = __modules;
      peers.onBind(__modules);
      done();
    });
  });

  beforeEach(function (done) {
    getPeers(function (err, __peers) {
      currentPeers = __peers;
      done();
    });
  });

  describe('sandboxApi', function (done) {
    it('should pass the call', function () {
      var sandboxHelper = require('../../../helpers/sandbox.js');
      sinon.stub(sandboxHelper, 'callMethod').returns(true);
      peers.sandboxApi();
      expect(sandboxHelper.callMethod.calledOnce).to.be.true;
      sandboxHelper.callMethod.restore();
    });
  });

  describe('update', function () {
    it('should insert new peer', function (done) {
      peers.update(validPeer);

      getPeers(function (err, __peers) {
        expect(currentPeers.length + 1).that.equals(__peers.length);
        currentPeers = __peers;
        var inserted = __peers.find(function (p) {
          return p.ip + ':' + p.port === validPeer.ip + ':' + validPeer.port;
        });
        expect(inserted).to.be.an('object');
        expect(inserted).not.to.be.empty;
        done();
      });
    });

    it('should update existing peer', function (done) {
      var toUpdate = _.clone(validPeer);
      toUpdate.height += 1;
      peers.update(toUpdate);

      getPeers(function (err, __peers) {
        expect(currentPeers.length).that.equals(__peers.length);
        currentPeers = __peers;
        var updated = __peers.find(function (p) {
          return p.ip + ':' + p.port === validPeer.ip + ':' + validPeer.port;
        });
        expect(updated).to.be.an('object');
        expect(updated).not.to.be.empty;
        expect(updated.ip + ':' + updated.port).that.equals(validPeer.ip + ':' + validPeer.port);
        expect(updated.height).that.equals(toUpdate.height);
        done();
      });
    });

    it('should insert new peer if ip or port changed', function (done) {
      var toUpdate = _.clone(validPeer);
      toUpdate.port += 1;
      peers.update(toUpdate);

      getPeers(function (err, __peers) {
        expect(currentPeers.length + 1).that.equals(__peers.length);
        currentPeers = __peers;
        var inserted = __peers.find(function (p) {
          return p.ip + ':' + p.port === toUpdate.ip + ':' + toUpdate.port;
        });
        expect(inserted).to.be.an('object');
        expect(inserted).not.to.be.empty;
        expect(inserted.ip + ':' + inserted.port).that.equals(toUpdate.ip + ':' + toUpdate.port);

        toUpdate.ip = '40.40.40.41';
        peers.update(toUpdate);
        getPeers(function (err, __peers) {
          expect(currentPeers.length + 1).that.equals(__peers.length);
          currentPeers = __peers;
          var inserted = __peers.find(function (p) {
            return p.ip + ':' + p.port === toUpdate.ip + ':' + toUpdate.port;
          });
          expect(inserted).to.be.an('object');
          expect(inserted).not.to.be.empty;
          expect(inserted.ip + ':' + inserted.port).that.equals(toUpdate.ip + ':' + toUpdate.port);
          done();
        });
      });
    });

    var ipAndPortPeer = {
      ip: '40.41.40.41',
      port: 4000
    };

    it('should insert new peer with only ip and port defined', function (done) {
      peers.update(ipAndPortPeer);

      getPeers(function (err, __peers) {
        expect(currentPeers.length + 1).that.equals(__peers.length);
        currentPeers = __peers;
        var inserted = __peers.find(function (p) {
          return p.ip + ':' + p.port === ipAndPortPeer.ip + ':' + ipAndPortPeer.port;
        });
        expect(inserted).to.be.an('object');
        expect(inserted).not.to.be.empty;
        expect(inserted.ip + ':' + inserted.port).that.equals(ipAndPortPeer.ip + ':' + ipAndPortPeer.port);
        done();
      });
    });

    it('should update peer with only one property defined', function (done) {
      peers.update(ipAndPortPeer);

      getPeers(function (err, __peers) {
        currentPeers = __peers;

        var almostEmptyPeer = _.clone(ipAndPortPeer);
        almostEmptyPeer.height = 1;

        peers.update(almostEmptyPeer);
        getPeers(function (err, __peers) {
          expect(currentPeers.length).that.equals(__peers.length);
          var inserted = __peers.find(function (p) {
            return p.ip + ':' + p.port === ipAndPortPeer.ip + ':' + ipAndPortPeer.port;
          });
          expect(inserted).to.be.an('object');
          expect(inserted).not.to.be.empty;
          expect(inserted.ip + ':' + inserted.port).that.equals(ipAndPortPeer.ip + ':' + ipAndPortPeer.port);
          expect(inserted.height).that.equals(almostEmptyPeer.height);
          done();
        });
      });
    });
  });

  describe('remove', function () {
    before(function (done) {
      peers.update(validPeer);
      done();
    });

    it('should remove added peer', function (done) {
      getPeers(function (err, __peers) {
        currentPeers = __peers;
        var peerToRemove = currentPeers.find(function (p) {
          return p.ip + ':' + p.port === validPeer.ip + ':' + validPeer.port;
        });
        expect(peerToRemove).to.be.an('object').and.not.to.be.empty;
        expect(peerToRemove.state).that.equals(2);

        expect(peers.remove(peerToRemove.ip, peerToRemove.port)).to.be.true;
        getPeers(function (err, __peers) {
          expect(currentPeers.length - 1).that.equals(__peers.length);
          currentPeers = __peers;
          done();
        });
      });
    });
  });

  describe('acceptable', function () {
    before(function () {
      process.env['NODE_ENV'] = 'DEV';
    });

    var ip = require('neoip');

    it('should accept peer with public ip', function () {
      expect(peers.acceptable([validPeer])).that.is.an('array').and.to.deep.equal([validPeer]);
    });

    it('should not accept peer with private ip', function () {
      var privatePeer = _.clone(validPeer);
      privatePeer.ip = '127.0.0.1';
      expect(peers.acceptable([privatePeer])).that.is.an('array').and.to.be.empty;
    });

    it('should not accept peer with adm-js-api os', function () {
      var privatePeer = _.clone(validPeer);
      privatePeer.os = 'adm-js-api';
      expect(peers.acceptable([privatePeer])).that.is.an('array').and.to.be.empty;
    });

    it('should not accept peer with host\'s nonce', function () {
      var peer = _.clone(validPeer);
      peer.nonce = NONCE;
      expect(peers.acceptable([peer])).that.is.an('array').and.to.be.empty;
    });

    it('should not accept peer with different ip but the same nonce', function () {
      process.env['NODE_ENV'] = 'TEST';
      var meAsPeer = {
        ip: '40.00.40.40',
        port: 4001,
        nonce: NONCE
      };
      expect(peers.acceptable([meAsPeer])).that.is.an('array').and.to.be.empty;
    });

    after(function () {
      process.env['NODE_ENV'] = 'TEST';
    });
  });

  describe('ping', function () {
    it('should accept peer with public ip', function (done) {
      sinon.stub(modules.transport, 'getFromPeer').callsArgWith(2, null, {
        success: true,
        peer: validPeer,
        body: {
          success: true, height: validPeer.height, peers: [validPeer]
        }
      });

      peers.ping(validPeer, function (err, res) {
        expect(modules.transport.getFromPeer.calledOnce).to.be.true;
        expect(modules.transport.getFromPeer.calledWith(validPeer)).to.be.true;
        modules.transport.getFromPeer.restore();
        done();
      });
    });
  });

  describe('onBlockchainReady', function () {
    before(function () {
      modules.transport.onBind(modules);
    });

    it('should update peers during onBlockchainReady', function (done) {
      sinon.stub(peers, 'discover').callsArgWith(0, null);
      var config = require('../../config.json');
      var initialPeers = _.clone(config.peers.list);
      if (initialPeers.length === 0) {
        config.peers.list.push(validPeer);
      }
      peers.onBlockchainReady();
      setTimeout(function () {
        expect(peers.discover.calledOnce).to.be.true;
        peers.discover.restore();
        done();
      }, 1000);
    });
  });

  describe('onPeersReady', function () {
    before(function () {
      modules.transport.onBind(modules);
    });

    it('should update peers during onBlockchainReady', function (done) {
      sinon.stub(peers, 'discover').callsArgWith(0, null);
      peers.onPeersReady();
      setTimeout(function () {
        expect(peers.discover.calledOnce).to.be.true;
        peers.discover.restore();
        done();
      }, 1000);
    });
  });
});
