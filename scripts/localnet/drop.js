#!/usr/bin/env node
'use strict';

const { Command } = require('commander');
const localnet = require('./localnet.js');

const program = new Command();

program
    .description('Gracefully stop localnet and drop localnet PostgreSQL databases')
    .option('--nodes <count>', 'fallback number of localnet databases', String(localnet.DEFAULTS.nodes))
    .option('--runtime-dir <path>', 'generated runtime directory', localnet.DEFAULTS.runtimeDir)
    .option('--logs-dir <path>', 'localnet log directory', localnet.DEFAULTS.logsDir)
    .option('--timeout-ms <ms>', 'graceful shutdown timeout per node', String(localnet.DEFAULTS.stopTimeoutMs))
    .option('--db-host <host>', 'PostgreSQL host', localnet.DEFAULTS.dbHost)
    .option('--db-port <port>', 'PostgreSQL port', String(localnet.DEFAULTS.dbPort))
    .option('--db-user <user>', 'node PostgreSQL owner/user', localnet.DEFAULTS.dbUser)
    .option('--db-admin-user <user>', 'PostgreSQL user for dropping localnet databases')
    .option('--db-admin-password <password>', 'PostgreSQL password for --db-admin-user')
    .option('--db-name-prefix <prefix>', 'PostgreSQL database name prefix', localnet.DEFAULTS.dbNamePrefix)
    .option('--redis-url <url>', 'base Redis URL', localnet.DEFAULTS.redisUrl)
    .option('--redis-db-base <index>', 'first Redis database index', String(localnet.DEFAULTS.redisDbBase))
    .parse(process.argv);

/**
 * Drops localnet databases after graceful node shutdown.
 */
async function main () {
  const options = program.opts();

  options.stopTimeoutMs = options.timeoutMs;

  const result = await localnet.dropLocalnet(options);

  reportStopResult(result.stopResult);
  reportDropResult(result.dropResult);
  reportRedisResult(result.redisResult);

  if (result.stopResult.timedOut.length ||
      result.dropResult.failed.length ||
      result.redisResult.failed.length) {
    process.exit(1);
  }
}

/**
 * Prints stop status before dropping databases.
 * @param {object} result - Localnet stop result.
 */
function reportStopResult (result) {
  if (result.message) {
    console.log(result.message);
    return;
  }

  result.stopped.forEach(function (node) {
    console.log('Stopped ' + node.id + ' pid ' + node.pid + '.');
  });

  result.missing.forEach(function (node) {
    console.log('Already stopped or missing: ' + node.id + ' pid ' + node.pid + '.');
  });

  result.timedOut.forEach(function (node) {
    console.error('Timed out waiting for graceful shutdown: ' + node.id + ' pid ' + node.pid + '.');
  });
}

/**
 * Prints database drop status.
 * @param {object} result - Localnet database drop result.
 */
function reportDropResult (result) {
  if (result.message) {
    console.error(result.message);
  }

  result.dropped.forEach(function (databaseName) {
    console.log('Dropped database ' + databaseName + '.');
  });

  result.skipped.forEach(function (databaseName) {
    console.log('Database already absent: ' + databaseName + '.');
  });

  result.failed.forEach(function (failure) {
    console.error('Failed to drop database ' + failure.database + ': ' + failure.error);
  });
}

/**
 * Prints Redis cleanup status for the isolated localnet databases.
 * @param {object} result - Localnet Redis cleanup result.
 */
function reportRedisResult (result) {
  if (result.message) {
    console.error(result.message);
  }

  result.flushed.forEach(function (redisUrl) {
    console.log('Flushed Redis database ' + redisUrl + '.');
  });

  result.failed.forEach(function (failure) {
    console.error('Failed to flush Redis database ' + failure.redisUrl + ': ' + failure.error);
  });
}

main().catch(function (error) {
  console.error(error.message);
  process.exit(1);
});
