'use strict';

const { expect } = require('chai');
const fs = require('fs');
const os = require('os');
const path = require('path');

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

    it('changes an existing custom directory to owner-only mode', (done) => {
      fs.chmodSync(runtimeDir, 0o755);

      forgingControl.start({
        controlSocket: socketPath
      }, handler, null, (err, control) => {
        expect(err).to.equal(null);
        expect(fs.statSync(runtimeDir).mode & 0o777).to.equal(0o700);

        control.close(done);
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
    });
  });
});
