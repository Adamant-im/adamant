'use strict';

const { expect } = require('chai');

const ip = require('neoip');
const _ = require('lodash');

const Peer = require('../../../logic/peer.js');

const { validPeer } = require('../../common/stubs/peers.js');

describe('peer', () => {
  let peer;

  beforeEach(() => {
    peer = new Peer({});
  });

  describe('accept()', () => {
    it('should accept valid peer', () => {
      const peer = new Peer({});
      const __peer = peer.accept(validPeer);
      ['height', 'ip', 'port', 'state'].forEach((property) => {
        expect(__peer[property]).equals(validPeer[property]);
      });
      expect(__peer.string).equals(`${validPeer.ip}:${validPeer.port}`);
    });

    it('should accept empty peer and set default values', () => {
      const __peer = peer.accept({});
      expect(__peer.port).to.equal(0);
      expect(__peer.ip).to.be.undefined;
      expect(__peer.state).to.equal(1);
      expect(__peer.height).to.be.undefined;
      expect(__peer.string).to.be.undefined;
    });

    it('should accept peer with ip as long', () => {
      const __peer = peer.accept({ ip: ip.toLong(validPeer.ip) });
      expect(__peer.ip).to.equal(validPeer.ip);
    });

    it('should convert dappid to array', () => {
      const __peer = peer.accept({ dappid: 'random-dapp-id' });
      expect(__peer.dappid).to.be.an('array');
      expect(_.isEqual(__peer.dappid, ['random-dapp-id'])).to.be.true;
      delete __peer.dappid;
    });
  });

  describe('parseInt()', () => {
    it('should always return a number', () => {
      expect(peer.parseInt('1')).to.equal(1);
      expect(peer.parseInt(1)).to.equal(1);
    });

    it('should return default value when NaN is provided', () => {
      expect(peer.parseInt('not a number', 1)).to.equal(1);
      expect(peer.parseInt(undefined, 1)).to.equal(1);
      expect(peer.parseInt(null, 1)).to.equal(1);
    });
  });

  describe('applyHeaders()', () => {
    it('should not apply random values to the peer scope', () => {
      peer.applyHeaders({ headerA: 'HeaderA' });
      expect(peer.headerA).not.to.exist;
    });

    it('should apply defined values as headers', () => {
      peer.headers.forEach((header) => {
        delete peer[header];
        if (validPeer[header]) {
          const headers = {};
          headers[header] = validPeer[header];
          peer.applyHeaders(headers);
          expect(peer[header]).to.equal(validPeer[header]);
        }
      });
    });

    it('should not apply nulls or undefined values as headers', () => {
      peer.headers.forEach((header) => {
        delete peer[header];
        if (validPeer[header] === null || validPeer[header] === undefined) {
          const headers = {};
          headers[header] = validPeer[header];
          peer.applyHeaders(headers);
          expect(peer[header]).not.to.exist;
        }
      });
    });

    it('should parse height and port', () => {
      const appliedHeaders = peer.applyHeaders({ port: '4000', height: '1' });

      expect(appliedHeaders.port).to.equal(4000);
      expect(appliedHeaders.height).to.equal(1);
    });
  });

  describe('update()', () => {
    it('should not pass the unexpected values to the peer scope', () => {
      peer.update({ someProp: 'someValue' });
      expect(peer.someProp).not.to.exist;
    });

    it('should not apply undefined to the peer scope', () => {
      peer.update({ someProp: undefined });
      expect(peer.someProp).not.to.exist;
    });

    it('should not apply null to the peer scope', () => {
      peer.update({ someProp: null });
      expect(peer.someProp).not.to.exist;
    });

    it('should change state of banned peer', () => {
      const initialState = peer.state;
      // Ban peer
      peer.state = 0;
      // Try to unban peer
      peer.update({ state: 2 });
      expect(peer.state).to.equal(2);
      peer.state = initialState;
    });

    it('should update defined values', () => {
      const updateData = {
        os: 'test os',
        version: '0.0.0',
        dappid: ['test dappid'],
        broadhash: 'test broadhash',
        height: 3,
        nonce: 'ABCD123',
      };
      expect(_.isEqual(_.keys(updateData), peer.headers)).to.be.true;
      peer.update(updateData);
      peer.headers.forEach((header) => {
        expect(peer[header]).to.exist.and.equal(updateData[header]);
      });
    });

    it('should not update immutable properties', () => {
      const peerBeforeUpdate = _.clone(peer);
      const updateImmutableData = {
        ip: validPeer.ip,
        port: validPeer.port,
        string: validPeer.ip + ':' + validPeer.port,
      };

      expect(_.isEqual(_.keys(updateImmutableData), peer.immutable)).to.be.true;
      peer.update(updateImmutableData);
      peer.headers.forEach((header) => {
        expect(peer[header])
          .to.equal(peerBeforeUpdate[header])
          .and.not.equal(updateImmutableData);
      });
    });
  });

  describe('object()', () => {
    it('should create proper copy of peer', () => {
      const __peer = new Peer(validPeer);
      const peerCopy = __peer.object();
      _.keys(validPeer).forEach((property) => {
        if (__peer.properties.indexOf(property) !== -1) {
          expect(peerCopy[property]).to.equal(validPeer[property]);
          if (
            __peer.nullable.indexOf(property) !== -1 &&
            !validPeer[property]
          ) {
            expect(peerCopy[property]).to.be.null;
          }
        }
      });
    });

    it('should always return state', () => {
      const initialState = peer.state;
      peer.update({ state: 'unreadable' });
      const peerCopy = peer.object();
      expect(peerCopy.state).to.equal(1);
      peer.state = initialState;
    });
  });
});
