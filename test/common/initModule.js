'use strict';

var express = require('express');
var path = require('path');
var randomString = require('randomstring');

var _ = require('lodash');

var async = require('async');
var dirname = path.join(__dirname, '..', '..');
var config = require(path.join(dirname, 'test/config.json')); // use Testnet config
var packageJson = require(path.join(dirname, '/package.json'));
var database = require(path.join(dirname, '/helpers', 'database.js'));
var genesisblock = require(path.join(dirname, 'test/genesisBlock.json')); // use Testnet genesisBlock
var Logger = require(dirname + '/logger.js');
var z_schema = require('../../helpers/z_schema.js');
var cacheHelper = require('../../helpers/cache.js');
var Cache = require('../../modules/cache.js');
var ed = require('../../helpers/ed');
var Transaction = require('../../logic/transaction.js');
var Account = require('../../logic/account.js');
var accounts = require('../../helpers/accounts');
var Sequence = require('../../helpers/sequence.js');
const { removeQueuedJobs } = require('../common/globalAfter.js');

var modulesLoader = new function () {
  this.db = null;
  this.logger = new Logger({ echo: null, errorLevel: config.fileLogLevel, filename: config.logFileName });
  this.scope = {
    config: config,
    packageJson: packageJson,
    genesisblock: { block: genesisblock },
    logger: this.logger,
    balancesSequence: new Sequence(),
    network: {
      app: express()
    },
    public: '../../public',
    schema: new z_schema(),
    ed: ed,
    accounts: accounts,
    bus: {
      message: function () {}
    },
    nonce: randomString.generate(16)
  };

  /**
   * Initializes Logic class with params
   *
   * @param {Function} Logic
   * @param {Object} scope
   * @param {Function} cb
   */
  this.initLogic = function (Logic, scope, cb) {
    switch (Logic.name) {
      case 'Account':
        new Logic(scope.db, scope.schema, scope.logger, cb);
        break;
      case 'Transaction':
        async.series({
          account: function (cb) {
            new Account(scope.db, scope.schema, scope.logger, cb);
          }
        }, function (err, result) {
          // null is for clientWs
          new Logic(scope.db, scope.ed, scope.schema, scope.genesisblock, result.account, scope.logger, null, cb);
        });
        break;
      case 'Block':
        async.waterfall([
          function (waterCb) {
            return new Account(scope.db, scope.schema, scope.logger, waterCb);
          },
          function (account, waterCb) {
            // null is for clientWs
            return new Transaction(scope.db, scope.ed, scope.schema, scope.genesisblock, account, scope.logger, null, waterCb);
          }
        ], function (err, transaction) {
          new Logic(scope.ed, scope.schema, transaction, cb);
        });
        break;
      case 'Peers':
        new Logic(scope.logger, cb);
        break;
      case 'State':
        async.series({
          account: function (cb) {
            new Account(scope.db, scope.schema, scope.logger, cb);
          }
        }, function (err, result) {
          new Logic(scope.db, scope.ed, scope.schema, result.account, scope.logger, cb);
        });
        break;
      default:
        console.log('no Logic case initLogic');
    }
  };

  /**
   * Initializes Module class with params
   *
   * @param {Function} Module
   * @param {Object} scope
   * @param {Function} cb
   */
  this.initModule = function (Module, scope, cb) {
    return new Module(cb, scope);
  };

  /**
   * Initializes multiple Modules
   *
   * @param {Array<{name: Module}>} modules
   * @param {Array<{name: Logic}>} logic
   * @param {Object>} scope
   * @param {Function} cb
   */
  this.initModules = function (modules, logic, scope, cb) {
    async.waterfall([
      function (waterCb) {
        this.getDbConnection(waterCb);
      }.bind(this),
      function (db, waterCb) {
        scope = _.merge(this.scope, { db: db }, scope);
        async.reduce(logic, {}, function (memo, logicObj, mapCb) {
          var name = _.keys(logicObj)[0];
          return this.initLogic(logicObj[name], scope, function (err, initializedLogic) {
            memo[name] = initializedLogic;
            return mapCb(err, memo);
          });
        }.bind(this), waterCb);
      }.bind(this),
      function (logic, waterCb) {
        scope = _.merge(this.scope, { logic: { ...logic, ...scope.logic } }, scope);
        async.reduce(modules, {}, function (memo, moduleObj, mapCb) {
          var name = _.keys(moduleObj)[0];
          return this.initModule(moduleObj[name], scope, function (err, module) {
            memo[name] = module;
            return mapCb(err, memo);
          });
        }.bind(this), waterCb);
      }.bind(this),

      function (modules, waterCb) {
        _.each(scope.logic, function (logic) {
          if (typeof logic.bind === 'function') {
            logic.bind({ modules: modules });
          }
          if (typeof logic.bindModules === 'function') {
            logic.bindModules(modules);
          }
        });
        waterCb(null, modules);
      }
    ], cb);
  };

  /**
   * Initializes all created Modules in directory
   *
   * @param {Function} cb
   * @param {object} [scope={}] scope
   */
  this.initAllModules = function (cb, scope) {
    this.initModules([
      { accounts: require('../../modules/accounts') },
      { blocks: require('../../modules/blocks') },
      { crypto: require('../../modules/crypto') },
      { delegates: require('../../modules/delegates') },
      { loader: require('../../modules/loader') },
      { multisignatures: require('../../modules/multisignatures') },
      { peers: require('../../modules/peers') },
      { rounds: require('../../modules/rounds') },
      { server: require('../../modules/server') },
      { signatures: require('../../modules/signatures') },
      { sql: require('../../modules/sql') },
      { system: require('../../modules/system') },
      { transactions: require('../../modules/transactions') },
      { transport: require('../../modules/transport') },
    ], [
      { 'transaction': require('../../logic/transaction') },
      { 'account': require('../../logic/account') },
      { 'block': require('../../logic/block') },
      { 'peers': require('../../logic/peers.js') }
    ], scope || {}, cb);
  };

  /**
   * Initializes Module class with basic conf
   *
   * @param {Function} Module
   * @param {Function} cb
   * @param {Object=} scope
   */
  this.initModuleWithDb = function (Module, cb, scope) {
    this.initWithDb(Module, this.initModule, cb, scope);
  };

  /**
   * Initializes Logic class with basic conf
   *
   * @param {Function} Logic
   * @param {Function} cb
   * @param {Object=} scope
   */
  this.initLogicWithDb = function (Logic, cb, scope) {
    this.initWithDb(Logic, this.initLogic, cb, scope);
  };

  /**
   * Accepts Class to invoke (Logic or Module) and fills the scope with basic conf
   *
   * @param {Function} Klass
   * @param {Function} moduleConstructor
   * @param {Function} cb
   * @param {Object=} scope
   */
  this.initWithDb = function (Klass, moduleConstructor, cb, scope) {
    this.getDbConnection(function (err, db) {
      if (err) {
        return cb(err);
      }

      moduleConstructor(Klass, _.merge(this.scope, { db: db }, scope), cb);
    }.bind(this));
  };

  /**
   * Starts and returns db connection
   *
   * @param {Function} cb
   */
  this.getDbConnection = function (cb) {
    if (this.db) {
      return cb(null, this.db);
    }
    database.connect(config.db, this.logger, function (err, db) {
      if (err) {
        return cb(err);
      }
      this.db = db;
      cb(null, this.db);
    }.bind(this));
  };

  /**
   * Initializes Cache module
   * @param {Function} cb
   */
  this.initCache = function (cb) {
    var cacheEnabled, cacheConfig;
    cacheEnabled = this.scope.config.cacheEnabled;
    cacheConfig = this.scope.config.redis;
    cacheHelper.connect(cacheEnabled, cacheConfig, this.logger, function (err, __cache) {
      if (err) {
        cb(err, __cache);
      } else {
        this.initModule(Cache, _.merge(this.scope, { cache: __cache }), cb);
      }
    }.bind(this));
  };
};

afterEach(() =>
  removeQueuedJobs()
)

module.exports = {
  modulesLoader: modulesLoader
};
