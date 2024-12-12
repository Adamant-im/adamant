const { expect } = require('chai');
const sinon = require('sinon');

const Sequence = require('../../../helpers/sequence');

describe('Sequence', () => {
  /**
   * @type {Sequence}
   */
  let sequence;

  beforeEach(() => {
    sequence = new Sequence({
      warningLimit: 3,
      onWarning: sinon.spy()
    });
  });

  describe('add()', () => {
    it('should add a task to the sequence', () => {
      const worker = () => {};
      sequence.add(worker);
      expect(sequence.count()).to.equal(1);
    });

    it('should add a task with arguments', () => {
      const worker = () => {};
      const args = [1, 2, 3];
      sequence.add(worker, args);
      expect(sequence.sequence[0].args).to.deep.equal(args);
    });

    it('should add a task with a done callback', () => {
      const worker = () => {};
      const done = () => {};
      sequence.add(worker, [], done);
      expect(sequence.sequence[0].done).to.equal(done);
    });

    it('should start ticking if not already ticking', (done) => {
      expect(sequence.isTicking).to.be.false;

      const worker = (callback) => callback();
      sequence.add(worker, [], () => {
        expect(sequence.isTicking).to.be.true;
        done();
      });
    });
  });

  describe('__tick()', () => {
    it('should process the next task in the sequence without blocking event loop', (done) => {
      const spy = sinon.spy();
      const worker = (callback) => {
        spy();
        callback();
      };

      sequence.add(worker, [], () => {
        expect(spy.calledOnce).to.be.true;
        done();
      });
      expect(sequence.isTicking).to.be.true;
    });

    it('should start ticking on the next tick after last task callback', (done) => {
      const worker = (callback) => callback();

      sequence.add(worker, [], () => {
        expect(sequence.isTicking).to.be.true;
        sequence.nextSequenceTick();
        expect(sequence.isTicking).to.be.false;
        done();
      });
    });

    it('should start the sequence again on a new task after stopping', (done) => {
      const worker = (callback) => callback();

      sequence.add(worker, [], () => {
        expect(sequence.isTicking).to.be.true;
        sequence.nextSequenceTick();
        expect(sequence.isTicking).to.be.false;

        sequence.add(worker, [], () => {
          done();
        })
        expect(sequence.isTicking).to.be.true;
      });
    });

    it('should process the task added while running the sequence', (done) => {
      const spy = sinon.spy();
      const worker = (callback) => {
        spy();
        callback();
      };

      expect(sequence.isTicking).to.be.false;

      sequence.add(worker, [], () => {
        expect(spy.calledOnce).to.be.true;
        expect(sequence.isTicking).to.be.true;

        const secondSpy = sinon.spy();
        const anotherWorker = (callback) => {
          secondSpy();
          callback();
        };
        sequence.add(anotherWorker, [], () => {
          expect(sequence.isTicking).to.be.true;
          expect(secondSpy.calledOnce).to.be.true
        })

        done();
      });
    });

    it('should call task.done with results', (done) => {
      const worker = (callback) => callback(null, 'result');
      const doneCallback = (err, res) => {
        expect(err).to.be.null;
        expect(res).to.equal('result');
        done();
      };

      sequence.add(worker, [], doneCallback);
    });
  });

  describe('count()', () => {
    it('should return the number of pending tasks in the sequence', () => {
      expect(sequence.count()).to.equal(0);
      sequence.add(() => {});
      expect(sequence.count()).to.equal(1);
    });
  });

  describe('config.warningLimit', () => {
    it('should call onWarning when sequence length equals warningLimit', (done) => {
      const onWarningSpy = sinon.spy();
      sequence = new Sequence({
        warningLimit: 2,
        onWarning: onWarningSpy
      });

      const worker = (callback) => callback();

      sequence.add(worker);
      sequence.add(worker, [], () => {
        expect(onWarningSpy.calledOnce).to.be.true;
        expect(onWarningSpy.firstCall.args).to.deep.equal([2, 2]);
        done();
      });
    });
  });
});
