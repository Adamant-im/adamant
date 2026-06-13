'use strict';

const fs = require('fs');
const path = require('path');

const configOverrides = require('../../helpers/configOverrides.js');
const { HttpClient } = require('./httpClient.js');

const DEFAULT_LOCALNET_MANIFEST = '.localnet/manifest.json';

/**
 * Resolves live scenario targets for testnet or localnet mode.
 * @param {object} options - Runner options.
 */
async function resolveTarget (options) {
  if (options.mode === 'localnet') {
    return resolveLocalnetTarget(options);
  }

  return resolveTestnetTarget(options);
}

/**
 * Resolves a testnet node, preferring explicit --node, then local testnet,
 * then the first peer from test/config.default.json.
 * @param {object} options - Runner options.
 */
async function resolveTestnetTarget (options) {
  const configPath = path.resolve(process.cwd(), options.testnetConfig || 'test/config.default.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  let selected;

  if (options.node) {
    selected = normalizeEndpoint(options.node, { id: 'node-recipient' });
  } else {
    const local = normalizeEndpoint(config.address + ':' + config.port, {
      id: 'node-recipient',
      host: config.address === '0.0.0.0' ? '127.0.0.1' : config.address,
      port: config.port
    });
    const localReachable = await isApiReachable(local.apiUrl, options.timeoutMs);

    if (localReachable) {
      selected = local;
    } else {
      const firstPeer = config.peers && config.peers.list && config.peers.list[0];

      if (!firstPeer) {
        throw Error('No --node supplied and no fallback peers found in ' + configPath);
      }

      selected = normalizeEndpoint(firstPeer.ip + ':' + firstPeer.port, {
        id: 'node-recipient'
      });
    }
  }

  const peer = resolveTestnetObservationPeer(config, selected, configPath);
  const nodeConfiguration = buildNodeConfiguration(config, configPath);
  const readinessNodes = buildTestnetReadinessNodes(
      config,
      selected,
      peer,
      nodeConfiguration
  );
  const observationNodes = await Promise.all([
    enrichNodeFromStatus(Object.assign({}, selected, {
      configuration: nodeConfiguration
    }), options.timeoutMs),
    enrichNodeFromStatus(Object.assign({}, peer, {
      configuration: nodeConfiguration
    }), options.timeoutMs)
  ]);

  return {
    mode: 'testnet',
    source: options.node ? 'explicit-node' : 'testnet-config',
    configPath,
    nodes: [observationNodes[0]],
    readinessNodes,
    transactionObservationNodes: observationNodes
  };
}

/**
 * Builds the complete testnet readiness inventory from the selected node and configured peers.
 * @param {object} config - Parsed testnet configuration.
 * @param {object} selectedNode - Primary node used by other scenarios.
 * @param {object} observationPeer - Peer used for transaction confirmation.
 * @param {object} configuration - Report-safe node configuration.
 */
function buildTestnetReadinessNodes (config, selectedNode, observationPeer, configuration) {
  const configuredPeers = config.peers && config.peers.list || [];
  const candidates = [selectedNode].concat(configuredPeers.map(function (peer, index) {
    return normalizeEndpoint(peer.ip + ':' + peer.port, {
      id: 'node-config-' + (index + 1)
    });
  }));
  const seen = new Set();

  return candidates.filter(function (candidate) {
    if (seen.has(candidate.apiUrl)) {
      return false;
    }

    seen.add(candidate.apiUrl);
    return true;
  }).map(function (candidate) {
    const roles = [];

    if (candidate.apiUrl === selectedNode.apiUrl) {
      roles.push('node-recipient');
    }
    if (candidate.apiUrl === observationPeer.apiUrl) {
      roles.push('node-peer');
    }

    return Object.assign({}, candidate, {
      roles,
      configuration
    });
  });
}

/**
 * Resolves the third configured testnet peer used to observe transaction propagation.
 * @param {object} config - Parsed testnet configuration.
 * @param {object} recipientNode - Node that receives submitted transactions.
 * @param {string} configPath - Configuration path used in error messages.
 */
function resolveTestnetObservationPeer (config, recipientNode, configPath) {
  const configuredPeers = config.peers && config.peers.list;

  if (!configuredPeers || configuredPeers.length < 3) {
    throw Error('No third fallback peer found in ' + configPath + ' for node-peer observation.');
  }

  const preferredPeers = [configuredPeers[2]].concat(configuredPeers.filter(function (peer, index) {
    return index !== 2;
  }));
  const peer = preferredPeers.map(function (configuredPeer) {
    return normalizeEndpoint(configuredPeer.ip + ':' + configuredPeer.port, {
      id: 'node-peer'
    });
  }).find(function (candidate) {
    return candidate.apiUrl !== recipientNode.apiUrl;
  });

  if (!peer) {
    throw Error('No configured peer differs from node-recipient in ' + configPath + '.');
  }

  return peer;
}

/**
 * Resolves localnet nodes from explicit --node flags or a localnet manifest.
 * @param {object} options - Runner options.
 */
function resolveLocalnetTarget (options) {
  if (options.nodes && options.nodes.length) {
    const configuration = buildNodeConfiguration(
        readJsonFileIfExists(path.resolve(process.cwd(), 'test/config.default.json')),
        'test/config.default.json'
    );
    const nodes = options.nodes.map(function (node, index) {
      return Object.assign(normalizeEndpoint(node, { id: 'node-' + (index + 1) }), {
        roles: index === 0 ? ['node-recipient'] : [],
        configuration
      });
    });

    return {
      mode: 'localnet',
      source: 'explicit-nodes',
      manifestPath: null,
      nodes,
      readinessNodes: nodes
    };
  }

  const manifestPath = path.resolve(process.cwd(), options.manifest || DEFAULT_LOCALNET_MANIFEST);

  if (!fs.existsSync(manifestPath)) {
    throw Error(
        'No localnet manifest found at ' +
        manifestPath +
        '. Start localnet separately or pass --node for each target.'
    );
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const nodes = (manifest.nodes || []).map(function (node, index) {
    const configuration = resolveLocalnetNodeConfiguration(manifest, node);

    return {
      id: node.id,
      host: node.host,
      port: node.port,
      apiUrl: node.apiUrl,
      wsClientPort: node.wsClientPort,
      wsClientUrl: node.wsClientUrl,
      pid: node.pid,
      logDir: node.logDir,
      runtimeDir: node.runtimeDir,
      generalLogFile: node.generalLogFile,
      debugLogFile: node.debugLogFile,
      delegateSecretsCount: node.delegateSecretsCount,
      overrideFile: node.overrideFile,
      roles: index === 0 ? ['node-recipient'] : [],
      configuration,
      db: node.db,
      redis: node.redis
    };
  });

  if (!nodes.length) {
    throw Error('Localnet manifest does not contain any nodes: ' + manifestPath);
  }

  return {
    mode: 'localnet',
    source: 'manifest',
    manifestPath,
    manifest,
    nodes,
    readinessNodes: nodes
  };
}

/**
 * Resolves report-safe configuration for one managed localnet node.
 * @param {object} manifest - Localnet manifest.
 * @param {object} node - Manifest node entry.
 */
function resolveLocalnetNodeConfiguration (manifest, node) {
  const cwd = manifest.cwd || process.cwd();
  const baseConfigPath = path.resolve(cwd, manifest.baseConfig || 'test/config.default.json');
  const config = readJsonFileIfExists(baseConfigPath);
  const overrideFiles = (manifest.configOverrides || []).concat(node.overrideFile || []);

  overrideFiles.forEach(function (overrideFile) {
    const resolvedPath = path.resolve(cwd, overrideFile);

    if (!fs.existsSync(resolvedPath)) {
      return;
    }

    const entries = configOverrides.parseOverrideFile(resolvedPath);

    entries.forEach(function (entry) {
      setNestedConfigValue(config, entry.path, entry.value);
    });
  });

  return buildNodeConfiguration(config, baseConfigPath);
}

/**
 * Builds the non-sensitive API and WebSocket configuration included in target reports.
 * @param {object} config - Parsed effective node configuration.
 * @param {string} source - Configuration source description.
 */
function buildNodeConfiguration (config, source) {
  config = config || {};

  const api = config.api || {};
  const apiAccess = api.access || {};
  const wsClient = config.wsClient || {};
  const wsServer = config.wsNode || {};

  return {
    source,
    api: {
      enabled: api.enabled,
      public: apiAccess.public,
      limits: api.options && api.options.limits
    },
    wsClient: {
      enabled: wsClient.enabled,
      port: wsClient.portWS
    },
    wsServer: {
      enabled: wsServer.enabled,
      maxBroadcastConnections: wsServer.maxBroadcastConnections,
      maxReceiveConnections: wsServer.maxReceiveConnections
    }
  };
}

/**
 * Reads a JSON object when the file exists.
 * @param {string} filePath - JSON file path.
 */
function readJsonFileIfExists (filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

/**
 * Applies one parsed config override without copying unrelated or sensitive values to reports.
 * @param {object} config - Config object to mutate.
 * @param {Array<string>} configPath - Parsed override path.
 * @param {*} value - Override value.
 */
function setNestedConfigValue (config, configPath, value) {
  let cursor = config;

  configPath.slice(0, -1).forEach(function (segment) {
    if (!cursor[segment] || typeof cursor[segment] !== 'object') {
      cursor[segment] = {};
    }
    cursor = cursor[segment];
  });

  cursor[configPath[configPath.length - 1]] = value;
}

/**
 * Normalizes host:port or URL input into API/WS endpoint metadata.
 * @param {string} input - Endpoint input.
 * @param {object} defaults - Default metadata.
 */
function normalizeEndpoint (input, defaults) {
  defaults = defaults || {};

  let apiUrl;
  let host = defaults.host;
  let port = defaults.port;

  if (/^https?:\/\//i.test(input)) {
    const url = new URL(input);
    apiUrl = url.origin;
    host = host || url.hostname;
    port = port || parseInt(url.port || (url.protocol === 'https:' ? '443' : '80'), 10);
  } else {
    const parts = String(input).split(':');

    if (parts.length !== 2) {
      throw Error('Invalid node endpoint "' + input + '": expected host:port or http(s) URL');
    }

    host = host || parts[0];
    port = port || parsePort(parts[1], 'node port');
    apiUrl = 'http://' + host + ':' + port;
  }

  return {
    id: defaults.id || host + ':' + port,
    host,
    port,
    apiUrl,
    wsClientPort: defaults.wsClientPort || null,
    wsClientUrl: defaults.wsClientUrl || null
  };
}

/**
 * Adds version and WebSocket metadata from /api/node/status when available.
 * @param {object} node - Node metadata.
 * @param {number} timeoutMs - HTTP timeout.
 */
async function enrichNodeFromStatus (node, timeoutMs) {
  const client = new HttpClient({
    baseUrl: node.apiUrl,
    timeoutMs
  });
  const status = await client.get('/api/node/status');

  if (!status.ok || !status.body || !status.body.success) {
    return node;
  }

  const wsClient = status.body.wsClient || {};

  node.version = status.body.version;
  node.height = status.body.network && status.body.network.height;
  node.nethash = status.body.network && status.body.network.nethash;
  node.broadhash = status.body.network && status.body.network.broadhash;

  if (wsClient.enabled && wsClient.port) {
    node.wsClientPort = wsClient.port;
    node.wsClientUrl = 'ws://' + node.host + ':' + wsClient.port;
  }

  return node;
}

/**
 * Checks if a REST API endpoint responds.
 * @param {string} apiUrl - Base API URL.
 * @param {number} timeoutMs - HTTP timeout.
 */
async function isApiReachable (apiUrl, timeoutMs) {
  const client = new HttpClient({
    baseUrl: apiUrl,
    timeoutMs
  });
  const result = await client.get('/api/loader/status/ping');

  return result.ok;
}

/**
 * Parses a port number.
 * @param {string|number} value - Port input.
 * @param {string} name - Field name.
 */
function parsePort (value, name) {
  const port = parseInt(value, 10);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw Error('Invalid ' + name + ': ' + value);
  }

  return port;
}

module.exports = {
  DEFAULT_LOCALNET_MANIFEST,
  enrichNodeFromStatus,
  normalizeEndpoint,
  parsePort,
  buildNodeConfiguration,
  buildTestnetReadinessNodes,
  resolveLocalnetTarget,
  resolveLocalnetNodeConfiguration,
  resolveTarget,
  resolveTestnetObservationPeer,
  resolveTestnetTarget
};
