'use strict';

const fs = require('fs');
const path = require('path');
const { Command } = require('commander');

const configOverrides = require('../../helpers/configOverrides.js');
const packageJson = require('../../package.json');
const { HttpClient } = require('./httpClient.js');
const { MetricsCollector } = require('./metrics.js');
const { redactSensitive, writeReports } = require('./report.js');
const { resolveTarget } = require('./target.js');
const { selectScenarios } = require('./scenarios.js');

const BASE_CONFIG_PATH = 'test/config.default.json';

const DEFAULTS = {
  timeoutMs: 5000,
  readyTimeoutMs: 120000,
  blockWaitTimeoutMs: 120000,
  pollIntervalMs: 2000,
  minHeight: 1,
  maxHeightDrift: 2,
  waitBlocks: 1,
  reportDir: 'reports/live-test',
  profile: 'baseline',
  fundingAmount: 3200 * 100000000,
  transferAmount: 1 * 100000000,
  repeatedInvalidCount: 3,
  genesisPasses: 'test/genesisPasses.json',
  testnetConfig: 'test/config.default.json'
};

/**
 * Adds shared live-test CLI options.
 * @param {Command} program - Commander instance.
 */
function configureProgram (program) {
  return program
      .option('--all', 'run all non-stress scenarios for the target mode')
      .option('--suite <name>', 'scenario suite to run; repeatable', collectOption, [])
      .option('--scenario <id>', 'specific scenario id to run; repeatable', collectOption, [])
      .option('--node <host:port|url>', 'explicit target node; repeatable in localnet mode', collectOption, [])
      .option('--manifest <path>', 'localnet manifest path')
      .option('--profile <name>', 'load profile: baseline, sustained, high, overload', DEFAULTS.profile)
      .option('--unsafe-stress', 'enable opt-in stress/overload scenarios')
      .option('--timeout-ms <ms>', 'HTTP/WebSocket timeout', String(DEFAULTS.timeoutMs))
      .option('--ready-timeout-ms <ms>', 'node readiness timeout', String(DEFAULTS.readyTimeoutMs))
      .option('--block-wait-timeout-ms <ms>', 'block wait timeout', String(DEFAULTS.blockWaitTimeoutMs))
      .option('--poll-interval-ms <ms>', 'readiness/block polling interval', String(DEFAULTS.pollIntervalMs))
      .option('--min-height <height>', 'minimum ready height', String(DEFAULTS.minHeight))
      .option('--max-height-drift <count>', 'allowed localnet height drift', String(DEFAULTS.maxHeightDrift))
      .option('--wait-blocks <count>', 'blocks to wait after funding before dependent transactions', String(DEFAULTS.waitBlocks))
      .option('--funding-amount <amount>', 'funding amount in internal ADM units', String(DEFAULTS.fundingAmount))
      .option('--transfer-amount <amount>', 'send amount in internal ADM units', String(DEFAULTS.transferAmount))
      .option('--repeated-invalid-count <count>', 'bounded repeated invalid transaction submissions', String(DEFAULTS.repeatedInvalidCount))
      .option('--genesis-passes <path>', 'test genesis passphrase fixture path', DEFAULTS.genesisPasses)
      .option('--testnet-config <path>', 'testnet config path for fallback peer resolution', DEFAULTS.testnetConfig)
      .option('--config-overrides <path>', 'config override file to include in report metadata; repeatable', collectOption, [])
      .option('--config-set <key=value>', 'config override value to include in report metadata; repeatable', collectOption, [])
      .option('--report-dir <path>', 'report output directory', DEFAULTS.reportDir);
}

/**
 * Runs live scenarios and writes reports.
 * @param {object} input - Normalized or raw CLI options.
 */
async function runLiveTests (input) {
  const options = normalizeOptions(input);
  const target = await resolveTarget(options);
  const scenarios = selectScenarios(options, target.mode);

  assertStressAllowed(scenarios, options);

  const metrics = new MetricsCollector();
  const context = buildContext(options, target, metrics);
  const run = {
    id: buildRunId(target.mode),
    mode: target.mode,
    startedAt: new Date().toISOString(),
    nodeVersion: packageJson.version
  };
  const scenarioResults = [];

  for (const scenario of scenarios) {
    const startedAt = Date.now();

    try {
      const data = await scenario.run(context);

      scenarioResults.push({
        id: scenario.id,
        suite: scenario.suite,
        status: data && data.__skipped ? 'skipped' : 'passed',
        durationMs: Date.now() - startedAt,
        result: data && data.__skipped ? { reason: data.reason } : data
      });
    } catch (error) {
      scenarioResults.push({
        id: scenario.id,
        suite: scenario.suite,
        status: 'failed',
        durationMs: Date.now() - startedAt,
        error: error.message
      });
    }
  }

  const finalNodeStates = await collectFinalNodeStates(context);

  run.finishedAt = new Date().toISOString();

  const report = {
    status: scenarioResults.some(function (scenario) {
      return scenario.status === 'failed';
    }) ? 'failed' : 'passed',
    run,
    target: redactTarget(target),
    selection: {
      all: options.all,
      suites: options.suites,
      scenarios: options.scenarios,
      profile: options.profile,
      unsafeStress: options.unsafeStress
    },
    configMetadata: context.configMetadata,
    finalNodeStates,
    fixtureAccounts: {
      genesis: publicFixture(context.fixtureAccounts.genesis),
      transfer: publicFixture(context.fixtureAccounts.transfer),
      delegates: (context.fixtureAccounts.delegates || []).map(publicFixture)
    },
    scenarios: scenarioResults,
    metrics: metrics.snapshot()
  };
  const paths = writeReports(report, options.reportDir);

  return {
    report,
    paths
  };
}

/**
 * Collects final chain status per target node.
 * @param {object} context - Runner context.
 */
async function collectFinalNodeStates (context) {
  const states = [];

  for (const node of context.target.nodes) {
    const client = context.clientFor(node);
    const status = await client.get('/api/node/status');
    const blocks = await client.get('/api/blocks?limit=1&orderBy=height:desc');
    const lastBlock = blocks.body && blocks.body.blocks && blocks.body.blocks[0];

    states.push({
      id: node.id,
      apiUrl: node.apiUrl,
      ok: status.ok && status.body && status.body.success,
      height: status.body && status.body.network && status.body.network.height,
      broadhash: status.body && status.body.network && status.body.network.broadhash,
      nethash: status.body && status.body.network && status.body.network.nethash,
      blockId: lastBlock && lastBlock.id,
      blockHeight: lastBlock && lastBlock.height,
      version: status.body && status.body.version
    });
  }

  return states;
}

/**
 * Builds runner context shared by scenarios.
 * @param {object} options - Runner options.
 * @param {object} target - Target metadata.
 * @param {MetricsCollector} metrics - Metrics collector.
 */
function buildContext (options, target, metrics) {
  const clients = {};
  const fixtureAccounts = loadGenesisPasses(options.genesisPasses);
  const configMetadata = collectConfigMetadata(options, target);

  return {
    options,
    target,
    primaryNode: target.nodes[0],
    fixtureAccounts,
    configMetadata,
    metrics,
    clientFor: function (node) {
      if (!clients[node.id]) {
        clients[node.id] = new HttpClient({
          baseUrl: node.apiUrl,
          timeoutMs: options.timeoutMs
        });
      }

      return clients[node.id];
    },
    assert: function (condition, message) {
      if (!condition) {
        throw Error(message);
      }
    },
    skip: function (reason) {
      return {
        __skipped: true,
        reason
      };
    }
  };
}

/**
 * Normalizes CLI options to runner values.
 * @param {object} input - Raw input.
 */
function normalizeOptions (input) {
  input = input || {};

  const nodeValues = Array.isArray(input.node) ? input.node : normalizeList(input.node);

  return {
    mode: input.mode,
    all: !!input.all,
    suites: normalizeList(input.suite || input.suites),
    scenarios: normalizeList(input.scenario || input.scenarios),
    node: input.mode === 'testnet' ? nodeValues[0] : null,
    nodes: input.mode === 'localnet' ? nodeValues : [],
    manifest: input.manifest,
    profile: input.profile || DEFAULTS.profile,
    unsafeStress: !!input.unsafeStress,
    timeoutMs: parseNonNegativeInteger(input.timeoutMs, 'timeoutMs', DEFAULTS.timeoutMs),
    readyTimeoutMs: parseNonNegativeInteger(input.readyTimeoutMs, 'readyTimeoutMs', DEFAULTS.readyTimeoutMs),
    blockWaitTimeoutMs: parseNonNegativeInteger(input.blockWaitTimeoutMs, 'blockWaitTimeoutMs', DEFAULTS.blockWaitTimeoutMs),
    pollIntervalMs: parseNonNegativeInteger(input.pollIntervalMs, 'pollIntervalMs', DEFAULTS.pollIntervalMs),
    minHeight: parseNonNegativeInteger(input.minHeight, 'minHeight', DEFAULTS.minHeight),
    maxHeightDrift: parseNonNegativeInteger(input.maxHeightDrift, 'maxHeightDrift', DEFAULTS.maxHeightDrift),
    waitBlocks: parseNonNegativeInteger(input.waitBlocks, 'waitBlocks', DEFAULTS.waitBlocks),
    fundingAmount: parseNonNegativeInteger(input.fundingAmount, 'fundingAmount', DEFAULTS.fundingAmount),
    transferAmount: parseNonNegativeInteger(input.transferAmount, 'transferAmount', DEFAULTS.transferAmount),
    repeatedInvalidCount: parseNonNegativeInteger(input.repeatedInvalidCount, 'repeatedInvalidCount', DEFAULTS.repeatedInvalidCount),
    genesisPasses: input.genesisPasses || DEFAULTS.genesisPasses,
    testnetConfig: input.testnetConfig || DEFAULTS.testnetConfig,
    configOverrides: normalizeList(input.configOverrides),
    configSet: normalizeList(input.configSet),
    reportDir: input.reportDir || DEFAULTS.reportDir
  };
}

/**
 * Loads test genesis fixture passphrases. Secrets stay in memory only.
 * @param {string} genesisPassesPath - Fixture path.
 */
function loadGenesisPasses (genesisPassesPath) {
  const resolvedPath = path.resolve(process.cwd(), genesisPassesPath);

  if (!fs.existsSync(resolvedPath)) {
    return {};
  }

  const fixtures = JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));

  // `transfer` is an array in current fixtures; scenarios need one primary funded source.
  return {
    genesis: fixtures.genesis,
    transfer: Array.isArray(fixtures.transfer) ? fixtures.transfer[0] : fixtures.transfer,
    transfers: Array.isArray(fixtures.transfer) ? fixtures.transfer : (fixtures.transfer ? [fixtures.transfer] : []),
    delegates: Array.isArray(fixtures.delegates) ? fixtures.delegates : []
  };
}

/**
 * Collects redacted config override metadata for reports.
 * @param {object} options - Runner options.
 * @param {object} target - Target metadata.
 */
function collectConfigMetadata (options, target) {
  const entries = [];
  const paths = [];
  const baseConfigPath = path.resolve(process.cwd(), BASE_CONFIG_PATH);

  // Live reports always start from the canonical testnet/localnet base config.
  if (baseConfigPath && fs.existsSync(baseConfigPath)) {
    const baseConfig = JSON.parse(fs.readFileSync(baseConfigPath, 'utf8'));

    // Include base activation metadata even when no override files were supplied.
    if (baseConfig.consensusActivationHeights) {
      entries.push({
        source: baseConfigPath,
        path: 'consensusActivationHeights',
        value: baseConfig.consensusActivationHeights
      });
    }
  }

  if (target.manifest && Array.isArray(target.manifest.configOverrides)) {
    target.manifest.configOverrides.forEach(function (overridePath) {
      paths.push(overridePath);
    });
  }

  (target.nodes || []).forEach(function (node) {
    if (node.overrideFile) {
      paths.push(node.overrideFile);
    }
  });

  options.configOverrides.forEach(function (overridePath) {
    paths.push(overridePath);
  });

  paths.forEach(function (overridePath) {
    const resolvedPath = path.resolve(process.cwd(), overridePath);

    if (!fs.existsSync(resolvedPath)) {
      entries.push({
        source: overridePath,
        missing: true
      });
      return;
    }

    configOverrides.parseOverrideFile(resolvedPath).forEach(function (entry) {
      entries.push({
        source: entry.source,
        path: entry.path.join('.'),
        value: configOverrides.redactConfigValue(entry.path, entry.value)
      });
    });
  });

  options.configSet.forEach(function (override) {
    const entry = configOverrides.parseOverride(override, '--config-set');

    entries.push({
      source: entry.source,
      path: entry.path.join('.'),
      value: configOverrides.redactConfigValue(entry.path, entry.value)
    });
  });

  return {
    consensusActivationHeights: deriveActivationHeights(entries),
    overrides: entries
  };
}

/**
 * Derives final activation-height values from ordered config metadata entries.
 * @param {Array<object>} entries - Config metadata entries.
 */
function deriveActivationHeights (entries) {
  const activationHeights = {};

  entries.forEach(function (entry) {
    if (entry.path === 'consensusActivationHeights' && entry.value) {
      Object.assign(activationHeights, entry.value);
    } else if (/^consensusActivationHeights\./.test(entry.path)) {
      activationHeights[entry.path.replace('consensusActivationHeights.', '')] = entry.value;
    }
  });

  return activationHeights;
}

/**
 * Rejects stress scenarios unless the caller opted in explicitly.
 * @param {Array<object>} scenarios - Selected scenario definitions.
 * @param {object} options - Runner options.
 */
function assertStressAllowed (scenarios, options) {
  const stress = scenarios.filter(function (scenario) {
    return scenario.stress;
  });

  if (stress.length && !options.unsafeStress) {
    throw Error('Stress scenario selected without --unsafe-stress: ' + stress.map(function (scenario) {
      return scenario.id;
    }).join(', '));
  }
}

/**
 * Builds report-safe target metadata.
 * @param {object} target - Full target metadata.
 */
function redactTarget (target) {
  return redactSensitive({
    mode: target.mode,
    source: target.source,
    manifestPath: target.manifestPath,
    configPath: target.configPath,
    nodes: target.nodes
  });
}

/**
 * Builds report-safe fixture account metadata.
 * @param {?object} fixture - Fixture account with possible secret fields.
 */
function publicFixture (fixture) {
  if (!fixture) {
    return null;
  }

  const result = {
    address: fixture.address,
    publicKey: fixture.publicKey,
    code: fixture.code
  };

  if (fixture.amount !== undefined) {
    result.amount = fixture.amount;
  }

  return result;
}

/**
 * Collects repeatable Commander option values.
 * @param {string} value - Current CLI option value.
 * @param {Array<string>} previous - Values collected so far.
 */
function collectOption (value, previous) {
  previous.push(value);
  return previous;
}

/**
 * Normalizes an optional scalar or array to a filtered array.
 * @param {string|Array<string>} value - Input value.
 */
function normalizeList (value) {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value.filter(Boolean);
  }

  return [value];
}

/**
 * Parses a non-negative integer option.
 * @param {string|number} value - Option value.
 * @param {string} name - Option name for errors.
 * @param {number} defaultValue - Default value.
 */
function parseNonNegativeInteger (value, name, defaultValue) {
  const raw = value === undefined || value === null || value === '' ? defaultValue : value;
  const parsed = parseInt(raw, 10);

  if (!Number.isInteger(parsed) || parsed < 0) {
    throw Error('Invalid ' + name + ': ' + value);
  }

  return parsed;
}

/**
 * Builds a filesystem-safe run identifier.
 * @param {string} mode - Target mode.
 */
function buildRunId (mode) {
  return mode + '-' + new Date().toISOString().replace(/[:.]/g, '-');
}

/**
 * Runs the command-line interface for one target mode.
 * @param {string} mode - Target mode.
 * @param {string} description - CLI description.
 */
async function runCli (mode, description) {
  const program = configureProgram(new Command());

  program.description(description).parse(process.argv);

  const options = program.opts();
  options.mode = mode;

  const result = await runLiveTests(options);

  console.log('Live scenarios ' + result.report.status + '.');
  console.log('JSON report: ' + result.paths.jsonPath);
  console.log('Markdown report: ' + result.paths.markdownPath);

  if (result.report.status !== 'passed') {
    process.exitCode = 1;
  }
}

module.exports = {
  BASE_CONFIG_PATH,
  DEFAULTS,
  buildContext,
  collectConfigMetadata,
  configureProgram,
  collectFinalNodeStates,
  normalizeOptions,
  runCli,
  runLiveTests
};
