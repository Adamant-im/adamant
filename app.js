'use strict';
/**
 * A node-style callback as used by {@link logic} and {@link modules}.
 * @see {@link https://nodejs.org/api/errors.html#errors_node_js_style_callbacks}
 * @callback nodeStyleCallback
 * @param {?Error} error - Error, if any, otherwise `null`.
 * @param {Data} data - Data, if there hasn't been an error.
 */
/**
 * A triggered by setImmediate callback as used by {@link logic}, {@link modules} and {@link helpers}.
 * Parameters formats: (cb, error, data), (cb, error), (cb).
 * @see {@link https://nodejs.org/api/timers.html#timers_setimmediate_callback_args}
 * @callback setImmediateCallback
 * @param {function} cb - Callback function.
 * @param {?Error} [error] - Error, if any, otherwise `null`.
 * @param {Data} [data] - Data, if there hasn't been an error and the function should return data.
 */

/**
 * Main entry point.
 * Loads the ADAMANT modules, the ADAMANT api and run the express server as Domain master.
 * CLI options available.
 * @module app
 */

var async = require('async');
var checkIpInList = require('./helpers/checkIpInList.js');
var extend = require('extend');
var fs = require('fs');

var git = require('./helpers/git.js');
var https = require('https');
var Logger = require('./logger.js');
var packageJson = require('./package.json');
var path = require('path');
var Command = require('commander').Command;
var httpApi = require('./helpers/httpApi.js');
var Sequence = require('./helpers/sequence.js');
var util = require('util');
var z_schema = require('./helpers/z_schema.js');
process.stdin.resume();

var versionBuild = fs.readFileSync(path.join(__dirname, 'build'), 'utf8');

/**
 * @property {string} - Hash of last git commit.
 */
var lastCommit = '';

if (typeof gc !== 'undefined') {
  setInterval(function () {
    // eslint-disable-next-line no-undef
    gc();
  }, 60000);
}

const program = new Command();

program
    .version(packageJson.version)
    .option('-c, --config <path>', 'config.json file path')
    .option('-g, --genesis <path>', 'genesisBlock.json file path')
    .option('-p, --port <port>', 'listening port number')
    .option('-a, --address <ip>', 'listening host name or ip')
    .option('-x, --peers [peers...]', 'peers list')
    .option('-l, --log <level>', 'log level')
    .option('-s, --snapshot <round>', 'verify snapshot')
    .parse(process.argv);

var programOpts = program.opts();

/**
 * @property {object} - The default list of configuration options. Can be updated by CLI.
 * @default 'config.json'
 */
var appConfig = require('./helpers/config.js')(programOpts.config);
var genesisblock = require(path.resolve(process.cwd(), (programOpts.genesis || 'genesisBlock.json')));

if (programOpts.port) {
  appConfig.port = programOpts.port;
}

if (programOpts.address) {
  appConfig.address = programOpts.address;
}

if (programOpts.peers) {
  if (typeof programOpts.peers === 'string') {
    appConfig.peers.list = programOpts.peers.split(',').map(function (peer) {
      peer = peer.split(':');
      return {
        ip: peer.shift(),
        port: peer.shift() || appConfig.port
      };
    });
  } else {
    appConfig.peers.list = [];
  }
}

if (programOpts.log) {
  appConfig.consoleLogLevel = programOpts.log;
}

if (programOpts.snapshot) {
  appConfig.loading.snapshot = Math.abs(
      Math.floor(programOpts.snapshot)
  );
}

if (process.env.NODE_ENV === 'test') {
  appConfig.coverage = true;
}

// Define top endpoint availability
process.env.TOP = appConfig.topAccounts;

/**
 * The config object to handle ADAMANT modules and ADAMANT api.
 * It loads `modules` and `api` folders content.
 * Also contains db configuration from config.json.
 * @property {object} db - Config values for database.
 * @property {object} modules - `modules` folder content.
 * @property {object} api - `api/http` folder content.
 */
var config = {
  db: appConfig.db,
  cache: appConfig.redis,
  cacheEnabled: appConfig.cacheEnabled,
  modules: {
    server: './modules/server.js',
    accounts: './modules/accounts.js',
    transactions: './modules/transactions.js',
    blocks: './modules/blocks.js',
    signatures: './modules/signatures.js',
    transport: './modules/transport.js',
    loader: './modules/loader.js',
    system: './modules/system.js',
    peers: './modules/peers.js',
    delegates: './modules/delegates.js',
    rounds: './modules/rounds.js',
    multisignatures: './modules/multisignatures.js',
    dapps: './modules/dapps.js',
    chats: './modules/chats.js',
    chatrooms: './modules/chatrooms.js',
    states: './modules/states.js',
    node: './modules/node.js',
    chats: './modules/chats.js',
    crypto: './modules/crypto.js',
    sql: './modules/sql.js',
    cache: './modules/cache.js'
  },
  api: {
    accounts: { http: './api/http/accounts.js' },
    blocks: { http: './api/http/blocks.js' },
    dapps: { http: './api/http/dapps.js' },
    chats: { http: './api/http/chats.js' },
    chatrooms: { http: './api/http/chatrooms.js' },
    states: { http: './api/http/states.js' },
    node: { http: './api/http/node.js' },
    delegates: { http: './api/http/delegates.js' },
    loader: { http: './api/http/loader.js' },
    multisignatures: { http: './api/http/multisignatures.js' },
    peers: { http: './api/http/peers.js' },
    server: { http: './api/http/server.js' },
    signatures: { http: './api/http/signatures.js' },
    transactions: { http: './api/http/transactions.js' },
    transport: { http: './api/http/transport.js' }
  }
};

/**
 * Logger holder so we can log with custom functionality.
 * The Object is initialized here and pass to others as parameter.
 * @property {object} - Logger instance.
 */
var logger = new Logger({
  echo: appConfig.consoleLogLevel,
  errorLevel: appConfig.fileLogLevel,
  filename: appConfig.logFileName
});

// Trying to get last git commit
try {
  lastCommit = git.getLastCommit();
} catch (err) {
  logger.debug('Cannot get last git commit', err.message);
}

/**
 * Creates the express server and loads all the Modules and logic.
 * @property {object} - Domain instance.
 */
var d = require('domain').create();

d.on('error', function (err) {
  logger.fatal('Domain master', {
    message: err.message,
    stack: err.stack
  });
  process.exit(0);
});

// runs domain
d.run(function () {
  var modules = [];
  async.auto({
    /**
     * Loads `payloadHash` and generate dapp password if it is empty and required.
     * Then updates config.json with new random  password.
     * @method config
     * @param {nodeStyleCallback} cb - Callback function with the mutated `appConfig`.
     * @throws {Error} If failed to assign nethash from genesis block.
     */
    config: function (cb) {
      try {
        appConfig.nethash = Buffer.from(genesisblock.payloadHash, 'hex').toString('hex');
      } catch (e) {
        logger.error('Failed to assign nethash from genesis block');
        throw Error(e);
      }

      if (!appConfig.cors) {
        appConfig.cors = { origin: '*' };
      }

      appConfig.cors.credentials = true;

      if (appConfig.dapp.masterrequired && !appConfig.dapp.masterpassword) {
        var randomstring = require('randomstring');

        appConfig.dapp.masterpassword = randomstring.generate({
          length: 12,
          readable: true,
          charset: 'alphanumeric'
        });

        if (appConfig.loading.snapshot != null) {
          delete appConfig.loading.snapshot;
        }

        fs.writeFileSync('./config.json', JSON.stringify(appConfig, null, 4));
        cb(null, appConfig);
      } else {
        cb(null, appConfig);
      }
    },
    logger: function (cb) {
      cb(null, logger);
    },

    build: function (cb) {
      cb(null, versionBuild);
    },

    /**
     * Returns hash of last git commit.
     * @method lastCommit
     * @param {nodeStyleCallback} cb - Callback function with Hash of last git commit.
     */
    lastCommit: function (cb) {
      cb(null, lastCommit);
    },

    genesisblock: function (cb) {
      cb(null, {
        block: genesisblock
      });
    },
    packageJson: function (cb) {
      cb(null, packageJson);
    },
    public: function (cb) {
      cb(null, path.join(__dirname, 'public'));
    },

    schema: function (cb) {
      cb(null, new z_schema());
    },

    /**
     * ws client PWA,
     * @method clientWs
     * @param {object} wsconfig - config from ws client PWA,
     * @param {nodeStyleCallback} cb - Callback function with created Method:
     * `emit`.
     */
    clientWs: ['config', function (scope, cb) {
      const ClientWs = require('./modules/clientWs');

      const clientWs = new ClientWs(
        Object.assign(scope.config.wsClient, { cors: appConfig.cors }),
        logger
      );

      cb(null, clientWs);
    }],
    /**
     * Once config is completed, creates app, http & https servers & sockets with express.
     * @method network
     * @param {object} scope - The results from current execution,
     * at least will contain the required elements.
     * @param {nodeStyleCallback} cb - Callback function with created Object:
     * `{express, app, server, io, https, https_io}`.
     */
    network: ['config', function (scope, cb) {
      var express = require('express');
      var compression = require('compression');
      var cors = require('cors');
      var app = express();

      if (appConfig.coverage) {
        var im = require('nyc-middleware');
        logger.debug('Hook loader for coverage - do not use in production environment!');
        im.hookLoader(__dirname);
        app.use('/coverage', im.createHandler());
      }

      require('./helpers/request-limiter')(app, appConfig);

      app.use(compression({
        level: 9
      }));
      app.use(cors(appConfig.cors));
      app.options('*', cors(appConfig.cors));

      var server = require('http').createServer(app);

      const { Server } = require('socket.io');
      const io = new Server(server, {
        allowEIO3: true,
        cors: appConfig.cors
      });

      var privateKey, certificate, https, https_io;

      if (scope.config.ssl.enabled) {
        privateKey = fs.readFileSync(scope.config.ssl.options.key);
        certificate = fs.readFileSync(scope.config.ssl.options.cert);

        https = require('https').createServer({
          key: privateKey,
          cert: certificate,
          ciphers: 'ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-AES256-GCM-SHA384:DHE-RSA-AES128-GCM-SHA256:' + 'ECDHE-RSA-AES128-SHA256:DHE-RSA-AES128-SHA256:ECDHE-RSA-AES256-SHA384:DHE-RSA-AES256-SHA384:ECDHE-RSA-AES256-SHA256:DHE-RSA-AES256-SHA256:HIGH:' + '!aNULL:!eNULL:!EXPORT:!DES:!RC4:!MD5:!PSK:!SRP:!CAMELLIA'
        }, app);

        https_io = new Server(https, {
          allowEIO3: true,
          cors: appConfig.cors
        });
      }

      cb(null, {
        express: express,
        app: app,
        server: server,
        io: io,
        https: https,
        https_io: https_io
      });
    }],

    dbSequence: ['logger', function (scope, cb) {
      var sequence = new Sequence({
        onWarning: function (current, limit) {
          scope.logger.warn('DB queue', current);
        }
      });
      cb(null, sequence);
    }],

    sequence: ['logger', function (scope, cb) {
      var sequence = new Sequence({
        onWarning: function (current, limit) {
          scope.logger.warn('Main queue', current);
        }
      });
      cb(null, sequence);
    }],

    balancesSequence: ['logger', function (scope, cb) {
      var sequence = new Sequence({
        onWarning: function (current, limit) {
          scope.logger.warn('Balance queue', current);
        }
      });
      cb(null, sequence);
    }],

    /**
     * Once config, public, genesisblock, logger, build and network are completed,
     * adds configuration to `network.app`.
     * @method connect
     * @param {object} scope - The results from current execution,
     * at least will contain the required elements.
     * @param {function} cb - Callback function.
     */
    connect: ['config', 'public', 'genesisblock', 'logger', 'build', 'network', function (scope, cb) {
      var path = require('path');
      var bodyParser = require('body-parser');
      var methodOverride = require('method-override');
      var queryParser = require('express-query-int');
      var randomString = require('randomstring');

      scope.nonce = randomString.generate(16);
      scope.network.app.engine('html', require('ejs').renderFile);
      scope.network.app.use(require('express-domain-middleware'));
      scope.network.app.set('view engine', 'ejs');
      scope.network.app.set('views', path.join(__dirname, 'public'));
      scope.network.app.use(scope.network.express.static(path.join(__dirname, 'public')));
      scope.network.app.use(bodyParser.raw({
        limit: '2mb'
      }));
      scope.network.app.use(bodyParser.urlencoded({
        extended: true,
        limit: '2mb',
        parameterLimit: 5000
      }));
      scope.network.app.use(bodyParser.json({
        limit: '2mb'
      }));
      scope.network.app.use(methodOverride());

      var ignore = ['id', 'name', 'lastBlockId', 'blockId', 'transactionId', 'address', 'recipientId', 'senderId', 'previousBlock'];

      scope.network.app.use(queryParser({
        parser: function (value, radix, name) {
          if (ignore.indexOf(name) >= 0) {
            return value;
          }

          // Ignore conditional fields for transactions list
          if (/^.+?:(blockId|recipientId|senderId)$/.test(name)) {
            return value;
          }

          /* eslint-disable eqeqeq */
          if (isNaN(value) || parseInt(value) != value || isNaN(parseInt(value, radix))) {
            return value;
          }
          /* eslint-enable eqeqeq */
          return parseInt(value);
        }
      }));

      scope.network.app.use(require('./helpers/z_schema-express.js')(scope.schema));

      scope.network.app.use(httpApi.middleware.logClientConnections.bind(null, scope.logger));

      /* Instruct browser to deny display of <frame>, <iframe> regardless of origin.
       *
       * RFC -> https://tools.ietf.org/html/rfc7034
       */
      scope.network.app.use(httpApi.middleware.attachResponseHeader.bind(null, 'X-Frame-Options', 'DENY'));
      /* Set Content-Security-Policy headers.
       *
       * frame-ancestors - Defines valid sources for <frame>, <iframe>, <object>, <embed> or <applet>.
       *
       * W3C Candidate Recommendation -> https://www.w3.org/TR/CSP/
       */
      scope.network.app.use(httpApi.middleware.attachResponseHeader.bind(null, 'Content-Security-Policy', 'frame-ancestors \'none\''));

      scope.network.app.use(httpApi.middleware.applyAPIAccessRules.bind(null, scope.config));

      cb();
    }],

    ed: function (cb) {
      cb(null, require('./helpers/ed.js'));
    },
    accounts: function (cb) {
      cb(null, require('./helpers/accounts.js'));
    },
    bus: ['ed', function (scope, cb) {
      var changeCase = require('change-case');
      var bus = function () {
        this.message = function () {
          var args = [];
          Array.prototype.push.apply(args, arguments);
          var topic = args.shift();
          var eventName = 'on' + changeCase.pascalCase(topic);

          // executes the each module onBind function
          modules.forEach(function (module) {
            if (typeof (module[eventName]) === 'function') {
              module[eventName].apply(module[eventName], args);
            }
            if (module.submodules) {
              async.each(module.submodules, function (submodule) {
                if (submodule && typeof (submodule[eventName]) === 'function') {
                  submodule[eventName].apply(submodule[eventName], args);
                }
              });
            }
          });
        };
      };
      cb(null, new bus());
    }],
    db: function (cb) {
      var db = require('./helpers/database.js');
      db.connect(config.db, logger, cb);
    },
    /**
     * It tries to connect with redis server based on config. provided in config.json file
     * @param {function} cb
     */
    cache: function (cb) {
      var cache = require('./helpers/cache.js');
      cache.connect(config.cacheEnabled, config.cache, logger, cb);
    },
    /**
     * Once db, bus, schema and genesisblock are completed,
     * loads transaction, block, account and peers from logic folder.
     * @method logic
     * @param {object} scope - The results from current execution,
     * at least will contain the required elements.
     * @param {function} cb - Callback function.
     */
    logic: ['db', 'bus', 'schema', 'genesisblock', function (scope, cb) {
      var Transaction = require('./logic/transaction.js');
      var Chat = require('./logic/chat.js');
      var State = require('./logic/state.js');
      var Block = require('./logic/block.js');
      var Account = require('./logic/account.js');
      var Peers = require('./logic/peers.js');

      async.auto({
        bus: function (cb) {
          cb(null, scope.bus);
        },
        db: function (cb) {
          cb(null, scope.db);
        },
        ed: function (cb) {
          cb(null, scope.ed);
        },
        logger: function (cb) {
          cb(null, logger);
        },
        schema: function (cb) {
          cb(null, scope.schema);
        },
        genesisblock: function (cb) {
          cb(null, {
            block: genesisblock
          });
        },
        clientWs: function (cb) {
          cb(null, scope.clientWs);
        },
        account: ['db', 'bus', 'ed', 'schema', 'genesisblock', 'logger', function (scope, cb) {
          new Account(scope.db, scope.schema, scope.logger, cb);
        }],
        transaction: ['db', 'bus', 'ed', 'schema', 'genesisblock', 'account', 'logger', 'clientWs', function (scope, cb) {
          new Transaction(scope.db, scope.ed, scope.schema, scope.genesisblock, scope.account, scope.logger, scope.clientWs, cb);
        }],
        chat: ['db', 'bus', 'ed', 'schema', 'account', 'logger', function (scope, cb) {
          new Chat(scope.db, scope.ed, scope.schema, scope.account, scope.logger, cb);
        }],
        state: ['db', 'bus', 'ed', 'schema', 'account', 'logger', function (scope, cb) {
          new State(scope.db, scope.ed, scope.schema, scope.account, scope.logger, cb);
        }],
        block: ['db', 'bus', 'ed', 'schema', 'genesisblock', 'account', 'transaction', function (scope, cb) {
          new Block(scope.ed, scope.schema, scope.transaction, cb);
        }],
        peers: ['logger', function (scope, cb) {
          new Peers(scope.logger, cb);
        }]
      }, cb);
    }],
    /**
     * Once network, connect, config, logger, bus, sequence,
     * dbSequence, balancesSequence, db and logic are completed,
     * loads modules from `modules` folder using `config.modules`.
     * @method modules
     * @param {object} scope - The results from current execution,
     * at least will contain the required elements.
     * @param {nodeStyleCallback} cb - Callback function with resulted load.
     */
    modules: ['network', 'connect', 'config', 'logger', 'bus', 'sequence', 'dbSequence', 'balancesSequence', 'db', 'logic', 'cache', function (scope, cb) {
      var tasks = {};

      Object.keys(config.modules).forEach(function (name) {
        tasks[name] = function (cb) {
          var d = require('domain').create();

          d.on('error', function (err) {
            scope.logger.fatal('Domain ' + name, {
              message: err.message,
              stack: err.stack
            });
          });

          d.run(function () {
            logger.debug('Loading module', name);
            var Klass = require(config.modules[name]);
            var obj = new Klass(cb, scope);
            modules.push(obj);
          });
        };
      });

      async.parallel(tasks, function (err, results) {
        cb(err, results);
      });
    }],

    /**
     * Loads api from `api` folder using `config.api`, once modules, logger and
     * network are completed.
     * @method api
     * @param {object} scope - The results from current execution,
     * at least will contain the required elements.
     * @param {function} cb - Callback function.
     */
    api: ['modules', 'logger', 'network', function (scope, cb) {
      Object.keys(config.api).forEach(function (moduleName) {
        Object.keys(config.api[moduleName]).forEach(function (protocol) {
          var apiEndpointPath = config.api[moduleName][protocol];
          try {
            var ApiEndpoint = require(apiEndpointPath);
            new ApiEndpoint(scope.modules[moduleName], scope.network.app, scope.logger, scope.modules.cache);
          } catch (e) {
            scope.logger.error('Unable to load API endpoint for ' + moduleName + ' of ' + protocol, e);
          }
        });
      });

      scope.network.app.use(httpApi.middleware.errorLogger.bind(null, scope.logger));
      cb();
    }],

    ready: ['modules', 'bus', 'logic', function (scope, cb) {
      scope.bus.message('bind', scope.modules);
      scope.logic.transaction.bindModules(scope.modules);
      scope.logic.peers.bindModules(scope.modules);
      cb();
    }],

    /**
     * Once 'ready' is completed, binds and listens for connections on the
     * specified host and port for `scope.network.server`.
     * @method listen
     * @param {object} scope - The results from current execution,
     * at least will contain the required elements.
     * @param {nodeStyleCallback} cb - Callback function with `scope.network`.
     */
    listen: ['ready', function (scope, cb) {
      scope.network.server.listen(scope.config.port, scope.config.address, function (err) {
        scope.logger.info('ADAMANT started: ' + scope.config.address + ':' + scope.config.port);

        if (!err) {
          if (scope.config.ssl.enabled) {
            scope.network.https.listen(scope.config.ssl.options.port, scope.config.ssl.options.address, function (err) {
              scope.logger.info('ADAMANT https started: ' + scope.config.ssl.options.address + ':' + scope.config.ssl.options.port);

              cb(err, scope.network);
            });
          } else {
            cb(null, scope.network);
          }
        } else {
          cb(err, scope.network);
        }
      });
    }]
  }, function (err, scope) {
    if (err) {
      logger.fatal(err);
    } else {
      /**
       * Handles app instance (acts as global variable, passed as parameter).
       * @global
       * @typedef {Object} scope
       * @property {Object} api - Undefined.
       * @property {undefined} balancesSequence - Sequence function, sequence Array.
       * @property {string} build - Empty.
       * @property {Object} bus - Message function, bus constructor.
       * @property {Object} config - Configuration.
       * @property {undefined} connect - Undefined.
       * @property {Object} db - Database constructor, database functions.
       * @property {function} dbSequence - Database function.
       * @property {Object} ed - Crypto functions from ADAMANT node-sodium.
       * @property {Object} genesisblock - Block information.
       * @property {string} lastCommit - Hash transaction.
       * @property {Object} listen - Network information.
       * @property {Object} logger - Log functions.
       * @property {Object} logic - several logic functions and objects.
       * @property {Object} modules - Several modules functions.
       * @property {Object} network - Several network functions.
       * @property {string} nonce
       * @property {string} public - Path to ADAMANT public folder.
       * @property {undefined} ready
       * @property {Object} schema - ZSchema with objects.
       * @property {Object} sequence - Sequence function, sequence Array.
       * @todo logic repeats: bus, ed, genesisblock, logger, schema.
       * @todo description for nonce and ready
       */
      scope.logger.info('Modules ready and launched');
      /**
       * Event reporting a cleanup.
       * @event cleanup
       */
      /**
       * Receives a 'cleanup' signal and cleans all modules.
       * @listens cleanup
       */
      process.once('cleanup', function () {
        scope.logger.info('Cleaning up...');
        async.eachSeries(modules, function (module, cb) {
          if (typeof (module.cleanup) === 'function') {
            module.cleanup(cb);
          } else {
            setImmediate(cb);
          }
        }, function (err) {
          if (err) {
            scope.logger.error(err);
          } else {
            scope.logger.info('Cleaned up successfully');
          }
          process.exit(1);
        });
      });

      /**
       * Event reporting a SIGTERM.
       * @event SIGTERM
       */
      /**
       * Receives a 'SIGTERM' signal and emits a cleanup.
       * @listens SIGTERM
       */
      process.once('SIGTERM', function () {
        /**
         * emits cleanup once 'SIGTERM'.
         * @emits cleanup
         */
        process.emit('cleanup');
      });

      /**
       * Event reporting an exit.
       * @event exit
       */
      /**
       * Receives an 'exit' signal and emits a cleanup.
       * @listens exit
       */
      process.once('exit', function () {
        /**
         * emits cleanup once 'exit'.
         * @emits cleanup
         */
        process.emit('cleanup');
      });

      /**
       * Event reporting a SIGINT.
       * @event SIGINT
       */
      /**
       * Receives a 'SIGINT' signal and emits a cleanup.
       * @listens SIGINT
       */
      process.once('SIGINT', function () {
        /**
         * emits cleanup once 'SIGINT'.
         * @emits cleanup
         */
        process.emit('cleanup');
      });
    }
  });
});

/**
 * Event reporting an uncaughtException.
 * @event uncaughtException
 */
/**
 * Receives a 'uncaughtException' signal and emits a cleanup.
 * @listens uncaughtException
 */
process.on('uncaughtException', function (err) {
  // Handle error safely
  logger.fatal('System error', {
    message: err.message,
    stack: err.stack
  });
  /**
   * emits cleanup once 'uncaughtException'.
   * @emits cleanup
   */
  process.emit('cleanup');
});
