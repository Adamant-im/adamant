'use strict';

const { expect } = require('chai');
const fs = require('fs');
const os = require('os');
const path = require('path');

const DApps = require('../../../modules/dapps.js');

describe('DApps', function () {
  let tempDir;

  afterEach(function () {
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
});
