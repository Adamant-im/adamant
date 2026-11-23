'use strict';

const AbuseWindow = require('./abuse-window.js');
const ipLimitKey = AbuseWindow.ipLimitKey;
const resolveClientIp = AbuseWindow.resolveClientIp;

const DEFAULT_PENDING_TIMEOUT_MS = 10000;

/**
 * Reserves bounded transport sessions before Engine.IO allocates one.
 */
class SocketAdmission {
  /**
   * @param {object} options - Admission policy.
   * @param {number|null} options.maxConnections - Total connection cap, or null.
   * @param {number|null} options.maxConnectionsPerIp - Total per-IP cap, or null.
   * @param {number|null} options.maxPendingConnections - Pre-authentication cap, or null.
   * @param {number|null} options.maxPendingConnectionsPerIp - Pre-authentication per-IP cap, or null.
   * @param {number} options.pendingTimeoutMs - Pre-authentication timeout.
   * @param {number} options.maxConnectionAttempts - Attempts allowed per window.
   * @param {number} options.connectionWindowMs - Attempt window length.
   * @param {boolean} options.trustProxy - Whether forwarding headers are trusted.
   * @param {Function} [options.onReject] - Rejection observer.
   */
  constructor (options) {
    this.maxConnections = options.maxConnections;
    this.maxConnectionsPerIp = options.maxConnectionsPerIp;
    this.maxPendingConnections = options.maxPendingConnections;
    this.maxPendingConnectionsPerIp = options.maxPendingConnectionsPerIp;
    this.pendingTimeoutMs = options.pendingTimeoutMs > 0 ?
      options.pendingTimeoutMs :
      DEFAULT_PENDING_TIMEOUT_MS;
    this.trustProxy = Boolean(options.trustProxy);
    this.onReject = options.onReject;
    this.attempts = new AbuseWindow(
        options.maxConnectionAttempts,
        options.connectionWindowMs
    );
    this.pending = new WeakMap();
    this.active = new WeakMap();
    this.connectionsByIp = new Map();
    this.pendingConnectionsByIp = new Map();
    this.reservationCount = 0;
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
    const currentByIp = this.connectionsByIp.get(key) || 0;
    const pendingByIp = this.pendingConnectionsByIp.get(key) || 0;

    if (!this.attempts.allow(key)) {
      return this.reject(callback, 'Too many connection attempts', address);
    }

    if (
      this.maxConnections !== null &&
      this.connectionCount >= this.maxConnections
    ) {
      return this.reject(callback, 'Server connection limit exceeded', address);
    }

    if (
      this.maxConnectionsPerIp !== null &&
      currentByIp >= this.maxConnectionsPerIp
    ) {
      return this.reject(callback, 'IP connection limit exceeded', address);
    }

    if (
      this.maxPendingConnections !== null &&
      this.pendingCount >= this.maxPendingConnections
    ) {
      return this.reject(callback, 'Pending connection limit exceeded', address);
    }

    if (
      this.maxPendingConnectionsPerIp !== null &&
      pendingByIp >= this.maxPendingConnectionsPerIp
    ) {
      return this.reject(callback, 'Pending IP connection limit exceeded', address);
    }

    const reservation = {
      key,
      timer: null,
      promoted: false
    };

    reservation.timer = setTimeout(() => {
      this.releasePending(req);
    }, this.pendingTimeoutMs);
    reservation.timer.unref();

    this.pending.set(req, reservation);
    this.reservationCount += 1;
    this.pendingCount += 1;
    this.connectionsByIp.set(key, currentByIp + 1);
    this.pendingConnectionsByIp.set(key, pendingByIp + 1);
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

    this.pending.delete(req);
    this.reservationCount -= 1;
    this.active.set(socket, reservation);
    this.activeCount += 1;
    clearTimeout(reservation.timer);
    reservation.timer = setTimeout(() => {
      if (!reservation.promoted) {
        this.releaseActive(socket);
        socket.close(true);
      }
    }, this.pendingTimeoutMs);
    reservation.timer.unref();
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
   * Promotes a validated namespace socket out of the pending budget.
   * @param {object} socket - Engine.IO socket.
   * @return {boolean} Whether the socket was promoted.
   */
  promote (socket) {
    const reservation = this.active.get(socket);

    if (!reservation) {
      return false;
    }

    if (reservation.promoted) {
      return true;
    }

    clearTimeout(reservation.timer);
    reservation.promoted = true;
    this.pendingCount = Math.max(0, this.pendingCount - 1);
    this.releaseIp(this.pendingConnectionsByIp, reservation.key);
    return true;
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
    this.reservationCount = Math.max(0, this.reservationCount - 1);
    this.pendingCount = Math.max(0, this.pendingCount - 1);
    this.releaseIp(this.pendingConnectionsByIp, reservation.key);
    this.releaseIp(this.connectionsByIp, reservation.key);
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

    clearTimeout(reservation.timer);
    this.active.delete(socket);
    this.activeCount = Math.max(0, this.activeCount - 1);
    if (!reservation.promoted) {
      this.pendingCount = Math.max(0, this.pendingCount - 1);
      this.releaseIp(this.pendingConnectionsByIp, reservation.key);
    }
    this.releaseIp(this.connectionsByIp, reservation.key);
  }

  /**
   * @return {number} Total active and reserved transport count.
   */
  get connectionCount () {
    return this.reservationCount + this.activeCount;
  }

  /**
   * @return {number} Pending, not-yet-promoted transport count.
   */
  get pendingConnectionCount () {
    return this.pendingCount;
  }

  /**
   * @param {Map<string, number>} counters - Counter map.
   * @param {string} key - IP allocation key.
   * @return {void}
   */
  releaseIp (counters, key) {
    const current = counters.get(key) || 0;

    if (current <= 1) {
      counters.delete(key);
    } else {
      counters.set(key, current - 1);
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
