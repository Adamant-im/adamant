#!/usr/bin/env node
'use strict';

const { Command } = require('commander');
const localnet = require('./localnet.js');

const program = new Command();

program
    .description('Start an ADAMANT localnet in background/headless mode')
    .option('--nodes <count>', 'number of localnet nodes', String(localnet.DEFAULTS.nodes))
    .option('--config <path>', 'base config file', localnet.DEFAULTS.config)
    .option('--genesis <path>', 'genesis block file', localnet.DEFAULTS.genesis)
    .option('--genesis-passes <path>', 'genesis delegate passphrase file', localnet.DEFAULTS.genesisPasses)
    .option('--config-overrides <path>', 'base config override file', collectOption, [])
    .option('--runtime-dir <path>', 'generated runtime directory', localnet.DEFAULTS.runtimeDir)
    .option('--logs-dir <path>', 'localnet log directory', localnet.DEFAULTS.logsDir)
    .option('--bind-address <ip>', 'local bind address', localnet.DEFAULTS.bindAddress)
    .option('--base-port <port>', 'first node HTTP/peer port', String(localnet.DEFAULTS.basePort))
    .option('--base-ws-port <port>', 'first node WebSocket client port', String(localnet.DEFAULTS.baseWsPort))
    .option('--db-host <host>', 'PostgreSQL host', localnet.DEFAULTS.dbHost)
    .option('--db-port <port>', 'PostgreSQL port', String(localnet.DEFAULTS.dbPort))
    .option('--db-user <user>', 'PostgreSQL user', localnet.DEFAULTS.dbUser)
    .option('--db-password <password>', 'PostgreSQL password', localnet.DEFAULTS.dbPassword)
    .option('--db-admin-user <user>', 'PostgreSQL user for creating localnet databases')
    .option('--db-admin-password <password>', 'PostgreSQL password for --db-admin-user')
    .option('--db-name-prefix <prefix>', 'PostgreSQL database name prefix', localnet.DEFAULTS.dbNamePrefix)
    .option('--redis-url <url>', 'base Redis URL', localnet.DEFAULTS.redisUrl)
    .option('--redis-db-base <index>', 'first Redis database index', String(localnet.DEFAULTS.redisDbBase))
    .option('--skip-db-create', 'do not create per-node PostgreSQL databases')
    .option('--force', 'replace a stale localnet manifest without running PIDs')
    .addHelpText('after', '\nWhen no --config-overrides is passed, test/config.localnet.json is used.')
    .parse(process.argv);

/**
 * Collects repeatable Commander options in declaration order.
 * @param {string} value - Current option value.
 * @param {Array<string>} previous - Values collected so far.
 */
function collectOption (value, previous) {
  previous.push(value);
  return previous;
}

/**
 * Starts localnet from parsed CLI options and prints connection metadata.
 */
function main () {
  const options = program.opts();

  if (!options.configOverrides.length) {
    // Commander cannot display this dynamic default for repeatable options.
    options.configOverrides = localnet.DEFAULTS.configOverrides;
  }

  const manifest = localnet.startLocalnet(options);

  console.log('Started ADAMANT localnet with ' + manifest.nodes.length + ' node(s).');
  console.log('Manifest: ' + manifest.generatedRuntimeDir + '/manifest.json');
  console.log('Logs: ' + manifest.logsDir + '/node-N/');
  manifest.nodes.forEach(function (node) {
    console.log('- ' + node.id + ': pid ' + node.pid + ', API ' + node.apiUrl + ', WS ' + node.wsClientUrl);
  });
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
