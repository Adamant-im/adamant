'use strict';

const { expect } = require('chai');
const fs = require('fs');
const os = require('os');
const path = require('path');
const sinon = require('sinon');

const Config = require('../../../helpers/config.js');
const configOverrides = require('../../../helpers/configOverrides.js');
const configSchema = require('../../../schema/config.js');

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
    const testConfigPath = path.join(__dirname, '../../config.json');

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

    it('should fail during schema validation for invalid override value types', () => {
      sinon.stub(console, 'error');
      sinon.stub(process, 'exit').throws(new Error('process.exit'));

      expect(() => Config(testConfigPath, {
        sets: ['port=not-an-integer']
      })).to.throw('process.exit');
      expect(process.exit.calledWith(1)).to.be.true;
      expect(console.error.firstCall.args[1]).to.include('Failed to validate config data');
    });
  });
});
