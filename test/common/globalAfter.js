const jobsQueue = require('../../helpers/jobsQueue.js');

function removeQueuedJobs () {
  jobsQueue.clear();
}

module.exports = {
  mochaHooks: {
    afterEach: removeQueuedJobs
  },
  removeQueuedJobs
};
