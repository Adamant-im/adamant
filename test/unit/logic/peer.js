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

  describe('recordRequest()', () => {
    let successRateBefore, successRateAfter;

    it('should lower success rate after recording a failed request', () => {
      successRateBefore = peer.calcSuccessRate();

      peer.recordRequest('TEST_ERROR');
      successRateAfter = peer.calcSuccessRate();

      expect(successRateAfter).to.be.lessThan(successRateBefore);
    });

    it('should not increment success rate when already at the limit', () => {
      successRateBefore = peer.calcSuccessRate();

      peer.recordRequest();
      successRateAfter = peer.calcSuccessRate();

      expect(successRateAfter).to.equal(successRateBefore);
    });

    it('should hit the bottom limit after 100 failed requests', () => {
      Array.from({ length: 100 }).forEach(() => peer.recordRequest('an error'));

      const successRate = peer.calcSuccessRate();
      expect(successRate).to.equal(0);
    });

    it('should not change state for a banned peer', () => {
      peer.state = Peer.STATE.BANNED;

      Array.from({ length: 100 }).forEach(() => peer.recordRequest('an error'));

      expect(peer.state).to.equal(Peer.STATE.BANNED);
    });

    it('should change peer state to disconnected after too many failures', () => {
      peer.state = Peer.STATE.CONNECTED;

      Array.from({ length: 100 }).forEach(() => peer.recordRequest('an error'));

      expect(peer.state).to.equal(Peer.STATE.DISCONNECTED);
    });
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

    it('should canonicalize IPv6 and IPv4-mapped peer identities', () => {
      const ipv6 = new Peer({ ip: '2606:4700:0001:0001:0000:0000:0000:0001', port: 36666 });
      const mapped = new Peer({ ip: '::ffff:40.40.40.40', port: 36666 });

      expect(ipv6.ip).to.equal('2606:4700:1:1::1');
      expect(ipv6.string).to.equal('2606:4700:1:1::1:36666');
      expect(mapped.ip).to.equal('40.40.40.40');
      expect(mapped.string).to.equal('40.40.40.40:36666');
    });

    it('should ignore legacy DApp peer properties', () => {
      const __peer = peer.accept({ dappid: 'random-dapp-id' });

      expect(__peer).not.to.have.property('dappid');
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

    it('should not synthesize state while applying response headers', () => {
      peer.state = Peer.STATE.BANNED;
      peer.applyHeaders({ height: '2' });

      expect(peer.state).to.equal(Peer.STATE.BANNED);
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
        broadhash: 'test broadhash',
        height: 3,
        nonce: 'ABCD123'
      };
      expect(_.isEqual(_.keys(updateData), peer.headers)).to.be.true;
      peer.update(updateData);
      peer.headers.forEach((header) => {
        expect(peer[header]).to.exist.and.equal(updateData[header]);
      });
    });

    it('should initialize live defaults for connection properties', () => {
      const created = new Peer({ ip: validPeer.ip, port: validPeer.port });

      // Filters such as peers.list({ syncProtocol: 'http' }) read live objects,
      // so the defaults must exist on the instance, not only in object().
      expect(created.syncProtocol).to.equal('http');
      expect(created.isBroadcastingViaSocket).to.equal(false);
    });

    it('should keep explicitly provided connection properties', () => {
      const created = new Peer({
        ip: validPeer.ip,
        port: validPeer.port,
        syncProtocol: 'ws',
        isBroadcastingViaSocket: true
      });

      expect(created.syncProtocol).to.equal('ws');
      expect(created.isBroadcastingViaSocket).to.equal(true);
    });

    it('should not update immutable properties', () => {
      const peerBeforeUpdate = _.clone(peer);
      const updateImmutableData = {
        ip: validPeer.ip,
        port: validPeer.port,
        string: validPeer.ip + ':' + validPeer.port,
        isBroadcastingViaSocket: false,
        syncProtocol: 'http'
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

    it('should omit outbound failure state from the persisted copy', () => {
      peer.recordNetworkFailure(1_000, {
        unreachableBackoffInitialMs: 30_000,
        unreachableBackoffMaxMs: 60_000
      });
      peer.lastOutboundSuccessAt = 1_000;

      const peerCopy = peer.object();

      expect(peerCopy).not.to.have.property('consecutiveNetworkFailures');
      expect(peerCopy).not.to.have.property('nextAttemptAt');
      expect(peerCopy).not.to.have.property('lastOutboundSuccessAt');
    });
  });

  describe('network probe policy', () => {
    const backoff = {
      unreachableBackoffInitialMs: 30_000,
      unreachableBackoffMaxMs: 60_000
    };

    function makePeer (ip, extra) {
      const created = new Peer(Object.assign({
        ip: ip,
        port: 36666,
        state: Peer.STATE.DISCONNECTED,
        updated: 1
      }, extra));

      return created;
    }

    it('should keep protocol failures out of the network-error set', () => {
      expect(Peer.isNetworkError('ECONNREFUSED Request failed GET http://203.0.113.10/peer/height')).to.equal(true);
      expect(Peer.isNetworkError('ETIMEDOUT Request failed GET http://203.0.113.10/peer/height')).to.equal(true);
      expect(Peer.isNetworkError({ code: 'EHOSTUNREACH' })).to.equal(true);
      expect(Peer.isNetworkError({ code: 'ERR_CANCELED' })).to.equal(true);
      expect(Peer.isNetworkError('Peer is not on the same network abc GET http://203.0.113.10/peer/height')).to.equal(false);
      expect(Peer.isNetworkError('Peer is using incompatible version 0.0.1 GET http://203.0.113.10/peer/height')).to.equal(false);
      expect(Peer.isNetworkError('Invalid response headers {} GET http://203.0.113.10/peer/height')).to.equal(false);
      expect(Peer.isNetworkError('ERR_BAD_RESPONSE Request failed GET http://203.0.113.10/peer/height')).to.equal(false);
      expect(Peer.isNetworkError()).to.equal(false);
    });

    it('should distinguish temporary peer throttling from request failures', () => {
      expect(Peer.isRateLimitError(
          'ERATELIMIT 429 GET http://203.0.113.10/peer/blocks'
      )).to.equal(true);
      expect(Peer.isRateLimitError({ code: 'ERATELIMIT' })).to.equal(true);
      expect(Peer.isRateLimitError('ERESPONSE 500')).to.equal(false);
      expect(Peer.isRateLimitError()).to.equal(false);
    });

    it('should preserve peer health for temporary throttling', () => {
      const previousSuccessRate = peer.successRequestCount;

      peer.recordRequest('ERATELIMIT 429 retry in 1000ms');

      expect(peer.successRequestCount).to.equal(previousSuccessRate);
    });

    it('should not record backoff from the success-rate path', () => {
      peer.state = Peer.STATE.BANNED;
      peer.recordRequest('ECONNREFUSED');

      expect(peer.state).to.equal(Peer.STATE.BANNED);
      expect(peer.nextAttemptAt).to.equal(undefined);
      expect(peer.consecutiveNetworkFailures).to.equal(undefined);
    });

    it('should back off exponentially up to the configured cap', () => {
      expect(Peer.networkBackoffMs(1, backoff)).to.equal(30_000);
      expect(Peer.networkBackoffMs(2, backoff)).to.equal(60_000);
      expect(Peer.networkBackoffMs(3, backoff)).to.equal(60_000);

      const now = 10_000;
      const failures = peer.recordNetworkFailure(now, backoff);

      expect(failures).to.equal(1);
      expect(peer.nextAttemptAt).to.be.at.least(now + 30_000);
      expect(peer.nextAttemptAt).to.be.at.most(now + 30_000 + 7_500);
    });

    it('should clear backoff after an outbound success', () => {
      peer.recordNetworkFailure(1_000, backoff);
      peer.clearNetworkFailures(5_000);

      expect(peer.consecutiveNetworkFailures).to.equal(0);
      expect(peer.nextAttemptAt).to.equal(0);
      expect(peer.lastOutboundSuccessAt).to.equal(5_000);
    });

    it('should dial a bounded sample instead of every known peer', () => {
      const verified = [1, 2].map((index) => {
        const created = makePeer('203.0.113.' + index, { state: Peer.STATE.CONNECTED });
        created.lastOutboundSuccessAt = 1;
        return created;
      });
      const handshakeOnly = [];

      for (let index = 0; index < 40; index++) {
        handshakeOnly.push(makePeer('203.0.114.' + (index + 1), {
          state: Peer.STATE.CONNECTED
        }));
      }

      const banned = makePeer('203.0.115.1', { state: Peer.STATE.BANNED });
      const backedOff = makePeer('203.0.115.2', { state: Peer.STATE.DISCONNECTED });
      backedOff.nextAttemptAt = 1_000_000;
      const fresh = makePeer('203.0.115.3', { state: Peer.STATE.DISCONNECTED, updated: 9_000 });

      const targets = Peer.selectProbeTargets(
          verified.concat(handshakeOnly, [banned, backedOff, fresh]),
          {
            maxProbeTargets: 6,
            unverifiedProbeLimit: 2,
            minUpdateAgeMs: 1_000
          },
          10_000
      );
      const targetIps = targets.map((item) => item.ip);

      expect(targets).to.have.length(4);
      expect(targetIps).to.include('203.0.113.1');
      expect(targetIps).to.include('203.0.113.2');
      expect(targets.filter((item) => !item.lastOutboundSuccessAt)).to.have.length(2);
      expect(targetIps).to.not.include(banned.ip);
      expect(targetIps).to.not.include(backedOff.ip);
      expect(targetIps).to.not.include(fresh.ip);
    });
  });
});
