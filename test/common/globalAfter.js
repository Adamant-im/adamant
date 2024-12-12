const jobsQueue = require('../../helpers/jobsQueue.js');

function removeQueuedJob(names) {
  names.forEach((name) => {
    const timeout = jobsQueue.jobs[name];
    clearTimeout(timeout);
    delete jobsQueue.jobs[name];
  });
}

module.exports = {
  removeQueuedJob,
};
