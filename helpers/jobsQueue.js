'use strict';

var jobsQueue = {

  jobs: {},

  register: function (name, job, time) {
    if (Object.prototype.hasOwnProperty.call(this.jobs, name)) {
      throw new Error('Synchronous job ' + name + ' already registered');
    }

    var registration = {
      timeout: null
    };

    this.jobs[name] = registration;

    var nextJob = function () {
      if (jobsQueue.jobs[name] !== registration) {
        return;
      }

      return job(function () {
        if (jobsQueue.jobs[name] !== registration) {
          return;
        }

        registration.timeout = setTimeout(nextJob, time);
      });
    };

    nextJob();
    return registration.timeout;
  },

  unregister: function (name) {
    var registration = this.jobs[name];

    if (!registration) {
      return;
    }

    if (registration.timeout) {
      clearTimeout(registration.timeout);
    }

    delete this.jobs[name];
  },

  clear: function () {
    Object.keys(this.jobs).forEach(this.unregister.bind(this));
  }

};

module.exports = jobsQueue;
