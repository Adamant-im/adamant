'use strict';

var _ = require('lodash');
var async = require('async');
var constants = require('../helpers/constants.js');
var jobsQueue = require('../helpers/jobsQueue.js');
var extend = require('extend');
var pgp = require('pg-promise')(); // We also initialize library here
var schema = require('../schema/node.js');
var BlockReward = require('../logic/blockReward.js');
var util = require('util');

// Private fields
var modules, library, self, __private = {}, shared = {};

__private.blockReward = new BlockReward();

/**
 * Initializes library with scope content.
 * @memberof module:node
 * @class
 * @classdesc Main node methods.
 * @param {function} cb - Callback function.
 * @param {scope} scope - App instance.
 * @return {setImmediateCallback} Callback function with `self` as data.
 */
// Constructor
function Node (cb, scope) {
	library = {
		logger: scope.logger,
		db: scope.db,
		schema: scope.schema,
		bus: scope.bus,
		nonce: scope.nonce,
		build: scope.build,
        logic: scope.logic,
		lastCommit: scope.lastCommit,
		config: {
			peers: scope.config.peers,
			version: scope.packageJson.version,
            wsClient: scope.config.wsClient
		},
	};
	self = this;

	setImmediate(cb, null, self);
}

// Private methods


// Public methods

// Events
/**
 * assigns scope to modules variable
 * @param {modules} scope
 */
Node.prototype.onBind = function (scope) {
	modules = {
		blocks: scope.blocks,
		transport: scope.transport,
		system: scope.system
	};
};

/**
 * Triggers onPeersReady after:
 * - Ping to every member of peers list.
 * - Load peers from database and checks every peer state and updated time.
 * - Discover peers by getting list and validates them.
 */
Node.prototype.onBlockchainReady = function () {
};


/**
 * Checks if `modules` is loaded.
 * @return {boolean} True if `modules` is loaded.
 */
Node.prototype.isLoaded = function () {
	return !!modules;
};

// Shared API
/**
 * @todo implement API comments with apidoc.
 * @see {@link http://apidocjs.com/}
 */
Node.prototype.shared = {

	/*
	 * Returns information about node status
	 *
	 * @public
	 * @async
	 * @method status
	 * @param  {Object}   req HTTP request object
	 * @param  {Function} cb Callback function
	 * @return {Function} cb Callback function from params (through setImmediate)
	 * @return {Object}   cb.err Always return `null` here
	 * @return {Object}   cb.obj Anonymous object with version info
	 * @return {Object}   cb.obj.network Anonymous object with network info
	 * @return {Object}   cb.obj.wsClient Anonymous object with WebSocket Client info
	 * @return {Boolean}  cb.obj.wsClient.enabled are webSockets available.
	 * @return {Object}   cb.obj.version Anonymous object with version info
	 * @return {String}   cb.obj.version.build Build information (if available, otherwise '')
	 * @return {String}   cb.obj.version.commit Hash of last git commit (if available, otherwise '')
	 * @return {String}   cb.obj.version.version ADAMANT version from package.json
	 */
    getStatus: function (req, cb) {
        var lastBlock = modules.blocks.lastBlock.get();
        var wsClientOptions = {
            enabled: false
        };
        if (library.config.wsClient) {
            if (library.config.wsClient.enabled) {
                wsClientOptions.enabled = true;
                wsClientOptions.port = library.config.wsClient.portWS;
            }
        }
        return setImmediate(cb, null,
            {
            	network: {
                    broadhash: modules.system.getBroadhash(),
                    epoch: constants.epochTime,
                    height: lastBlock.height,
                    fee: library.logic.block.calculateFee(),
                    milestone: __private.blockReward.calcMilestone(lastBlock.height),
                    nethash: modules.system.getNethash(),
                    reward: __private.blockReward.calcReward(lastBlock.height),
                    supply: __private.blockReward.calcSupply(lastBlock.height)
				},
            	version: {
                    build: library.build,
                    commit: library.lastCommit,
                    version: library.config.version
                },
                wsClient: wsClientOptions
            });
    }
};

// Export
module.exports = Node;
