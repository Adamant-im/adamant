'use strict';

const { expect } = require('chai');
const cors = require('cors');
const express = require('express');
const http = require('http');
const net = require('net');
const request = require('supertest');
const sinon = require('sinon');

const corsOptions = require('../../../helpers/cors-options.js');
const RequestLimiter = require('../../../helpers/request-limiter.js');
const ZSchema = require('../../../helpers/z_schema.js');
const configSchema = require('../../../schema/config.js');

describe('RequestLimiter', () => {
  /**
   * @type {express.Express}
   */
  let app;

  beforeEach(() => {
    app = express();
  });

  describe('when config.trustProxy is `undefined`', () => {
    it('should not enable trust proxy', () => {
      RequestLimiter(app, {});
      expect(app.enabled('trust proxy')).to.be.false;
    });
  });

  describe('when config.trustProxy set to `false`', () => {
    it('should not enable trust proxy', () => {
      RequestLimiter(app, { trustProxy: false });
      expect(app.enabled('trust proxy')).to.be.false;
    });
  });

  describe('when config.trustProxy set to `true`', () => {
    it('should enable trust proxy', () => {
      RequestLimiter(app, { trustProxy: true });
      expect(app.enabled('trust proxy')).to.be.true;
      expect(app.get('trust proxy')).to.equal(1);
    });
  });

  describe('when limits are `undefined`', () => {
    let limiter;

    beforeEach(() => {
      limiter = RequestLimiter(app, {});
    });

    it('should return the default client limits', () => {
      expect(limiter)
          .to.be.an('object')
          .that.has.property('client')
          .that.is.an('object');
      expect(limiter.client).to.have.property('delayAfter').to.equal(1000);
      expect(limiter.client).to.have.property('delayMs').that.is.a('function');
      expect(limiter.client).to.have.property('max').to.equal(15300);
      expect(limiter.client).to.have.property('limit').to.equal(15300);
      expect(limiter.client).to.have.property('windowMs').to.equal(60000);
      expect(limiter.client.delayMs(100)).to.equal(0);
      expect(limiter.client.delayMs(1001)).to.equal(25);
      expect(limiter.client.routes.publish.limit).to.equal(300);
      expect(limiter.client.routes.status.limit).to.equal(12000);
    });

    it('should return the default peer limits', () => {
      expect(limiter)
          .to.be.an('object')
          .that.has.property('peer')
          .that.is.an('object');
      expect(limiter.peer).to.have.property('delayAfter').to.equal(6000);
      expect(limiter.peer).to.have.property('delayMs').that.is.a('function');
      expect(limiter.peer).to.have.property('max').to.equal(44000);
      expect(limiter.peer).to.have.property('limit').to.equal(44000);
      expect(limiter.peer).to.have.property('windowMs').to.equal(60000);
      expect(limiter.peer.delayMs(100)).to.equal(0);
      expect(limiter.peer.routes.sync.limit).to.equal(12000);
      expect(limiter.peer.routes.sync.delayAfter).to.equal(8000);
      expect(limiter.peer.routes.status.limit).to.equal(20000);
    });

    it('should enable the client middleware', () => {
      expect(limiter)
          .to.be.an('object')
          .that.has.property('middleware')
          .that.is.an('object');
      expect(limiter.middleware)
          .to.have.property('client')
          .that.is.a('function');
    });

    it('should enable the peer middleware', () => {
      expect(limiter)
          .to.be.an('object')
          .that.has.property('middleware')
          .that.is.an('object');
      expect(limiter.middleware).to.have.property('peer').that.is.a('function');
    });
  });

  describe('when limits are defined', () => {
    let limits;
    let options;
    let limiter;

    beforeEach(() => {
      limits = {
        max: 5,
        delayMs: 2,
        delayAfter: 3,
        windowMs: 4
      };
      options = { options: { limits: limits } };
      limiter = RequestLimiter(app, { api: options, peers: options });
    });

    it('should return the defined client limits', () => {
      expect(limiter)
          .to.be.an('object')
          .that.has.property('client')
          .that.is.an('object');
      expect(limiter.client).to.have.property('delayMs').that.is.a('function');
      expect(limiter.client).to.have.property('max').to.equal(5);
      expect(limiter.client).to.have.property('limit').to.equal(5);
      expect(limiter.client).to.have.property('delayAfter').to.equal(3);
      expect(limiter.client).to.have.property('windowMs').to.equal(4);
      expect(limiter.client.delayMs(4)).to.equal(2);
    });

    it('should return the defined peer limits', function () {
      expect(limiter)
          .to.be.an('object')
          .that.has.property('peer')
          .that.is.an('object');
      expect(limiter.peer).to.have.property('delayMs').that.is.a('function');
      expect(limiter.peer).to.have.property('max').to.equal(5);
      expect(limiter.peer).to.have.property('delayAfter').to.equal(3);
      expect(limiter.peer).to.have.property('windowMs').to.equal(4);
      expect(limiter.peer.delayMs(4)).to.equal(2);
    });

    it('should enable the client middleware', function () {
      expect(limiter)
          .to.be.an('object')
          .that.has.property('middleware')
          .that.is.an('object');
      expect(limiter.middleware)
          .to.have.property('client')
          .that.is.a('function');
    });

    it('should enable the peer middleware', function () {
      expect(limiter)
          .to.be.an('object')
          .that.has.property('middleware')
          .that.is.an('object');
      expect(limiter.middleware).to.have.property('peer').that.is.a('function');
    });

    it('should keep the delay calculation independent from its receiver', () => {
      const delayMs = limiter.client.delayMs;
      expect(delayMs(4)).to.equal(2);
    });
  });

  it('should enforce max when slow-down is disabled', async () => {
    RequestLimiter(app, {
      api: {
        options: {
          limits: {
            max: 1,
            delayAfter: 0,
            delayMs: 0,
            windowMs: 60000
          }
        }
      }
    });
    app.get('/api/test', (req, res) => res.sendStatus(200));

    await request(app).get('/api/test').expect(200);
    await request(app).get('/api/test').expect(429);
  });

  it('should not apply a hard limit when max is disabled', async () => {
    RequestLimiter(app, {
      api: {
        options: {
          limits: {
            max: 0,
            delayAfter: 1,
            delayMs: 0,
            windowMs: 60000
          }
        }
      }
    });
    app.get('/api/test', (req, res) => res.sendStatus(200));

    for (let i = 0; i < 6; i++) {
      await request(app).get('/api/test').expect(200);
    }
  });

  it('should prefer limit over legacy max', async () => {
    RequestLimiter(app, {
      api: {
        options: {
          limits: {
            limit: 1,
            max: 50,
            delayAfter: 0,
            delayMs: 0,
            windowMs: 60000
          }
        }
      }
    });
    app.get('/api/test', (req, res) => res.sendStatus(200));

    await request(app).get('/api/test').expect(200);
    const limited = await request(app).get('/api/test').expect(429);

    expect(limited.body).to.deep.equal({
      success: false,
      error: 'Too many requests, please try again later.'
    });
    expect(limited.headers).to.have.property('retry-after');
    expect(limited.headers).to.have.property('ratelimit-limit', '1');
    expect(limited.headers).not.to.have.property('x-ratelimit-limit');
  });

  it('should disable a surface when limit is 0, including route policies', async () => {
    RequestLimiter(app, {
      api: {
        options: {
          limits: {
            limit: 0,
            max: 1,
            delayAfter: 0,
            delayMs: 0,
            windowMs: 60000,
            routes: {
              publish: {
                limit: 1,
                delayAfter: 0,
                delayMs: 0
              }
            }
          }
        }
      }
    });
    app.post('/api/transactions', (req, res) => res.sendStatus(200));

    for (let i = 0; i < 4; i++) {
      await request(app).post('/api/transactions').send({ transaction: null }).expect(200);
    }
  });

  it('should keep separate budgets for status, read, publish, sync, and broadcast', async () => {
    RequestLimiter(app, {
      api: {
        options: {
          limits: {
            limit: 10,
            delayAfter: 0,
            delayMs: 0,
            windowMs: 60000,
            routes: {
              status: { limit: 2, delayAfter: 0, delayMs: 0 },
              read: { limit: 2, delayAfter: 0, delayMs: 0 },
              publish: { limit: 1, delayAfter: 0, delayMs: 0 }
            }
          }
        }
      },
      peers: {
        options: {
          limits: {
            limit: 10,
            delayAfter: 0,
            delayMs: 0,
            windowMs: 60000,
            routes: {
              status: { limit: 2, delayAfter: 0, delayMs: 0 },
              sync: { limit: 3, delayAfter: 0, delayMs: 0 },
              broadcast: { limit: 1, delayAfter: 0, delayMs: 0 }
            }
          }
        }
      }
    });
    app.use('/api/', (req, res) => res.sendStatus(200));
    app.use('/peer/', (req, res) => res.sendStatus(200));

    await request(app).get('/api/loader/status').expect(200);
    await request(app).get('/api/node/status').expect(200);
    await request(app).get('/api/loader/status/ping').expect(429);
    await request(app).get('/api/transactions').expect(200);
    await request(app).get('/api/blocks').expect(200);
    await request(app).get('/api/delegates').expect(429);
    await request(app).post('/api/transactions').send({}).expect(200);
    await request(app).post('/api/transactions').send({ not: 'a transaction' }).expect(429);

    const capable = {};
    capable[RequestLimiter.peerRateLimitHeader] = RequestLimiter.peerRateLimitVersion;

    await request(app).get('/peer/ping').set(capable).expect(200);
    await request(app).get('/peer/height').set(capable).expect(200);
    await request(app).get('/peer/list').set(capable).expect(429);
    await request(app).get('/peer/blocks').set(capable).expect(200);
    await request(app).get('/peer/blocks/common').set(capable).expect(200);
    await request(app).get('/peer/transactions').set(capable).expect(200);
    await request(app).get('/peer/blocks').set(capable).expect(429);
    await request(app).post('/peer/transactions').set(capable).send({ transaction: '{' }).expect(200);
    await request(app).post('/peer/blocks').set(capable).send({ block: null }).expect(429);
  });

  it('should negotiate peer hard limits with upgraded callers only', async () => {
    RequestLimiter(app, {
      peers: {
        options: {
          limits: {
            limit: 1,
            delayAfter: 0,
            delayMs: 0,
            windowMs: 60000
          }
        }
      }
    });
    app.get('/peer/height', (req, res) => res.sendStatus(200));

    for (let i = 0; i < 3; i++) {
      await request(app).get('/peer/height').expect(200);
    }

    const capable = {};
    capable[RequestLimiter.peerRateLimitHeader] = RequestLimiter.peerRateLimitVersion;

    await request(app).get('/peer/height').set(capable).expect(200);
    const limited = await request(app).get('/peer/height').set(capable).expect(429);

    expect(limited.headers['ratelimit-scope']).to.equal('all');
  });

  it('should not bill CORS preflight against the shared bucket', async () => {
    RequestLimiter(app, {
      api: {
        options: {
          limits: {
            max: 1,
            delayAfter: 0,
            delayMs: 0,
            windowMs: 60000
          }
        }
      }
    });
    app.use('/api/', (req, res) => res.sendStatus(200));

    await request(app).options('/api/transactions').expect(200);
    await request(app).options('/api/transactions').expect(200);
    await request(app).get('/api/transactions').expect(200);
    await request(app).get('/api/transactions').expect(429);
  });

  it('should slow requests only after delayAfter', async () => {
    RequestLimiter(app, {
      api: {
        options: {
          limits: {
            limit: 10,
            delayAfter: 1,
            delayMs: 40,
            maxDelayMs: 40,
            windowMs: 60000
          }
        }
      }
    });
    app.get('/api/blocks', (req, res) => res.sendStatus(200));

    await request(app).get('/api/blocks').expect(200);
    const started = Date.now();
    await request(app).get('/api/blocks').expect(200);

    expect(Date.now() - started).to.be.at.least(30);
  });

  it('should preserve CORS headers and expose rate-limit headers on 429 responses', async () => {
    const origin = 'https://client.example';

    app.use(cors(corsOptions({
      origin,
      exposedHeaders: ['X-Request-Id']
    })));
    RequestLimiter(app, {
      api: {
        options: {
          limits: {
            limit: 1,
            delayAfter: 0,
            delayMs: 0,
            windowMs: 60000
          }
        }
      }
    });
    app.get('/api/blocks', (req, res) => res.sendStatus(200));

    const accepted = await request(app)
        .get('/api/blocks')
        .set('Origin', origin)
        .expect(200);
    const limited = await request(app)
        .get('/api/blocks')
        .set('Origin', origin)
        .expect(429);

    expect(accepted.headers['access-control-allow-origin']).to.equal(origin);
    expect(limited.headers['access-control-allow-origin']).to.equal(origin);
    expect(limited.headers['access-control-expose-headers']).to.include('Retry-After');
    expect(limited.headers['access-control-expose-headers']).to.include('RateLimit-Limit');
    expect(limited.headers['access-control-expose-headers']).to.include('RateLimit-Scope');
  });

  it('should enforce the parent limit across inherited route policies', async () => {
    RequestLimiter(app, {
      api: {
        options: {
          limits: {
            limit: 2,
            delayAfter: 0,
            delayMs: 0,
            windowMs: 60000,
            routes: {
              status: { limit: 100, delayAfter: 0, delayMs: 0 },
              read: { limit: 100, delayAfter: 0, delayMs: 0 },
              publish: { limit: 100, delayAfter: 0, delayMs: 0 }
            }
          }
        }
      }
    });
    app.use('/api/', (req, res) => res.sendStatus(200));

    await request(app).get('/api/loader/status').expect(200);
    await request(app).get('/api/blocks').expect(200);
    await request(app).post('/api/transactions').expect(429);
  });

  it('should preserve class budgets within the default aggregate budget', async () => {
    RequestLimiter(app, {
      api: {
        options: {
          limits: {
            limit: 6,
            delayAfter: 0,
            delayMs: 0,
            windowMs: 60000,
            routes: {
              status: { limit: 2, delayAfter: 0, delayMs: 0 },
              read: { limit: 2, delayAfter: 0, delayMs: 0 },
              publish: { limit: 2, delayAfter: 0, delayMs: 0 }
            }
          }
        }
      }
    });
    app.use('/api/', (req, res) => res.sendStatus(200));

    await request(app).get('/api/loader/status').expect(200);
    await request(app).get('/api/node/status').expect(200);
    await request(app).get('/api/blocks').expect(200);
    await request(app).get('/api/transactions').expect(200);
    await request(app).post('/api/transactions').expect(200);
    await request(app).post('/api/transactions').expect(200);
  });

  it('should report the effective limiting policy across route classes', async () => {
    RequestLimiter(app, {
      api: {
        options: {
          limits: {
            limit: 2,
            delayAfter: 0,
            delayMs: 0,
            windowMs: 60000,
            routes: {
              status: { limit: 10, delayAfter: 0, delayMs: 0 },
              read: { limit: 10, delayAfter: 0, delayMs: 0 },
              publish: { limit: 10, delayAfter: 0, delayMs: 0 }
            }
          }
        }
      }
    });
    app.use('/api/', (req, res) => res.sendStatus(200));

    const status = await request(app).get('/api/loader/status').expect(200);
    const read = await request(app).get('/api/blocks').expect(200);
    const limited = await request(app).post('/api/transactions').expect(429);

    expect(status.headers['ratelimit-limit']).to.equal('2');
    expect(status.headers['ratelimit-remaining']).to.equal('1');
    expect(read.headers['ratelimit-limit']).to.equal('2');
    expect(read.headers['ratelimit-remaining']).to.equal('0');
    expect(limited.headers['ratelimit-scope']).to.equal('all');
  });

  it('should report a class budget when it is tighter than the aggregate', async () => {
    RequestLimiter(app, {
      api: {
        options: {
          limits: {
            limit: 10,
            delayAfter: 0,
            delayMs: 0,
            windowMs: 60000,
            routes: {
              status: { limit: 2, delayAfter: 0, delayMs: 0 },
              read: { limit: 10, delayAfter: 0, delayMs: 0 },
              publish: { limit: 10, delayAfter: 0, delayMs: 0 }
            }
          }
        }
      }
    });
    app.get('/api/loader/status', (req, res) => res.sendStatus(200));

    const response = await request(app).get('/api/loader/status').expect(200);

    expect(response.headers['ratelimit-limit']).to.equal('2');
    expect(response.headers['ratelimit-remaining']).to.equal('1');
    expect(response.headers['ratelimit-scope']).to.equal('status');
  });

  it('should classify an absolute-form publish target before dispatch', async () => {
    RequestLimiter(app, {
      api: {
        options: {
          limits: {
            limit: 10,
            delayAfter: 0,
            delayMs: 0,
            windowMs: 60000,
            routes: {
              status: { limit: 10, delayAfter: 0, delayMs: 0 },
              read: { limit: 10, delayAfter: 0, delayMs: 0 },
              publish: { limit: 1, delayAfter: 0, delayMs: 0 }
            }
          }
        }
      }
    });
    app.post('/api/transactions', (req, res) => res.sendStatus(200));
    const server = http.createServer(app);

    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

    async function sendAbsolute () {
      return new Promise((resolve, reject) => {
        const socket = net.connect(server.address().port, '127.0.0.1');
        let response = '';

        socket.on('connect', () => {
          socket.write([
            'POST http://example.test/api/transactions HTTP/1.1',
            'Host: example.test',
            'Content-Length: 0',
            'Connection: close',
            '',
            ''
          ].join('\r\n'));
        });
        socket.on('data', (chunk) => {
          response += chunk.toString();
        });
        socket.on('error', reject);
        socket.on('end', () => {
          const status = Number((response.match(/^HTTP\/1\.1 (\d{3})/) || [])[1]);
          resolve(status);
        });
      });
    }

    try {
      expect(await sendAbsolute()).to.equal(200);
      expect(await sendAbsolute()).to.equal(429);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it('should trust one proxy hop and group forwarded IPv6 addresses by allocation', async () => {
    RequestLimiter(app, {
      trustProxy: true,
      api: {
        options: {
          limits: {
            limit: 1,
            delayAfter: 0,
            delayMs: 0,
            windowMs: 60000
          }
        }
      }
    });
    app.get('/api/blocks', (req, res) => res.sendStatus(200));

    await request(app)
        .get('/api/blocks')
        .set('X-Forwarded-For', '192.0.2.1, 2001:db8:abcd:1200::1')
        .expect(200);
    await request(app)
        .get('/api/blocks')
        .set('X-Forwarded-For', '192.0.2.2, 2001:db8:abcd:1200::2')
        .expect(429);
  });

  it('should allow an honest burst under the production defaults', async function () {
    this.timeout(20000);
    const nodeConfig = require('../../../config.default.json');

    expect(nodeConfig.api.options.limits.limit).to.equal(RequestLimiter.defaults.api.limit);
    expect(nodeConfig.api.options.limits.limit).to.be.at.least(
        nodeConfig.api.options.limits.routes.status.limit +
        nodeConfig.api.options.limits.routes.read.limit +
        nodeConfig.api.options.limits.routes.publish.limit
    );
    expect(nodeConfig.api.options.limits.routes.publish.limit).to.equal(300);
    expect(nodeConfig.peers.options.limits.routes.sync.limit).to.equal(12000);
    expect(nodeConfig.peers.options.limits.limit).to.be.at.least(
        nodeConfig.peers.options.limits.routes.status.limit +
        nodeConfig.peers.options.limits.routes.sync.limit +
        nodeConfig.peers.options.limits.routes.broadcast.limit
    );
    expect(nodeConfig.peers.options.limits.routes.sync.limit).to.be.above(
        nodeConfig.api.options.limits.routes.publish.limit
    );

    RequestLimiter(app, nodeConfig);
    app.use('/api/', (req, res) => res.sendStatus(200));
    app.use('/peer/', (req, res) => res.sendStatus(200));
    const peerHeaders = {};
    peerHeaders[RequestLimiter.peerRateLimitHeader] = RequestLimiter.peerRateLimitVersion;

    for (let i = 0; i < 40; i++) {
      await request(app).get('/peer/blocks').set(peerHeaders).expect(200);
      await request(app).post('/peer/transactions').set(peerHeaders).send({}).expect(200);
      await request(app).get('/api/loader/status').expect(200);
      await request(app).post('/api/transactions').send({}).expect(200);
    }
  });

  it('should warn when a configured surface is disabled', () => {
    const logger = { warn: sinon.spy() };

    RequestLimiter(app, {
      api: {
        options: {
          limits: {
            max: 0,
            delayAfter: 0,
            delayMs: 0,
            windowMs: 60000
          }
        }
      }
    }, logger);

    expect(logger.warn.called).to.equal(true);
    expect(logger.warn.firstCall.args[0]).to.equal('limits');
    expect(logger.warn.firstCall.args[1]).to.match(/Public API request limits are disabled/);
  });

  describe('config schema', () => {
    function validate (config) {
      const validator = new ZSchema();
      const valid = validator.validate(config, configSchema.config);

      return {
        valid: valid,
        errors: validator.getLastErrors()
      };
    }

    it('should accept the production defaults', () => {
      const result = validate(require('../../../config.default.json'));

      expect(result.valid, JSON.stringify(result.errors)).to.equal(true);
    });

    it('should accept a legacy max block and a limit block without max', () => {
      const legacy = JSON.parse(JSON.stringify(require('../../../config.default.json')));
      const modern = JSON.parse(JSON.stringify(legacy));
      const oldLimits = {
        max: 10,
        delayMs: 0,
        delayAfter: 0,
        windowMs: 60000
      };

      legacy.api.options.limits = oldLimits;
      legacy.peers.options.limits = oldLimits;
      delete modern.api.options.limits.max;
      delete modern.peers.options.limits.max;

      expect(validate(legacy).valid).to.equal(true);
      expect(validate(modern).valid).to.equal(true);
    });

    it('should reject a limits block that sets neither limit nor max', () => {
      const config = JSON.parse(JSON.stringify(require('../../../config.default.json')));

      delete config.api.options.limits.limit;
      delete config.api.options.limits.max;

      const result = validate(config);

      expect(result.valid).to.equal(false);
      expect(JSON.stringify(result.errors)).to.match(/anyOf|limit|max/i);
    });

    it('should reject malformed WebSocket limits', () => {
      const invalidClient = JSON.parse(JSON.stringify(require('../../../config.default.json')));
      const invalidNode = JSON.parse(JSON.stringify(invalidClient));

      invalidClient.wsClient.limits.maxConnectionAttempts = -1;
      invalidNode.wsNode.eventLimit = -1;

      expect(validate(invalidClient).valid).to.equal(false);
      expect(validate(invalidNode).valid).to.equal(false);
    });

    it('should reject a peer limit status other than 429', () => {
      const config = JSON.parse(JSON.stringify(require('../../../config.default.json')));

      config.peers.options.limits.statusCode = 503;

      const result = validate(config);

      expect(result.valid).to.equal(false);
      expect(JSON.stringify(result.errors)).to.match(/enum|429|statusCode/i);
    });

    it('should normalize peer status codes to 429 even before config loading', () => {
      const limiter = RequestLimiter(app, {
        peers: {
          options: {
            limits: {
              limit: 10,
              delayAfter: 0,
              delayMs: 0,
              windowMs: 60000,
              statusCode: 503
            }
          }
        }
      });

      expect(limiter.peer.statusCode).to.equal(429);
    });
  });

  describe('request classes', () => {
    const cases = [
      ['GET', '/api/loader/status/ping', 'status'],
      ['GET', '/api/blocks/getFees', 'status'],
      ['GET', '/api/transactions?limit=1', 'read'],
      ['POST', '/api/transactions', 'publish'],
      ['POST', '/api/states/get', 'read'],
      ['PUT', '/api/dapps', 'read'],
      ['POST', '/api/delegates/forging/enable', 'read'],
      ['PUT', '/api/signatures', 'publish'],
      ['OPTIONS', '/api/transactions', null],
      ['GET', '/peer/ping', 'status'],
      ['GET', '/peer/blocks/common', 'sync'],
      ['GET', '/peer/signatures', 'sync'],
      ['POST', '/peer/blocks', 'broadcast'],
      ['POST', '/peer/dapp/message', 'broadcast'],
      ['OPTIONS', '/peer/blocks', null]
    ];

    cases.forEach(function (entry) {
      const method = entry[0];
      const path = entry[1];
      const expected = entry[2];
      const classify = path.startsWith('/peer/') ?
        RequestLimiter.classifyPeerRequest :
        RequestLimiter.classifyApiRequest;

      it('should classify ' + method + ' ' + path, () => {
        expect(classify({ method: method, originalUrl: path })).to.equal(expected);
      });
    });
  });
});
