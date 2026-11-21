'use strict';

const { expect } = require('chai');
const fs = require('fs');
const os = require('os');
const path = require('path');
const sinon = require('sinon');
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

    it('always uses the repository runtime directory', () => {
      expect(forgingControl.controlSocketDir()).to.equal(
          path.resolve(__dirname, '../../..', '.run')
      );
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

    it('rejects a socket below a writable ancestor', (done) => {
      const untrustedParent = path.join(runtimeRoot, 'untrusted');
      const privateChild = path.join(untrustedParent, 'private');

      fs.mkdirSync(untrustedParent, { mode: 0o777 });
      fs.chmodSync(untrustedParent, 0o777);
      fs.mkdirSync(privateChild, { mode: 0o700 });

      forgingControl.start({
        controlSocket: path.join(privateChild, 'control.sock')
      }, handler, null, (err, control) => {
        expect(err).to.exist;
        expect(err.message).to.match(/writable by another user/);
        expect(err.message).to.match(/chmod g-w,o-w /);
        expect(control).to.not.exist;
        done();
      });
    });

    it('reports a group-writable checkout before the socket directory exists', () => {
      const checkout = path.join(runtimeRoot, 'checkout');

      fs.mkdirSync(checkout, { mode: 0o700 });
      fs.chmodSync(checkout, 0o775);

      expect(() => forgingControl.checkControlSocketLocation(
          path.join(checkout, '.run', 'control-36666.sock')
      )).to.throw(/writable by another user: .*checkout\. Remove group and other write access \(chmod g-w,o-w /);
      expect(fs.existsSync(path.join(checkout, '.run'))).to.equal(false);
    });

    it('accepts a private location whose socket directory does not exist yet', () => {
      expect(() => forgingControl.checkControlSocketLocation(
          path.join(runtimeDir, 'missing', 'control.sock')
      )).to.not.throw();
      expect(fs.existsSync(path.join(runtimeDir, 'missing'))).to.equal(false);
    });

    it('rejects a foreign-owned sticky ancestor', (done) => {
      const lstatSync = fs.lstatSync;
      const canonicalRuntimeRoot = fs.realpathSync(runtimeRoot);

      fs.chmodSync(runtimeRoot, 0o1777);
      const lstatStub = sinon.stub(fs, 'lstatSync').callsFake(function (target) {
        const stats = lstatSync(target);

        if (
          path.resolve(target) === canonicalRuntimeRoot &&
          typeof process.getuid === 'function'
        ) {
          stats.uid = process.getuid() + 1;
        }

        return stats;
      });

      forgingControl.start({
        controlSocket: socketPath
      }, handler, null, (err, control) => {
        lstatStub.restore();

        if (control) {
          return control.close(function () {
            done(new Error('Expected foreign-owned ancestor to be rejected.'));
          });
        }

        try {
          expect(err).to.exist;
          expect(err.message).to.match(/owned by another user/);
          done();
        } catch (assertionErr) {
          done(assertionErr);
        }
      });
    });

    it('revalidates writable ancestors on the client before sending', (done) => {
      const childDir = path.join(runtimeDir, 'private-child');
      const nestedSocket = path.join(childDir, 'control.sock');

      fs.mkdirSync(childDir, { mode: 0o700 });

      forgingControl.start({
        controlSocket: nestedSocket
      }, handler, null, (err, control) => {
        expect(err).to.equal(null);
        fs.chmodSync(runtimeDir, 0o777);

        forgingControl.sendCommand(nestedSocket, {
          cmd: 'unlock',
          password: 'must-not-be-sent'
        }, (sendErr) => {
          expect(sendErr).to.exist;
          expect(sendErr.message).to.match(/writable by another user/);
          control.close(done);
        });
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
        const wrapper = path.join(__dirname, '../../../tools/zabbix/adm-forging-status');
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

        function runWrapper (args) {
          return new Promise((resolve, reject) => {
            const child = spawn('/bin/sh', [wrapper].concat(args), {
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

        it('makes an invalid Zabbix wrapper instance a deterministic unavailable state', async () => {
          const result = await runWrapper(['not-an-instance']);

          expect(result.code).to.equal(0);
          expect(result.stderr).to.equal('');
          expect(JSON.parse(result.stdout)).to.deep.equal({
            state: 'unavailable',
            encrypted: 0,
            encryptedLoaded: 0,
            plaintext: 0,
            invalidEncrypted: 0,
            loadedKeypairs: 0
          });
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
