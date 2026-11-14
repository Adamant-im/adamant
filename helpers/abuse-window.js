'use strict';

/**
 * Fixed-window counter for non-consensus abuse control.
 * A non-positive limit disables the counter and allows every hit.
 */
class AbuseWindow {
  /**
   * @param {number} limit - Maximum hits per window.
   * @param {number} windowMs - Window length in milliseconds.
   */
  constructor (limit, windowMs) {
    this.limit = limit;
    this.windowMs = windowMs > 0 ? windowMs : 60000;
    this.hits = new Map();
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
    let bucket = this.hits.get(bucketKey);

    if (!bucket || now >= bucket.resetAt) {
      bucket = {
        count: 0,
        resetAt: now + this.windowMs
      };
      this.hits.set(bucketKey, bucket);
      this.prune(now);
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
    if (this.hits.size < 1000) {
      return;
    }

    for (const [key, bucket] of this.hits) {
      if (now >= bucket.resetAt) {
        this.hits.delete(key);
      }
    }
  }
}

/**
 * Strips an IPv4-mapped IPv6 prefix.
 * @param {*} ip - Remote address.
 * @return {string} Normalized address.
 */
function normalizeIp (ip) {
  return String(ip || 'unknown').replace(/^::ffff:/, '');
}

module.exports = AbuseWindow;
module.exports.normalizeIp = normalizeIp;
