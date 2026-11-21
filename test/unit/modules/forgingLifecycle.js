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
  let delegateFound;
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

  function startDelegates (secrets, cb, options) {
    options = options || {};
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
          controlSocket: options.controlSocket === undefined ? socketPath : options.controlSocket,
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

            if (!delegateFound) {
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

      if (options.blockchainReady !== false) {
        delegates.onBlockchainReady();
      }
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
    delegateFound = true;
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

  it('answers loading before blockchain readiness and rejects unlock until ready', async function () {
    await new Promise(function (resolve, reject) {
      startDelegates(function (blob) {
        return [blob];
      }, function (err) {
        if (err) {
          return reject(err);
        }
        return resolve();
      }, {
        blockchainReady: false
      });
    });

    const loading = await send('status');
    expect(loading.ok).to.equal(true);
    expect(loading.status.forging).to.equal('loading');

    const earlyUnlock = await send('unlock', { password: PASSWORD });
    expect(earlyUnlock.ok).to.equal(false);
    expect(earlyUnlock.error).to.match(/still loading/);

    delegates.onBlockchainReady();
    await registeredPromise;

    const locked = await send('status');
    expect(locked.status.forging).to.equal('locked');
  });

  it('keeps a decrypted key when its delegate account is not on the local chain yet', async function () {
    delegateFound = false;

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

    const unlocked = await send('unlock', { password: PASSWORD });
    expect(unlocked.ok).to.equal(true);
    expect(unlocked.status.loadedKeypairs).to.equal(1);
    expect(unlocked.status.forging).to.equal('unlocked');
  });

  it('locks without waiting for unrelated sequence work', async function () {
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

    let finishSequenceWork;
    const sequenceStarted = new Promise(function (resolve) {
      forgingSequence.add(function (done) {
        finishSequenceWork = done;
        resolve();
      });
    });

    await sequenceStarted;

    const locked = await send('lock');
    expect(locked.ok).to.equal(true);
    expect(locked.status.forging).to.equal('locked');
    expect(locked.status.loadedKeypairs).to.equal(0);

    finishSequenceWork();
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

  it('does not open a control socket for nodes with only plaintext secrets', async function () {
    const startSpy = sinon.spy(forgingControl, 'start');

    try {
      await new Promise(function (resolve, reject) {
        startDelegates(function () {
          return [PASSPHRASE];
        }, function (err) {
          if (err) {
            return reject(err);
          }
          return resolve();
        }, {
          controlSocket: ''
        });
      });

      await registeredPromise;
      expect(startSpy.called).to.equal(false);
    } finally {
      startSpy.restore();
    }
  });

  it('opens the control socket for malformed encrypted entries', async function () {
    const startStub = sinon.stub(forgingControl, 'start').callsFake(function (options, handler, logger, cb) {
      setImmediate(cb, null, null);
    });

    try {
      await new Promise(function (resolve, reject) {
        startDelegates(function () {
          return [forgingSecret.ENCRYPTED_PREFIX + 'invalid'];
        }, function (err) {
          if (err) {
            return reject(err);
          }
          return resolve();
        }, {
          controlSocket: ''
        });
      });

      await registeredPromise;
      expect(startStub.calledOnce).to.equal(true);
    } finally {
      startStub.restore();
    }
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
      await new Promise(function (resolve) {
        setTimeout(resolve, 20);
      });

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

  it('keeps plaintext forging responsive while encrypted unlock is pending', async function () {
    const realDecrypt = forgingSecret.decrypt;
    let finishDecrypt;
    let markDecryptStarted;
    const decryptStarted = new Promise(function (resolve) {
      markDecryptStarted = resolve;
    });
    const decryptStub = sinon.stub(forgingSecret, 'decrypt').callsFake(function (blob, password, cb) {
      finishDecrypt = function () {
        realDecrypt(blob, password, cb);
      };
      markDecryptStarted();
    });

    try {
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
      const unlockRequest = send('unlock', { password: PASSWORD });
      await decryptStarted;

      const duringUnlock = await send('status');
      expect(duringUnlock.status.forging).to.equal('partial');
      expect(duringUnlock.status.loadedKeypairs).to.equal(1);

      const getSlotNumberStub = sinon.stub(slots, 'getSlotNumber').callsFake(function (timestamp) {
        return timestamp === undefined || timestamp === 0 ? 0 : -1;
      });
      const getLastSlotStub = sinon.stub(slots, 'getLastSlot').returns(1);
      const getSlotTimeStub = sinon.stub(slots, 'getSlotTime').returns(0);

      try {
        await new Promise(function (resolve) {
          registeredJob(resolve);
        });

        expect(generateBlockStub.calledOnce).to.equal(true);
      } finally {
        getSlotNumberStub.restore();
        getLastSlotStub.restore();
        getSlotTimeStub.restore();
      }

      finishDecrypt();
      finishDecrypt = null;
      const unlocked = await unlockRequest;
      expect(unlocked.ok).to.equal(true);
      expect(unlocked.status.loadedKeypairs).to.equal(1);
    } finally {
      if (finishDecrypt) {
        finishDecrypt();
      }
      decryptStub.restore();
    }
  });

  it('preserves production when a planned slot passes while queued', async function () {
    var currentSlot = 0;

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
    peerLookupDeferred = true;

    const getSlotNumberStub = sinon.stub(slots, 'getSlotNumber').callsFake(function (timestamp) {
      if (timestamp === undefined) {
        return currentSlot;
      }
      if (timestamp === -1) {
        return -1;
      }
      return 0;
    });
    const getLastSlotStub = sinon.stub(slots, 'getLastSlot').returns(1);
    const getSlotTimeStub = sinon.stub(slots, 'getSlotTime').returns(0);

    try {
      const forgeFinished = new Promise(function (resolve) {
        registeredJob(resolve);
      });

      await peerLookupStarted;
      currentSlot = 1;
      peerLookupCallback(null, []);
      await forgeFinished;

      expect(generateBlockStub.calledOnce).to.equal(true);
    } finally {
      getSlotNumberStub.restore();
      getLastSlotStub.restore();
      getSlotTimeStub.restore();
    }
  });
});
