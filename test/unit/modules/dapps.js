'use strict';

const { expect } = require('chai');
const fs = require('fs');
const os = require('os');
const path = require('path');
const sinon = require('sinon');

const DApps = require('../../../modules/dapps.js');

describe('DApps', function () {
  let tempDir;

  afterEach(function () {
    sinon.restore();
    if (tempDir) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should remove only the configured public DApp runtime path', function (done) {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'adamant-dapps-'));
    const publicDir = path.join(tempDir, 'public');
    const targetDir = path.join(tempDir, 'outside');
    const runtimeDir = path.join(publicDir, 'dapps');
    const sentinel = path.join(targetDir, 'keep.txt');

    fs.mkdirSync(publicDir);
    fs.mkdirSync(targetDir);
    fs.writeFileSync(sentinel, 'keep');
    fs.symlinkSync(targetDir, runtimeDir, 'dir');

    const scope = {
      db: {},
      logger: {},
      network: {},
      public: publicDir,
      schema: {},
      logic: {
        transaction: {
          attachAssetType: function (type, assetType) {
            return assetType;
          }
        }
      }
    };

    new DApps(function (err) {
      try {
        expect(err).not.to.exist;
        expect(fs.existsSync(runtimeDir)).to.equal(false);
        expect(fs.readFileSync(sentinel, 'utf8')).to.equal('keep');
        done();
      } catch (error) {
        done(error);
      }
    }, scope);
  });

  it('should continue startup when retired public DApp content cannot be removed', function (done) {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'adamant-read-only-dapps-'));
    const publicDir = path.join(tempDir, 'public');
    const runtimeDir = path.join(publicDir, 'dapps');
    const legacyFile = path.join(runtimeDir, 'legacy.txt');
    const removalError = Object.assign(new Error('permission denied'), { code: 'EACCES' });
    const logger = {
      warn: sinon.spy()
    };

    fs.mkdirSync(runtimeDir, { recursive: true });
    fs.writeFileSync(legacyFile, 'legacy');
    sinon.stub(fs, 'rm').callsFake(function (filePath, options, callback) {
      callback(removalError);
    });

    const scope = createScope(logger, publicDir);

    new DApps(function (err, dapps) {
      try {
        expect(err).not.to.exist;
        expect(dapps).to.be.instanceOf(DApps);
        expect(fs.readFileSync(legacyFile, 'utf8')).to.equal('legacy');
        expect(logger.warn.calledOnceWith(
            'dapps',
            sinon.match.string,
            sinon.match({
              error: 'EACCES'
            })
        )).to.equal(true);
        done();
      } catch (error) {
        done(error);
      }
    }, scope);
  });

  function createScope (logger, publicDir) {
    return {
      db: {},
      logger: logger,
      network: {},
      public: publicDir,
      schema: {},
      logic: {
        transaction: {
          attachAssetType: function (type, assetType) {
            return assetType;
          }
        }
      }
    };
  }
});
