'use strict';

var fs = require('fs');
var net = require('net');
var os = require('os');
var path = require('path');

var MAX_LINE_BYTES = 64 * 1024;
var SOCKET_TIMEOUT_MS = 2000;

/**
 * Returns the per-user directory that holds the default control socket.
 * Keeping it out of a shared sticky temp root stops another local user from
 * planting a socket path before this process binds it.
 * @return {string} Directory path.
 */
function controlSocketDir () {
  var userId = typeof process.getuid === 'function' ? String(process.getuid()) : os.userInfo().username;
  return path.join(os.tmpdir(), 'adamant-node-' + userId);
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
 * Validates the directory that contains a forging control socket.
 * The default directory is private. A custom directory may be readable, but it
 * must not be writable by another user and must never be a symlink.
 * @param {string} dir - Directory path.
 * @param {fs.Stats} stats - lstat result.
 * @param {boolean} requirePrivate - Whether mode must be exactly 0700.
 */
function assertSecureDirectory (dir, stats, requirePrivate) {
  if (!stats.isDirectory() || stats.isSymbolicLink()) {
    throw new Error('Forging control socket directory is not a real directory: ' + dir);
  }

  if (!isOwnedByCurrentUser(stats)) {
    throw new Error('Forging control socket directory is not owned by the current user: ' + dir);
  }

  var mode = stats.mode & 0o777;
  var insecureMode = requirePrivate ? (mode !== 0o700) : !!(mode & 0o022);

  if (insecureMode) {
    throw new Error('Forging control socket directory is not securely permissioned: ' + dir);
  }
}

/**
 * Creates and validates the directory used for a control socket.
 * @param {string} dir - Directory path.
 * @param {boolean} requirePrivate - Whether the directory must be mode 0700.
 */
function prepareRuntimeDir (dir, requirePrivate) {
  var stats;

  try {
    stats = fs.lstatSync(dir);
  } catch (err) {
    if (err.code !== 'ENOENT') {
      throw err;
    }

    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    stats = fs.lstatSync(dir);
  }

  assertSecureDirectory(dir, stats, false);

  if (requirePrivate) {
    fs.chmodSync(dir, 0o700);
  }

  assertSecureDirectory(dir, fs.lstatSync(dir), requirePrivate);
}

/**
 * Validates an existing Unix socket before a client connects or a stale path is removed.
 * @param {string} socketPath - Socket path.
 * @param {fs.Stats} [stats] - Previously read lstat result.
 * @return {fs.Stats} Validated lstat result.
 */
function assertControlSocket (socketPath, stats) {
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

  try {
    socketPath = resolveControlSocketPath(options);
    prepareRuntimeDir(path.dirname(socketPath), true);
    socketPath = canonicalizeControlSocketPath(socketPath);

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
 * @param {function} cb - Callback `(err, response)`.
 */
function sendCommand (socketPath, payload, cb) {
  var buffer = '';
  var settled = false;
  var request;
  var socket;

  try {
    socketPath = canonicalizeControlSocketPath(socketPath);
    assertControlSocket(socketPath);
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

  socket.setTimeout(10000, function () {
    finish(new Error('Control socket timed out.'));
  });

  socket.once('connect', function () {
    socket.write(request);
    request = null;
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
 * @param {function} cb - Callback `(err)`.
 */
function ensureReachable (socketPath, cb) {
  var settled = false;
  var socket;

  try {
    socketPath = canonicalizeControlSocketPath(socketPath);
    assertControlSocket(socketPath);
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
    finish(null);
  });

  socket.setTimeout(SOCKET_TIMEOUT_MS, function () {
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
