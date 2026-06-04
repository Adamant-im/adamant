'use strict';

const { expect } = require('chai');
const fs = require('fs');
const os = require('os');
const path = require('path');
const childProcess = require('child_process');
const sinon = require('sinon');

const localnet = require('../../scripts/localnet/localnet.js');
const localnetStatus = require('../../scripts/localnet/status.js');

describe('localnet scripts', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'adamant-localnet-'));
  });

  afterEach(() => {
    sinon.restore();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should build isolated node overrides and startup args', () => {
    const options = localnet.normalizeOptions({
      cwd: tempDir,
      nodes: 3,
      delegateSecrets: ['secret-1', 'secret-2', 'secret-3', 'secret-4', 'secret-5'],
      runtimeDir: '.localnet-test',
      logsDir: 'logs-localnet-test',
      basePort: 4100,
      baseWsPort: 5100,
      redisDbBase: 20,
      configOverrides: ['test/config.localnet.json', 'test/custom.json']
    });
    const plan = localnet.buildLocalnetPlan(options);

    expect(plan.manifestPath).to.equal(path.join(tempDir, '.localnet-test', 'manifest.json'));
    expect(plan.nodes).to.have.length(3);
    expect(plan.nodes.map((node) => node.port)).to.deep.equal([4100, 4101, 4102]);
    expect(plan.nodes.map((node) => node.wsClientPort)).to.deep.equal([5100, 5101, 5102]);
    expect(plan.nodes.map((node) => node.db.database)).to.deep.equal([
      'adamant_localnet_node_1',
      'adamant_localnet_node_2',
      'adamant_localnet_node_3'
    ]);
    expect(plan.nodes.map((node) => node.redis.url)).to.deep.equal([
      'redis://127.0.0.1:6379/20',
      'redis://127.0.0.1:6379/21',
      'redis://127.0.0.1:6379/22'
    ]);

    expect(plan.nodes[0].peers).to.deep.equal([
      { ip: '127.0.0.1', port: 4101 },
      { ip: '127.0.0.1', port: 4102 }
    ]);
    expect(plan.nodes[1].overrides).to.include({
      port: 4101,
      address: '127.0.0.1'
    });
    expect(plan.nodes[1].overrides.wsClient.portWS).to.equal(5101);
    expect(plan.nodes[1].overrides.generalLog.fileName)
        .to.equal('logs-localnet-test/node-2/adamant_localnet.log');
    expect(plan.nodes[1].overrides.debugLog.fileName)
        .to.equal('logs-localnet-test/node-2/adamant_localnet_debug.log');
    expect(plan.nodes.map((node) => node.delegateSecretsCount)).to.deep.equal([2, 2, 1]);
    expect(plan.nodes[1].overrides.forging.secret).to.deep.equal(['secret-2', 'secret-5']);
    expect(plan.nodes[1].overrides.peers.list).to.deep.equal([
      { ip: '127.0.0.1', port: 4100 },
      { ip: '127.0.0.1', port: 4102 }
    ]);
    expect(plan.nodes[1].overrides.peers.options.allowPrivatePeers).to.equal(true);

    expect(plan.nodes[2].args).to.deep.equal([
      'app.js',
      '--config',
      'config.default.json',
      '--genesis',
      'test/genesisBlock.json',
      '--config-overrides',
      'test/config.localnet.json',
      '--config-overrides',
      'test/custom.json',
      '--config-overrides',
      '.localnet-test/node-3/config.overrides.json'
    ]);
  });

  it('should write manifest and generated config files without starting databases when skipped', () => {
    sinon.stub(childProcess, 'spawn').returns({
      pid: 12345,
      unref: sinon.stub()
    });

    const manifest = localnet.startLocalnet({
      cwd: tempDir,
      nodes: 1,
      delegateSecrets: ['secret-1'],
      runtimeDir: '.localnet-test',
      logsDir: 'logs-localnet-test',
      basePort: 4200,
      baseWsPort: 5200,
      skipDbCreate: true
    });
    const manifestPath = path.join(tempDir, '.localnet-test', 'manifest.json');
    const overridePath = path.join(tempDir, '.localnet-test', 'node-1', 'config.overrides.json');

    expect(fs.existsSync(manifestPath)).to.equal(true);
    expect(fs.existsSync(overridePath)).to.equal(true);
    expect(manifest.status).to.equal('running');
    expect(manifest.nodes).to.have.length(1);
    expect(manifest.nodes[0].pid).to.equal(12345);
    expect(manifest.nodes[0].port).to.equal(4200);
    expect(manifest.nodes[0].logDir).to.equal(path.join(tempDir, 'logs-localnet-test', 'node-1'));

    const overrides = JSON.parse(fs.readFileSync(overridePath, 'utf8'));

    expect(overrides.port).to.equal(4200);
    expect(overrides.wsClient.portWS).to.equal(5200);
    expect(overrides.db.database).to.equal('adamant_localnet_node_1');
    expect(overrides.redis.url).to.equal('redis://127.0.0.1:6379/10');
    expect(overrides.forging.secret).to.deep.equal(['secret-1']);
  });

  it('should keep the last node non-forging when more than three nodes are started', () => {
    const options = localnet.normalizeOptions({
      cwd: tempDir,
      nodes: 4,
      delegateSecrets: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'],
      runtimeDir: '.localnet-test',
      logsDir: 'logs-localnet-test'
    });
    const plan = localnet.buildLocalnetPlan(options);

    expect(plan.nodes.map((node) => node.delegateSecretsCount)).to.deep.equal([3, 3, 2, 0]);
    expect(plan.nodes[3].overrides.forging.secret).to.deep.equal([]);
  });

  it('should create localnet databases with the configured node database owner', () => {
    sinon.stub(childProcess, 'spawn').returns({
      pid: 12345,
      unref: sinon.stub()
    });
    const spawnSync = sinon.stub(childProcess, 'spawnSync').returns({
      status: 0,
      stdout: '',
      stderr: ''
    });

    localnet.startLocalnet({
      cwd: tempDir,
      nodes: 1,
      delegateSecrets: ['secret-1'],
      runtimeDir: '.localnet-test',
      logsDir: 'logs-localnet-test',
      dbAdminUser: 'postgres_admin'
    });

    expect(spawnSync.calledOnce).to.equal(true);
    expect(spawnSync.firstCall.args[0]).to.equal('createdb');
    expect(spawnSync.firstCall.args[1]).to.deep.equal([
      '-h',
      'localhost',
      '-p',
      '5432',
      '-U',
      'postgres_admin',
      '-O',
      'adamanttest',
      'adamant_localnet_node_1'
    ]);
  });

  it('should assign Redis database indexes for URLs without an existing path', () => {
    expect(localnet.withRedisDatabase('redis://127.0.0.1:6379', 15))
        .to.equal('redis://127.0.0.1:6379/15');
  });

  it('should read delegate count and last forging time for localnet status', () => {
    const nodeDir = path.join(tempDir, '.localnet-test', 'node-1');
    const logDir = path.join(tempDir, 'logs-localnet-test', 'node-1');
    const overrideFile = path.join(nodeDir, 'config.overrides.json');
    const generalLogFile = path.join(logDir, 'adamant_localnet.log');

    fs.mkdirSync(nodeDir, { recursive: true });
    fs.mkdirSync(logDir, { recursive: true });
    fs.writeFileSync(overrideFile, JSON.stringify({
      forging: {
        secret: ['secret-1', 'secret-2']
      }
    }));
    fs.writeFileSync(generalLogFile, [
      '[inf] 2026-06-04T12:00:01.000Z | delegates | Forged new block id: 1 height: 2',
      '[inf] 2026-06-04T12:00:05.000Z | delegates | Forged new block id: 2 height: 3'
    ].join('\n'));

    const node = {
      overrideFile,
      generalLogFile
    };
    const lastForging = localnetStatus.findLastForgingEvent(generalLogFile);

    expect(localnetStatus.readDelegateSecretsCount(node)).to.equal(2);
    expect(lastForging.timestamp).to.equal('2026-06-04T12:00:05.000Z');
  });

  it('should mark missing localnet processes as stopped', async () => {
    const options = localnet.normalizeOptions({
      cwd: tempDir,
      runtimeDir: '.localnet-test',
      logsDir: 'logs-localnet-test'
    });
    const manifestPath = localnet.getManifestPath(options);

    fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
    fs.writeFileSync(manifestPath, JSON.stringify({
      status: 'running',
      nodes: [
        {
          id: 'node-1',
          pid: 999999999
        }
      ]
    }, null, 2));

    const result = await localnet.stopLocalnet({
      cwd: tempDir,
      runtimeDir: '.localnet-test',
      logsDir: 'logs-localnet-test',
      stopTimeoutMs: 1
    });
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

    expect(result.stopped).to.be.empty;
    expect(result.timedOut).to.be.empty;
    expect(result.missing.map((node) => node.id)).to.deep.equal(['node-1']);
    expect(manifest.status).to.equal('stopped');
    expect(manifest.stopResult).to.deep.equal({
      stopped: [],
      missing: ['node-1'],
      timedOut: []
    });
  });

  it('should drop localnet databases on stop when requested', async () => {
    const options = localnet.normalizeOptions({
      cwd: tempDir,
      runtimeDir: '.localnet-test',
      logsDir: 'logs-localnet-test'
    });
    const manifestPath = localnet.getManifestPath(options);
    const spawnSync = sinon.stub(childProcess, 'spawnSync');

    spawnSync.withArgs('psql').returns({
      status: 0,
      stdout: 'adamant_localnet_node_1\nadamant_localnet_node_2\n',
      stderr: ''
    });
    spawnSync.withArgs('dropdb').returns({
      status: 0,
      stdout: '',
      stderr: ''
    });

    fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
    fs.writeFileSync(manifestPath, JSON.stringify({
      status: 'running',
      nodes: [
        {
          id: 'node-1',
          pid: 999999999,
          db: {
            database: 'adamant_localnet_node_1'
          }
        }
      ]
    }, null, 2));

    const result = await localnet.stopLocalnet({
      cwd: tempDir,
      runtimeDir: '.localnet-test',
      logsDir: 'logs-localnet-test',
      dropOnStop: true
    });
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

    expect(result.dropResult.dropped).to.deep.equal([
      'adamant_localnet_node_1',
      'adamant_localnet_node_2'
    ]);
    expect(manifest.dropResult.dropped).to.deep.equal(result.dropResult.dropped);
    expect(spawnSync.withArgs('dropdb').callCount).to.equal(2);
  });

  it('should stop and drop localnet databases with dropLocalnet', async () => {
    const spawnSync = sinon.stub(childProcess, 'spawnSync');

    spawnSync.withArgs('psql').returns({
      status: 0,
      stdout: 'adamant_localnet_node_1\n',
      stderr: ''
    });
    spawnSync.withArgs('dropdb').returns({
      status: 0,
      stdout: '',
      stderr: ''
    });

    const result = await localnet.dropLocalnet({
      cwd: tempDir,
      runtimeDir: '.localnet-test',
      logsDir: 'logs-localnet-test'
    });

    expect(result.stopResult.message).to.equal('No localnet manifest found.');
    expect(result.dropResult.dropped).to.deep.equal(['adamant_localnet_node_1']);
    expect(spawnSync.withArgs('dropdb').firstCall.args[1]).to.deep.equal([
      '-h',
      'localhost',
      '-p',
      '5432',
      '--if-exists',
      'adamant_localnet_node_1'
    ]);
  });
});
