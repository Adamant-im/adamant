#!/usr/bin/env node
'use strict';

const { runCli } = require('./liveTest.js');

runCli('localnet', 'Run ADAMANT live scenarios against an already running localnet')
    .catch(function (error) {
      console.error(error.message);
      process.exit(1);
    });
