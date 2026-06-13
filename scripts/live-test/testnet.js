#!/usr/bin/env node
'use strict';

const { runCli } = require('./liveTest.js');

runCli('testnet', 'Run ADAMANT live scenarios against an already running testnet node')
    .catch(function (error) {
      console.error(error.message);
      process.exit(1);
    });
