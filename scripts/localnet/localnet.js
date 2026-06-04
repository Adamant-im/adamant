'use strict';

const childProcess = require('child_process');
const fs = require('fs');
const path = require('path');

const DEFAULTS = {
  nodes: 3,
  config: 'test/config.default.json',
  genesis: 'test/genesisBlock.json',
  genesisPasses: 'test/genesisPasses.json',
  configOverrides: ['test/config.localnet.json'],
  runtimeDir: '.localnet',
  logsDir: 'logs-localnet',
  bindAddress: '127.0.0.1',
  basePort: 36670,
  baseWsPort: 36770,
  dbHost: 'localhost',
  dbPort: 5432,
  dbUser: 'adamanttest',
  dbPassword: 'password',
  dbAdminUser: null,
  dbAdminPassword: null,
  dbNamePrefix: 'adamant_localnet_node_',
  redisUrl: 'redis://127.0.0.1:6379/10',
  redisDbBase: 10,
  stopTimeoutMs: 120000
};

/**
 * Normalizes CLI/test input into a complete localnet option object.
 * @param {object} input - Partial localnet options.
 */
function normalizeOptions (input) {
  input = input || {};

  const cwd = path.resolve(input.cwd || process.cwd());
  const configOverrides = normalizePathList(
      input.configOverrides !== undefined ? input.configOverrides : DEFAULTS.configOverrides
  );

  return {
    cwd,
    nodes: parsePositiveInteger(input.nodes, 'nodes', DEFAULTS.nodes),
    config: normalizeRelativePath(input.config || DEFAULTS.config),
    genesis: normalizeRelativePath(input.genesis || DEFAULTS.genesis),
    genesisPasses: normalizeRelativePath(input.genesisPasses || DEFAULTS.genesisPasses),
    delegateSecrets: Array.isArray(input.delegateSecrets) ? input.delegateSecrets.slice() : null,
    configOverrides,
    runtimeDir: path.resolve(cwd, input.runtimeDir || DEFAULTS.runtimeDir),
    logsDir: path.resolve(cwd, input.logsDir || DEFAULTS.logsDir),
    bindAddress: input.bindAddress || DEFAULTS.bindAddress,
    basePort: parsePort(input.basePort, 'basePort', DEFAULTS.basePort),
    baseWsPort: parsePort(input.baseWsPort, 'baseWsPort', DEFAULTS.baseWsPort),
    dbHost: input.dbHost || DEFAULTS.dbHost,
    dbPort: parsePort(input.dbPort, 'dbPort', DEFAULTS.dbPort),
    dbUser: input.dbUser || DEFAULTS.dbUser,
    dbPassword: input.dbPassword !== undefined ? input.dbPassword : DEFAULTS.dbPassword,
    dbAdminUser: input.dbAdminUser !== undefined ? input.dbAdminUser : DEFAULTS.dbAdminUser,
    dbAdminPassword: input.dbAdminPassword !== undefined ? input.dbAdminPassword : DEFAULTS.dbAdminPassword,
    dbNamePrefix: input.dbNamePrefix || DEFAULTS.dbNamePrefix,
    redisUrl: input.redisUrl || DEFAULTS.redisUrl,
    redisDbBase: parseNonNegativeInteger(input.redisDbBase, 'redisDbBase', DEFAULTS.redisDbBase),
    skipDbCreate: !!input.skipDbCreate,
    dropOnStop: !!(input.dropOnStop || input.drop_on_stop),
    force: !!input.force,
    stopTimeoutMs: parsePositiveInteger(input.stopTimeoutMs, 'stopTimeoutMs', DEFAULTS.stopTimeoutMs)
  };
}

/**
 * Builds node definitions, generated override payloads, and startup commands.
 * @param {object} options - Normalized localnet options.
 */
function buildLocalnetPlan (options) {
  const nodes = [];
  const delegateSecrets = options.delegateSecrets || loadGenesisDelegateSecrets(options);
  const delegateSecretBatches = distributeDelegateSecrets(delegateSecrets, options.nodes);

  for (let index = 1; index <= options.nodes; index++) {
    const nodeId = 'node-' + index;
    const port = options.basePort + index - 1;
    const wsClientPort = options.baseWsPort + index - 1;
    const logDir = path.join(options.logsDir, nodeId);
    const runtimeDir = path.join(options.runtimeDir, nodeId);
    const dbName = options.dbNamePrefix + index;
    const redisUrl = withRedisDatabase(options.redisUrl, options.redisDbBase + index - 1);

    nodes.push({
      id: nodeId,
      index,
      host: options.bindAddress,
      port,
      wsClientPort,
      apiUrl: 'http://' + options.bindAddress + ':' + port,
      wsClientUrl: 'ws://' + options.bindAddress + ':' + wsClientPort,
      logDir,
      runtimeDir,
      overrideFile: path.join(runtimeDir, 'config.overrides.json'),
      stdoutFile: path.join(logDir, 'stdout.log'),
      stderrFile: path.join(logDir, 'stderr.log'),
      generalLogFile: path.join(logDir, 'adamant_localnet.log'),
      debugLogFile: path.join(logDir, 'adamant_localnet_debug.log'),
      delegateSecrets: delegateSecretBatches[index - 1],
      delegateSecretsCount: delegateSecretBatches[index - 1].length,
      db: {
        host: options.dbHost,
        port: options.dbPort,
        database: dbName,
        user: options.dbUser
      },
      redis: {
        url: redisUrl
      }
    });
  }

  nodes.forEach(function (node) {
    // Localnet uses static peer lists so nodes do not connect to public testnet peers.
    node.peers = nodes
        .filter(function (peerNode) {
          return peerNode.id !== node.id;
        })
        .map(function (peerNode) {
          return {
            ip: peerNode.host,
            port: peerNode.port
          };
        });

    node.overrides = buildNodeOverrides(node, options);
    node.args = buildNodeArgs(node, options);
    node.command = ['node'].concat(node.args).join(' ');
  });

  return {
    manifestPath: getManifestPath(options),
    options,
    nodes
  };
}

/**
 * Starts every localnet node in detached/headless mode.
 * @param {object} input - Partial localnet options.
 */
function startLocalnet (input) {
  const options = normalizeOptions(input);
  const plan = buildLocalnetPlan(options);

  assertNoRunningLocalnet(plan.manifestPath, options.force);
  ensureDirectory(options.runtimeDir);
  ensureDirectory(options.logsDir);

  plan.nodes.forEach(function (node) {
    ensureDirectory(node.runtimeDir);
    ensureDirectory(node.logDir);
    writeJsonFile(node.overrideFile, node.overrides);
  });

  if (!options.skipDbCreate) {
    plan.nodes.forEach(function (node) {
      ensureDatabase(node, options);
    });
  }

  const manifest = buildManifest(plan, []);
  writeJsonFile(plan.manifestPath, manifest);

  plan.nodes.forEach(function (node) {
    const child = spawnNode(node, options);
    node.pid = child.pid;
    node.startedAt = new Date().toISOString();
    manifest.nodes.push(toManifestNode(node));
    // Persist after every spawn so stop:localnet can clean up a partially started network.
    writeJsonFile(plan.manifestPath, manifest);
  });

  manifest.status = 'running';
  writeJsonFile(plan.manifestPath, manifest);

  return manifest;
}

/**
 * Stops every managed localnet process through the node graceful shutdown path.
 * @param {object} input - Partial localnet options.
 */
async function stopLocalnet (input) {
  const options = normalizeOptions(input);
  const manifestPath = getManifestPath(options);

  if (!fs.existsSync(manifestPath)) {
    return {
      manifestPath,
      stopped: [],
      missing: [],
      timedOut: [],
      message: 'No localnet manifest found.'
    };
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const stopped = [];
  const missing = [];
  const timedOut = [];

  for (const node of manifest.nodes || []) {
    if (!node.pid || !isProcessRunning(node.pid)) {
      missing.push(node);
      continue;
    }

    process.kill(node.pid, 'SIGTERM');

    // Do not escalate to SIGKILL; callers must inspect timedOut and decide manually.
    const exited = await waitForExit(node.pid, options.stopTimeoutMs);

    if (exited) {
      stopped.push(node);
    } else {
      timedOut.push(node);
    }
  }

  manifest.status = timedOut.length ? 'stopping-timeout' : 'stopped';
  manifest.stoppedAt = new Date().toISOString();
  manifest.stopResult = {
    stopped: stopped.map(function (node) {
      return node.id;
    }),
    missing: missing.map(function (node) {
      return node.id;
    }),
    timedOut: timedOut.map(function (node) {
      return node.id;
    })
  };
  writeJsonFile(manifestPath, manifest);

  let dropResult = null;
  if (options.dropOnStop && !timedOut.length) {
    dropResult = dropLocalnetDatabases(options, manifest);
    manifest.dropResult = dropResult;
    writeJsonFile(manifestPath, manifest);
  }

  return {
    manifestPath,
    stopped,
    missing,
    timedOut,
    dropResult
  };
}

/**
 * Builds the generated config override JSON for one localnet node.
 * @param {object} node - Localnet node definition.
 * @param {object} options - Normalized localnet options.
 */
function buildNodeOverrides (node, options) {
  return {
    port: node.port,
    address: options.bindAddress,
    generalLog: {
      fileName: toRelativePath(options.cwd, node.generalLogFile)
    },
    debugLog: {
      fileName: toRelativePath(options.cwd, node.debugLogFile)
    },
    db: {
      database: node.db.database
    },
    redis: {
      url: node.redis.url
    },
    forging: {
      secret: node.delegateSecrets
    },
    peers: {
      list: node.peers,
      options: {
        allowPrivatePeers: true
      }
    },
    wsClient: {
      portWS: node.wsClientPort
    }
  };
}

/**
 * Builds the app.js argv list for one localnet node.
 * @param {object} node - Localnet node definition.
 * @param {object} options - Normalized localnet options.
 */
function buildNodeArgs (node, options) {
  const args = [
    'app.js',
    '--config',
    options.config,
    '--genesis',
    options.genesis
  ];

  options.configOverrides.forEach(function (overrideFile) {
    args.push('--config-overrides', overrideFile);
  });

  // Generated per-node overrides are last so ports/logs/databases stay isolated.
  args.push('--config-overrides', toRelativePath(options.cwd, node.overrideFile));

  return args;
}

/**
 * Builds a localnet manifest document.
 * @param {object} plan - Localnet plan.
 * @param {Array<object>} nodes - Manifest node entries.
 */
function buildManifest (plan, nodes) {
  return {
    version: 1,
    status: 'starting',
    startedAt: new Date().toISOString(),
    cwd: plan.options.cwd,
    baseConfig: plan.options.config,
    genesisBlock: plan.options.genesis,
    genesisPasses: plan.options.genesisPasses,
    configOverrides: plan.options.configOverrides,
    generatedRuntimeDir: toRelativePath(plan.options.cwd, plan.options.runtimeDir),
    logsDir: toRelativePath(plan.options.cwd, plan.options.logsDir),
    nodes
  };
}

/**
 * Converts an internal node definition into public manifest metadata.
 * @param {object} node - Localnet node definition.
 */
function toManifestNode (node) {
  return {
    id: node.id,
    index: node.index,
    pid: node.pid,
    startedAt: node.startedAt,
    host: node.host,
    port: node.port,
    wsClientPort: node.wsClientPort,
    apiUrl: node.apiUrl,
    wsClientUrl: node.wsClientUrl,
    peers: node.peers,
    db: node.db,
    redis: node.redis,
    runtimeDir: node.runtimeDir,
    logDir: node.logDir,
    overrideFile: node.overrideFile,
    stdoutFile: node.stdoutFile,
    stderrFile: node.stderrFile,
    generalLogFile: node.generalLogFile,
    debugLogFile: node.debugLogFile,
    delegateSecretsCount: node.delegateSecretsCount,
    command: node.command
  };
}

/**
 * Loads genesis delegate passphrases used to enable localnet forging.
 * @param {object} options - Normalized localnet options.
 */
function loadGenesisDelegateSecrets (options) {
  const genesisPassesPath = path.resolve(options.cwd, options.genesisPasses);
  const genesisPasses = JSON.parse(fs.readFileSync(genesisPassesPath, 'utf8'));

  if (!genesisPasses.delegates || !Array.isArray(genesisPasses.delegates)) {
    throw Error('Invalid genesis passes file "' + options.genesisPasses + '": expected delegates array');
  }

  return genesisPasses.delegates.map(function (delegate) {
    return delegate.secret;
  }).filter(Boolean);
}

/**
 * Splits delegate passphrases across localnet nodes.
 * @param {Array<string>} delegateSecrets - Forging passphrases from genesis delegates.
 * @param {number} nodeCount - Number of localnet nodes.
 */
function distributeDelegateSecrets (delegateSecrets, nodeCount) {
  const batches = Array.from({ length: nodeCount }, function () {
    return [];
  });
  const forgingNodeCount = nodeCount > 3 ? nodeCount - 1 : nodeCount;

  delegateSecrets.forEach(function (secret, index) {
    batches[index % forgingNodeCount].push(secret);
  });

  return batches;
}

/**
 * Spawns one ADAMANT node as a detached background process.
 * @param {object} node - Localnet node definition.
 * @param {object} options - Normalized localnet options.
 */
function spawnNode (node, options) {
  const stdout = fs.openSync(node.stdoutFile, 'a');
  const stderr = fs.openSync(node.stderrFile, 'a');
  let child;

  try {
    child = childProcess.spawn(process.execPath, node.args, {
      cwd: options.cwd,
      detached: true,
      stdio: ['ignore', stdout, stderr]
    });
  } finally {
    // The detached child owns the duplicated descriptors; the parent must not leak them.
    fs.closeSync(stdout);
    fs.closeSync(stderr);
  }

  child.unref();

  return child;
}

/**
 * Ensures the PostgreSQL database for one localnet node exists.
 * @param {object} node - Localnet node definition.
 * @param {object} options - Normalized localnet options.
 */
function ensureDatabase (node, options) {
  const result = runPostgresCommand('createdb', [
    '-O',
    options.dbUser,
    node.db.database
  ], options);

  if (result.status === 0) {
    return;
  }

  const output = [result.stdout, result.stderr, result.error && result.error.message]
      .filter(Boolean)
      .join('\n');

  if (/already exists/i.test(output)) {
    return;
  }

  throw Error(
      'Failed to create PostgreSQL database "' +
      node.db.database +
      '". Create it manually, rerun with --skip-db-create, or pass --db-admin-user. ' +
      output
  );
}

/**
 * Stops a localnet if needed and drops all matching localnet databases.
 * @param {object} input - Partial localnet options.
 */
async function dropLocalnet (input) {
  const options = normalizeOptions(input);
  const stopResult = await stopLocalnet(options);

  if (stopResult.timedOut.length) {
    return {
      stopResult,
      dropResult: {
        dropped: [],
        skipped: [],
        failed: [],
        message: 'Database drop skipped because some nodes did not stop gracefully.'
      }
    };
  }

  const manifest = fs.existsSync(stopResult.manifestPath) ?
    JSON.parse(fs.readFileSync(stopResult.manifestPath, 'utf8')) :
    null;
  const dropResult = dropLocalnetDatabases(options, manifest);

  return {
    stopResult,
    dropResult
  };
}

/**
 * Drops localnet databases found by prefix and manifest metadata.
 * @param {object} options - Normalized localnet options.
 * @param {?object} manifest - Localnet manifest, when available.
 */
function dropLocalnetDatabases (options, manifest) {
  const databaseNames = getLocalnetDatabaseNames(options, manifest);
  const result = {
    dropped: [],
    skipped: [],
    failed: []
  };

  databaseNames.forEach(function (databaseName) {
    const dropResult = runPostgresCommand('dropdb', [
      '--if-exists',
      databaseName
    ], options);
    const output = formatCommandOutput(dropResult);

    if (dropResult.status === 0) {
      result.dropped.push(databaseName);
    } else if (/does not exist/i.test(output)) {
      result.skipped.push(databaseName);
    } else {
      result.failed.push({
        database: databaseName,
        error: output
      });
    }
  });

  return result;
}

/**
 * Finds database names to drop from PostgreSQL metadata and manifest fallback.
 * @param {object} options - Normalized localnet options.
 * @param {?object} manifest - Localnet manifest, when available.
 */
function getLocalnetDatabaseNames (options, manifest) {
  const names = new Set();
  const listedNames = listLocalnetDatabases(options);

  listedNames.forEach(function (databaseName) {
    names.add(databaseName);
  });

  (manifest && manifest.nodes || []).forEach(function (node) {
    if (node.db && node.db.database) {
      names.add(node.db.database);
    }
  });

  if (!names.size) {
    for (let index = 1; index <= options.nodes; index++) {
      names.add(options.dbNamePrefix + index);
    }
  }

  return Array.from(names).sort();
}

/**
 * Lists localnet databases by configured prefix.
 * @param {object} options - Normalized localnet options.
 */
function listLocalnetDatabases (options) {
  const escapedPrefix = options.dbNamePrefix.replace(/'/g, '\'\'').replace(/_/g, '\\_');
  const result = runPostgresCommand('psql', [
    '-d',
    'postgres',
    '-At',
    '-c',
    'SELECT datname FROM pg_database WHERE datname LIKE \'' + escapedPrefix + '%\' ESCAPE \'\\\\\' ORDER BY datname'
  ], options);

  if (result.status !== 0) {
    return [];
  }

  return (result.stdout || '')
      .split(/\r?\n/)
      .map(function (databaseName) {
        return databaseName.trim();
      })
      .filter(Boolean);
}

/**
 * Runs a PostgreSQL CLI command with localnet admin connection flags.
 * @param {string} command - PostgreSQL CLI command name.
 * @param {Array<string>} args - Command-specific arguments.
 * @param {object} options - Normalized localnet options.
 */
function runPostgresCommand (command, args, options) {
  const env = Object.assign({}, process.env);
  const commandArgs = [
    '-h',
    options.dbHost,
    '-p',
    String(options.dbPort)
  ];

  if (options.dbAdminUser) {
    commandArgs.push('-U', options.dbAdminUser);
  }

  if (options.dbAdminPassword !== undefined && options.dbAdminPassword !== null) {
    env.PGPASSWORD = options.dbAdminPassword;
  }

  return childProcess.spawnSync(command, commandArgs.concat(args), {
    cwd: options.cwd,
    env,
    encoding: 'utf8'
  });
}

/**
 * Formats child process output for user-facing errors.
 * @param {object} result - spawnSync result object.
 */
function formatCommandOutput (result) {
  return [result.stdout, result.stderr, result.error && result.error.message]
      .filter(Boolean)
      .join('\n');
}

/**
 * Refuses unsafe localnet starts when the previous manifest is active or unclear.
 * @param {string} manifestPath - Localnet manifest path.
 * @param {boolean} force - Whether to replace a stale non-running manifest.
 */
function assertNoRunningLocalnet (manifestPath, force) {
  if (!fs.existsSync(manifestPath)) {
    return;
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const running = (manifest.nodes || []).filter(function (node) {
    return node.pid && isProcessRunning(node.pid);
  });

  if (running.length) {
    throw Error(
        'Localnet manifest already contains running nodes: ' +
        running.map(function (node) {
          return node.id + ' pid ' + node.pid;
        }).join(', ') +
        '. Run npm run stop:localnet first.'
    );
  }

  if (manifest.status === 'stopped') {
    return;
  }

  if (!force) {
    throw Error(
        'Localnet manifest already exists at ' +
        manifestPath +
        '. Pass --force to replace the stale manifest.'
    );
  }
}

/**
 * Checks whether a process exists without sending a real signal.
 * @param {number} pid - Process ID.
 */
function isProcessRunning (pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

/**
 * Waits until a process exits or a timeout expires.
 * @param {number} pid - Process ID.
 * @param {number} timeoutMs - Maximum wait time in milliseconds.
 */
function waitForExit (pid, timeoutMs) {
  const started = Date.now();

  return new Promise(function (resolve) {
    function check () {
      if (!isProcessRunning(pid)) {
        return resolve(true);
      }

      if (Date.now() - started >= timeoutMs) {
        return resolve(false);
      }

      setTimeout(check, 250);
    }

    check();
  });
}

/**
 * Returns the manifest path for a localnet runtime directory.
 * @param {object} options - Normalized localnet options.
 */
function getManifestPath (options) {
  return path.join(options.runtimeDir, 'manifest.json');
}

/**
 * Writes JSON with stable formatting.
 * @param {string} filePath - Target file path.
 * @param {object} data - JSON-serializable data.
 */
function writeJsonFile (filePath, data) {
  ensureDirectory(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
}

/**
 * Creates a directory and its parents when missing.
 * @param {string} dirPath - Directory path.
 */
function ensureDirectory (dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

/**
 * Returns a Redis URL with a deterministic database index.
 * @param {string} redisUrl - Base Redis URL.
 * @param {number} databaseIndex - Redis logical database index.
 */
function withRedisDatabase (redisUrl, databaseIndex) {
  try {
    const url = new URL(redisUrl);
    url.pathname = '/' + databaseIndex;
    return url.toString();
  } catch (error) {
    return redisUrl.replace(/\/\d+\/?$/, '') + '/' + databaseIndex;
  }
}

/**
 * Converts a path to cwd-relative form when it is safely inside cwd.
 * @param {string} cwd - Current working directory.
 * @param {string} targetPath - Target path.
 */
function toRelativePath (cwd, targetPath) {
  const relativePath = path.relative(cwd, targetPath);

  if (!relativePath || relativePath.indexOf('..') === 0 || path.isAbsolute(relativePath)) {
    return targetPath;
  }

  return relativePath;
}

/**
 * Normalizes path separators for CLI arguments that should remain relative.
 * @param {string} value - Path value.
 */
function normalizeRelativePath (value) {
  return String(value).replace(/\\/g, '/');
}

/**
 * Normalizes optional path input into an ordered path list.
 * @param {string|Array<string>} value - Path or paths.
 */
function normalizePathList (value) {
  if (Array.isArray(value)) {
    return value.map(normalizeRelativePath);
  }

  if (!value) {
    return [];
  }

  return [normalizeRelativePath(value)];
}

/**
 * Parses a positive integer option.
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
 * Parses a non-negative integer option.
 * @param {*} value - Raw option value.
 * @param {string} name - Option name for error messages.
 * @param {number} fallback - Fallback value when the raw value is empty.
 */
function parseNonNegativeInteger (value, name, fallback) {
  const parsed = value === undefined || value === null ? fallback : Number(value);

  if (!Number.isInteger(parsed) || parsed < 0) {
    throw Error('Invalid ' + name + ': expected a non-negative integer');
  }

  return parsed;
}

/**
 * Parses and validates a TCP port option.
 * @param {*} value - Raw option value.
 * @param {string} name - Option name for error messages.
 * @param {number} fallback - Fallback value when the raw value is empty.
 */
function parsePort (value, name, fallback) {
  const parsed = parsePositiveInteger(value, name, fallback);

  if (parsed > 65535) {
    throw Error('Invalid ' + name + ': expected a TCP port between 1 and 65535');
  }

  return parsed;
}

module.exports = {
  DEFAULTS,
  normalizeOptions,
  buildLocalnetPlan,
  buildNodeOverrides,
  buildNodeArgs,
  buildManifest,
  toManifestNode,
  loadGenesisDelegateSecrets,
  distributeDelegateSecrets,
  withRedisDatabase,
  startLocalnet,
  stopLocalnet,
  dropLocalnet,
  dropLocalnetDatabases,
  getLocalnetDatabaseNames,
  listLocalnetDatabases,
  isProcessRunning,
  waitForExit,
  getManifestPath
};
