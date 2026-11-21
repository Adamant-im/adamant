'use strict';

const { expect } = require('chai');
const fs = require('fs');
const path = require('path');
const sinon = require('sinon');

const ed = require('../../../helpers/ed.js');
const forgingControl = require('../../../helpers/forgingControl.js');
const forgingSecret = require('../../../helpers/forgingSecret.js');
const jobsQueue = require('../../../helpers/jobsQueue.js');
const promptSecret = require('../../../helpers/promptSecret.js');
const Sequence = require('../../../helpers/sequence.js');
const Delegates = require('../../../modules/delegates.js');
const slots = require('../../../helpers/slots.js');

const PASSPHRASE = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const PASSWORD = 'correct horse battery staple';

describe('encrypted delegate forging lifecycle', function () {
  let runtimeDir;
  let socketPath;
  let delegates;
  let delegateEligible;
  let forgingSequence;
  let generateBlockStub;
  let peerLookupCallback;
  let peerLookupDeferred;
  let peerLookupStarted;
  let resolvePeerLookupStarted;
  let registeredJob;
  let registerStub;
  let registeredPromise;
  let resolveRegistered;

  function startDelegates (secrets, cb) {
    const blob = forgingSecret.encrypt(PASSPHRASE, PASSWORD);
    const identity = forgingSecret.parseHeader(blob);
    const logger = {
      debug: sinon.stub(),
      error: sinon.stub(),
      info: sinon.stub(),
      warn: sinon.stub()
    };
    forgingSequence = new Sequence();
    const scope = {
      balancesSequence: new Sequence(),
      config: {
        forging: {
          controlSocket: socketPath,
          secret: secrets(blob)
        },
        port: 36666
      },
      db: {},
      ed,
      logger,
      network: {},
      schema: {},
      sequence: forgingSequence,
      logic: {
        consensus: {
          isActivated: function () {
            return false;
          }
        },
        transaction: {
          attachAssetType: function () {
            return {
              bind: function () {}
            };
          }
        }
      }
    };

    new Delegates(function (err, instance) {
      if (err) {
        return cb(err);
      }

      delegates = instance;
      delegates.onBind({
        accounts: {
          getAccount: function (query, done) {
            if (query.publicKey !== identity.publicKey) {
              return setImmediate(done, null, null);
            }

            setImmediate(done, null, {
              address: identity.address,
              isDelegate: delegateEligible ? 1 : 0,
              publicKey: identity.publicKey
            });
          },
          getAccounts: function (query, fields, done) {
            setImmediate(done, null, [{
              publicKey: identity.publicKey
            }]);
          }
        },
        blocks: {
          lastBlock: {
            get: function () {
              return {
                height: 1,
                timestamp: -1
              };
            }
          },
          lastReceipt: {
            update: sinon.stub()
          },
          process: {
            generateBlock: generateBlockStub
          }
        },
        loader: {
          isReadyToSync: function () {
            return true;
          },
          syncing: function () {
            return false;
          }
        },
        rounds: {
          calc: function () {
            return 1;
          },
          loaded: function () {
            return true;
          },
          ticking: function () {
            return false;
          }
        },
        transport: {
          consensus: function () {
            return 100;
          },
          getPeers: function (query, done) {
            if (!peerLookupDeferred) {
              return setImmediate(done, null, []);
            }

            peerLookupCallback = done;
            resolvePeerLookupStarted();
          },
          poorConsensus: function () {
            return false;
          }
        },
        delegates: instance,
        transactions: {
          fillPool: function (done) {
            setImmediate(done);
          }
        }
      });

      delegates.onBlockchainReady();
      return cb();
    }, scope);
  }

  function send (command, payload) {
    return new Promise(function (resolve, reject) {
      forgingControl.sendCommand(socketPath, Object.assign({
        cmd: command
      }, payload), function (err, response) {
        if (err) {
          return reject(err);
        }

        return resolve(response);
      });
    });
  }

  beforeEach(function () {
    runtimeDir = fs.mkdtempSync(path.join('/tmp', 'adn-'));
    fs.chmodSync(runtimeDir, 0o700);
    socketPath = path.join(runtimeDir, 'control.sock');
    generateBlockStub = sinon.stub().callsFake(function (keypair, timestamp, done) {
      setImmediate(done);
    });
    peerLookupDeferred = false;
    peerLookupStarted = new Promise(function (resolve) {
      resolvePeerLookupStarted = resolve;
    });
    registeredPromise = new Promise(function (resolve) {
      resolveRegistered = resolve;
    });
    delegateEligible = true;
    registerStub = sinon.stub(jobsQueue, 'register').callsFake(function (name, job) {
      registeredJob = job;
      resolveRegistered();
    });
  });

  afterEach(function (done) {
    registerStub.restore();

    function removeRuntimeDir (err) {
      fs.rmSync(runtimeDir, { recursive: true, force: true });
      done(err);
    }

    if (!delegates) {
      return removeRuntimeDir();
    }

    delegates.cleanup(function (err) {
      delegates = null;
      removeRuntimeDir(err);
    });
  });

  it('stays operational and locked until a password is supplied to the control socket', async function () {
    await new Promise(function (resolve, reject) {
      startDelegates(function (blob) {
        return [blob];
      }, function (err) {
        if (err) {
          return reject(err);
        }

        return resolve();
      });
    });

    await registeredPromise;

    const locked = await send('status');
    expect(locked.status.forging).to.equal('locked');
    expect(locked.status.encryptedDelegates).to.equal(1);
    expect(locked.status.loadedKeypairs).to.equal(0);

    const wrong = await send('unlock', { password: 'wrong password' });
    expect(wrong.ok).to.equal(false);
    expect(wrong.error).to.match(/Wrong operator password/);

    const unlocked = await send('unlock', { password: PASSWORD });
    expect(unlocked.ok).to.equal(true);
    expect(unlocked.status.forging).to.equal('unlocked');
    expect(unlocked.status.loadedKeypairs).to.equal(1);

    const lockedAgain = await send('lock');
    expect(lockedAgain.ok).to.equal(true);
    expect(lockedAgain.status.forging).to.equal('locked');
    expect(lockedAgain.status.loadedKeypairs).to.equal(0);
  });

  it('does not remove a plaintext keypair when locking the same encrypted delegate', async function () {
    await new Promise(function (resolve, reject) {
      startDelegates(function (blob) {
        return [PASSPHRASE, blob];
      }, function (err) {
        if (err) {
          return reject(err);
        }

        return resolve();
      });
    });

    await registeredPromise;

    const unlocked = await send('unlock', { password: PASSWORD });
    expect(unlocked.status.loadedKeypairs).to.equal(1);

    const locked = await send('lock');
    expect(locked.status.loadedKeypairs).to.equal(1);
    expect(locked.status.forging).to.equal('partial');
  });

  it('rolls back all keypairs when one encrypted delegate uses a different password', async function () {
    await new Promise(function (resolve, reject) {
      startDelegates(function (blob) {
        return [
          blob,
          forgingSecret.encrypt(ed.generatePassphrase(), 'a different operator password')
        ];
      }, function (err) {
        if (err) {
          return reject(err);
        }

        return resolve();
      });
    });

    await registeredPromise;

    const unlocked = await send('unlock', { password: PASSWORD });
    expect(unlocked.ok).to.equal(false);

    const status = await send('status');
    expect(status.status.forging).to.equal('locked');
    expect(status.status.loadedKeypairs).to.equal(0);
  });

  it('starts the forging and mempool job while an interactive unlock prompt is pending', async function () {
    const originalTty = Object.getOwnPropertyDescriptor(process.stdin, 'isTTY');
    const promptStub = sinon.stub(promptSecret, 'promptHidden').callsFake(function () {});

    Object.defineProperty(process.stdin, 'isTTY', {
      configurable: true,
      value: true
    });

    try {
      await new Promise(function (resolve, reject) {
        startDelegates(function (blob) {
          return [blob];
        }, function (err) {
          if (err) {
            return reject(err);
          }

          return resolve();
        });
      });

      await registeredPromise;
      expect(registerStub.calledOnce).to.equal(true);
      expect(promptStub.calledOnce).to.equal(true);
    } finally {
      promptStub.restore();

      if (originalTty) {
        Object.defineProperty(process.stdin, 'isTTY', originalTty);
      } else {
        delete process.stdin.isTTY;
      }
    }
  });

  it('keeps the node running when a plaintext forging secret is invalid', async function () {
    await new Promise(function (resolve, reject) {
      startDelegates(function () {
        return ['not a valid BIP39 mnemonic'];
      }, function (err) {
        if (err) {
          return reject(err);
        }

        return resolve();
      });
    });

    await registeredPromise;

    const status = await send('status');
    expect(status.status.forging).to.equal('disabled');
    expect(status.status.plaintextDelegates).to.equal(1);
    expect(status.status.loadedKeypairs).to.equal(0);
  });

  it('retries plaintext delegates that have not become delegates yet', async function () {
    delegateEligible = false;

    await new Promise(function (resolve, reject) {
      startDelegates(function () {
        return [PASSPHRASE];
      }, function (err) {
        if (err) {
          return reject(err);
        }

        return resolve();
      });
    });

    await registeredPromise;

    const beforePromotion = await send('status');
    expect(beforePromotion.status.loadedKeypairs).to.equal(0);

    delegateEligible = true;
    await new Promise(function (resolve) {
      registeredJob(resolve);
    });

    const afterPromotion = await send('status');
    expect(afterPromotion.status.forging).to.equal('unlocked');
    expect(afterPromotion.status.loadedKeypairs).to.equal(1);
  });

  it('does not forge with a key while a lock request is already queued', async function () {
    await new Promise(function (resolve, reject) {
      startDelegates(function (blob) {
        return [blob];
      }, function (err) {
        if (err) {
          return reject(err);
        }

        return resolve();
      });
    });

    await registeredPromise;
    await send('unlock', { password: PASSWORD });

    const getSlotNumberStub = sinon.stub(slots, 'getSlotNumber').callsFake(function (timestamp) {
      return timestamp === -1 ? -1 : 0;
    });
    const getLastSlotStub = sinon.stub(slots, 'getLastSlot').returns(1);
    const getSlotTimeStub = sinon.stub(slots, 'getSlotTime').returns(0);
    peerLookupDeferred = true;

    try {
      const forgeFinished = new Promise(function (resolve) {
        registeredJob(resolve);
      });

      await peerLookupStarted;

      const lockRequest = send('lock');

      while (forgingSequence.count() === 0) {
        await new Promise(function (resolve) {
          setImmediate(resolve);
        });
      }

      peerLookupCallback(null, []);

      const locked = await lockRequest;
      await forgeFinished;

      expect(locked.status.forging).to.equal('locked');
      expect(generateBlockStub.called).to.equal(false);
    } finally {
      getSlotNumberStub.restore();
      getLastSlotStub.restore();
      getSlotTimeStub.restore();
    }
  });
});
