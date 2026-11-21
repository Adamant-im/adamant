'use strict';

var fs = require('fs');
var net = require('net');
var path = require('path');

var MAX_LINE_BYTES = 64 * 1024;
var SOCKET_TIMEOUT_MS = 2000;

/**
 * Returns the directory that holds the default control socket.
 * The repository-local path is stable across TMPDIR, XDG_RUNTIME_DIR,
 * PrivateTmp, sudo, and shell differences.
 * @return {string} Directory path.
 */
function controlSocketDir () {
  return path.resolve(__dirname, '..', '.run');
}

/**
 * Resolves the Unix socket used by `adm-node forging`.
 * A non-empty forging.controlSocket wins. Otherwise the path includes the node
 * port so several local nodes do not share one socket.
 * @param {object} options - Socket options.
 * @param {string} [options.controlSocket] - Configured socket path. Empty uses the default.
 * @param {number|string} [options.port] - Effective node port.
 * @return {string} Absolute socket path.
 */
function resolveControlSocketPath (options) {
  options = options || {};

  var configured = typeof options.controlSocket === 'string' ? options.controlSocket.trim() : '';

  if (configured) {
    return path.resolve(configured);
  }

  if (!options.port) {
    throw new Error('Node port is required to resolve the forging control socket path.');
  }

  return path.join(controlSocketDir(), 'control-' + String(options.port) + '.sock');
}

/**
 * Resolves symlinked path components only after the parent has been protected.
 * Clients then connect to the stable canonical path instead of re-resolving a
 * potentially changed symlink between lstat and connect.
 * @param {string} socketPath - Absolute socket path.
 * @return {string} Socket path rooted at the canonical parent directory.
 */
function canonicalizeControlSocketPath (socketPath) {
  var parent = fs.realpathSync(path.dirname(socketPath));
  return path.join(parent, path.basename(socketPath));
}

/**
 * Returns true when a filesystem entry belongs to this process user.
 * UID checks are unavailable on Windows, where Unix socket mode is also unavailable.
 * @param {fs.Stats} stats - Filesystem entry metadata.
 * @return {boolean} True when ownership is acceptable.
 */
function isOwnedByCurrentUser (stats) {
  return typeof process.getuid !== 'function' || stats.uid === process.getuid();
}

/**
 * Validates the identity and type of a control socket directory.
 * @param {string} dir - Directory path.
 * @param {fs.Stats} stats - lstat result.
 */
function assertSecureDirectoryIdentity (dir, stats) {
  if (!stats.isDirectory() || stats.isSymbolicLink()) {
    throw new Error('Forging control socket directory is not a real directory: ' + dir);
  }

  if (!isOwnedByCurrentUser(stats)) {
    throw new Error('Forging control socket directory is not owned by the current user: ' + dir);
  }
}

/**
 * Validates every canonical directory component before using a socket path.
 * Sticky shared roots such as /tmp are allowed, but non-sticky group/world
 * writable ancestors are rejected. The leaf must be owned by this user and 0700.
 * @param {string} dir - Canonical directory path.
 */
function assertTrustedDirectoryChain (dir) {
  var parsed = path.parse(dir);
  var current = parsed.root;
  var segments = dir.slice(parsed.root.length).split(path.sep).filter(Boolean);

  function checkDirectory (directory) {
    var stats = fs.lstatSync(directory);

    if (!stats.isDirectory() || stats.isSymbolicLink()) {
      throw new Error('Forging control socket directory chain is not trusted: ' + directory);
    }

    if (
      typeof process.getuid === 'function' &&
      stats.uid !== 0 &&
      stats.uid !== process.getuid()
    ) {
      throw new Error('Forging control socket directory chain is owned by another user: ' + directory);
    }

    var mode = stats.mode & 0o7777;
    var groupWritable = !!(mode & 0o020);
    var worldWritable = !!(mode & 0o002);
    var sticky = !!(mode & 0o1000);

    if ((groupWritable || worldWritable) && !sticky) {
      throw new Error('Forging control socket directory chain is writable by another user: ' + directory);
    }
  }

  checkDirectory(current);

  segments.forEach(function (segment) {
    current = path.join(current, segment);
    checkDirectory(current);
  });

  var leafStats = fs.lstatSync(dir);

  if (!isOwnedByCurrentUser(leafStats) || (leafStats.mode & 0o777) !== 0o700) {
    throw new Error('Forging control socket parent must be owned by the current user and use mode 0700: ' + dir);
  }
}

/**
 * Validates the type, owner and mode of a control socket directory.
 * @param {string} dir - Directory path.
 * @param {fs.Stats} stats - lstat result.
 */
function assertSecureDirectory (dir, stats) {
  assertSecureDirectoryIdentity(dir, stats);

  if ((stats.mode & 0o777) !== 0o700) {
    throw new Error('Forging control socket directory is not securely permissioned: ' + dir);
  }
}

/**
 * Creates and validates the directory used for a control socket.
 * @param {string} dir - Directory path.
 * @param {boolean} chmodExisting - Whether an existing default directory can be repaired.
 */
function prepareRuntimeDir (dir, chmodExisting) {
  var stats;
  var created = false;

  try {
    stats = fs.lstatSync(dir);
  } catch (err) {
    if (err.code !== 'ENOENT') {
      throw err;
    }

    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    stats = fs.lstatSync(dir);
    created = true;
  }

  assertSecureDirectoryIdentity(dir, stats);

  if (created || chmodExisting) {
    fs.chmodSync(dir, 0o700);
  }

  assertSecureDirectory(dir, fs.lstatSync(dir));
}

/**
 * Validates an existing Unix socket before a client connects or a stale path is removed.
 * @param {string} socketPath - Socket path.
 * @param {fs.Stats} [stats] - Previously read lstat result.
 * @return {fs.Stats} Validated lstat result.
 */
function assertControlSocket (socketPath, stats) {
  assertTrustedDirectoryChain(path.dirname(socketPath));
  stats = stats || fs.lstatSync(socketPath);

  if (!stats.isSocket() || stats.isSymbolicLink()) {
    throw new Error('Forging control path is not a Unix socket: ' + socketPath);
  }

  if (!isOwnedByCurrentUser(stats)) {
    throw new Error('Forging control socket is not owned by the current user: ' + socketPath);
  }

  if ((stats.mode & 0o777) !== 0o600) {
    throw new Error('Forging control socket permissions must be 0600: ' + socketPath);
  }

  return stats;
}

/**
 * Checks that a socket path did not change after it was validated.
 * @param {string} socketPath - Canonical socket path.
 * @param {fs.Stats} expected - Previously validated inode metadata.
 */
function assertSameControlSocket (socketPath, expected) {
  assertControlSocket(socketPath);
  var current = fs.lstatSync(socketPath);

  if (
    current.dev !== expected.dev ||
    current.ino !== expected.ino ||
    current.uid !== expected.uid
  ) {
    throw new Error('Forging control socket changed while connecting.');
  }
}

/**
 * Removes a socket only if it is still the same filesystem entry checked earlier.
 * @param {string} socketPath - Socket path.
 * @param {fs.Stats} expected - Previously validated socket metadata.
 */
function unlinkExpectedSocket (socketPath, expected) {
  var current = fs.lstatSync(socketPath);

  if (
    !current.isSocket() ||
    current.dev !== expected.dev ||
    current.ino !== expected.ino ||
    current.uid !== expected.uid
  ) {
    throw new Error('Forging control socket changed before it could be removed.');
  }

  fs.unlinkSync(socketPath);
}

/**
 * Removes a stale socket file when nothing is accepting connections on it.
 * @param {string} socketPath - Socket path.
 * @param {function} cb - Callback `(err)`.
 */
function replaceStaleSocket (socketPath, cb) {
  var stats;

  try {
    stats = assertControlSocket(socketPath);
  } catch (err) {
    if (err.code === 'ENOENT') {
      return setImmediate(cb);
    }

    return setImmediate(cb, err);
  }

  var client = net.connect(socketPath);
  var settled = false;

  function finish (err) {
    if (settled) {
      return;
    }

    settled = true;
    client.destroy();
    setImmediate(cb, err);
  }

  client.once('connect', function () {
    finish(new Error('Forging control socket is already in use.'));
  });

  client.setTimeout(SOCKET_TIMEOUT_MS, function () {
    finish(new Error('Forging control socket did not respond while checking for a stale path.'));
  });

  client.once('error', function (err) {
    if (err.code !== 'ECONNREFUSED') {
      return finish(err);
    }

    try {
      unlinkExpectedSocket(socketPath, stats);
    } catch (unlinkErr) {
      return finish(unlinkErr);
    }

    finish(null);
  });
}

/**
 * Returns an error message that is safe to send to the CLI.
 * @param {Error|string} err - Failure from a control handler.
 * @return {string} Short error text.
 */
function safeMessage (err) {
  var message = err && err.message ? String(err.message) : (typeof err === 'string' ? err : '');

  if (!message || message.length > 300) {
    return 'Control command failed.';
  }

  return message;
}

/**
 * Handles one control command. The password is forwarded to the handler and
 * then dropped. It is never written to the response or the logger.
 * @param {object} message - Parsed request.
 * @param {object} handler - Status, unlock, and lock callbacks.
 * @param {function} cb - Callback `(response)`.
 */
function handleCommand (message, handler, cb) {
  if (!message || typeof message.cmd !== 'string') {
    return setImmediate(cb, { ok: false, error: 'Malformed control request.' });
  }

  if (message.cmd === 'status') {
    return setImmediate(cb, { ok: true, status: handler.status() });
  }

  if (message.cmd === 'lock') {
    return handler.lock(function (err) {
      if (err) {
        return cb({ ok: false, error: safeMessage(err) });
      }

      return cb({
        ok: true,
        message: 'Forging locked. Delegate keypairs cleared from memory.',
        status: handler.status()
      });
    });
  }

  if (message.cmd === 'unlock') {
    if (typeof message.password !== 'string' || message.password.length === 0) {
      return setImmediate(cb, { ok: false, error: 'Operator password is required.' });
    }

    var password = message.password;
    message.password = null;

    return handler.unlock(password, function (err, result) {
      password = null;

      if (err) {
        return cb({ ok: false, error: safeMessage(err) });
      }

      var count = result && result.unlocked ? result.unlocked : 0;

      return cb({
        ok: true,
        message: 'Forging unlocked for ' + count + ' delegate(s).',
        status: handler.status()
      });
    });
  }

  return setImmediate(cb, { ok: false, error: 'Unknown command.' });
}

/**
 * Starts the owner-only forging control socket.
 * @param {object} options - `port` and optional `controlSocket`.
 * @param {object} handler - Runtime forging handler.
 * @param {object} logger - Node logger. Must not receive secrets.
 * @param {function} cb - Callback `(err, control)`.
 */
function start (options, handler, logger, cb) {
  var socketPath;
  var customPath = options && typeof options.controlSocket === 'string' &&
    options.controlSocket.trim();

  try {
    socketPath = resolveControlSocketPath(options);
    prepareRuntimeDir(path.dirname(socketPath), !customPath);
    socketPath = canonicalizeControlSocketPath(socketPath);
    assertTrustedDirectoryChain(path.dirname(socketPath));

    if (Buffer.byteLength(socketPath) >= 104) {
      throw new Error('Forging control socket path is too long.');
    }
  } catch (err) {
    return setImmediate(cb, err);
  }

  replaceStaleSocket(socketPath, function (err) {
    if (err) {
      return cb(err);
    }

    var started = false;
    var socketStats = null;
    var connections = new Set();

    function finishStart (startErr, control) {
      if (started) {
        return;
      }

      started = true;
      cb(startErr, control);
    }

    var server = net.createServer(function (socket) {
      var buffer = '';
      connections.add(socket);

      socket.on('data', function (chunk) {
        buffer += chunk.toString('utf8');

        if (Buffer.byteLength(buffer, 'utf8') > MAX_LINE_BYTES) {
          buffer = '';
          socket.end(JSON.stringify({ ok: false, error: 'Control request is too large.' }) + '\n');
          return;
        }

        var newlineIndex = buffer.indexOf('\n');

        while (newlineIndex !== -1) {
          var line = buffer.slice(0, newlineIndex).trim();
          buffer = buffer.slice(newlineIndex + 1);
          newlineIndex = buffer.indexOf('\n');

          if (!line) {
            continue;
          }

          var message;

          try {
            message = JSON.parse(line);
          } catch (parseErr) {
            socket.write(JSON.stringify({ ok: false, error: 'Malformed control request.' }) + '\n');
            continue;
          }

          handleCommand(message, handler, function (response) {
            if (socket.writable) {
              socket.write(JSON.stringify(response) + '\n');
            }
          });
        }
      });

      socket.once('close', function () {
        connections.delete(socket);
      });

      socket.on('error', function (socketErr) {
        if (logger && socketErr.code !== 'ECONNRESET' && socketErr.code !== 'EPIPE') {
          logger.warn('delegates', 'Forging control socket client error: ' + socketErr.message);
        }
      });
    });

    server.on('error', function (serverErr) {
      if (!started) {
        return finishStart(serverErr);
      }

      if (logger) {
        logger.error('delegates', 'Forging control socket error: ' + serverErr.message);
      }
    });

    server.listen(socketPath, function () {
      try {
        fs.chmodSync(socketPath, 0o600);
        socketStats = assertControlSocket(socketPath);
      } catch (chmodErr) {
        server.close(function () {
          try {
            unlinkExpectedSocket(socketPath, assertControlSocket(socketPath));
          } catch (unlinkErr) {
            // The socket is already gone.
          }
        });
        return finishStart(chmodErr);
      }

      var control = {
        path: socketPath,
        close: function (done) {
          server.close(function (closeErr) {
            try {
              if (socketStats) {
                unlinkExpectedSocket(socketPath, socketStats);
              }
            } catch (unlinkErr) {
              if (unlinkErr.code !== 'ENOENT' && logger) {
                logger.warn('delegates', 'Failed to remove forging control socket: ' + unlinkErr.message);
              }
            }

            process.removeListener('exit', cleanup);

            if (done) {
              done(closeErr);
            }
          });

          connections.forEach(function (connection) {
            connection.destroy();
          });
        }
      };

      function cleanup () {
        try {
          if (socketStats) {
            unlinkExpectedSocket(socketPath, socketStats);
          }
        } catch (unlinkErr) {
          // Exit cleanup cannot safely wait for or report filesystem failures.
        }
      }

      process.once('exit', cleanup);

      if (logger) {
        logger.info('delegates', 'Forging control socket listening at ' + socketPath);
      }

      finishStart(null, control);
    });
  });
}

/**
 * Sends one newline-delimited JSON command to a forging control socket.
 * @param {string} socketPath - Socket path.
 * @param {object} payload - Command payload. May contain a password; it is not logged.
 * @param {object|function} [options] - Timeout options or callback.
 * @param {number} [options.timeoutMs] - Client timeout in milliseconds.
 * @param {function} cb - Callback `(err, response)`.
 */
function sendCommand (socketPath, payload, options, cb) {
  if (typeof options === 'function') {
    cb = options;
    options = {};
  }

  options = options || {};
  var buffer = '';
  var settled = false;
  var request;
  var socket;
  var socketStats;

  try {
    socketPath = canonicalizeControlSocketPath(socketPath);
    socketStats = assertControlSocket(socketPath);
    request = JSON.stringify(payload) + '\n';
  } catch (err) {
    return setImmediate(cb, err);
  }

  if (payload && Object.prototype.hasOwnProperty.call(payload, 'password')) {
    payload.password = null;
  }

  socket = net.connect(socketPath);

  function finish (err, response) {
    if (settled) {
      return;
    }

    settled = true;
    request = null;
    socket.destroy();
    cb(err, response);
  }

  socket.setTimeout(options.timeoutMs || 10000, function () {
    finish(new Error('Control socket timed out.'));
  });

  socket.once('connect', function () {
    try {
      assertSameControlSocket(socketPath, socketStats);
      socket.write(request);
      request = null;
    } catch (err) {
      finish(err);
    }
  });

  socket.on('data', function (chunk) {
    buffer += chunk.toString('utf8');

    if (Buffer.byteLength(buffer, 'utf8') > MAX_LINE_BYTES) {
      return finish(new Error('Control response is too large.'));
    }

    var newlineIndex = buffer.indexOf('\n');

    if (newlineIndex === -1) {
      return;
    }

    try {
      finish(null, JSON.parse(buffer.slice(0, newlineIndex)));
    } catch (err) {
      finish(new Error('Malformed control response.'));
    }
  });

  socket.once('error', function (err) {
    var error = new Error('Control request failed.');
    error.code = err.code;
    finish(error);
  });
}

/**
 * Checks that a control socket accepts a connection before prompting.
 * @param {string} socketPath - Socket path.
 * @param {object|function} [options] - Timeout options or callback.
 * @param {number} [options.timeoutMs] - Client timeout in milliseconds.
 * @param {function} cb - Callback `(err)`.
 */
function ensureReachable (socketPath, options, cb) {
  if (typeof options === 'function') {
    cb = options;
    options = {};
  }

  options = options || {};
  var settled = false;
  var socket;
  var socketStats;

  try {
    socketPath = canonicalizeControlSocketPath(socketPath);
    socketStats = assertControlSocket(socketPath);
  } catch (err) {
    return setImmediate(cb, err);
  }

  socket = net.connect(socketPath);

  function finish (err) {
    if (settled) {
      return;
    }

    settled = true;
    socket.destroy();
    cb(err);
  }

  socket.once('connect', function () {
    try {
      assertSameControlSocket(socketPath, socketStats);
      finish(null);
    } catch (err) {
      finish(err);
    }
  });

  socket.setTimeout(options.timeoutMs || SOCKET_TIMEOUT_MS, function () {
    finish(new Error('Control socket timed out while connecting.'));
  });

  socket.once('error', function (err) {
    finish(err);
  });
}

module.exports = {
  controlSocketDir: controlSocketDir,
  resolveControlSocketPath: resolveControlSocketPath,
  start: start,
  sendCommand: sendCommand,
  ensureReachable: ensureReachable
};
