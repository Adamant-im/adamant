'use strict';

var fs = require('fs');
var net = require('net');
var os = require('os');
var path = require('path');

var MAX_LINE_BYTES = 64 * 1024;

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
 * Creates the default socket directory and requires it to be owned by this user.
 * @param {string} dir - Directory path.
 */
function prepareRuntimeDir (dir) {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });

  var stats = fs.statSync(dir);

  if (typeof process.getuid === 'function' && stats.uid !== process.getuid()) {
    throw new Error('Forging control socket directory is not owned by the current user.');
  }

  fs.chmodSync(dir, 0o700);
}

/**
 * Removes a stale socket file when nothing is accepting connections on it.
 * @param {string} socketPath - Socket path.
 * @param {function} cb - Callback `(err)`.
 */
function replaceStaleSocket (socketPath, cb) {
  if (!fs.existsSync(socketPath)) {
    return setImmediate(cb);
  }

  var client = net.connect(socketPath);
  var settled = false;

  function finish (err) {
    if (settled) {
      return;
    }

    settled = true;
    client.destroy();
    cb(err);
  }

  client.once('connect', function () {
    finish(new Error('Forging control socket is already in use.'));
  });

  client.once('error', function () {
    try {
      fs.unlinkSync(socketPath);
    } catch (err) {
      return finish(err);
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
  var customPath = options && typeof options.controlSocket === 'string' && options.controlSocket.trim();

  try {
    socketPath = resolveControlSocketPath(options);

    if (Buffer.byteLength(socketPath) >= 104) {
      throw new Error('Forging control socket path is too long.');
    }

    if (!customPath) {
      prepareRuntimeDir(path.dirname(socketPath));
    } else {
      fs.mkdirSync(path.dirname(socketPath), { recursive: true });
    }
  } catch (err) {
    return setImmediate(cb, err);
  }

  replaceStaleSocket(socketPath, function (err) {
    if (err) {
      return cb(err);
    }

    var started = false;

    function finishStart (startErr, control) {
      if (started) {
        return;
      }

      started = true;
      cb(startErr, control);
    }

    var server = net.createServer(function (socket) {
      var buffer = '';

      socket.on('data', function (chunk) {
        buffer += chunk.toString('utf8');

        if (Buffer.byteLength(buffer) > MAX_LINE_BYTES) {
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
            socket.write(JSON.stringify(response) + '\n');
          });
        }
      });

      socket.on('error', function () {});
    });

    server.once('error', function (listenErr) {
      finishStart(listenErr);
    });

    server.listen(socketPath, function () {
      try {
        fs.chmodSync(socketPath, 0o600);
      } catch (chmodErr) {
        server.close(function () {
          try {
            fs.unlinkSync(socketPath);
          } catch (unlinkErr) {
            // The socket is already gone.
          }
        });
        return finishStart(chmodErr);
      }

      var control = {
        path: socketPath,
        close: function (done) {
          server.close(function () {
            try {
              fs.unlinkSync(socketPath);
            } catch (unlinkErr) {
              // The socket is already gone.
            }

            if (done) {
              done();
            }
          });
        }
      };

      process.once('exit', function () {
        try {
          fs.unlinkSync(socketPath);
        } catch (unlinkErr) {
          // The socket is already gone.
        }
      });

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
  var socket = net.connect(socketPath);
  var buffer = '';
  var settled = false;

  function finish (err, response) {
    if (settled) {
      return;
    }

    settled = true;
    socket.destroy();
    cb(err, response);
  }

  socket.setTimeout(10000, function () {
    finish(new Error('Control socket timed out.'));
  });

  socket.once('connect', function () {
    socket.write(JSON.stringify(payload) + '\n');
  });

  socket.on('data', function (chunk) {
    buffer += chunk.toString('utf8');

    if (buffer.length > MAX_LINE_BYTES) {
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
  var socket = net.connect(socketPath);
  var settled = false;

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
