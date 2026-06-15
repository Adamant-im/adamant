const fs = require('fs');
const readline = require('readline');

const { SILENT, OUTPUT } = process.env;

const MAX_LOG_LENGTH = 600;

const log = (message, data) => {
  const json = JSON.stringify(data);

  let details = '';

  if (data) {
    details = json.length > MAX_LOG_LENGTH ?
      `${json.slice(0, MAX_LOG_LENGTH)}...` :
      json;
  }

  if (SILENT !== 'true') {
    console.log(message, details);
  }

  if (OUTPUT) {
    // remove terminal colors
    const cleanMessage = message.replace(/\x1B\[[0-9;]*m/g, '');
    fs.appendFileSync(OUTPUT, `${cleanMessage} ${json ?? ''}\n`, 'utf-8');
  }
};

const logUpdate = (...args) => {
  if (SILENT !== 'true') {
    readline.clearLine(process.stdout, 0);
    readline.cursorTo(process.stdout, 0);
    process.stdout.write(`${args.join(' ')}`);
  }
};

module.exports = {
  log,
  logUpdate
};
