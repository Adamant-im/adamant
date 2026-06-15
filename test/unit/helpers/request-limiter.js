'use strict';

const { expect } = require('chai');
const express = require('express');
const request = require('supertest');

const RequestLimiter = require('../../../helpers/request-limiter.js');

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
      expect(limiter.client).to.have.property('delayAfter').to.equal(0);
      expect(limiter.client).to.have.property('delayMs').that.is.a('function');
      expect(limiter.client).to.have.property('max').to.equal(0);
      expect(limiter.client).to.have.property('windowMs').to.equal(60000);
      expect(limiter.client.delayMs(100)).to.equal(0);
    });

    it('should return the default peer limits', () => {
      expect(limiter)
          .to.be.an('object')
          .that.has.property('peer')
          .that.is.an('object');
      expect(limiter.peer).to.have.property('delayAfter').to.equal(0);
      expect(limiter.peer).to.have.property('delayMs').that.is.a('function');
      expect(limiter.peer).to.have.property('max').to.equal(0);
      expect(limiter.peer).to.have.property('windowMs').to.equal(60000);
      expect(limiter.peer.delayMs(100)).to.equal(0);
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
});
