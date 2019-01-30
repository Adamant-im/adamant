'use strict';

const Router = require('../../helpers/router');
const httpApi = require('../../helpers/httpApi');

/**
 * Binds api with modules and creates common url.
 * - End point: `/api/chatrooms`
 *
 * - Sanitized
 * 	- get	/:ID
 * 	- get	/:ID/:ID
 * @memberof module:chatrooms
 * @requires helpers/Router
 * @requires helpers/httpApi
 * @constructor
 * @param {Object} chatroomsModule - Module chats instance.
 * @param {scope} app - Network app.
 */
// Constructor
function ChatroomsHttpApi (chatroomsModule, app) {

    const router = new Router();

    router.map(chatroomsModule.internal, {
        'get /U*/U*': 'getMessages',
        'get /U*': 'getChats',
    });


    httpApi.registerEndpoint('/api/chatrooms', app, router, chatroomsModule.isLoaded);
}

module.exports = ChatroomsHttpApi;