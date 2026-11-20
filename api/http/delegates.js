'use strict';

var Router = require('../../helpers/router');
var httpApi = require('../../helpers/httpApi');

/**
 * Binds api with modules and creates common url.
 * - End point: `/api/delegates`
 * - Public API:
  - get   /count
  - get   /search
  - get   /voters
  - get   /get
  - get   /
  - get   /forging/getForgedByAccount
   - post  /
  - get  /getNextForgers
 * @memberof module:delegates
 * @requires helpers/Router
 * @requires helpers/httpApi
 * @constructor
 * @param {object} delegatesModule - Module delegate instance.
 * @param {scope} app - Network app.
 * @param {Logger} logger - Application logger.
 * @param {Cache} cache - API response cache.
 */
// Constructor
function DelegatesHttpApi (delegatesModule, app, logger, cache) {
  var router = new Router();

  // attach a middlware to endpoints
  router.attachMiddlwareForUrls(httpApi.middleware.useCache.bind(null, logger, cache), ['get /']);

  router.map(delegatesModule.shared, {
    'get /count': 'count',
    'get /search': 'search',
    'get /voters': 'getVoters',
    'get /get': 'getDelegate',
    'get /': 'getDelegates',
    'get /forging/getForgedByAccount': 'getForgedByAccount',
    'post /': 'registerDelegate',
    'get /getNextForgers': 'getNextForgers'
  });

  httpApi.registerEndpoint('/api/delegates', app, router, delegatesModule.isLoaded);
}

module.exports = DelegatesHttpApi;
