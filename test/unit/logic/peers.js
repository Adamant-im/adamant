'use strict';

const { expect } = require('chai');

const _ = require('lodash');

const Peers = require('../../../logic/peers.js');
const Peer = require('../../../logic/peer.js');

const { modulesLoader } = require('../../common/initModule');
const { validPeer } = require('../../common/stubs/peers.js');

describe('peers', () => {
  let peers;

  before((done) => {
    modulesLoader.initAllModules((err, __modules) => {
      if (err) {
        return done(err);
      }

      __modules.peers.onBind(__modules);

      modulesLoader.initLogic(
          Peers,
          modulesLoader.scope,
          function (err, __peers) {
            if (err) {
              return done(err);
            }

            peers = __peers;
            peers.bindModules({ peers: __modules.peers });
            done();
          }
      );
    });
  });

  function removeAll () {
    peers.list().forEach((peer) => peers.remove(peer));

    expect(peers.list()).to.be.an('array').and.empty;
  }

  function arePeersEqual (peerA, peerB) {
    const allPeersProperties = (peer) => {
      return _.keys(peer).every((property) => {
        return (
          Peer.prototype.properties.concat(['string']).indexOf(property) !== -1
        );
      });
    };

    if (!allPeersProperties(peerA)) {
      throw new Error('Not a peer: ', peerA);
    }

    if (!allPeersProperties(peerB)) {
      throw new Error('Not a peer: ', peerB);
    }

    const commonProperties = _.intersection(_.keys(peerA), _.keys(peerB));

    if (
      commonProperties.indexOf('ip') === -1 ||
      commonProperties.indexOf('port') === -1
    ) {
      throw new Error(
          'Insufficient data to compare the peers (no port or ip provided)'
      );
    }

    return commonProperties.every((property) => {
      return peerA[property] === peerB[property];
    });
  }

  describe('create()', () => {
    it('should always return Peer instance', () => {
      expect(peers.create()).to.be.an.instanceof(Peer);
      expect(peers.create(validPeer)).to.be.an.instanceof(Peer);
      expect(peers.create(new Peer(validPeer))).to.be.an.instanceof(Peer);
    });
  });

  describe('list()', () => {
    it('should list peers as Peer instances', () => {
      removeAll();
      peers.upsert(validPeer);
      peers.list().forEach((peer) => {
        expect(peer).to.be.an.instanceof(Peer);
      });
      removeAll();
    });

    it('should list peers as objects when normalized', () => {
      removeAll();
      peers.upsert(validPeer);
      peers.list(true).forEach((peer) => {
        expect(peer).to.be.an('object');
      });
      removeAll();
    });
  });

  describe('upsert', () => {
    it('should insert new peers', () => {
      removeAll();
      peers.upsert(validPeer);
      expect(peers.list().length).equal(1);
      removeAll();
    });

    it('should not insert new peer with adm-js-api os', () => {
      removeAll();
      const modifiedPeer = _.clone(validPeer);
      modifiedPeer.os = 'adm-js-api';
      peers.upsert(modifiedPeer);
      expect(peers.list().length).equal(0);
      removeAll();
    });

    it('should update height of existing peer', () => {
      removeAll();

      peers.upsert(validPeer);
      let list = peers.list();
      const inserted = list[0];
      expect(list.length).equal(1);
      expect(arePeersEqual(inserted, validPeer)).to.be.true;

      const modifiedPeer = _.clone(validPeer);
      modifiedPeer.height += 1;
      peers.upsert(modifiedPeer);
      list = peers.list();
      const updated = list[0];
      expect(list.length).equal(1);
      expect(arePeersEqual(updated, modifiedPeer)).to.be.true;
      expect(arePeersEqual(updated, validPeer)).to.be.false;

      removeAll();
    });

    it('should not update height with insertOnly param', () => {
      removeAll();

      peers.upsert(validPeer);
      let list = peers.list();
      const inserted = list[0];
      expect(list.length).equal(1);
      expect(arePeersEqual(inserted, validPeer)).to.be.true;

      const modifiedPeer = _.clone(validPeer);
      modifiedPeer.height += 1;
      peers.upsert(modifiedPeer, true);
      list = peers.list();
      const updated = list[0];
      expect(list.length).equal(1);
      expect(arePeersEqual(updated, modifiedPeer)).to.be.false;
      expect(arePeersEqual(updated, validPeer)).to.be.true;

      removeAll();
    });

    it('should insert peer with different ports', () => {
      removeAll();

      peers.upsert(validPeer);
      expect(peers.list().length).equal(1);

      const differentPortPeer = _.clone(validPeer);
      differentPortPeer.port += 1;
      peers.upsert(differentPortPeer);
      const list = peers.list();
      expect(list.length).equal(2);

      const demandedPorts = _.map([validPeer, differentPortPeer], 'port');
      const listPorts = _.map(list, 'port');

      expect(_.isEqual(demandedPorts.sort(), listPorts.sort())).to.be.true;

      removeAll();
    });

    it('should insert peer with different IPs', () => {
      removeAll();

      peers.upsert(validPeer);
      expect(peers.list().length).equal(1);

      const differentIpPeer = _.clone(validPeer);
      differentIpPeer.ip = '40.40.40.41';
      expect(differentIpPeer.ip).to.not.equal(validPeer);
      peers.upsert(differentIpPeer);

      const list = peers.list();
      expect(list.length).equal(2);

      const demandedIps = _.map([validPeer, differentIpPeer], 'ip');
      const listIps = _.map(list, 'ip');

      expect(_.isEqual(demandedIps.sort(), listIps.sort())).to.be.true;

      removeAll();
    });
  });

  describe('exists()', () => {
    it('should return true if peer is on the list', () => {
      removeAll();

      peers.upsert(validPeer);
      const list = peers.list(true);
      expect(list.length).equal(1);
      expect(peers.exists(validPeer)).to.be.true;

      const differentPortPeer = _.clone(validPeer);
      differentPortPeer.port += 1;
      expect(peers.exists(differentPortPeer)).to.be.false;
    });
  });

  describe('get', () => {
    it('should return inserted peer', () => {
      removeAll();
      peers.upsert(validPeer);
      const insertedPeer = peers.get(validPeer);
      expect(arePeersEqual(insertedPeer, validPeer)).to.be.true;
    });

    it('should return inserted peer by address', () => {
      removeAll();
      peers.upsert(validPeer);
      const insertedPeer = peers.get(`${validPeer.ip}:${validPeer.port}`);
      expect(arePeersEqual(insertedPeer, validPeer)).to.be.true;
    });

    it('should return undefined if peer is not inserted', () => {
      removeAll();
      expect(peers.get(validPeer)).to.be.undefined;
    });
  });

  describe('remove()', () => {
    it('should remove added peer', () => {
      removeAll();
      peers.upsert(validPeer);
      expect(peers.list().length).equal(1);
      const result = peers.remove(validPeer);
      expect(result).to.be.true;
      expect(peers.list().length).equal(0);
    });

    it('should return false when trying to remove non inserted peer', () => {
      removeAll();
      const result = peers.remove(validPeer);
      expect(result).to.be.false;
      expect(peers.list().length).equal(0);
    });
  });

  describe('setMaxPeers()', () => {
    const extraPeers = [
      { ip: '50.2.3.21', port: 36666, state: 1 },
      { ip: '50.2.3.22', port: 36666, state: 1 },
      { ip: '50.2.3.23', port: 36666, state: 1 }
    ];

    afterEach(() => {
      peers.setMaxPeers(0);
      removeAll();
    });

    it('should keep table size bounded and still update existing peers', () => {
      removeAll();
      peers.setMaxPeers(2);

      expect(peers.upsert(extraPeers[0])).to.equal(true);
      expect(peers.upsert(extraPeers[1])).to.equal(true);
      peers.get(extraPeers[0]).consecutiveNetworkFailures = 1;
      expect(peers.upsert(extraPeers[2])).to.equal(true);
      expect(peers.list()).to.have.length(2);

      const updated = _.clone(extraPeers[1]);
      updated.height = 4;
      updated.state = 2;

      expect(peers.upsert(updated)).to.equal(true);
      expect(peers.get(extraPeers[1]).height).to.equal(4);
      expect(peers.get(extraPeers[1]).state).to.equal(2);
    });
  });

  describe('setAdmissionPolicy()', () => {
    afterEach(() => {
      peers.setMaxPeers(0);
      peers.setAdmissionPolicy({
        maxPeersPerIp: 0,
        maxPeersPerSubnet: 0,
        subnetMaskIpv4: 24,
        subnetMaskIpv6: 64
      });
      removeAll();
    });

    it('should reject additional ports from one ip when per-ip cap is reached', () => {
      removeAll();
      peers.setAdmissionPolicy({ maxPeersPerIp: 2, maxPeersPerSubnet: 0 });

      expect(peers.upsert({ ip: '51.10.0.1', port: 20001, state: 1 })).to.equal(true);
      expect(peers.upsert({ ip: '51.10.0.1', port: 20002, state: 1 })).to.equal(true);
      expect(peers.upsert({ ip: '51.10.0.1', port: 20003, state: 1 })).to.equal(false);
      expect(peers.list()).to.have.length(2);
    });

    it('should reject additional peers from one subnet when per-subnet cap is reached', () => {
      removeAll();
      peers.setAdmissionPolicy({ maxPeersPerIp: 0, maxPeersPerSubnet: 2, subnetMaskIpv4: 24 });

      expect(peers.upsert({ ip: '51.11.0.1', port: 21001, state: 1 })).to.equal(true);
      expect(peers.upsert({ ip: '51.11.0.2', port: 21002, state: 1 })).to.equal(true);
      expect(peers.upsert({ ip: '51.11.0.3', port: 21003, state: 1 })).to.equal(false);
      expect(peers.upsert({ ip: '51.11.1.3', port: 21004, state: 1 })).to.equal(true);
    });

    it('should evict stale unverified peer when table is full', () => {
      removeAll();
      peers.setMaxPeers(2);

      expect(peers.upsert({ ip: '52.20.0.1', port: 22001, state: 1 })).to.equal(true);
      expect(peers.upsert({ ip: '52.20.0.2', port: 22002, state: 1 })).to.equal(true);

      var first = peers.get({ ip: '52.20.0.1', port: 22001 });
      var second = peers.get({ ip: '52.20.0.2', port: 22002 });
      first.updated = 1;
      first.consecutiveNetworkFailures = 1;
      second.updated = 2;

      expect(peers.upsert({ ip: '52.20.0.3', port: 22003, state: 1 })).to.equal(true);

      expect(peers.get({ ip: '52.20.0.1', port: 22001 })).to.equal(undefined);
      expect(peers.get({ ip: '52.20.0.2', port: 22002 })).to.not.equal(undefined);
      expect(peers.get({ ip: '52.20.0.3', port: 22003 })).to.not.equal(undefined);
    });

    it('should keep verified peers when evicting for capacity', () => {
      removeAll();
      peers.setMaxPeers(2);

      expect(peers.upsert({ ip: '52.21.0.1', port: 23001, state: 2 })).to.equal(true);
      expect(peers.upsert({ ip: '52.21.0.2', port: 23002, state: 1 })).to.equal(true);

      var verified = peers.get({ ip: '52.21.0.1', port: 23001 });
      var unverified = peers.get({ ip: '52.21.0.2', port: 23002 });
      verified.lastOutboundSuccessAt = 100;
      verified.updated = 1;
      unverified.updated = 2;
      unverified.consecutiveNetworkFailures = 1;

      expect(peers.upsert({ ip: '52.21.0.3', port: 23003, state: 1 })).to.equal(true);

      expect(peers.get({ ip: '52.21.0.1', port: 23001 })).to.not.equal(undefined);
      expect(peers.get({ ip: '52.21.0.2', port: 23002 })).to.equal(undefined);
      expect(peers.get({ ip: '52.21.0.3', port: 23003 })).to.not.equal(undefined);
    });

    it('should validate a candidate before evicting at capacity', () => {
      removeAll();
      peers.setMaxPeers(1);

      const admitted = { ip: '52.22.0.1', port: 24001, state: 1 };
      expect(peers.upsert(admitted)).to.equal(true);
      peers.get(admitted).consecutiveNetworkFailures = 1;

      expect(peers.upsert({ ip: 'not-an-ip', port: 24002, state: 1 })).to.equal(false);
      expect(peers.get(admitted)).to.not.equal(undefined);
      expect(peers.list()).to.have.length(1);
    });

    it('should canonicalize IPv6 addresses for per-ip limits', () => {
      removeAll();
      peers.setAdmissionPolicy({ maxPeersPerIp: 1, maxPeersPerSubnet: 0, subnetMaskIpv6: 64 });

      expect(peers.upsert({ ip: '2606:4700:1:1::1', port: 25001, state: 1 })).to.equal(true);
      expect(peers.upsert({ ip: '2606:4700:0001:0001:0000:0000:0000:0001', port: 25002, state: 1 })).to.equal(false);
    });

    it('should canonicalize IPv6 prefixes for subnet limits', () => {
      removeAll();
      peers.setAdmissionPolicy({ maxPeersPerIp: 0, maxPeersPerSubnet: 1, subnetMaskIpv6: 64 });

      expect(peers.upsert({ ip: '2606:4700:2:1::1', port: 26001, state: 1 })).to.equal(true);
      expect(peers.upsert({ ip: '2606:4700:0002:0001:ffff::2', port: 26002, state: 1 })).to.equal(false);
      expect(peers.upsert({ ip: '2606:4700:2:2::1', port: 26003, state: 1 })).to.equal(true);
    });

    it('should replace an unverified peer to admit verified capacity in the same subnet', () => {
      removeAll();
      peers.setAdmissionPolicy({ maxPeersPerIp: 1, maxPeersPerSubnet: 1, subnetMaskIpv4: 24 });

      const unverified = { ip: '53.30.0.1', port: 27001, state: 1 };
      expect(peers.upsert(unverified)).to.equal(true);

      const verified = new Peer({
        ip: '53.30.0.2',
        port: 27002,
        state: Peer.STATE.CONNECTED
      });
      verified.lastOutboundSuccessAt = 1;

      expect(peers.upsert(verified)).to.equal(true);
      expect(peers.get(unverified)).to.equal(undefined);
      expect(peers.get(verified)).to.not.equal(undefined);
    });

    it('should replace an unverified port to admit a verified peer from the same ip', () => {
      removeAll();
      peers.setAdmissionPolicy({ maxPeersPerIp: 1, maxPeersPerSubnet: 0 });

      const unverified = { ip: '53.31.0.1', port: 28001, state: 1 };
      expect(peers.upsert(unverified)).to.equal(true);

      const verified = new Peer({
        ip: '53.31.0.1',
        port: 28002,
        state: Peer.STATE.CONNECTED
      });
      verified.lastOutboundSuccessAt = 1;

      expect(peers.upsert(verified)).to.equal(true);
      expect(peers.get(unverified)).to.equal(undefined);
      expect(peers.get(verified)).to.not.equal(undefined);
    });

    it('should reserve global capacity for an outbound-verified peer', () => {
      removeAll();
      peers.setMaxPeers(1);

      const unverified = { ip: '53.32.0.1', port: 29001, state: 1 };
      expect(peers.upsert(unverified)).to.equal(true);

      const verified = new Peer({
        ip: '53.32.0.2',
        port: 29002,
        state: Peer.STATE.CONNECTED
      });
      verified.lastOutboundSuccessAt = 1;

      expect(peers.upsert(verified)).to.equal(true);
      expect(peers.get(unverified)).to.equal(undefined);
      expect(peers.get(verified)).to.not.equal(undefined);
    });

    it('should never evict a banned peer for capacity', () => {
      const scenarios = [
        { maxPeers: 1, maxPeersPerIp: 0, maxPeersPerSubnet: 0, subnetMaskIpv4: 24 },
        { maxPeers: 0, maxPeersPerIp: 1, maxPeersPerSubnet: 0, subnetMaskIpv4: 24 },
        { maxPeers: 0, maxPeersPerIp: 0, maxPeersPerSubnet: 1, subnetMaskIpv4: 24 }
      ];

      scenarios.forEach(function (policy, index) {
        removeAll();
        peers.setMaxPeers(policy.maxPeers);
        peers.setAdmissionPolicy(policy);

        const banned = {
          ip: '54.40.' + index + '.1',
          port: 30001 + index,
          state: Peer.STATE.BANNED
        };
        const verified = new Peer({
          ip: index === 1 ? banned.ip : '54.40.' + index + '.2',
          port: 30101 + index,
          state: Peer.STATE.CONNECTED
        });
        verified.lastOutboundSuccessAt = 1;

        expect(peers.upsert(banned)).to.equal(true);
        expect(peers.upsert(verified)).to.equal(false);
        expect(peers.get(banned)).to.not.equal(undefined);
        expect(peers.get(banned).state).to.equal(Peer.STATE.BANNED);
      });
    });

    it('should apply explicit-family masks at IPv6 prefix boundaries', () => {
      const cases = [
        { mask: 0, first: '2606:4700:1:1::1', sameSubnet: '2001:4860:2:2::2' },
        { mask: 1, first: '2606:4700:1:1::1', sameSubnet: '3fff:4860:2:2::2' },
        { mask: 16, first: '2606:4700:1:1::1', sameSubnet: '2606:4860:2:2::2' },
        { mask: 32, first: '2606:4700:1:1::1', sameSubnet: '2606:4700:2:2::2' },
        { mask: 33, first: '2606:4700:1:1::1', sameSubnet: '2606:4700:7fff:2::2' },
        { mask: 64, first: '2606:4700:1:1::1', sameSubnet: '2606:4700:1:1:ffff::2' },
        { mask: 128, first: '2606:4700:1:1::1', sameSubnet: '2606:4700:0001:0001:0000:0000:0000:0001' }
      ];

      cases.forEach(function (entry, index) {
        removeAll();
        peers.setAdmissionPolicy({
          maxPeersPerIp: 0,
          maxPeersPerSubnet: 1,
          subnetMaskIpv6: entry.mask
        });

        expect(peers.upsert({
          ip: entry.first,
          port: 31001 + index,
          state: Peer.STATE.DISCONNECTED
        })).to.equal(true);
        expect(peers.upsert({
          ip: entry.sameSubnet,
          port: 31101 + index,
          state: Peer.STATE.DISCONNECTED
        })).to.equal(false);
      });

      removeAll();
      peers.setAdmissionPolicy({ maxPeersPerIp: 0, maxPeersPerSubnet: 1, subnetMaskIpv6: 33 });
      expect(peers.upsert({ ip: '2606:4700:0::1', port: 32001, state: 1 })).to.equal(true);
      expect(peers.upsert({ ip: '2606:4700:8000::1', port: 32002, state: 1 })).to.equal(true);
    });

    it('should use canonical addresses as peer-table identities', () => {
      removeAll();
      const original = {
        ip: '2606:4700:0003:0001:0000:0000:0000:0001',
        port: 33001,
        state: Peer.STATE.BANNED
      };
      const alias = { ip: '2606:4700:3:1::1', port: 33001 };

      expect(peers.upsert(original)).to.equal(true);
      expect(peers.get(alias)).to.equal(peers.get(original));
      expect(peers.list()).to.have.length(1);
      expect(peers.remove(alias)).to.equal(true);
      expect(peers.list()).to.have.length(0);
    });
  });
});
