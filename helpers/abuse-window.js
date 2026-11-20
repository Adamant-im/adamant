'use strict';

const net = require('net');
const { ipKeyGenerator } = require('express-rate-limit');

const DEFAULT_MAX_KEYS = 10000;
const PRUNE_BATCH_SIZE = 128;

/**
 * Fixed-window counter for non-consensus abuse control.
 * A non-positive limit disables the counter and allows every hit.
 */
class AbuseWindow {
  /**
   * @param {number} limit - Maximum hits per window.
   * @param {number} windowMs - Window length in milliseconds.
   * @param {number} [maxKeys] - Maximum number of active keys retained.
   */
  constructor (limit, windowMs, maxKeys) {
    this.limit = limit;
    this.windowMs = windowMs > 0 ? windowMs : 60000;
    this.maxKeys = Number.isInteger(maxKeys) && maxKeys > 0 ? maxKeys : DEFAULT_MAX_KEYS;
    this.hits = new Map();
    this.expirations = [];
    this.expirationHead = 0;
  }

  /**
   * Records one hit and reports whether it is still inside the limit.
   * @param {string} key - Bucket key.
   * @return {boolean} True when the hit is allowed.
   */
  allow (key) {
    if (!(this.limit > 0)) {
      return true;
    }

    const now = Date.now();
    const bucketKey = String(key);

    this.prune(now);

    let bucket = this.hits.get(bucketKey);

    if (!bucket) {
      if (this.hits.size >= this.maxKeys) {
        return false;
      }

      bucket = {
        count: 0,
        resetAt: now + this.windowMs
      };
      this.hits.set(bucketKey, bucket);
      this.expirations.push({
        key: bucketKey,
        resetAt: bucket.resetAt
      });
    } else if (now >= bucket.resetAt) {
      bucket.count = 0;
      bucket.resetAt = now + this.windowMs;
      this.expirations.push({
        key: bucketKey,
        resetAt: bucket.resetAt
      });
    }

    bucket.count += 1;
    return bucket.count <= this.limit;
  }

  /**
   * Drops expired buckets so idle keys do not grow without bound.
   * @param {number} now - Current timestamp in milliseconds.
   * @return {void}
   */
  prune (now) {
    let processed = 0;

    while (
      processed < PRUNE_BATCH_SIZE &&
      this.expirationHead < this.expirations.length
    ) {
      const expiration = this.expirations[this.expirationHead];

      if (expiration.resetAt > now) {
        break;
      }

      this.expirationHead += 1;
      processed += 1;

      const bucket = this.hits.get(expiration.key);
      if (bucket && bucket.resetAt === expiration.resetAt) {
        this.hits.delete(expiration.key);
      }
    }

    if (
      this.expirationHead >= 1024 &&
      this.expirationHead * 2 >= this.expirations.length
    ) {
      this.expirations = this.expirations.slice(this.expirationHead);
      this.expirationHead = 0;
    }
  }
}

/**
 * Strips an IPv4-mapped IPv6 prefix.
 * @param {*} ip - Remote address.
 * @return {string} Normalized address.
 */
function normalizeIp (ip) {
  return String(ip || 'unknown').trim().replace(/^::ffff:/i, '');
}

/**
 * Converts a client address into an abuse-control key.
 * IPv6 clients are grouped by the same /56 allocation boundary used by HTTP rate limits.
 * @param {*} ip - Remote address.
 * @return {string} Stable abuse-control key.
 */
function ipLimitKey (ip) {
  const normalized = normalizeIp(ip);

  if (!net.isIP(normalized)) {
    return 'unknown';
  }

  return ipKeyGenerator(normalized);
}

/**
 * Resolves an HTTP or Socket.IO client address, trusting only the nearest proxy hop.
 * @param {object} source - IncomingMessage or Socket.IO socket.
 * @param {boolean} trustProxy - Whether the direct peer is a trusted reverse proxy.
 * @return {string} Normalized client address.
 */
function resolveClientIp (source, trustProxy) {
  const handshake = (source && source.handshake) || {};
  const headers = handshake.headers || (source && source.headers) || {};

  if (trustProxy) {
    const forwardedValue = headers['x-forwarded-for'];
    const forwarded = Array.isArray(forwardedValue) ?
      forwardedValue[0] :
      forwardedValue;

    if (typeof forwarded === 'string' && forwarded.trim()) {
      const values = forwarded.split(',');
      return normalizeIp(values[values.length - 1].trim());
    }
  }

  const address = handshake.address ||
    (source && source.remoteAddress) ||
    (source && source.socket && source.socket.remoteAddress) ||
    (source && source.connection && source.connection.remoteAddress) ||
    (source && source.conn && source.conn.remoteAddress) ||
    (source && source.request && source.request.socket && source.request.socket.remoteAddress) ||
    'unknown';

  return normalizeIp(address);
}

module.exports = AbuseWindow;
module.exports.normalizeIp = normalizeIp;
module.exports.ipLimitKey = ipLimitKey;
module.exports.resolveClientIp = resolveClientIp;
