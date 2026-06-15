'use strict';

var Router = require('../../helpers/router');
var httpApi = require('../../helpers/httpApi');

/**
 * Renders main page wallet from public folder.
 * - Public API:
 *   - get  /
 * @memberof module:server
 * @requires helpers/Router
 * @requires helpers/httpApi
 * @constructor
 * @param {object} serverModule - Module server instance.
 * @param {scope} app - Main app.
 */
// Constructor
function ServerHttpApi (serverModule, app) {
  var router = new Router();

  router.use(function (req, res, next) {
    if (serverModule.areModulesReady()) { return next(); }
    res.status(500).send({ success: false, error: 'Blockchain is loading' });
  });

  router.use(function (req, res, next) {
    if (req.url.indexOf('/api/') === -1 && req.url.indexOf('/peer/') === -1) {
      return res.status(404).send({ success: false, error: 'API endpoint not found' });
    }
    next();
  });

  app.use('/', router);
}

module.exports = ServerHttpApi;
