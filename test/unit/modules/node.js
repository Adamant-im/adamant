'use strict';

const { expect } = require('chai');
const semver = require('semver');

const { modulesLoader } = require('../../common/initModule.js');
const { isHex } = require('../../common/assert.js');

const Node = require('../../../modules/node.js');
const constants = require('../../../helpers/constants.js');

describe('node', function () {
  /**
   * @type {Node}
   */
  let nodeModule;
  let modules;

  const dummyBlock = {
    id: '9314232245035524467',
    height: 1,
    timestamp: 0,
  };

  const library = {
    lastCommit: '07757855c143e69e417da6e3918e0e57a3dd1864',
    build: '',
  };

  before(function (done) {
    modulesLoader.initAllModules((err, __modules) => {
      if (err) {
        return done(err);
      }

      const blocks = __modules.blocks;
      blocks.lastBlock.set(dummyBlock);

      modules = __modules;

      const scope = {
        ...modulesLoader.scope,
        ...library,
      };

      modulesLoader.initModuleWithDb(
        Node,
        (err, module) => {
          if (err) {
            return done(err);
          }

          nodeModule = module;
          done();
        },
        scope
      );
    });
  });

  describe('isLoaded()', () => {
    it('should return false before delegates.onBind() was called', (done) => {
      expect(nodeModule.isLoaded()).to.be.false;
      done();
    });
  });

  describe('onBind()', () => {
    it('should initialize modules', (done) => {
      nodeModule.onBind(modules);
      expect(nodeModule.isLoaded()).to.be.true;
      done();
    });
  });

  describe('shared', () => {
    describe('getStatus()', () => {
      it('should return valid node status', (done) => {
        nodeModule.shared.getStatus({}, (err, response) => {
          expect(err).not.to.exist;
          const keys = ['loader', 'network', 'version', 'wsClient'];
          expect(response).to.have.keys(keys);

          const loaderKeys = [
            'loaded',
            'now',
            'syncing',
            'consensus',
            'blocks',
            'blocksCount',
          ];
          expect(response.loader).to.be.an('object').that.have.keys(loaderKeys);

          expect(isHex(response.network.broadhash)).to.be.true;

          expect(response.network.epoch).to.equal(constants.epochTime);
          expect(response.network.height).to.equal(dummyBlock.height);
          expect(response.network.fee).to.be.greaterThan(0);
          expect(response.network.milestone).to.satisfy(Number.isInteger);

          const { nethash } = modulesLoader.scope.config;
          expect(response.network.nethash).to.equal(nethash);

          expect(response.network.reward).to.satisfy(Number.isInteger);
          expect(response.network.supply).to.satisfy(Number.isInteger);

          const versionKeys = ['build', 'commit', 'version'];
          expect(response.version).to.have.all.keys(versionKeys);
          expect(response.version.commit).to.equal(library.lastCommit);
          expect(response.version.build).to.equal(library.build);

          expect(semver.valid(response.version.version)).not.to.be.null;

          done();
        });
      });
    });
  });
});
