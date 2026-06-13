#!/usr/bin/env node
'use strict';

const fs = require('fs');
const http = require('http');
const https = require('https');
const { Command } = require('commander');
const localnet = require('./localnet.js');

const DEFAULT_TIMEOUT_MS = 3000;
const FORGED_BLOCK_PATTERN = /^\[[^\]]+\]\s+([0-9TZ:.+-]+)\s+\|\s+delegates\s+\|\s+Forged new block id:/;

const program = new Command();

program
    .description('Show ADAMANT localnet process, API, delegate, and forging status')
    .option('--runtime-dir <path>', 'generated runtime directory', localnet.DEFAULTS.runtimeDir)
    .option('--logs-dir <path>', 'localnet log directory', localnet.DEFAULTS.logsDir)
    .option('--timeout-ms <ms>', 'HTTP status request timeout per node', String(DEFAULT_TIMEOUT_MS));

/**
 * Collects manifest, process, API, config, and log status for localnet.
 * @param {object} input - Partial localnet status options.
 */
async function getLocalnetStatus (input) {
  input = input || {};

  const options = localnet.normalizeOptions(input);
  const manifestPath = localnet.getManifestPath(options);

  if (!fs.existsSync(manifestPath)) {
    return {
      manifestPath,
      manifestExists: false,
      nodes: []
    };
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const timeoutMs = parsePositiveInteger(input.timeoutMs, 'timeoutMs', DEFAULT_TIMEOUT_MS);
  const nodes = await Promise.all((manifest.nodes || []).map(function (node) {
    return getNodeStatus(node, timeoutMs);
  }));

  return {
    manifestPath,
    manifestExists: true,
    manifest,
    nodes,
    summary: buildSummary(manifest, nodes)
  };
}

/**
 * Collects status for one manifest node.
 * @param {object} node - Manifest node entry.
 * @param {number} timeoutMs - HTTP request timeout in milliseconds.
 */
async function getNodeStatus (node, timeoutMs) {
  const pidRunning = !!(node.pid && localnet.isProcessRunning(node.pid));
  const results = await Promise.all([
    fetchNodeApiStatus(node.apiUrl, timeoutMs),
    fetchNodePeers(node.apiUrl, timeoutMs)
  ]);
  const api = results[0];
  const peers = results[1];

  return {
    id: node.id,
    pid: node.pid,
    pidRunning,
    apiUrl: node.apiUrl,
    wsClientUrl: node.wsClientUrl,
    api,
    peers,
    delegateSecretsCount: readDelegateSecretsCount(node),
    lastForging: findLastForgingEvent(node.generalLogFile)
  };
}

/**
 * Requests `/api/node/status` from one localnet node.
 * @param {string} apiUrl - Base node API URL from manifest.
 * @param {number} timeoutMs - HTTP request timeout in milliseconds.
 */
function fetchNodeApiStatus (apiUrl, timeoutMs) {
  return fetchNodeJson(apiUrl, '/api/node/status', timeoutMs).then(function (result) {
    if (!result.ok) {
      return result;
    }

    return Object.assign({}, result, {
      payload: extractNodeStatusPayload(result.body),
      error: result.body.error || null
    });
  });
}

/**
 * Requests `/api/peers` from one localnet node.
 * @param {string} apiUrl - Base node API URL from manifest.
 * @param {number} timeoutMs - HTTP request timeout in milliseconds.
 */
function fetchNodePeers (apiUrl, timeoutMs) {
  return fetchNodeJson(apiUrl, '/api/peers?limit=100', timeoutMs).then(function (result) {
    if (!result.ok) {
      return result;
    }

    return Object.assign({}, result, {
      peers: Array.isArray(result.body.peers) ? result.body.peers : []
    });
  });
}

/**
 * Requests and parses JSON from a localnet node API endpoint.
 * @param {string} apiUrl - Base node API URL from manifest.
 * @param {string} endpoint - Absolute API endpoint path and query.
 * @param {number} timeoutMs - HTTP request timeout in milliseconds.
 */
function fetchNodeJson (apiUrl, endpoint, timeoutMs) {
  return new Promise(function (resolve) {
    const statusUrl = new URL(endpoint, apiUrl);

    const transport = statusUrl.protocol === 'https:' ? https : http;
    const request = transport.get(statusUrl, function (response) {
      const chunks = [];

      response.on('data', function (chunk) {
        chunks.push(chunk);
      });

      response.on('end', function () {
        const body = Buffer.concat(chunks).toString('utf8');

        try {
          const parsedBody = JSON.parse(body);
          const payload = extractNodeStatusPayload(parsedBody);

          resolve({
            ok: response.statusCode >= 200 && response.statusCode < 300 && parsedBody.success !== false,
            statusCode: response.statusCode,
            body: parsedBody,
            payload,
            error: parsedBody.error || null
          });
        } catch (error) {
          resolve({
            ok: false,
            statusCode: response.statusCode,
            body: null,
            payload: null,
            error: 'Invalid JSON response: ' + error.message
          });
        }
      });
    });

    request.setTimeout(timeoutMs, function () {
      // Destroying the client request does not affect the node process; it only ends this status probe.
      request.destroy(Error('Request timed out after ' + timeoutMs + ' ms'));
    });

    request.on('error', function (error) {
      resolve({
        ok: false,
        statusCode: null,
        body: null,
        payload: null,
        error: error.message
      });
    });
  });
}

/**
 * Normalizes current and possible future API response wrappers.
 * @param {object} body - Parsed `/api/node/status` response body.
 */
function extractNodeStatusPayload (body) {
  if (!body || typeof body !== 'object') {
    return null;
  }

  return body.node || body.status || body.data || body;
}

/**
 * Reads configured forging delegate count from a generated node override file.
 * @param {object} node - Manifest node entry.
 */
function readDelegateSecretsCount (node) {
  if (!node.overrideFile || !fs.existsSync(node.overrideFile)) {
    return node.delegateSecretsCount || 0;
  }

  const overrides = JSON.parse(fs.readFileSync(node.overrideFile, 'utf8'));
  const secrets = overrides.forging && overrides.forging.secret;

  if (Array.isArray(secrets)) {
    return secrets.length;
  }

  return secrets ? 1 : 0;
}

/**
 * Finds the last successful forging event in a node general log.
 * @param {string} logFile - Path to a node general log file.
 */
function findLastForgingEvent (logFile) {
  if (!logFile || !fs.existsSync(logFile)) {
    return null;
  }

  const lines = fs.readFileSync(logFile, 'utf8').split(/\r?\n/);
  let lastEvent = null;

  lines.forEach(function (line) {
    const match = FORGED_BLOCK_PATTERN.exec(line);

    if (!match) {
      return;
    }

    const timestampMs = Date.parse(match[1]);

    if (!Number.isNaN(timestampMs)) {
      lastEvent = {
        timestamp: new Date(timestampMs).toISOString(),
        timestampMs,
        line
      };
    }
  });

  return lastEvent;
}

/**
 * Builds aggregate localnet counters from node statuses.
 * @param {object} manifest - Localnet manifest.
 * @param {Array<object>} nodes - Per-node status entries.
 */
function buildSummary (manifest, nodes) {
  const apiOkNodes = nodes.filter(function (node) {
    return node.api.ok;
  });
  const heights = apiOkNodes.map(function (node) {
    return node.api.payload && node.api.payload.network && node.api.payload.network.height;
  }).filter(function (height) {
    return Number.isFinite(height);
  });

  return {
    status: manifest.status || 'unknown',
    nodesTotal: nodes.length,
    processesRunning: nodes.filter(function (node) {
      return node.pidRunning;
    }).length,
    apiReachable: apiOkNodes.length,
    minHeight: heights.length ? Math.min.apply(null, heights) : null,
    maxHeight: heights.length ? Math.max.apply(null, heights) : null
  };
}

/**
 * Calculates current broadhash consensus from peer records.
 * @param {string} broadhash - Local node broadhash.
 * @param {Array<object>} peers - Current peer records from `/api/peers`.
 */
function calculateBroadhashConsensus (broadhash, peers) {
  const connectedPeers = (peers || []).filter(function (peer) {
    return peer.state === 2;
  });

  if (!broadhash || !connectedPeers.length) {
    return null;
  }

  const matchedPeers = connectedPeers.filter(function (peer) {
    return peer.broadhash === broadhash;
  });

  return Math.round(matchedPeers.length / connectedPeers.length * 100 * 1e2) / 1e2;
}

/**
 * Formats localnet status as a compact terminal report.
 * @param {object} status - Localnet status returned by `getLocalnetStatus`.
 */
function formatStatusReport (status) {
  if (!status.manifestExists) {
    return 'No localnet manifest found at ' + status.manifestPath + '.';
  }

  const lines = [];
  const summary = status.summary;
  const heightText = summary.minHeight === null ?
    'n/a' :
    summary.minHeight === summary.maxHeight ? String(summary.maxHeight) : summary.minHeight + '..' + summary.maxHeight;

  lines.push('Localnet status: ' + summary.status);
  lines.push('Manifest: ' + status.manifestPath);
  lines.push(
      'Nodes: ' +
      summary.nodesTotal +
      ' total, ' +
      summary.processesRunning +
      ' process(es) running, ' +
      summary.apiReachable +
      ' API reachable, height ' +
      heightText
  );

  status.nodes.forEach(function (node) {
    lines.push(formatNodeStatusLine(node));
  });

  return lines.join('\n');
}

/**
 * Formats one node status line.
 * @param {object} node - Per-node status entry.
 */
function formatNodeStatusLine (node) {
  const payload = node.api.payload || {};
  const network = payload.network || {};
  const loader = payload.loader || {};
  const apiState = node.api.ok ? 'api ok' : 'api unavailable: ' + (node.api.error || 'unknown error');
  const processState = node.pidRunning ? 'pid ' + node.pid + ' running' : 'pid ' + (node.pid || 'n/a') + ' not running';
  const height = Number.isFinite(network.height) ? network.height : 'n/a';
  const nethash = network.nethash || 'n/a';
  const broadhash = network.broadhash || 'n/a';
  const cachedConsensus = Number.isFinite(loader.consensus) ? loader.consensus : null;
  const liveConsensus = node.peers && node.peers.ok ?
    calculateBroadhashConsensus(network.broadhash, node.peers.peers) :
    null;

  return [
    '- ' + node.id + ':',
    processState + ',',
    apiState + ',',
    'height ' + height + ',',
    'loaded ' + formatBoolean(loader.loaded) + ',',
    'syncing ' + formatBoolean(loader.syncing) + ',',
    'broadhash consensus ' + formatConsensus(liveConsensus, cachedConsensus) + ',',
    'broadhash ' + broadhash + ',',
    'delegates ' + node.delegateSecretsCount + ',',
    'last forge ' + formatLastForging(node.lastForging) + ',',
    'nethash ' + nethash
  ].join(' ');
}

/**
 * Formats live and cached consensus values for terminal output.
 * @param {?number} liveConsensus - Consensus calculated from current peer records.
 * @param {?number} cachedConsensus - Cached consensus returned by `/api/node/status`.
 */
function formatConsensus (liveConsensus, cachedConsensus) {
  if (liveConsensus === null && cachedConsensus === null) {
    return 'n/a';
  }

  if (liveConsensus === null) {
    return cachedConsensus + '% cached';
  }

  if (cachedConsensus !== null && cachedConsensus !== liveConsensus) {
    return liveConsensus + '% (cached ' + cachedConsensus + '%)';
  }

  return liveConsensus + '%';
}

/**
 * Formats boolean-like API values for terminal output.
 * @param {*} value - API value.
 */
function formatBoolean (value) {
  return typeof value === 'boolean' ? String(value) : 'n/a';
}

/**
 * Formats a forging event with relative age.
 * @param {?object} event - Forging event returned by `findLastForgingEvent`.
 */
function formatLastForging (event) {
  if (!event) {
    return 'never';
  }

  const secondsAgo = Math.max(0, Math.floor((Date.now() - event.timestampMs) / 1000));

  return event.timestamp + ' (' + secondsAgo + 's ago)';
}

/**
 * Parses a positive integer option for standalone status execution.
 * @param {*} value - Raw option value.
 * @param {string} name - Option name for error messages.
 * @param {number} fallback - Fallback value when the raw value is empty.
 */
function parsePositiveInteger (value, name, fallback) {
  const parsed = value === undefined || value === null ? fallback : Number(value);

  if (!Number.isInteger(parsed) || parsed < 1) {
    throw Error('Invalid ' + name + ': expected a positive integer');
  }

  return parsed;
}

/**
 * Runs status collection from parsed CLI options and prints the report.
 */
async function main () {
  program.parse(process.argv);

  const status = await getLocalnetStatus(program.opts());

  console.log(formatStatusReport(status));
}

if (require.main === module) {
  main().catch(function (error) {
    console.error(error.message);
    process.exit(1);
  });
}

module.exports = {
  getLocalnetStatus,
  getNodeStatus,
  fetchNodeApiStatus,
  fetchNodePeers,
  fetchNodeJson,
  extractNodeStatusPayload,
  readDelegateSecretsCount,
  findLastForgingEvent,
  buildSummary,
  calculateBroadhashConsensus,
  formatStatusReport,
  formatNodeStatusLine,
  formatBoolean,
  formatConsensus,
  formatLastForging
};
