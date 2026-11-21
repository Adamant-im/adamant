'use strict';

const { expect } = require('chai');

const jobsQueue = require('../../../helpers/jobsQueue.js');

describe('jobsQueue', () => {
  afterEach(() => jobsQueue.clear());

  it('reserves a job name before its first asynchronous callback', () => {
    jobsQueue.register('pending-job', () => {}, 1000);

    expect(() => jobsQueue.register('pending-job', () => {}, 1000)).to.throw(
        'Synchronous job pending-job already registered'
    );
  });

  it('ignores a stale callback after an identically named job is replaced', () => {
    let finishOldJob;
    let finishNewJob;

    jobsQueue.register('replaceable-job', (done) => {
      finishOldJob = done;
    }, 1000);

    jobsQueue.unregister('replaceable-job');

    jobsQueue.register('replaceable-job', (done) => {
      finishNewJob = done;
    }, 1000);

    const newRegistration = jobsQueue.jobs['replaceable-job'];
    finishOldJob();

    expect(jobsQueue.jobs['replaceable-job']).to.equal(newRegistration);
    expect(newRegistration.timeout).to.be.null;

    finishNewJob();

    expect(newRegistration.timeout).not.to.be.null;
  });
});
