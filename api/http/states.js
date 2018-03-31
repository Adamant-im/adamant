'use strict';

var Router = require('../../helpers/router');
var httpApi = require('../../helpers/httpApi');


/**
 * Binds api with modules and creates common url.
 * - End point: `/api/states`
 * - Private API:
 * 	- post	/normalize
 * 	- post	/finalize
 *
 * - Sanitized
 * 	- get	/get
 * @memberof module:states
 * @requires helpers/Router
 * @requires helpers/httpApi
 * @constructor
 * @param {Object} statesModule - Module storing options state
 * @param {scope} app - Network app.
 */
// Constructor
function StatesHttpApi (statesModule, app) {

    var router = new Router();

    router.map(statesModule.internal, {
        'get /get': 'getTransactions',
        'post /normalize': 'normalize',
        'post /store': 'store'
    });


    httpApi.registerEndpoint('/api/states', app, router, statesModule.isLoaded);
}

module.exports = StatesHttpApi;
