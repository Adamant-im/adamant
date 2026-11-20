'use strict';

const RATE_LIMIT_HEADERS = [
  'RateLimit',
  'RateLimit-Policy',
  'RateLimit-Limit',
  'RateLimit-Remaining',
  'RateLimit-Reset',
  'Retry-After',
  'X-RateLimit-Limit',
  'X-RateLimit-Remaining',
  'X-RateLimit-Reset'
];

/**
 * Adds rate-limit response headers to the configured browser allowlist.
 * @param {object} [config] - Existing cors package options.
 * @return {object} Cors options with rate-limit headers exposed.
 */
function corsOptions (config) {
  const source = config && typeof config === 'object' ? config : {};
  const configured = Array.isArray(source.exposedHeaders) ?
    source.exposedHeaders :
    typeof source.exposedHeaders === 'string' ?
      source.exposedHeaders.split(',').map((header) => header.trim()) :
      [];
  const exposedHeaders = new Set(configured.filter(Boolean));

  RATE_LIMIT_HEADERS.forEach((header) => exposedHeaders.add(header));

  return Object.assign({}, source, {
    exposedHeaders: Array.from(exposedHeaders)
  });
}

module.exports = corsOptions;
module.exports.rateLimitHeaders = RATE_LIMIT_HEADERS;
