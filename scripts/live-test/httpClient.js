'use strict';

const axios = require('axios').default;
const { performance } = require('perf_hooks');

/**
 * Small JSON client with latency measurements for live scenario checks.
 */
class HttpClient {
  /**
   * @param {object} options - Client options.
   * @param {string} options.baseUrl - Base REST API URL.
   * @param {number} options.timeoutMs - Request timeout.
   * @param {object} [options.headers] - Default headers.
   */
  constructor (options) {
    this.baseUrl = normalizeBaseUrl(options.baseUrl);
    this.timeoutMs = options.timeoutMs;
    this.headers = options.headers || {};
  }

  /**
   * Performs a GET request.
   * @param {string} path - Absolute API path.
   */
  get (path) {
    return this.request('get', path);
  }

  /**
   * Performs a POST request.
   * @param {string} path - Absolute API path.
   * @param {object} body - JSON body.
   * @param {object} [options] - Per-request HTTP options.
   */
  post (path, body, options) {
    return this.request('post', path, body, options);
  }

  /**
   * Performs a PUT request.
   * @param {string} path - Absolute API path.
   * @param {object} body - JSON body.
   */
  put (path, body) {
    return this.request('put', path, body);
  }

  /**
   * Performs an HTTP request and returns status, body, and timing.
   * @param {string} method - HTTP method.
   * @param {string} path - Absolute API path.
   * @param {object} [body] - JSON body.
   * @param {object} [options] - Per-request HTTP options.
   */
  async request (method, path, body, options) {
    const started = performance.now();
    const timeoutMs = options && Number.isFinite(options.timeoutMs) ?
      options.timeoutMs :
      this.timeoutMs;

    try {
      const response = await axios({
        method,
        url: this.baseUrl + path,
        data: body,
        timeout: timeoutMs,
        headers: this.headers,
        validateStatus: function () {
          return true;
        }
      });

      return {
        ok: response.status >= 200 && response.status < 300,
        status: response.status,
        body: response.data,
        latencyMs: Math.round((performance.now() - started) * 100) / 100
      };
    } catch (error) {
      return {
        ok: false,
        status: 0,
        body: null,
        error: error.message,
        latencyMs: Math.round((performance.now() - started) * 100) / 100
      };
    }
  }
}

/**
 * Normalizes a base URL by trimming trailing slashes.
 * @param {string} baseUrl - User supplied base URL.
 */
function normalizeBaseUrl (baseUrl) {
  return String(baseUrl || '').replace(/\/+$/, '');
}

module.exports = {
  HttpClient,
  normalizeBaseUrl
};
