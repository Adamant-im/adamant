const node = require('./../node.js');

const apiUtils = {
  sendADM(params, done) {
    node.put('/api/transactions/', params, done);
  },
  postMessage (transaction, done) {
    node.post('/api/transactions', { transaction: transaction }, done);
  }
};

module.exports = apiUtils;
