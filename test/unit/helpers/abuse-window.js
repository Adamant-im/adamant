'use strict';

const { expect } = require('chai');
const sinon = require('sinon');

const AbuseWindow = require('../../../helpers/abuse-window.js');

describe('AbuseWindow', function () {
  let clock;

  beforeEach(function () {
    clock = sinon.useFakeTimers({ now: 1000 });
  });

  afterEach(function () {
    clock.restore();
  });

  it('should reset exactly at the fixed-window boundary', function () {
    const window = new AbuseWindow(2, 100);

    expect(window.allow('key')).to.equal(true);
    expect(window.allow('key')).to.equal(true);

    clock.tick(99);
    expect(window.allow('key')).to.equal(false);

    clock.tick(1);
    expect(window.allow('key')).to.equal(true);
  });

  it('should normalize IPv4-mapped IPv6 and group IPv6 allocations', function () {
    expect(AbuseWindow.normalizeIp(' ::FFFF:127.0.0.1 ')).to.equal('127.0.0.1');
    expect(AbuseWindow.ipLimitKey('2001:db8:abcd:1200::1')).to.equal(
        AbuseWindow.ipLimitKey('2001:DB8:ABCD:1200::2')
    );
    expect(AbuseWindow.ipLimitKey('2001:db8:abcd:1200::1')).to.not.equal(
        AbuseWindow.ipLimitKey('2001:db8:abce:1200::1')
    );
  });

  it('should bound tracked keys and expire them without a full-map scan', function () {
    const window = new AbuseWindow(1, 100, 3);

    expect(window.allow('one')).to.equal(true);
    expect(window.allow('two')).to.equal(true);
    expect(window.allow('three')).to.equal(true);
    expect(window.allow('four')).to.equal(false);
    expect(window.hits.size).to.equal(3);

    clock.tick(100);

    expect(window.allow('four')).to.equal(true);
    expect(window.hits.size).to.equal(1);
  });

  it('should use the closest forwarded address only for trusted requests', function () {
    const source = {
      socket: { remoteAddress: '10.0.0.1' },
      headers: {
        'x-forwarded-for': '192.0.2.1, 198.51.100.10'
      }
    };

    expect(AbuseWindow.resolveClientIp(source, false)).to.equal('10.0.0.1');
    expect(AbuseWindow.resolveClientIp(source, true)).to.equal('198.51.100.10');
  });
});
