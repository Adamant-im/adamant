'use strict';

const AbuseWindow = require('./abuse-window.js');
const ipLimitKey = AbuseWindow.ipLimitKey;
const resolveClientIp = AbuseWindow.resolveClientIp;

const PENDING_TIMEOUT_MS = 30000;

/**
 * Reserves bounded transport sessions before Engine.IO allocates one.
 */
class SocketAdmission {
  /**
   * @param {object} options - Admission policy.
   * @param {number|null} options.maxConnections - Global active and pending cap, or null.
   * @param {number|null} options.maxConnectionsPerIp - Per-IP active and pending cap, or null.
   * @param {number} options.maxConnectionAttempts - Attempts allowed per window.
   * @param {number} options.connectionWindowMs - Attempt window length.
   * @param {boolean} options.trustProxy - Whether forwarding headers are trusted.
   * @param {Function} [options.onReject] - Rejection observer.
   */
  constructor (options) {
    this.maxConnections = options.maxConnections;
    this.maxConnectionsPerIp = options.maxConnectionsPerIp;
    this.trustProxy = Boolean(options.trustProxy);
    this.onReject = options.onReject;
    this.attempts = new AbuseWindow(
        options.maxConnectionAttempts,
        options.connectionWindowMs
    );
    this.pending = new WeakMap();
    this.active = new WeakMap();
    this.connectionsByIp = new Map();
    this.pendingCount = 0;
    this.activeCount = 0;
  }

  /**
   * Attaches lifecycle tracking after Socket.IO created the Engine.IO server.
   * @param {object} engine - Engine.IO server.
   * @return {void}
   */
  bind (engine) {
    engine.on('connection', (socket) => {
      this.activate(socket);
    });
    engine.on('connection_error', (error) => {
      if (error && error.req) {
        this.releasePending(error.req);
      }
    });
  }

  /**
   * Engine.IO allowRequest hook. A successful reservation is released or activated
   * before the request's Engine.IO session can remain resident.
   * @param {object} req - Incoming handshake request.
   * @param {Function} callback - Engine.IO admission callback.
   * @return {boolean} Whether the handshake was admitted.
   */
  allowRequest (req, callback) {
    const address = resolveClientIp(req, this.trustProxy);
    const key = ipLimitKey(address);
    const currentCount = this.pendingCount + this.activeCount;
    const currentByIp = this.connectionsByIp.get(key) || 0;

    if (!this.attempts.allow(key)) {
      return this.reject(callback, 'Too many connection attempts', address);
    }

    if (
      this.maxConnections !== null &&
      currentCount >= this.maxConnections
    ) {
      return this.reject(callback, 'Server connection limit exceeded', address);
    }

    if (
      this.maxConnectionsPerIp !== null &&
      currentByIp >= this.maxConnectionsPerIp
    ) {
      return this.reject(callback, 'IP connection limit exceeded', address);
    }

    const reservation = {
      key,
      timer: null
    };

    reservation.timer = setTimeout(() => {
      this.releasePending(req);
    }, PENDING_TIMEOUT_MS);
    reservation.timer.unref();

    this.pending.set(req, reservation);
    this.pendingCount += 1;
    this.connectionsByIp.set(key, currentByIp + 1);
    callback(null, true);
    return true;
  }

  /**
   * Moves an admitted handshake into the active set before namespace dispatch.
   * @param {object} socket - Engine.IO socket.
   * @return {boolean} Whether the socket had a reservation.
   */
  activate (socket) {
    const req = socket && socket.request;
    const reservation = req && this.pending.get(req);

    if (!reservation) {
      if (socket && typeof socket.close === 'function') {
        socket.close(true);
      }
      return false;
    }

    clearTimeout(reservation.timer);
    this.pending.delete(req);
    this.pendingCount -= 1;
    this.active.set(socket, reservation);
    this.activeCount += 1;
    socket.once('close', () => {
      this.releaseActive(socket);
    });
    return true;
  }

  /**
   * @param {object} socket - Engine.IO socket.
   * @return {boolean} Whether the socket is admitted.
   */
  isActive (socket) {
    return this.active.has(socket);
  }

  /**
   * @param {object} req - Failed handshake request.
   * @return {void}
   */
  releasePending (req) {
    const reservation = req && this.pending.get(req);

    if (!reservation) {
      return;
    }

    clearTimeout(reservation.timer);
    this.pending.delete(req);
    this.pendingCount = Math.max(0, this.pendingCount - 1);
    this.releaseIp(reservation.key);
  }

  /**
   * @param {object} socket - Closed Engine.IO socket.
   * @return {void}
   */
  releaseActive (socket) {
    const reservation = this.active.get(socket);

    if (!reservation) {
      return;
    }

    this.active.delete(socket);
    this.activeCount = Math.max(0, this.activeCount - 1);
    this.releaseIp(reservation.key);
  }

  /**
   * @return {number} Active and pending transport count.
   */
  get connectionCount () {
    return this.pendingCount + this.activeCount;
  }

  /**
   * @param {string} key - IP allocation key.
   * @return {void}
   */
  releaseIp (key) {
    const current = this.connectionsByIp.get(key) || 0;

    if (current <= 1) {
      this.connectionsByIp.delete(key);
    } else {
      this.connectionsByIp.set(key, current - 1);
    }
  }

  /**
   * @param {Function} callback - Engine.IO admission callback.
   * @param {string} reason - Rejection reason.
   * @param {string} address - Normalized direct or forwarded address.
   * @return {boolean} Always false.
   */
  reject (callback, reason, address) {
    if (this.onReject) {
      this.onReject(reason, address);
    }

    callback(reason, false);
    return false;
  }
}

module.exports = SocketAdmission;
