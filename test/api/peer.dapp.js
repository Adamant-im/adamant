'use strict';

var node = require('./../node.js');

['message', 'request'].forEach(function (operation) {
  describe('POST /peer/dapp/' + operation, function () {
    it('should be treated as an unknown peer route', async function () {
      var unknown = await peerRequest('/peer/not-a-route');
      var response = await peerRequest('/peer/dapp/' + operation, {
        dappid: '1',
        body: {}
      });

      node.expect(response.status).to.equal(unknown.status);
      node.expect(response.body).to.deep.equal(unknown.body);
    });
  });
});

function peerRequest (path, body) {
  var pending = node.api.post(path)
      .set('Accept', 'application/json')
      .set('version', node.version)
      .set('nethash', node.config.nethash)
      .set('ip', '0.0.0.0')
      .set('port', node.config.port);

  if (body) {
    pending.send(body);
  }

  return pending;
}
