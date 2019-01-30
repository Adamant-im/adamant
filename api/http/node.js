'use strict';

var Router = require('../../helpers/router');
var httpApi = require('../../helpers/httpApi');
var schema = require('../../schema/node.js');

/**
 * Binds api with modules and creates common url.
 * - End point: `/api/node`
 * - Public API:
	- get 	/status
 * @memberof module:node
 * @requires helpers/Router
 * @requires helpers/httpApi
 * @constructor
 * @param {Object} nodeModule - Module node instance.
 * @param {scope} app - Network app.
 */

function NodeHttpApi (nodeModule, app) {

	var router = new Router();

	router.map(nodeModule.shared, {
		'get /status': 'getStatus',
	});


	httpApi.registerEndpoint('/api/node', app, router, nodeModule.isLoaded);
}

module.exports = NodeHttpApi;
