'use strict';

var Router = require('../../helpers/router');
var httpApi = require('../../helpers/httpApi');

/**
 * Binds api with modules and creates common url.
 * - End point: `/api/signatures`
 * - Public API:
 *   - get  /fee
 *   - put  /
 * @memberof module:signatures
 * @requires helpers/Router
 * @requires helpers/httpApi
 * @constructor
 * @param {Object} signaturesModule - Module signatures instance.
 * @param {scope} app - Network app.
 */
// Constructor
function SignaturesHttpApi (signaturesModule, app) {
  var router = new Router();

  router.all('*', (req, res) => {
    res.status(404).send({
      success: false,
      error: 'API endpoint not found',
    });
  });

  router.map(signaturesModule.shared, {
    'get /fee': 'getFee',
    'put /': 'addSignature'
  });

  httpApi.registerEndpoint('/api/signatures', app, router, signaturesModule.isLoaded);
}

module.exports = SignaturesHttpApi;
