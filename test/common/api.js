const node = require('./../node.js');

const apiUtils = {
  sendADM(params, done) {
    node.put('/api/transactions/', params, done);
  },
  sendADMasync(params) {
    return new Promise((resolve, reject) => {
      node.put('/api/transactions/', params, (err, data) => {
        if (err) {
          return reject(err);
        }

        resolve(data);
      });
    });
  },
  postMessage (transaction, done) {
    node.post('/api/transactions', { transaction: transaction }, done);
  }
};

module.exports = apiUtils;
