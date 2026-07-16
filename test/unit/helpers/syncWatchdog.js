'use strict';

const { expect } = require('chai');
const sinon = require('sinon');

const createSyncWatchdog = require('../../../helpers/syncWatchdog.js');

describe('helpers/syncWatchdog', () => {
  let clock;

  beforeEach(() => {
    clock = sinon.useFakeTimers();
  });

  afterEach(() => {
    clock.restore();
  });

  it('fires onStall once when height does not advance within the window', () => {
    const onStall = sinon.spy();
    const watchdog = createSyncWatchdog({
      timeoutMs: 1000,
      getHeight: () => 100,
      onStall
    });

    watchdog.start();
    expect(onStall.called).to.equal(false);

    // Sample once with no progress -> stall declared.
    clock.tick(1000);
    expect(onStall.calledOnce).to.equal(true);
    expect(onStall.firstCall.args[0]).to.equal(100);

    // It stops itself after firing and never fires again.
    clock.tick(5000);
    expect(onStall.calledOnce).to.equal(true);
  });

  it('does not fire while height keeps advancing', () => {
    const onStall = sinon.spy();
    let height = 100;
    const watchdog = createSyncWatchdog({
      timeoutMs: 1000,
      getHeight: () => height,
      onStall
    });

    watchdog.start();

    for (let i = 0; i < 10; i++) {
      height += 1; // progress every window
      clock.tick(1000);
    }

    expect(onStall.called).to.equal(false);
  });

  it('fires only after progress stops following earlier progress', () => {
    const onStall = sinon.spy();
    let height = 100;
    const watchdog = createSyncWatchdog({
      timeoutMs: 1000,
      getHeight: () => height,
      onStall
    });

    watchdog.start();

    // Two windows with progress.
    height = 150;
    clock.tick(1000);
    height = 200;
    clock.tick(1000);
    expect(onStall.called).to.equal(false);

    // Now height freezes for a full window -> stall.
    clock.tick(1000);
    expect(onStall.calledOnce).to.equal(true);
    expect(onStall.firstCall.args[0]).to.equal(200);
  });

  it('treats a height that goes backwards (no forward progress) as a stall', () => {
    const onStall = sinon.spy();
    let height = 200;
    const watchdog = createSyncWatchdog({
      timeoutMs: 1000,
      getHeight: () => height,
      onStall
    });

    watchdog.start();
    height = 199; // not greater than last observed -> no progress
    clock.tick(1000);

    expect(onStall.calledOnce).to.equal(true);
  });

  it('does not fire after stop()', () => {
    const onStall = sinon.spy();
    const watchdog = createSyncWatchdog({
      timeoutMs: 1000,
      getHeight: () => 100,
      onStall
    });

    watchdog.start();
    watchdog.stop();
    clock.tick(10000);

    expect(onStall.called).to.equal(false);
  });

  it('is disabled when timeoutMs is zero or non-finite', () => {
    const onStall = sinon.spy();
    const getHeight = sinon.stub().returns(100);

    [0, -1, NaN, Infinity, undefined].forEach((timeoutMs) => {
      const watchdog = createSyncWatchdog({ timeoutMs, getHeight, onStall });
      watchdog.start();
    });

    clock.tick(100000);
    expect(onStall.called).to.equal(false);
    expect(getHeight.called).to.equal(false);
  });

  it('is idempotent on start() and does not stack timers', () => {
    const onStall = sinon.spy();
    const watchdog = createSyncWatchdog({
      timeoutMs: 1000,
      getHeight: () => 100,
      onStall
    });

    watchdog.start();
    watchdog.start();
    watchdog.start();

    clock.tick(1000);
    expect(onStall.calledOnce).to.equal(true);
  });
});
