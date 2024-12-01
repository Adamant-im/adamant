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

      modulesLoader.initLogic(Peers, modulesLoader.scope, function (err, __peers) {
        if (err) {
          return done(err);
        }

        peers = __peers;
        peers.bindModules({ peers: __modules.peers });
        done();
      });
    });
  });

  function removeAll () {
    peers.list().forEach((peer) => peers.remove(peer));

    expect(peers.list()).to.be.an('array').and.empty;
  }

  function arePeersEqual (peerA, peerB) {
    const allPeersProperties = (peer) => {
      return _.keys(peer).every((property) => {
        return Peer.prototype.properties.concat(['string']).indexOf(property) !== -1;
      });
    };

    if (!allPeersProperties(peerA)) {
      throw new Error('Not a peer: ', peerA);
    }

    if (!allPeersProperties(peerB)) {
      throw new Error('Not a peer: ', peerB);
    }

    const commonProperties = _.intersection(_.keys(peerA), _.keys(peerB));

    if (commonProperties.indexOf('ip') === -1 || commonProperties.indexOf('port') === -1) {
      throw new Error('Insufficient data to compare the peers (no port or ip provided)');
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
      const  list = peers.list();
      const  inserted = list[0];
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
      const list = peers.list();
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
});
