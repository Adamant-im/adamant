'use strict';

/**
 * Creates a progress-based watchdog for a single blockchain sync run.
 *
 * The node serializes a sync attempt through callback-based async flows. If any
 * inner step fails to invoke its callback (for example a swallowed callback in
 * the block-processing path), the sync state machine never reaches its
 * completion handler. That leaves `loader.syncing()` permanently true, which in
 * turn makes the node reject every live block and never start a recovery sync.
 * The result is a node that is frozen at a height while still connected to the
 * network, requiring a manual restart.
 *
 * This watchdog guards against that failure mode. It periodically samples the
 * current blockchain height; if no new block is applied within `timeoutMs`, it
 * invokes `onStall` exactly once so the caller can abort the stalled sync and
 * let a fresh attempt start.
 *
 * It is intentionally liveness-only: it never inspects, validates, or mutates
 * block or chain state. It only observes whether height is advancing and signals
 * a lack of progress. Because the check is "did height advance within the
 * window", a slow-but-progressing sync (a node many blocks behind that keeps
 * applying blocks) is never aborted — only a genuinely stalled run is.
 *
 * @param {object} options
 * @param {number} options.timeoutMs - Maximum time without block progress before
 *   a stall is declared. Values `<= 0` (or non-finite) disable the watchdog.
 * @param {Function} options.getHeight - Returns the current blockchain height.
 * @param {Function} options.onStall - Called once, with the last observed height,
 *   when no block progress is detected within the window.
 * @return {{ start: Function, stop: Function }}
 */
function createSyncWatchdog (options) {
  const timeoutMs = options.timeoutMs;
  const getHeight = options.getHeight;
  const onStall = options.onStall;

  const enabled = Number.isFinite(timeoutMs) && timeoutMs > 0;

  let timer = null;
  let lastHeight = 0;
  let fired = false;

  function stop () {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  function tick () {
    const height = getHeight();

    // Progress observed within the window: remember it and keep waiting.
    if (height > lastHeight) {
      lastHeight = height;
      return;
    }

    // No new block was applied for the whole window: the sync is stalled.
    fired = true;
    stop();
    onStall(height);
  }

  function start () {
    if (!enabled || timer || fired) {
      return;
    }

    lastHeight = getHeight();
    timer = setInterval(tick, timeoutMs);

    // The watchdog must not by itself keep the process alive.
    if (timer && typeof timer.unref === 'function') {
      timer.unref();
    }
  }

  return {
    start: start,
    stop: stop
  };
}

module.exports = createSyncWatchdog;
