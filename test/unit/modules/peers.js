'use strict';

var expect = require('chai').expect;
var sinon = require('sinon');
var randomString = require('randomstring');
var _ = require('lodash');

const config = require('../../config.json');

const { validPeer } = require('../../common/stubs/peers.js');
const Peer = require('../../../logic/peer.js');
var modulesLoader = require('../../common/initModule').modulesLoader;

const initialPeers = _.clone(config.peers.list);

if (initialPeers.length === 0) {
  config.peers.list.push(validPeer);
}

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
      { transport: require('../../../modules/transport.js') }
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

  // Remove stub functions
  afterEach(() => sinon.restore());

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

    it('should export peer with a high valid port to database', function (done) {
      const highPortPeer = {
        ...validPeer,
        ip: '40.41.40.42',
        port: 36667
      };

      peers.update(highPortPeer);
      peers.cleanup(function () {
        modulesLoader.db.oneOrNone(
            'SELECT host(ip) AS ip, port FROM peers WHERE ip = ${ip} AND port = ${port}',
            highPortPeer
        ).then(function (peer) {
          expect(peer).to.be.an('object');
          expect(peer.ip).to.equal(highPortPeer.ip);
          expect(peer.port).to.equal(highPortPeer.port);
          done();
        }).catch(done);
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

  describe('isFrozen()', () => {
    it('should return true for every peer from config', () => {
      const configPeers = _.clone(initialPeers);

      configPeers.forEach((peer) => {
        const isFrozen = peers.isFrozen(peer.ip, peer.port);
        expect(isFrozen).to.be.true;
      });
    });

    it('should return true for random peers', () => {
      const otherPeers = [
        { ip: '192.168.0.1', port: '54321' },
        { ip: '10.0.0.2', port: '12345' },
        { ip: '172.16.0.3', port: '65432' },
        { ip: '8.8.8.8', port: '8080' },
        { ip: '192.168.1.4', port: '5000' },
        { ip: '203.0.113.5', port: '3000' },
        { ip: '10.1.2.3', port: '4000' },
        { ip: '172.20.10.4', port: '6000' },
        { ip: '192.0.2.1', port: '7000' },
        { ip: '192.168.100.10', port: '8000' },
        { ip: '10.10.10.10', port: '9000' },
        { ip: '203.0.113.6', port: '10000' }
      ];

      otherPeers.forEach((peer) => {
        const isFrozen = peers.isFrozen(peer.ip, peer.port);
        expect(isFrozen).to.be.false;
      });
    });
  });

  describe('recordRequest()', () => {
    function expectState (peer, state, done) {
      peers.shared.getPeer({
        body: { ip: peer.ip, port: peer.port }
      }, (error, response) => {
        expect(error).not.to.exist;

        expect(response.success).to.be.true;
        expect(response.peer).to.be.an('object')
            .that.has.property('state')
            .that.equals(state);

        done();
      });
    }

    it('should NOT disconnect from the peer after only 1 failed requests', (done) => {
      const targetPeer = currentPeers[0];
      peers.recordRequest(targetPeer.ip, targetPeer.port, 'ECONNRESET');

      expectState(targetPeer, Peer.STATE.CONNECTED, done);
    });

    it('should disconnect from the peer after 10 failed requests', (done) => {
      const targetPeer = currentPeers[0];

      Array.from({ length: 10 }).forEach(() => {
        peers.recordRequest(targetPeer.ip, targetPeer.port, 'ECONNRESET');
      });

      expectState(targetPeer, Peer.STATE.DISCONNECTED, done);
    });

    it('should reconnect to the peer after 10 success requests', (done) => {
      const targetPeer = currentPeers[0];

      Array.from({ length: 10 }).forEach(() => {
        peers.recordRequest(targetPeer.ip, targetPeer.port);
      });

      expectState(targetPeer, Peer.STATE.CONNECTED, done);
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

    it('should accept peer with private ip when explicitly configured', function () {
      var previousValue = config.peers.options.allowPrivatePeers;
      var privatePeer = _.clone(validPeer);
      privatePeer.ip = '127.0.0.1';

      config.peers.options.allowPrivatePeers = true;

      try {
        expect(peers.acceptable([privatePeer])).that.is.an('array').and.to.deep.equal([privatePeer]);
      } finally {
        config.peers.options.allowPrivatePeers = previousValue;
      }
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
      sinon.stub(peers, 'ping').callsArgWith(1, null, { success: true, height: validPeer.height });
      sinon.stub(peers, 'discover').callsArgWith(0, null);

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
      sinon.stub(peers, 'runPeerUpdate').callsArg(0);
      peers.onPeersReady();
      setTimeout(function () {
        expect(peers.discover.calledOnce).to.be.true;
        expect(peers.runPeerUpdate.calledOnce).to.be.true;
        peers.discover.restore();
        peers.runPeerUpdate.restore();
        done();
      }, 1000);
    });
  });

  describe('bounded peer update', function () {
    var logicPeers;
    var optionKeys = [
      'updateConcurrency',
      'probeSpacingMs',
      'maxProbeTargets',
      'unverifiedProbeLimit',
      'minUpdateAgeMs',
      'unreachableBackoffInitialMs',
      'unreachableBackoffMaxMs',
      'unreachableEvictAfter',
      'unreachableEvictAfterMs',
      'minConnectedPeers',
      'maxPeers'
    ];
    var savedOptions = {};
    var nextPort = 25000;

    function applyProbeOptions (overrides) {
      var values = Object.assign({
        updateConcurrency: 4,
        probeSpacingMs: 0,
        maxProbeTargets: 20,
        unverifiedProbeLimit: 20,
        minUpdateAgeMs: 0,
        unreachableBackoffInitialMs: 0,
        unreachableBackoffMaxMs: 0,
        unreachableEvictAfter: 6,
        unreachableEvictAfterMs: 0,
        minConnectedPeers: 0,
        maxPeers: 500
      }, overrides);

      optionKeys.forEach(function (key) {
        config.peers.options[key] = values[key];
      });
      logicPeers.setMaxPeers(values.maxPeers);
    }

    function holdSeeds () {
      logicPeers.list().forEach(function (peer) {
        if (peers.isFrozen(peer.ip, peer.port)) {
          peer.nextAttemptAt = Date.now() + (60 * 60 * 1000);
        }
      });
    }

    function removeAddedPeers () {
      logicPeers.list().slice().forEach(function (peer) {
        if (!peers.isFrozen(peer.ip, peer.port)) {
          peers.remove(peer.ip, peer.port);
        }
      });
    }

    function addPeer (fields) {
      var data = Object.assign({
        ip: '50.2.' + ((nextPort % 200) + 1) + '.10',
        port: nextPort++,
        state: Peer.STATE.DISCONNECTED
      }, fields);
      var inserted = logicPeers.upsert({
        ip: data.ip,
        port: data.port,
        state: data.state
      });
      var peer = logicPeers.get({ ip: data.ip, port: data.port });

      if (!inserted || !peer) {
        throw new Error('Failed to insert test peer ' + data.ip + ':' + data.port);
      }

      peer.state = data.state;
      peer.updated = Object.prototype.hasOwnProperty.call(fields, 'updated') ? fields.updated : 1;
      peer.nextAttemptAt = fields.nextAttemptAt || 0;
      peer.consecutiveNetworkFailures = fields.consecutiveNetworkFailures || 0;
      peer.lastOutboundSuccessAt = fields.lastOutboundSuccessAt || 0;

      return peer;
    }

    before(function () {
      logicPeers = modulesLoader.scope.logic.peers;
      optionKeys.forEach(function (key) {
        savedOptions[key] = config.peers.options[key];
      });
    });

    beforeEach(function () {
      applyProbeOptions();
      removeAddedPeers();
      holdSeeds();
    });

    after(function () {
      removeAddedPeers();
      optionKeys.forEach(function (key) {
        if (savedOptions[key] === undefined) {
          delete config.peers.options[key];
        } else {
          config.peers.options[key] = savedOptions[key];
        }
      });
      logicPeers.setMaxPeers(__privateMaxPeers());
      logicPeers.list().forEach(function (peer) {
        if (peers.isFrozen(peer.ip, peer.port)) {
          peer.nextAttemptAt = 0;
        }
      });
    });

    function __privateMaxPeers () {
      return savedOptions.maxPeers > 0 ? savedOptions.maxPeers : 500;
    }

    function networkError (peer) {
      return 'ECONNREFUSED Request failed GET http://' + peer.ip + ':' + peer.port + '/peer/height';
    }

    it('should not open an outbound probe to every known peer', function (done) {
      applyProbeOptions({ maxProbeTargets: 8, unverifiedProbeLimit: 3 });

      for (var index = 0; index < 30; index++) {
        addPeer({ state: Peer.STATE.DISCONNECTED });
      }

      var verified = addPeer({
        state: Peer.STATE.CONNECTED,
        lastOutboundSuccessAt: 1
      });
      sinon.stub(modules.transport, 'getFromPeer').callsFake(function (peer, request, cb) {
        setImmediate(cb, networkError(peer));
      });

      peers.runPeerUpdate(function () {
        var calledIps = modules.transport.getFromPeer.getCalls().map(function (call) {
          return call.args[0].ip;
        });

        expect(modules.transport.getFromPeer.callCount).to.equal(4);
        expect(calledIps).to.include(verified.ip);
        expect(calledIps.filter(function (ip) {
          return ip !== verified.ip;
        })).to.have.length(3);
        done();
      });
    });

    it('should skip banned peers and peers that are still backed off', function (done) {
      var due = addPeer({});
      var banned = addPeer({ state: Peer.STATE.BANNED });
      var waiting = addPeer({ nextAttemptAt: Date.now() + 60_000 });

      sinon.stub(modules.transport, 'getFromPeer').callsFake(function (peer, request, cb) {
        setImmediate(cb, networkError(peer));
      });

      peers.runPeerUpdate(function () {
        var called = modules.transport.getFromPeer.getCalls().map(function (call) {
          return call.args[0].ip + ':' + call.args[0].port;
        });

        expect(called).to.deep.equal([due.ip + ':' + due.port]);
        expect(called).to.not.include(banned.ip + ':' + banned.port);
        expect(called).to.not.include(waiting.ip + ':' + waiting.port);
        done();
      });
    });

    it('should back off a network failure and clear it after a later success', function (done) {
      applyProbeOptions({
        unreachableBackoffInitialMs: 60_000,
        unreachableBackoffMaxMs: 60_000
      });
      var peer = addPeer({});
      var stub = sinon.stub(modules.transport, 'getFromPeer').callsFake(function (target, request, cb) {
        setImmediate(cb, networkError(target));
      });

      peers.runPeerUpdate(function () {
        expect(peer.consecutiveNetworkFailures).to.equal(1);
        expect(peer.nextAttemptAt).to.be.above(Date.now());
        stub.resetHistory();

        peers.runPeerUpdate(function () {
          expect(stub.called).to.equal(false);
          peer.nextAttemptAt = 0;
          stub.callsFake(function (target, request, cb) {
            setImmediate(cb, null);
          });

          peers.runPeerUpdate(function () {
            expect(peer.consecutiveNetworkFailures).to.equal(0);
            expect(peer.nextAttemptAt).to.equal(0);
            expect(peer.lastOutboundSuccessAt).to.be.above(0);
            done();
          });
        });
      });
    });

    it('should keep a peer that fails the nethash check on the existing remove path', function (done) {
      var peer = addPeer({ state: Peer.STATE.CONNECTED });

      sinon.stub(modules.transport, 'getFromPeer').callsFake(function (target, request, cb) {
        setImmediate(cb, 'Peer is not on the same network abcdef GET http://' + target.ip);
      });

      peers.runPeerUpdate(function () {
        expect(logicPeers.get(peer)).to.equal(peer);
        expect(peer.consecutiveNetworkFailures || 0).to.equal(0);
        expect(peer.nextAttemptAt || 0).to.equal(0);
        done();
      });
    });

    it('should remove a non-seed peer after repeated network failures', function (done) {
      applyProbeOptions({ unreachableEvictAfter: 2, minConnectedPeers: 0 });
      var peer = addPeer({});
      var deleted = [];
      var deletePeer = modulesLoader.db.none.bind(modulesLoader.db);

      sinon.stub(modulesLoader.db, 'none').callsFake(function (query, params) {
        if (typeof query === 'string' && query.indexOf('DELETE FROM peers WHERE') === 0) {
          deleted.push(params);
        }

        return deletePeer(query, params);
      });
      sinon.stub(modules.transport, 'getFromPeer').callsFake(function (target, request, cb) {
        setImmediate(cb, networkError(target));
      });

      peers.runPeerUpdate(function () {
        expect(logicPeers.get(peer)).to.equal(peer);

        peers.runPeerUpdate(function () {
          expect(logicPeers.get(peer)).to.equal(undefined);
          expect(deleted).to.deep.equal([{ ip: peer.ip, port: peer.port }]);
          done();
        });
      });
    });

    it('should keep a configured seed peer after repeated network failures', function (done) {
      var seed = config.peers.list[0];

      applyProbeOptions({ unreachableEvictAfter: 1, minConnectedPeers: 0 });
      var peer = addPeer({ ip: seed.ip, port: seed.port });
      peer.nextAttemptAt = 0;

      sinon.stub(modules.transport, 'getFromPeer').callsFake(function (target, request, cb) {
        setImmediate(cb, networkError(target));
      });

      peers.runPeerUpdate(function () {
        expect(peers.isFrozen(seed.ip, seed.port)).to.equal(true);
        expect(logicPeers.get(seed)).to.equal(peer);
        expect(peer.consecutiveNetworkFailures).to.be.at.least(1);
        done();
      });
    });

    it('should keep unreachable peers while too few verified peers are connected', function (done) {
      applyProbeOptions({ unreachableEvictAfter: 1, minConnectedPeers: 2 });
      var peer = addPeer({});

      sinon.stub(modules.transport, 'getFromPeer').callsFake(function (target, request, cb) {
        setImmediate(cb, networkError(target));
      });

      peers.runPeerUpdate(function () {
        expect(logicPeers.get(peer)).to.equal(peer);
        expect(peer.consecutiveNetworkFailures).to.equal(1);
        done();
      });
    });

    it('should wait out the unreachable window after a peer has answered once', function (done) {
      var now = Date.now();

      applyProbeOptions({
        unreachableEvictAfter: 1,
        unreachableEvictAfterMs: 24 * 60 * 60 * 1000,
        minConnectedPeers: 0
      });
      var peer = addPeer({
        state: Peer.STATE.DISCONNECTED,
        lastOutboundSuccessAt: now
      });

      sinon.stub(modules.transport, 'getFromPeer').callsFake(function (target, request, cb) {
        setImmediate(cb, networkError(target));
      });

      peers.runPeerUpdate(function () {
        expect(logicPeers.get(peer)).to.equal(peer);
        peer.lastOutboundSuccessAt = now - (25 * 60 * 60 * 1000);
        peer.nextAttemptAt = 0;

        peers.runPeerUpdate(function () {
          expect(logicPeers.get(peer)).to.equal(undefined);
          done();
        });
      });
    });

    it('should keep at most the configured number of probes in flight', function (done) {
      applyProbeOptions({ updateConcurrency: 2, maxProbeTargets: 5, unverifiedProbeLimit: 5 });

      for (var index = 0; index < 5; index++) {
        addPeer({});
      }

      var active = 0;
      var maxActive = 0;
      sinon.stub(modules.transport, 'getFromPeer').callsFake(function (target, request, cb) {
        active++;
        if (active > maxActive) {
          maxActive = active;
        }
        setImmediate(function () {
          active--;
          cb(networkError(target));
        });
      });

      peers.runPeerUpdate(function () {
        expect(modules.transport.getFromPeer.callCount).to.equal(5);
        expect(maxActive).to.equal(2);
        done();
      });
    });

    it('should space the start of outbound probes', function (done) {
      this.timeout(5000);
      applyProbeOptions({
        probeSpacingMs: 40,
        updateConcurrency: 4,
        maxProbeTargets: 3,
        unverifiedProbeLimit: 3
      });

      addPeer({});
      addPeer({});
      addPeer({});

      var startedAt = [];
      sinon.stub(modules.transport, 'getFromPeer').callsFake(function (target, request, cb) {
        startedAt.push(Date.now());
        setImmediate(cb, networkError(target));
      });

      peers.runPeerUpdate(function () {
        expect(startedAt).to.have.length(3);
        expect(startedAt[1] - startedAt[0]).to.be.at.least(30);
        expect(startedAt[2] - startedAt[1]).to.be.at.least(30);
        done();
      });
    });
  });
});
