'use strict';

const { expect } = require('chai');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const forgingControl = require('../../../helpers/forgingControl.js');

describe('forgingControl', () => {
  describe('resolveControlSocketPath()', () => {
    it('includes the node port in the default per-user path', () => {
      const socketPath = forgingControl.resolveControlSocketPath({ port: 36666, controlSocket: '' });

      expect(socketPath).to.equal(path.join(forgingControl.controlSocketDir(), 'control-36666.sock'));
    });

    it('uses an explicit control socket path when one is configured', () => {
      const configured = path.join(os.tmpdir(), 'explicit-adamant-control.sock');

      expect(forgingControl.resolveControlSocketPath({
        port: 1,
        controlSocket: configured
      })).to.equal(configured);
    });

    it('uses XDG_RUNTIME_DIR for the default path when configured', () => {
      const runtimeRoot = fs.mkdtempSync(path.join('/tmp', 'afc-xdg-'));
      const previous = process.env.XDG_RUNTIME_DIR;

      process.env.XDG_RUNTIME_DIR = runtimeRoot;

      try {
        expect(forgingControl.controlSocketDir()).to.equal(
            path.join(runtimeRoot, 'adamant-node')
        );
      } finally {
        if (previous === undefined) {
          delete process.env.XDG_RUNTIME_DIR;
        } else {
          process.env.XDG_RUNTIME_DIR = previous;
        }
        fs.rmSync(runtimeRoot, { recursive: true, force: true });
      }
    });

    it('falls back to the repository runtime directory without XDG_RUNTIME_DIR', () => {
      const previous = process.env.XDG_RUNTIME_DIR;

      delete process.env.XDG_RUNTIME_DIR;

      try {
        expect(forgingControl.controlSocketDir()).to.equal(
            path.resolve(__dirname, '../../..', '.run')
        );
      } finally {
        if (previous !== undefined) {
          process.env.XDG_RUNTIME_DIR = previous;
        }
      }
    });
  });

  describe('path hardening', () => {
    let runtimeRoot;
    let runtimeDir;
    let socketPath;

    const handler = {
      status: function () {
        return { forging: 'locked' };
      },
      unlock: function (password, cb) {
        setImmediate(cb, null, { unlocked: 1 });
      },
      lock: function (cb) {
        setImmediate(cb);
      }
    };

    beforeEach(() => {
      runtimeRoot = fs.mkdtempSync(path.join('/tmp', 'afc-'));
      runtimeDir = path.join(runtimeRoot, 'runtime');
      socketPath = path.join(runtimeDir, 'control.sock');
      fs.mkdirSync(runtimeDir, { mode: 0o700 });
    });

    afterEach(() => {
      fs.rmSync(runtimeRoot, { recursive: true, force: true });
    });

    it('rejects a symlinked control directory', (done) => {
      const linkedDir = path.join(runtimeRoot, 'linked-runtime');

      fs.symlinkSync(runtimeDir, linkedDir, 'dir');

      forgingControl.start({
        controlSocket: path.join(linkedDir, 'control.sock')
      }, handler, null, (err, control) => {
        expect(err).to.exist;
        expect(err.message).to.match(/not a real directory/);
        expect(control).to.not.exist;
        expect(fs.existsSync(socketPath)).to.equal(false);
        done();
      });
    });

    it('does not chmod a symlinked default runtime directory', (done) => {
      const xdgRoot = path.join(runtimeRoot, 'xdg');
      const target = path.join(runtimeRoot, 'target');
      const symlinkPath = path.join(xdgRoot, 'adamant-node');
      const previous = process.env.XDG_RUNTIME_DIR;

      fs.mkdirSync(xdgRoot, { mode: 0o700 });
      fs.mkdirSync(target, { mode: 0o755 });
      fs.symlinkSync(target, symlinkPath, 'dir');
      process.env.XDG_RUNTIME_DIR = xdgRoot;

      forgingControl.start({
        port: 36666,
        controlSocket: ''
      }, handler, null, (err, control) => {
        if (previous === undefined) {
          delete process.env.XDG_RUNTIME_DIR;
        } else {
          process.env.XDG_RUNTIME_DIR = previous;
        }

        expect(err).to.exist;
        expect(err.message).to.match(/not a real directory/);
        expect(control).to.not.exist;
        expect(fs.statSync(target).mode & 0o777).to.equal(0o755);
        done();
      });
    });

    it('does not replace a regular file at the configured socket path', (done) => {
      fs.writeFileSync(socketPath, 'operator-owned file');

      forgingControl.start({
        controlSocket: socketPath
      }, handler, null, (err, control) => {
        expect(err).to.exist;
        expect(err.message).to.match(/not a Unix socket/);
        expect(control).to.not.exist;
        expect(fs.readFileSync(socketPath, 'utf8')).to.equal('operator-owned file');
        done();
      });
    });

    it('rejects a custom directory writable by another user', (done) => {
      fs.chmodSync(runtimeDir, 0o770);

      forgingControl.start({
        controlSocket: socketPath
      }, handler, null, (err, control) => {
        expect(err).to.exist;
        expect(err.message).to.match(/not securely permissioned/);
        expect(control).to.not.exist;
        done();
      });
    });

    it('rejects an existing custom directory instead of changing its mode', (done) => {
      fs.chmodSync(runtimeDir, 0o755);

      forgingControl.start({
        controlSocket: socketPath
      }, handler, null, (err, control) => {
        expect(err).to.exist;
        expect(err.message).to.match(/not securely permissioned/);
        expect(control).to.not.exist;
        expect(fs.statSync(runtimeDir).mode & 0o777).to.equal(0o755);
        done();
      });
    });

    it('uses a canonical parent before connecting through symlinked ancestors', (done) => {
      const alias = path.join(runtimeRoot, 'alias');
      const fakeRoot = path.join(runtimeRoot, 'fake-root');
      const configuredPath = path.join(alias, 'runtime', 'control.sock');

      fs.mkdirSync(path.join(fakeRoot, 'runtime'), {
        recursive: true,
        mode: 0o700
      });
      fs.symlinkSync(runtimeRoot, alias, 'dir');

      forgingControl.start({
        controlSocket: configuredPath
      }, handler, null, (err, control) => {
        expect(err).to.equal(null);
        expect(control.path).to.equal(path.join(fs.realpathSync(runtimeDir), 'control.sock'));

        fs.unlinkSync(alias);
        fs.symlinkSync(fakeRoot, alias, 'dir');

        forgingControl.sendCommand(configuredPath, { cmd: 'status' }, (redirectedErr) => {
          expect(redirectedErr).to.exist;

          fs.unlinkSync(alias);
          fs.symlinkSync(runtimeRoot, alias, 'dir');

          forgingControl.sendCommand(configuredPath, { cmd: 'status' }, (statusErr, response) => {
            expect(statusErr).to.equal(null);
            expect(response.ok).to.equal(true);
            control.close(done);
          });
        });
      });
    });
  });

  describe('socket commands', () => {
    let runtimeDir;
    let socketPath;
    let control;
    let unlockedWith;

    beforeEach((done) => {
      runtimeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'adamant-forging-control-'));
      fs.chmodSync(runtimeDir, 0o700);
      socketPath = path.join(runtimeDir, 'control.sock');
      unlockedWith = null;
      forgingControl.start({
        controlSocket: socketPath
      }, {
        status: function () {
          return {
            forging: unlockedWith ? 'unlocked' : 'locked',
            encryptedDelegates: 1,
            plaintextDelegates: 0,
            loadedKeypairs: unlockedWith ? 1 : 0,
            delegates: []
          };
        },
        unlock: function (password, cb) {
          unlockedWith = password;
          if (password !== 'right-password') {
            return setImmediate(cb, new Error('Wrong operator password or corrupted encrypted passphrase.'));
          }
          return setImmediate(cb, null, { unlocked: 1 });
        },
        lock: function (cb) {
          unlockedWith = null;
          return setImmediate(cb);
        }
      }, null, (err, started) => {
        control = started;
        done(err);
      });
    });

    afterEach((done) => {
      if (!control) {
        fs.rmSync(runtimeDir, { recursive: true, force: true });
        return done();
      }

      control.close(() => {
        control = null;
        fs.rmSync(runtimeDir, { recursive: true, force: true });
        done();
      });
    });

    it('creates an owner-only socket and returns status without secrets', (done) => {
      expect(fs.statSync(socketPath).mode & 0o777).to.equal(0o600);

      forgingControl.sendCommand(socketPath, { cmd: 'status' }, (err, response) => {
        expect(err).to.equal(null);
        expect(response.ok).to.equal(true);
        expect(response.status.forging).to.equal('locked');
        expect(JSON.stringify(response)).to.not.include('password');
        expect(JSON.stringify(response)).to.not.include('passphrase');
        done();
      });
    });

    it('unlocks with the operator password and does not echo it', (done) => {
      const payload = {
        cmd: 'unlock',
        password: 'right-password'
      };

      forgingControl.sendCommand(socketPath, payload, (err, response) => {
        expect(err).to.equal(null);
        expect(payload.password).to.equal(null);
        expect(response.ok).to.equal(true);
        expect(response.message).to.match(/unlocked for 1 delegate/);
        expect(response.status.forging).to.equal('unlocked');
        expect(JSON.stringify(response)).to.not.include('right-password');
        expect(unlockedWith).to.equal('right-password');
        done();
      });
    });

    it('rejects a wrong password without returning it', (done) => {
      forgingControl.sendCommand(socketPath, {
        cmd: 'unlock',
        password: 'wrong-password'
      }, (err, response) => {
        expect(err).to.equal(null);
        expect(response.ok).to.equal(false);
        expect(response.error).to.match(/Wrong operator password/);
        expect(JSON.stringify(response)).to.not.include('wrong-password');
        done();
      });
    });

    it('locks and rejects a malformed request', (done) => {
      forgingControl.sendCommand(socketPath, {
        cmd: 'unlock',
        password: 'right-password'
      }, (err) => {
        expect(err).to.equal(null);

        forgingControl.sendCommand(socketPath, { cmd: 'lock' }, (lockErr, locked) => {
          expect(lockErr).to.equal(null);
          expect(locked.ok).to.equal(true);
          expect(locked.status.forging).to.equal('locked');

          forgingControl.sendCommand(socketPath, { cmd: 'nope' }, (badErr, bad) => {
            expect(badErr).to.equal(null);
            expect(bad.ok).to.equal(false);
            expect(bad.error).to.match(/Unknown command/);
            done();
          });
        });
      });

      describe('adm-node monitoring status', () => {
        const cli = path.join(__dirname, '../../../tools/adm-node.js');
        let runtimeDir;
        let socketPath;
        let control;

        function runCli (args) {
          return new Promise((resolve, reject) => {
            const child = spawn(process.execPath, [cli].concat(args), {
              stdio: ['ignore', 'pipe', 'pipe']
            });
            let stdout = '';
            let stderr = '';

            child.stdout.on('data', (chunk) => {
              stdout += chunk.toString('utf8');
            });
            child.stderr.on('data', (chunk) => {
              stderr += chunk.toString('utf8');
            });
            child.on('error', reject);
            child.on('close', (code) => {
              resolve({ code, stdout, stderr });
            });
          });
        }

        beforeEach((done) => {
          runtimeDir = fs.mkdtempSync(path.join('/tmp', 'adm-zabbix-'));
          fs.chmodSync(runtimeDir, 0o700);
          socketPath = path.join(runtimeDir, 'control.sock');

          forgingControl.start({
            controlSocket: socketPath
          }, {
            status: function () {
              return {
                forging: 'loading',
                encryptedDelegates: 2,
                encryptedDelegatesLoaded: 0,
                invalidEncryptedDelegates: 1,
                plaintextDelegates: 1,
                loadedKeypairs: 1,
                delegates: [{
                  address: 'private-address',
                  publicKey: 'private-public-key',
                  source: 'encrypted',
                  loaded: false
                }]
              };
            },
            unlock: function (password, cb) {
              setImmediate(cb);
            },
            lock: function (cb) {
              setImmediate(cb);
            }
          }, null, (err, started) => {
            control = started;
            done(err);
          });
        });

        afterEach((done) => {
          control.close(() => {
            control = null;
            fs.rmSync(runtimeDir, { recursive: true, force: true });
            done();
          });
        });

        it('prints identity-free one-line JSON without loading config', async () => {
          const result = await runCli([
            'forging',
            'status',
            '--json',
            '--socket',
            socketPath,
            '--timeout',
            '1500',
            '--config',
            path.join(runtimeDir, 'does-not-exist.json')
          ]);

          expect(result.code).to.equal(0);
          expect(result.stderr).to.equal('');
          expect(result.stdout.trim().split('\n')).to.have.length(1);
          expect(JSON.parse(result.stdout)).to.deep.equal({
            state: 'loading',
            encrypted: 2,
            encryptedLoaded: 0,
            plaintext: 1,
            invalidEncrypted: 1,
            loadedKeypairs: 1
          });
          expect(result.stdout).to.not.include('private-address');
          expect(result.stdout).to.not.include('private-public-key');
        });

        it('explains local socket validation failures', async () => {
          const regularPath = path.join(runtimeDir, 'regular-file');
          fs.writeFileSync(regularPath, 'not a socket');

          const result = await runCli([
            'forging',
            'status',
            '--json',
            '--socket',
            regularPath
          ]);

          expect(result.code).to.equal(1);
          expect(result.stdout).to.equal('');
          expect(result.stderr).to.match(/not a Unix socket/);
          expect(result.stderr).to.match(/node service user/);
        });

        it('applies config override files and config-set values like the node', async () => {
          const configPath = path.join(__dirname, '../../../config.default.json');
          const overridePath = path.join(runtimeDir, 'config.override.json');

          fs.writeFileSync(overridePath, JSON.stringify({
            forging: {
              controlSocket: socketPath
            }
          }));

          const fromFile = await runCli([
            'forging',
            'status',
            '--json',
            '--config',
            configPath,
            '--config-overrides',
            overridePath
          ]);

          expect(fromFile.code).to.equal(0);
          expect(JSON.parse(fromFile.stdout).state).to.equal('loading');

          fs.writeFileSync(overridePath, '{}');

          const fromSet = await runCli([
            'forging',
            'status',
            '--json',
            '--config',
            configPath,
            '--config-overrides',
            overridePath,
            '--config-set',
            'forging.controlSocket=' + socketPath
          ]);

          expect(fromSet.code).to.equal(0);
          expect(JSON.parse(fromSet.stdout).state).to.equal('loading');

          const forced = await runCli([
            'forging',
            'status',
            '--json',
            '--config',
            configPath,
            '--config-overrides',
            overridePath,
            '--config-set',
            'forging.controlSocket=' + socketPath,
            '--config-set',
            'forging.force=true'
          ]);

          expect(forced.code).to.equal(0);
          expect(forced.stdout.trim().split('\n')).to.have.length(1);
          expect(JSON.parse(forced.stdout).state).to.equal('loading');
        });
      });
    });
  });
});
