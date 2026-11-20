'use strict';

var crypto = require('crypto');
var fs = require('fs');
var node = require('./../node.js');
var path = require('path');

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

  it('should reject the retired installed search filter explicitly', async function () {
    var response = await request('get', '/api/dapps/search?q=live&installed=1');

    node.expect(response.status).to.equal(200);
    node.expect(response.body).to.have.property('success').to.be.false;
    node.expect(response.body).to.have.property('error').to.equal('The installed filter is no longer supported');
  });

  it('should retain normal database-backed DApp searches', async function () {
    var response = await request('get', '/api/dapps/search?q=live');

    node.expect(response.status).to.equal(200);
    node.expect(response.body).to.have.property('success').to.be.true;
    node.expect(response.body).to.have.property('dapps').that.is.an('array');
  });

  it('should never serve retired public DApp content', async function () {
    var publicPath = path.join(__dirname, '..', '..', 'public');
    var publicDappsPath = path.join(publicPath, 'dapps');
    var createdDappsPath = false;
    var fixtureName = [
      'retired-content-test-',
      crypto.randomBytes(8).toString('hex'),
      '.txt'
    ].join('');
    var testFile = path.join(publicDappsPath, fixtureName);
    var paths = [
      '/dapps/' + fixtureName,
      '/%64apps/' + fixtureName,
      '/dapps%2F' + fixtureName
    ];

    node.expect(fs.lstatSync(publicPath).isDirectory()).to.equal(true);

    if (!fs.existsSync(publicDappsPath)) {
      fs.mkdirSync(publicDappsPath);
      createdDappsPath = true;
    } else {
      node.expect(fs.lstatSync(publicDappsPath).isDirectory()).to.equal(true);
      node.expect(fs.lstatSync(publicDappsPath).isSymbolicLink()).to.equal(false);
    }

    fs.writeFileSync(testFile, 'must not be served', { flag: 'wx' });

    try {
      var responses = await Promise.all(paths.map(function (retiredPath) {
        return request('get', retiredPath);
      }));

      responses.forEach(function (response) {
        node.expect(response.status).to.equal(404);
      });
    } finally {
      fs.rmSync(testFile, { force: true });
      if (createdDappsPath) {
        try {
          fs.rmdirSync(publicDappsPath);
        } catch (error) {
          if (error.code !== 'ENOTEMPTY' && error.code !== 'ENOENT') {
            throw error;
          }
        }
      }
    }
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
