'use strict';

var readline = require('readline');

/**
 * Reads one hidden line from stdin.
 * A terminal masks each character. Piped input is read as a normal line because
 * it is not echoed. The value is passed only to the callback and is not logged.
 * @param {string} query - Prompt text written to stderr.
 * @param {object|function} [options] - Options, or the callback when options are omitted.
 * @param {boolean} [options.cancelSignal] - On Ctrl-C, restore the terminal and raise SIGINT.
 * @param {function} cb - Callback `(err, value)`.
 */
function promptHidden (query, options, cb) {
  if (typeof options === 'function') {
    cb = options;
    options = {};
  }

  options = options || {};

  var stdin = process.stdin;
  var stderr = process.stderr;

  if (!stdin.isTTY || typeof stdin.setRawMode !== 'function') {
    readLine(query, cb);
    return;
  }

  var wasRaw = stdin.isRaw;
  var input = '';
  var settled = false;

  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding('utf8');
  stderr.write(query);

  function restore () {
    stdin.removeListener('data', onData);
    process.removeListener('SIGINT', onSigint);
    stdin.setRawMode(wasRaw);
    stdin.pause();
  }

  function finish (err, value) {
    if (settled) {
      return;
    }

    settled = true;
    restore();
    stderr.write('\n');
    cb(err, value);
  }

  function onSigint () {
    if (settled) {
      return;
    }

    settled = true;
    restore();
    stderr.write('\n');
  }

  process.on('SIGINT', onSigint);

  function onData (chunk) {
    var chars = String(chunk);

    for (var i = 0; i < chars.length; i++) {
      var char = chars.charAt(i);

      if (char === '\n' || char === '\r' || char === '\u0004') {
        finish(null, input);
        return;
      }

      if (char === '\u0003') {
        if (options.cancelSignal) {
          if (!settled) {
            settled = true;
            restore();
            stderr.write('\n');
          }
          process.kill(process.pid, 'SIGINT');
          return;
        }

        var cancelError = new Error('Prompt cancelled.');
        cancelError.code = 'PROMPT_CANCELLED';
        finish(cancelError);
        return;
      }

      if (char === '\u007f' || char === '\b') {
        if (input.length > 0) {
          input = input.slice(0, -1);
          stderr.write('\b \b');
        }
        continue;
      }

      if (char < ' ') {
        continue;
      }

      input += char;
      stderr.write('*');
    }
  }

  stdin.on('data', onData);
}

/**
 * Reads one line when stdin is not a terminal.
 * @param {string} query - Prompt text written to stderr.
 * @param {function} cb - Callback `(err, value)`.
 */
function readLine (query, cb) {
  var rl = readline.createInterface({
    input: process.stdin,
    output: process.stderr,
    terminal: false
  });
  var settled = false;

  process.stderr.write(query);

  rl.once('close', function () {
    if (!settled) {
      settled = true;
      cb(null, '');
    }
  });

  rl.once('line', function (line) {
    settled = true;
    rl.close();
    cb(null, line);
  });
}

/**
 * Creates a prompter that can ask for several hidden values.
 * Piped stdin is buffered once so later questions still see their lines.
 * @return {object} Prompter with an `ask(query, cb)` method.
 */
function createHiddenPrompter () {
  if (process.stdin.isTTY && typeof process.stdin.setRawMode === 'function') {
    return {
      ask: function (query, cb) {
        promptHidden(query, cb);
      }
    };
  }

  var linesPromise = null;
  var index = 0;

  function loadLines () {
    if (linesPromise) {
      return linesPromise;
    }

    linesPromise = new Promise(function (resolve) {
      var data = '';

      process.stdin.setEncoding('utf8');
      process.stdin.on('data', function (chunk) {
        data += chunk;
      });
      process.stdin.once('end', function () {
        resolve(data.split(/\r?\n/));
      });
    });

    return linesPromise;
  }

  return {
    ask: function (query, cb) {
      process.stderr.write(query);
      loadLines().then(function (lines) {
        var value = lines[index];
        index += 1;
        cb(null, value === undefined ? '' : value);
      }).catch(function (err) {
        cb(err);
      });
    }
  };
}

module.exports = {
  promptHidden: promptHidden,
  createHiddenPrompter: createHiddenPrompter
};
