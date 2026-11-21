#!/usr/bin/env node
'use strict';

var path = require('path');
var util = require('util');

var forgingControl = require('../helpers/forgingControl.js');
var forgingSecret = require('../helpers/forgingSecret.js');
var promptSecret = require('../helpers/promptSecret.js');

/**
 * Parses `adm-node forging <action>` arguments.
 * Passphrases and passwords are never accepted on the command line.
 * @param {Array<string>} argv - process.argv.
 * @return {object} Parsed arguments.
 */
function parseArgs (argv) {
  var parsed = {
    config: null,
    socket: null,
    command: null,
    action: null,
    error: null
  };
  var args = argv.slice(2);

  for (var i = 0; i < args.length; i++) {
    var arg = args[i];

    if (arg === '--config' || arg === '-c' || arg === '--socket') {
      var value = args[i + 1];

      if (!value || value.charAt(0) === '-') {
        parsed.error = 'Missing value for ' + arg + '.';
        return parsed;
      }

      if (arg === '--socket') {
        parsed.socket = value;
      } else {
        parsed.config = value;
      }

      i += 1;
      continue;
    }

    if (!parsed.command) {
      parsed.command = arg;
      continue;
    }

    if (!parsed.action) {
      parsed.action = arg;
      continue;
    }

    parsed.error = 'Unexpected argument.';
    return parsed;
  }

  return parsed;
}

/**
 * Prints CLI usage to stdout.
 */
function printUsage () {
  process.stdout.write([
    'adm-node — ADAMANT node forging control',
    '',
    'Usage:',
    '  adm-node forging encrypt',
    '  adm-node forging unlock [--config <path>] [--socket <path>]',
    '  adm-node forging lock [--config <path>] [--socket <path>]',
    '  adm-node forging status [--config <path>] [--socket <path>]',
    '',
    'encrypt reads the delegate passphrase and operator password from a hidden prompt.',
    'Put the printed admnode-enc-v1 value into forging.secret. Plaintext secrets keep working.',
    'unlock, lock, and status talk to the running node over its local control socket.',
    ''
  ].join('\n'));
}

/**
 * Encrypts one passphrase and writes only the blob to stdout.
 * @return {Promise<void>}
 */
async function cmdEncrypt () {
  var prompter = promptSecret.createHiddenPrompter();
  var ask = util.promisify(function (query, cb) {
    prompter.ask(query, cb);
  });
  var passphrase = (await ask('Enter the delegate passphrase to encrypt: ')).trim();

  if (!passphrase) {
    throw new Error('Passphrase cannot be empty.');
  }

  var password = await ask('Enter an operator password: ');
  var confirm = await ask('Confirm the operator password: ');

  if (password !== confirm) {
    throw new Error('Operator passwords do not match.');
  }

  var blob = forgingSecret.encrypt(passphrase, password);

  process.stderr.write('Encrypted passphrase. Put this single line in forging.secret:\n');
  process.stdout.write(blob + '\n');
}

/**
 * Loads node config the same way the node does, without decrypting secrets.
 * @param {string} configPath - Optional config path.
 * @return {object} Validated config.
 */
function loadConfig (configPath) {
  var load = require('../helpers/config.js');
  return load(configPath || null);
}

/**
 * Resolves the control socket for a running node.
 * @param {object} args - Parsed CLI arguments.
 * @return {string} Socket path.
 */
function resolveSocketPath (args) {
  if (args.socket) {
    return path.resolve(args.socket);
  }

  var config = loadConfig(args.config);

  return forgingControl.resolveControlSocketPath({
    controlSocket: config.forging && config.forging.controlSocket,
    port: config.port
  });
}

/**
 * Explains a missing control socket and exits.
 * @param {NodeJS.ErrnoException} err - Connection error.
 * @param {string} socketPath - Socket path that failed.
 */
function reportConnectionError (err, socketPath) {
  if (err.code === 'ENOENT' || err.code === 'ECONNREFUSED') {
    process.stderr.write('Node is not running, or its forging control socket was not found at ' + socketPath + '.\n');
  } else {
    process.stderr.write('Control request failed.\n');
  }

  process.exit(1);
}

/**
 * Prints a secret-free forging status snapshot.
 * @param {object} status - Status payload from the node.
 */
function printStatus (status) {
  status = status || {};

  var lines = [
    'Forging: ' + (status.forging || 'unknown'),
    'Encrypted delegates in config: ' + (status.encryptedDelegates || 0),
    'Invalid encrypted delegates in config: ' + (status.invalidEncryptedDelegates || 0),
    'Plaintext delegates in config: ' + (status.plaintextDelegates || 0),
    'Loaded keypairs: ' + (status.loadedKeypairs || 0)
  ];

  (status.delegates || []).forEach(function (delegate) {
    lines.push(
        '- ' + (delegate.address || '') +
        ' ' + (delegate.publicKey || '') +
        ' ' + (delegate.source || '') +
        ' ' + (delegate.loaded ? 'loaded' : 'locked')
    );
  });

  process.stdout.write(lines.join('\n') + '\n');
}

/**
 * Runs unlock, lock, or status against the running node.
 * @param {object} args - Parsed CLI arguments.
 * @param {string} action - Control command.
 * @return {Promise<void>}
 */
async function cmdSocket (args, action) {
  var socketPath = resolveSocketPath(args);
  var ensureReachable = util.promisify(forgingControl.ensureReachable);
  var sendCommand = util.promisify(forgingControl.sendCommand);

  if (action === 'unlock') {
    try {
      await ensureReachable(socketPath);
    } catch (err) {
      reportConnectionError(err, socketPath);
    }
  }

  var payload = { cmd: action };

  if (action === 'unlock') {
    var prompter = promptSecret.createHiddenPrompter();
    var ask = util.promisify(function (query, cb) {
      prompter.ask(query, cb);
    });

    payload.password = await ask('Enter the operator password: ');

    if (!payload.password) {
      throw new Error('Operator password is required.');
    }
  }

  var response;

  try {
    response = await sendCommand(socketPath, payload);
  } catch (err) {
    reportConnectionError(err, socketPath);
  }

  if (!response || !response.ok) {
    throw new Error((response && response.error) || 'Control command failed.');
  }

  if (action === 'status') {
    printStatus(response.status);
    return;
  }

  process.stdout.write(response.message + '\n');
  printStatus(response.status);
}

/**
 * CLI entry point.
 */
async function main () {
  var args = parseArgs(process.argv);

  if (args.error) {
    process.stderr.write(args.error + '\n');
    printUsage();
    process.exit(1);
  }

  if (args.command !== 'forging' || !args.action) {
    printUsage();
    process.exit(args.command ? 1 : 0);
  }

  if (args.action === 'encrypt') {
    await cmdEncrypt();
    return;
  }

  if (args.action === 'unlock' || args.action === 'lock' || args.action === 'status') {
    await cmdSocket(args, args.action);
    return;
  }

  printUsage();
  process.exit(1);
}

main().catch(function (err) {
  if (err && err.code === 'PROMPT_CANCELLED') {
    process.exit(130);
  }

  process.stderr.write((err && err.message ? err.message : 'Command failed.') + '\n');
  process.exit(1);
});
