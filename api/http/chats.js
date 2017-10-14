'use strict';

var Router = require('../../helpers/router');
var httpApi = require('../../helpers/httpApi');
var schema = require('../../schema/dapps');

/**
 * Binds api with modules and creates common url.
 * - End point: `/api/chats`
 * - Private API:
 * 	- post	/normalize
 * 	- post	/finalize
 *
 * - Sanitized
 * 	- get	/
 * 	- put	/
 * 	- get	/get
 * @memberof module:chats
 * @requires helpers/Router
 * @requires helpers/httpApi
 * @constructor
 * @param {Object} chatsModule - Module chats instance.
 * @param {scope} app - Network app.
 */
// Constructor
function ChatsHttpApi (chatsModule, app) {

    var router = new Router();

    router.map(chatsModule.internal, {
        'get /senders': 'senders',
        'get /get': 'getTransactions',
        'get /messages': 'messages',
        'post /normalize': 'normalize',
        'post /process': 'process'
    });


    httpApi.registerEndpoint('/api/chats', app, router, chatsModule.isLoaded);
}

module.exports = ChatsHttpApi;
