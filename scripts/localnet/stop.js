#!/usr/bin/env node
'use strict';

const { Command } = require('commander');
const localnet = require('./localnet.js');

const program = new Command();

program
    .description('Gracefully stop an ADAMANT localnet started by start:localnet')
    .option('--runtime-dir <path>', 'generated runtime directory', localnet.DEFAULTS.runtimeDir)
    .option('--logs-dir <path>', 'localnet log directory', localnet.DEFAULTS.logsDir)
    .option('--timeout-ms <ms>', 'graceful shutdown timeout per node', String(localnet.DEFAULTS.stopTimeoutMs))
    .option('--drop-on-stop', 'drop localnet PostgreSQL databases after graceful stop')
    .option('--dropOnStop', 'alias for --drop-on-stop')
    .option('--nodes <count>', 'fallback number of localnet databases', String(localnet.DEFAULTS.nodes))
    .option('--db-host <host>', 'PostgreSQL host', localnet.DEFAULTS.dbHost)
    .option('--db-port <port>', 'PostgreSQL port', String(localnet.DEFAULTS.dbPort))
    .option('--db-user <user>', 'node PostgreSQL owner/user', localnet.DEFAULTS.dbUser)
    .option('--db-admin-user <user>', 'PostgreSQL user for dropping localnet databases')
    .option('--db-admin-password <password>', 'PostgreSQL password for --db-admin-user')
    .option('--db-name-prefix <prefix>', 'PostgreSQL database name prefix', localnet.DEFAULTS.dbNamePrefix)
    .parse(process.argv);

/**
 * Stops localnet from parsed CLI options and reports graceful shutdown status.
 */
async function main () {
  const options = program.opts();

  options.stopTimeoutMs = options.timeoutMs;

  const result = await localnet.stopLocalnet(options);

  if (result.message) {
    console.log(result.message);
    console.log('Manifest: ' + result.manifestPath);
    return;
  }

  result.stopped.forEach(function (node) {
    console.log('Stopped ' + node.id + ' pid ' + node.pid + '.');
  });

  result.missing.forEach(function (node) {
    console.log('Already stopped or missing: ' + node.id + ' pid ' + node.pid + '.');
  });

  if (result.timedOut.length) {
    result.timedOut.forEach(function (node) {
      console.error('Timed out waiting for graceful shutdown: ' + node.id + ' pid ' + node.pid + '.');
    });
    process.exit(1);
  }

  if (result.dropResult) {
    result.dropResult.dropped.forEach(function (databaseName) {
      console.log('Dropped database ' + databaseName + '.');
    });

    result.dropResult.skipped.forEach(function (databaseName) {
      console.log('Database already absent: ' + databaseName + '.');
    });

    result.dropResult.failed.forEach(function (failure) {
      console.error('Failed to drop database ' + failure.database + ': ' + failure.error);
    });

    if (result.dropResult.failed.length) {
      process.exit(1);
    }
  }

  console.log('Localnet stopped gracefully.');
}

main().catch(function (error) {
  console.error(error.message);
  process.exit(1);
});
