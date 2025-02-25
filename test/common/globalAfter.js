const jobsQueue = require('../../helpers/jobsQueue.js');

function removeQueuedJobs() {
  Object.keys(jobsQueue.jobs).forEach((name) => {
    const timeout = jobsQueue.jobs[name];
    clearTimeout(timeout);
    delete jobsQueue.jobs[name];
  });
}

module.exports = {
  removeQueuedJobs,
};
