'use strict';

const { expect } = require('chai');
const express = require('express');

const RequestLimiter = require('../../../helpers/request-limiter.js');

describe('RequestLimiter', function () {
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

    beforeEach(function () {
      limiter = RequestLimiter(app, {});
    });

    it('should return the default client limits', () => {
      expect(limiter)
        .to.be.an('object')
        .that.has.property('client')
        .that.is.an('object');
      expect(limiter.client).to.have.property('delayAfter').to.equal(0);
      expect(limiter.client).to.have.property('delayAfter').to.equal(0);
      expect(limiter.client).to.have.property('delayMs').to.equal(0);
      expect(limiter.client).to.have.property('max').to.equal(0);
      expect(limiter.client).to.have.property('windowMs').to.equal(60000);
    });

    it('should return the default peer limits', () => {
      expect(limiter)
        .to.be.an('object')
        .that.has.property('peer')
        .that.is.an('object');
      expect(limiter.peer).to.have.property('delayAfter').to.equal(0);
      expect(limiter.peer).to.have.property('delayAfter').to.equal(0);
      expect(limiter.peer).to.have.property('delayMs').to.equal(0);
      expect(limiter.peer).to.have.property('max').to.equal(0);
      expect(limiter.peer).to.have.property('windowMs').to.equal(60000);
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
        max: 1,
        delayMs: 2,
        delayAfter: 3,
        windowMs: 4,
      };
      options = { options: { limits: limits } };
      limiter = RequestLimiter(app, { api: options, peers: options });
    });

    it('should return the defined client limits', () => {
      expect(limiter)
        .to.be.an('object')
        .that.has.property('client')
        .that.is.an('object');
      expect(limiter.client).to.have.property('max').to.equal(1);
      expect(limiter.client).to.have.property('delayMs').to.equal(2);
      expect(limiter.client).to.have.property('delayAfter').to.equal(3);
      expect(limiter.client).to.have.property('windowMs').to.equal(4);
    });

    it('should return the defined peer limits', function () {
      expect(limiter)
        .to.be.an('object')
        .that.has.property('peer')
        .that.is.an('object');
      expect(limiter.peer).to.have.property('max').to.equal(1);
      expect(limiter.peer).to.have.property('delayMs').to.equal(2);
      expect(limiter.peer).to.have.property('delayAfter').to.equal(3);
      expect(limiter.peer).to.have.property('windowMs').to.equal(4);
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
  });
});
