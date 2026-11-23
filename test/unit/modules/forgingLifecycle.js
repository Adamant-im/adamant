'use strict';

const { expect } = require('chai');
const fs = require('fs');
const path = require('path');
const sinon = require('sinon');

const ed = require('../../../helpers/ed.js');
const accounts = require('../../../helpers/accounts.js');
const forgingControl = require('../../../helpers/forgingControl.js');
const forgingSecret = require('../../../helpers/forgingSecret.js');
const jobsQueue = require('../../../helpers/jobsQueue.js');
const promptSecret = require('../../../helpers/promptSecret.js');
const Sequence = require('../../../helpers/sequence.js');
const Delegates = require('../../../modules/delegates.js');
const slots = require('../../../helpers/slots.js');

const PASSPHRASE = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const PENDING_PLAINTEXT_PASSPHRASE = 'weather play vibrant large edge clean notable april fire smoke drift hidden';
const PASSWORD = 'correct horse battery staple';

describe('encrypted delegate forging lifecycle', function () {
  let runtimeDir;
  let socketPath;
  let delegates;
  let delegateFound;
  let delegateEligible;
  let accountResponses;
  let accountLookups;
  let lastBlockHeight;
  let logger;
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
    logger = {
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
            accountLookups[query.publicKey] = (accountLookups[query.publicKey] || 0) + 1;

            if (Object.prototype.hasOwnProperty.call(accountResponses, query.publicKey)) {
              return setImmediate(done, null, accountResponses[query.publicKey]);
            }

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
                height: lastBlockHeight,
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
    accountResponses = {};
    accountLookups = {};
    lastBlockHeight = 1;
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

  it('answers loading and accepts unlock before blockchain readiness', async function () {
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
    expect(earlyUnlock.ok).to.equal(true);
    expect(earlyUnlock.status.forging).to.equal('loading');
    expect(earlyUnlock.status.encryptedDelegatesLoaded).to.equal(1);

    const earlyLock = await send('lock');
    expect(earlyLock.ok).to.equal(true);
    expect(earlyLock.status.forging).to.equal('loading');
    expect(earlyLock.status.encryptedDelegatesLoaded).to.equal(0);

    const earlyUnlockAgain = await send('unlock', { password: PASSWORD });
    expect(earlyUnlockAgain.ok).to.equal(true);
    expect(earlyUnlockAgain.status.forging).to.equal('loading');
    expect(earlyUnlockAgain.status.encryptedDelegatesLoaded).to.equal(1);

    delegates.onBlockchainReady();
    await registeredPromise;

    const unlocked = await send('status');
    expect(unlocked.status.forging).to.equal('unlocked');
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

  it('retries a pending plaintext delegate after encrypted unlock', async function () {
    const hash = ed.createPassPhraseHash(PENDING_PLAINTEXT_PASSPHRASE);
    const keypair = ed.makeKeypair(hash);
    const publicKey = keypair.publicKey.toString('hex');
    const address = accounts.getAddressByPublicKey(publicKey);

    hash.fill(0);
    keypair.privateKey.fill(0);
    accountResponses[publicKey] = null;

    await new Promise(function (resolve, reject) {
      startDelegates(function (blob) {
        return [PENDING_PLAINTEXT_PASSPHRASE, blob];
      }, function (err) {
        if (err) {
          return reject(err);
        }
        return resolve();
      });
    });

    await registeredPromise;
    await send('unlock', { password: PASSWORD });

    accountResponses[publicKey] = {
      address,
      isDelegate: 1,
      publicKey
    };

    await new Promise(function (resolve) {
      registeredJob(resolve);
    });

    let status;
    for (let attempts = 0; attempts < 10; attempts += 1) {
      status = await send('status');
      if (status.status.loadedKeypairs === 2) {
        break;
      }
      await new Promise(function (resolve) {
        setImmediate(resolve);
      });
    }

    expect(status.status.loadedKeypairs).to.equal(2);
    expect(status.status.plaintextDelegates).to.equal(1);
  });

  it('retries a pending plaintext delegate once per block and warns once per state', async function () {
    const hash = ed.createPassPhraseHash(PENDING_PLAINTEXT_PASSPHRASE);
    const keypair = ed.makeKeypair(hash);
    const publicKey = keypair.publicKey.toString('hex');
    const address = accounts.getAddressByPublicKey(publicKey);

    hash.fill(0);
    keypair.privateKey.fill(0);
    accountResponses[publicKey] = null;

    function settle () {
      return new Promise(function (resolve) {
        setTimeout(resolve, 20);
      });
    }

    async function runTicks (count) {
      for (let tick = 0; tick < count; tick += 1) {
        await new Promise(function (resolve) {
          registeredJob(resolve);
        });
        await settle();
      }
    }

    function warnings (pattern) {
      return logger.warn.getCalls().filter(function (call) {
        return pattern.test(call.args.join(' '));
      }).length;
    }

    await new Promise(function (resolve, reject) {
      startDelegates(function (blob) {
        return [PENDING_PLAINTEXT_PASSPHRASE, blob];
      }, function (err) {
        if (err) {
          return reject(err);
        }
        return resolve();
      });
    });

    await registeredPromise;
    await send('unlock', { password: PASSWORD });
    expect(accountLookups[publicKey]).to.equal(1);

    await runTicks(5);
    expect(accountLookups[publicKey]).to.equal(2);

    lastBlockHeight = 2;
    await runTicks(3);
    expect(accountLookups[publicKey]).to.equal(3);
    expect(warnings(new RegExp(publicKey + ' not found'))).to.equal(1);

    accountResponses[publicKey] = {
      address,
      isDelegate: 0,
      publicKey
    };
    lastBlockHeight = 3;
    await runTicks(2);
    lastBlockHeight = 4;
    await runTicks(2);
    expect(accountLookups[publicKey]).to.equal(5);
    expect(warnings(new RegExp(publicKey + ' is not a delegate'))).to.equal(1);

    accountResponses[publicKey].isDelegate = 1;
    lastBlockHeight = 5;
    await runTicks(1);

    const status = await send('status');
    expect(status.status.loadedKeypairs).to.equal(2);

    lastBlockHeight = 6;
    await runTicks(2);
    expect(accountLookups[publicKey]).to.equal(6);
    expect(logger.info.getCalls().filter(function (call) {
      return /delegates from config/.test(call.args.join(' '));
    }).length).to.equal(1);
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

  it('waits for an active encrypted block generation before clearing its key', async function () {
    let finishGeneration;
    let markGenerationStarted;
    const generationStarted = new Promise(function (resolve) {
      markGenerationStarted = resolve;
    });

    generateBlockStub.callsFake(function (keypair, timestamp, done) {
      finishGeneration = done;
      markGenerationStarted();
    });

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

    try {
      const forgeFinished = new Promise(function (resolve) {
        registeredJob(resolve);
      });

      await generationStarted;
      const lockPromise = send('lock');
      let lockResolved = false;

      lockPromise.then(function () {
        lockResolved = true;
      });

      await new Promise(function (resolve) {
        setTimeout(resolve, 20);
      });
      expect(lockResolved).to.equal(false);

      finishGeneration();
      const locked = await lockPromise;
      await forgeFinished;

      expect(locked.ok).to.equal(true);
      expect(locked.status.loadedKeypairs).to.equal(0);
    } finally {
      getSlotNumberStub.restore();
      getLastSlotStub.restore();
      getSlotTimeStub.restore();
    }
  });

  it('keeps a plaintext-forged block alive while encrypted keys are locked', async function () {
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
      const locked = await send('lock');
      expect(locked.status.forging).to.equal('partial');

      peerLookupCallback(null, []);
      await forgeFinished;

      expect(generateBlockStub.calledOnce).to.equal(true);
      expect(locked.status.loadedKeypairs).to.equal(1);
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
