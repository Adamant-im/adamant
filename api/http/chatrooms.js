'use strict';

const Router = require('../../helpers/router');
const httpApi = require('../../helpers/httpApi');

/**
 * Binds api with modules and creates common url.
 * - End point: `/api/chatrooms`
 *
 * - Sanitized
 *   - get  /:ID
 *   - get  /:ID/:ID
 * @memberof module:chatrooms
 * @requires helpers/Router
 * @requires helpers/httpApi
 * @constructor
 * @param {object} chatroomsModule - Module chats instance.
 * @param {scope} app - Network app.
 */
// Constructor
function ChatroomsHttpApi (chatroomsModule, app) {
  const router = new Router({ caseSensitive: false });

  router.map(chatroomsModule.internal, {
    'get /U:address1/U:address2': 'getMessages',
    'get /U:address': 'getChats'
  });


  httpApi.registerEndpoint('/api/chatrooms', app, router, chatroomsModule.isLoaded);
}

module.exports = ChatroomsHttpApi;
