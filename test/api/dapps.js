'use strict';

var node = require('./../node.js');

var removedRoutes = [
  { method: 'put', path: '/api/dapps' },
  { method: 'put', path: '/api/dapps/transaction' },
  { method: 'put', path: '/api/dapps/withdrawal' },
  { method: 'post', path: '/api/dapps/install' },
  { method: 'post', path: '/api/dapps/launch' },
  { method: 'post', path: '/api/dapps/stop' },
  { method: 'post', path: '/api/dapps/uninstall' },
  { method: 'get', path: '/api/dapps/installed' },
  { method: 'get', path: '/api/dapps/installedIds' },
  { method: 'get', path: '/api/dapps/installing' },
  { method: 'get', path: '/api/dapps/uninstalling' },
  { method: 'get', path: '/api/dapps/launched' },
  { method: 'get', path: '/api/dapps/ismasterpasswordenabled' },
  { method: 'get', path: '/api/dapps/1/api/status' }
];

describe('DApp HTTP API', function () {
  var unknownResponse;

  before(async function () {
    unknownResponse = await request('get', '/api/dapps/not-a-route');
  });

  removedRoutes.forEach(function (route) {
    it('should treat ' + route.method.toUpperCase() + ' ' + route.path + ' as an unknown route', async function () {
      var response = await request(route.method, route.path, {
        id: '1',
        secret: 'must-not-be-used',
        master: 'must-not-be-used'
      });

      node.expect(response.status).to.equal(unknownResponse.status);
      node.expect(response.body).to.deep.equal(unknownResponse.body);
    });
  });

  it('should retain the read-only categories endpoint', async function () {
    var response = await request('get', '/api/dapps/categories');

    node.expect(response.status).to.equal(200);
    node.expect(response.body).to.have.property('success').to.be.true;
    node.expect(response.body).to.have.property('categories').that.is.an('object');
  });

  it('should retain database-backed DApp listings', async function () {
    var response = await request('get', '/api/dapps');

    node.expect(response.status).to.equal(200);
    node.expect(response.body).to.have.property('success').to.be.true;
    node.expect(response.body).to.have.property('dapps').that.is.an('array');
  });
});

function request (method, path, body) {
  var pending = node.api[method](path)
      .set('Accept', 'application/json')
      .set('version', node.version)
      .set('nethash', node.config.nethash)
      .set('ip', '0.0.0.0')
      .set('port', node.config.port);

  if (body) {
    pending.send(body);
  }

  return pending;
}
