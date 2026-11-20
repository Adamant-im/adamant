'use strict';

const EventEmitter = require('events');
const { expect } = require('chai');
const sinon = require('sinon');

const SocketAdmission = require('../../../helpers/socket-admission.js');

function request (address, forwarded) {
  return {
    headers: forwarded ? { 'x-forwarded-for': forwarded } : {},
    socket: { remoteAddress: address }
  };
}

describe('SocketAdmission', function () {
  it('should reserve pending sessions and release an admitted transport', function () {
    const admission = new SocketAdmission({
      maxConnections: 1,
      maxConnectionsPerIp: 1,
      maxConnectionAttempts: 10,
      connectionWindowMs: 60000,
      trustProxy: false
    });
    const engine = new EventEmitter();
    const first = request('198.51.100.1');
    const second = request('198.51.100.2');
    const firstSocket = new EventEmitter();

    firstSocket.request = first;
    firstSocket.close = sinon.spy();
    admission.bind(engine);

    expect(admission.allowRequest(first, sinon.spy())).to.equal(true);
    expect(admission.allowRequest(second, sinon.spy())).to.equal(false);
    expect(admission.connectionCount).to.equal(1);

    engine.emit('connection', firstSocket);
    expect(admission.isActive(firstSocket)).to.equal(true);
    firstSocket.emit('close');

    expect(admission.allowRequest(second, sinon.spy())).to.equal(true);
    expect(admission.connectionCount).to.equal(1);
  });

  it('should reject untrusted Engine.IO requests before session activation', function () {
    const callback = sinon.spy();
    const onReject = sinon.spy();
    const admission = new SocketAdmission({
      maxConnections: 10,
      maxConnectionsPerIp: 1,
      maxConnectionAttempts: 10,
      connectionWindowMs: 60000,
      trustProxy: true,
      onReject
    });
    const first = request(
        '10.0.0.1',
        '192.0.2.1, 2001:db8:abcd:1200::1'
    );
    const rotated = request(
        '10.0.0.2',
        '192.0.2.2, 2001:db8:abcd:1200::2'
    );

    expect(admission.allowRequest(first, sinon.spy())).to.equal(true);
    expect(admission.allowRequest(rotated, callback)).to.equal(false);
    expect(callback.calledOnceWith('IP connection limit exceeded', false)).to.equal(true);
    expect(onReject.calledOnce).to.equal(true);
  });
});
