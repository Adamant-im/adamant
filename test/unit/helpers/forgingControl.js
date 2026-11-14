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

  describe('socket commands', () => {
    const socketPath = path.join(os.tmpdir(), 'adamant-forging-control-' + process.pid + '.sock');
    let control;
    let unlockedWith;

    beforeEach((done) => {
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
        return done();
      }

      control.close(() => {
        control = null;
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
      forgingControl.sendCommand(socketPath, {
        cmd: 'unlock',
        password: 'right-password'
      }, (err, response) => {
        expect(err).to.equal(null);
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
