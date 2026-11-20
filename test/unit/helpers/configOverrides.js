'use strict';

const { expect } = require('chai');
const express = require('express');
const fs = require('fs');
const os = require('os');
const path = require('path');
const sinon = require('sinon');
const request = require('supertest');

const Config = require('../../../helpers/config.js');
const configOverrides = require('../../../helpers/configOverrides.js');
const configSchema = require('../../../schema/config.js');
const RequestLimiter = require('../../../helpers/request-limiter.js');

describe('configOverrides', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'adamant-config-overrides-'));
  });

  afterEach(() => {
    sinon.restore();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  function writeTempFile (fileName, content) {
    const filePath = path.join(tempDir, fileName);

    fs.writeFileSync(filePath, content);

    return filePath;
  }

  describe('parseOverride()', () => {
    it('should parse dot-path scalar values as JSON-compatible values', () => {
      const override = configOverrides.parseOverride(
          'consensusActivationHeights.fairSystem=4359465',
          'test'
      );

      expect(override.path).to.deep.equal(['consensusActivationHeights', 'fairSystem']);
      expect(override.value).to.equal(4359465);
    });

    it('should parse whole object values', () => {
      const override = configOverrides.parseOverride(
          'redis={ "url": "redis://127.0.0.1:6379/1", "password": null }',
          'test'
      );

      expect(override.path).to.deep.equal(['redis']);
      expect(override.value).to.deep.equal({
        url: 'redis://127.0.0.1:6379/1',
        password: null
      });
    });

    it('should preserve non-JSON values as strings', () => {
      const override = configOverrides.parseOverride('consoleLog.level=debug', 'test');

      expect(override.value).to.equal('debug');
    });

    it('should preserve JSON string values as strings', () => {
      const override = configOverrides.parseOverride('db.password="123"', 'test');

      expect(override.value).to.equal('123');
    });

    it('should fail fast on malformed JSON objects', () => {
      expect(() => configOverrides.parseOverride('redis={ bad json }', 'test'))
          .to.throw(/Invalid JSON value/);
    });

    it('should reject unsafe keys inside direct JSON values', () => {
      expect(() => configOverrides.parseOverride('redis={ "__proto__": { "polluted": true } }', 'test'))
          .to.throw(/unsafe key "__proto__"/);
    });

    it('should reject unsafe keys inside single-quoted JSON values', () => {
      expect(() => configOverrides.parseOverride('redis=\'{ "constructor": { "polluted": true } }\'', 'test'))
          .to.throw(/unsafe key "constructor"/);
    });
  });

  describe('parseOverrideFile()', () => {
    it('should parse env-style override files', () => {
      const filePath = writeTempFile('overrides.env', [
        '# local test overrides',
        'consensusActivationHeights.fairSystem=4359465',
        'redis=\'{ "url": "redis://127.0.0.1:6379/1", "password": null }\''
      ].join('\n'));

      const entries = configOverrides.parseOverrideFile(filePath);

      expect(entries).to.have.length(2);
      expect(entries[0].path).to.deep.equal(['consensusActivationHeights', 'fairSystem']);
      expect(entries[0].value).to.equal(4359465);
      expect(entries[1].path).to.deep.equal(['redis']);
      expect(entries[1].value.password).to.equal(null);
    });

    it('should parse JSON override files as nested partial overrides', () => {
      const filePath = writeTempFile('overrides.json', JSON.stringify({
        consensusActivationHeights: {
          fairSystem: 4359465
        },
        redis: {
          url: 'redis://127.0.0.1:6379/1',
          password: null
        },
        forging: {
          secret: []
        }
      }));

      const entries = configOverrides.parseOverrideFile(filePath);

      expect(entries).to.deep.equal([
        {
          path: ['consensusActivationHeights', 'fairSystem'],
          value: 4359465,
          source: '--config-overrides ' + filePath
        },
        {
          path: ['redis', 'url'],
          value: 'redis://127.0.0.1:6379/1',
          source: '--config-overrides ' + filePath
        },
        {
          path: ['redis', 'password'],
          value: null,
          source: '--config-overrides ' + filePath
        },
        {
          path: ['forging', 'secret'],
          value: [],
          source: '--config-overrides ' + filePath
        }
      ]);
    });

    it('should reject JSON override files with non-object roots', () => {
      const filePath = writeTempFile('overrides.json', '[]');

      expect(() => configOverrides.parseOverrideFile(filePath))
          .to.throw(/root value must be an object/);
    });

    it('should reject unsafe keys inside JSON override files', () => {
      const filePath = writeTempFile('overrides.json', JSON.stringify({
        forging: {
          secret: [
            {
              prototype: true
            }
          ]
        }
      }));

      expect(() => configOverrides.parseOverrideFile(filePath))
          .to.throw(/unsafe key "prototype"/);
    });
  });

  describe('applyOverrides()', () => {
    it('should apply nested scalar and whole-object overrides', () => {
      const configData = {
        consensusActivationHeights: {
          fairSystem: 1,
          spaceship: 2
        },
        redis: {
          url: 'redis://127.0.0.1:6379/0',
          password: 'secret'
        }
      };
      const entries = [
        configOverrides.parseOverride('consensusActivationHeights.fairSystem=4359465', 'test'),
        configOverrides.parseOverride('redis={ "url": "redis://127.0.0.1:6379/1", "password": null }', 'test')
      ];

      configOverrides.applyOverrides(configData, entries, configSchema.config);

      expect(configData.consensusActivationHeights.fairSystem).to.equal(4359465);
      expect(configData.redis).to.deep.equal({
        url: 'redis://127.0.0.1:6379/1',
        password: null
      });
    });

    it('should collect redacted override events', () => {
      const configData = {
        db: {
          password: 'old-password'
        },
        redis: {
          url: 'redis://127.0.0.1:6379/0',
          password: 'old-password'
        }
      };
      const entries = [
        configOverrides.parseOverride('db.password="new-password"', '--config-set'),
        configOverrides.parseOverride(
            'redis={ "url": "redis://127.0.0.1:6379/1", "password": "new-password" }',
            '--config-set'
        )
      ];
      const events = [];

      configOverrides.applyOverrides(configData, entries, configSchema.config, events);

      expect(events).to.deep.equal([
        {
          path: 'db.password',
          source: '--config-set',
          value: 'XXXXXXXXXX'
        },
        {
          path: 'redis',
          source: '--config-set',
          value: {
            url: 'redis://127.0.0.1:6379/1',
            password: 'XXXXXXXXXX'
          }
        }
      ]);
      expect(JSON.stringify(events)).not.to.include('new-password');
    });

    it('should reject unknown schema paths', () => {
      const configData = {};
      const entries = [
        configOverrides.parseOverride('unknown.path=1', 'test')
      ];

      expect(() => configOverrides.applyOverrides(configData, entries, configSchema.config))
          .to.throw(/path is not defined in config schema/);
    });

    it('should reject unsafe path segments', () => {
      expect(() => configOverrides.parseOverride('db.__proto__.polluted=true', 'test'))
          .to.throw(/unsafe path segment/);
    });

    it('should create missing optional object parents for schema-defined paths', () => {
      const configData = {};
      const entries = [
        configOverrides.parseOverride('cors.origin="*"', 'test')
      ];

      configOverrides.applyOverrides(configData, entries, configSchema.config);

      expect(configData.cors.origin).to.equal('*');
    });
  });

  describe('Config()', () => {
    const testConfigPath = path.join(__dirname, '../../config.default.json');

    it('should validate and return configs with direct overrides', () => {
      const config = Config(testConfigPath, {
        sets: [
          'consensusActivationHeights.fairSystem=4359465',
          'redis={ "url": "redis://127.0.0.1:6379/1", "password": null }'
        ]
      });

      expect(config.consensusActivationHeights.fairSystem).to.equal(4359465);
      expect(config.redis).to.deep.equal({
        url: 'redis://127.0.0.1:6379/1',
        password: null
      });
      expect(config.__configEvents).to.deep.equal([
        {
          path: 'consensusActivationHeights.fairSystem',
          source: '--config-set',
          value: 4359465
        },
        {
          path: 'redis',
          source: '--config-set',
          value: {
            url: 'redis://127.0.0.1:6379/1',
            password: 'XXXXXXXXXX'
          }
        }
      ]);
    });

    it('should apply config file, env-file, direct, and legacy overrides in order', () => {
      const overrideFile = writeTempFile('overrides.env', 'port=36668\n');
      const config = Config(testConfigPath, {
        file: overrideFile,
        sets: ['port=36669'],
        overrides: [
          {
            path: 'port',
            value: 36670,
            source: '--port'
          }
        ]
      });

      expect(config.port).to.equal(36670);
    });

    it('should apply JSON override files before direct overrides', () => {
      const overrideFile = writeTempFile('overrides.json', JSON.stringify({
        port: 36668,
        consensusActivationHeights: {
          fairSystem: 4359465
        }
      }));
      const config = Config(testConfigPath, {
        file: overrideFile,
        sets: ['port=36669']
      });

      expect(config.port).to.equal(36669);
      expect(config.consensusActivationHeights.fairSystem).to.equal(4359465);
    });

    it('should ignore legacy direct config without exposing its values', () => {
      const raw = JSON.parse(fs.readFileSync(testConfigPath, 'utf8'));

      raw.forging.access = {
        whiteList: ['127.0.0.1']
      };
      raw.dapp = {
        masterrequired: true,
        masterpassword: 'do-not-log-this-password',
        autoexec: [{ dappid: '123' }]
      };

      const config = Config(writeTempFile('legacy-control-config.json', JSON.stringify(raw)));

      expect(config.forging).not.to.have.property('access');
      expect(config).not.to.have.property('dapp');
      expect(config.__configEvents.map((event) => event.path)).to.deep.equal([
        'forging.access',
        'dapp'
      ]);
      expect(JSON.stringify(config.__configEvents)).not.to.include('do-not-log-this-password');
    });

    it('should ignore deprecated control API overrides', () => {
      const overrideFile = writeTempFile('legacy-control-overrides.json', JSON.stringify({
        forging: {
          access: {
            whiteList: ['0.0.0.0']
          }
        },
        dapp: {
          masterpassword: 'do-not-log-this-password',
          autoexec: [{ dappid: '123' }]
        }
      }));
      const config = Config(testConfigPath, {
        file: overrideFile
      });

      expect(config.forging).not.to.have.property('access');
      expect(config).not.to.have.property('dapp');
      expect(config.__configEvents.map((event) => event.path)).to.deep.equal([
        'forging.access',
        'dapp'
      ]);
      expect(JSON.stringify(config.__configEvents)).not.to.include('do-not-log-this-password');
    });

    it('should strip a legacy access block from a whole forging override', () => {
      const config = Config(testConfigPath, {
        sets: [
          'forging={ "force": false, "secret": [], "access": { "whiteList": ["0.0.0.0"] } }'
        ]
      });

      expect(config.forging).to.deep.equal({
        force: false,
        secret: []
      });
      expect(config.__configEvents.map((event) => event.path)).to.deep.equal([
        'forging',
        'forging.access'
      ]);
    });

    it('should prevent legacy DApp password generation from activating snapshot mode', () => {
      const raw = JSON.parse(fs.readFileSync(testConfigPath, 'utf8'));

      raw.dapp = {
        masterrequired: true,
        masterpassword: '',
        autoexec: []
      };
      raw.loading.snapshot = 20;

      const config = Config(writeTempFile('legacy-snapshot.json', JSON.stringify(raw)));

      expect(config.loading).not.to.have.property('snapshot');
      expect(config.__configEvents).to.deep.include({
        type: 'migration',
        path: 'loading.snapshot',
        source: 'legacy config'
      });
    });

    it('should preserve explicitly overridden snapshot mode with legacy DApp config', () => {
      const raw = JSON.parse(fs.readFileSync(testConfigPath, 'utf8'));

      raw.dapp = {
        masterrequired: true,
        masterpassword: '',
        autoexec: []
      };
      raw.loading.snapshot = 20;

      const config = Config(writeTempFile('explicit-snapshot.json', JSON.stringify(raw)), {
        overrides: [{
          path: 'loading.snapshot',
          value: 10,
          source: '--snapshot'
        }]
      });

      expect(config.loading.snapshot).to.equal(10);
      expect(config.__configEvents.some((event) => event.type === 'migration')).to.equal(false);
    });

    it('should suppress persistent snapshot override files with legacy DApp config', () => {
      const raw = JSON.parse(fs.readFileSync(testConfigPath, 'utf8'));
      const overrideFile = writeTempFile('persistent-snapshot.json', JSON.stringify({
        loading: {
          snapshot: 20
        }
      }));

      raw.dapp = {
        masterrequired: true,
        masterpassword: '',
        autoexec: []
      };

      const config = Config(
          writeTempFile('persistent-snapshot-config.json', JSON.stringify(raw)),
          { file: overrideFile }
      );

      expect(config.loading).not.to.have.property('snapshot');
      expect(config.__configEvents).to.deep.include({
        type: 'migration',
        path: 'loading.snapshot',
        source: 'legacy config'
      });
    });

    it('should apply the former DApp defaults to partial legacy configs', () => {
      const raw = JSON.parse(fs.readFileSync(testConfigPath, 'utf8'));

      delete raw.dapp;
      raw.loading.snapshot = 20;

      const config = Config(writeTempFile('inherited-legacy-snapshot.json', JSON.stringify(raw)));

      expect(config.loading).not.to.have.property('snapshot');
      expect(config.__configEvents).to.deep.include({
        type: 'migration',
        path: 'loading.snapshot',
        source: 'legacy config'
      });
    });

    it('should apply multiple config override files in order', () => {
      const firstOverrideFile = writeTempFile('first.json', JSON.stringify({
        port: 36668,
        redis: {
          url: 'redis://127.0.0.1:6379/2'
        }
      }));
      const secondOverrideFile = writeTempFile('second.json', JSON.stringify({
        port: 36669
      }));
      const config = Config(testConfigPath, {
        file: [firstOverrideFile, secondOverrideFile]
      });

      expect(config.port).to.equal(36669);
      expect(config.redis.url).to.equal('redis://127.0.0.1:6379/2');
      expect(config.__configEvents.map((event) => event.source)).to.deep.equal([
        '--config-overrides ' + firstOverrideFile,
        '--config-overrides ' + firstOverrideFile,
        '--config-overrides ' + secondOverrideFile
      ]);
    });

    it('should fail during schema validation for invalid override value types', () => {
      sinon.stub(console, 'error');
      sinon.stub(process, 'exit').throws(new Error('process.exit'));

      expect(() => Config(testConfigPath, {
        sets: ['port=not-an-integer']
      })).to.throw('process.exit');
      expect(process.exit.calledWith(1)).to.be.true;
      expect(console.error.firstCall.args[1]).to.include('Failed to validate config data');
    });

    it('should keep a legacy max cap instead of inheriting default route policies', () => {
      const raw = JSON.parse(fs.readFileSync(testConfigPath, 'utf8'));

      raw.api.options.limits = {
        max: 40,
        delayMs: 0,
        delayAfter: 0,
        windowMs: 60000
      };
      raw.peers.options.limits = {
        max: 80,
        delayMs: 1,
        delayAfter: 2,
        windowMs: 60000
      };

      const config = Config(writeTempFile('legacy-limits.json', JSON.stringify(raw)));

      expect(config.api.options.limits.max).to.equal(40);
      expect(config.api.options.limits).not.to.have.property('limit');
      expect(config.api.options.limits).not.to.have.property('routes');
      expect(config.peers.options.limits.max).to.equal(80);
      expect(config.peers.options.limits).not.to.have.property('limit');
      expect(config.peers.options.limits).not.to.have.property('routes');
    });

    it('should inherit production limits when the limits block is absent', () => {
      const raw = JSON.parse(fs.readFileSync(testConfigPath, 'utf8'));
      const defaults = require('../../../config.default.json');

      delete raw.api.options.limits;
      delete raw.peers.options.limits;

      const config = Config(writeTempFile('inherited-limits.json', JSON.stringify(raw)));

      expect(config.api.options.limits.limit).to.equal(defaults.api.options.limits.limit);
      expect(config.api.options.limits.routes.publish.limit).to.equal(
          defaults.api.options.limits.routes.publish.limit
      );
      expect(config.peers.options.limits.routes.sync.limit).to.equal(
          defaults.peers.options.limits.routes.sync.limit
      );
    });

    it('should enforce a parent cap over inherited route policies', async () => {
      const raw = JSON.parse(fs.readFileSync(testConfigPath, 'utf8'));

      delete raw.api.options.limits;

      const config = Config(writeTempFile('surface-cap.json', JSON.stringify(raw)), {
        sets: ['api.options.limits.limit=1']
      });
      const app = express();

      RequestLimiter(app, config);
      app.get('/api/blocks', (req, res) => res.sendStatus(200));

      await request(app).get('/api/blocks').expect(200);
      await request(app).get('/api/blocks').expect(429);
    });

    it('should reject non-429 peer limit responses through the Config loader', () => {
      const raw = JSON.parse(fs.readFileSync(testConfigPath, 'utf8'));

      raw.peers.options.limits.statusCode = 503;
      sinon.stub(console, 'error');
      sinon.stub(process, 'exit').throws(new Error('process.exit'));

      expect(() => Config(writeTempFile('peer-status-code.json', JSON.stringify(raw))))
          .to.throw('process.exit');
      expect(process.exit.calledWith(1)).to.equal(true);
      expect(console.error.firstCall.args[1]).to.include('Failed to validate config data');
    });

    it('should fail during schema validation for zero snapshot override', () => {
      sinon.stub(console, 'error');
      sinon.stub(process, 'exit').throws(new Error('process.exit'));

      expect(() => Config(testConfigPath, {
        sets: ['loading.snapshot=0']
      })).to.throw('process.exit');
      expect(process.exit.calledWith(1)).to.be.true;
      expect(console.error.firstCall.args[1]).to.include('Failed to validate config data');
    });
  });
});
