'use strict';

var node = require('./../node.js');

describe('GET /api/node/status', function () {
  it('should expose effective consensus and milestone schedules', function (done) {
    node.get('/api/node/status', function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.true;
      node.expect(res.body).to.have.nested.property('network.height').that.is.a('number');
      node.expect(res.body).to.have.nested.property('network.consensus').that.satisfy(function (consensus) {
        return consensus === null || typeof consensus === 'string';
      });

      node.expect(res.body).to.have.property('consensusSchedule').that.has.all.keys('activationHeights');
      node.expect(res.body.consensusSchedule.activationHeights).to.deep.equal(node.config.consensusActivationHeights);

      node.expect(res.body).to.have.property('milestoneSchedule');
      node.expect(res.body.milestoneSchedule).to.deep.equal({
        offset: node.constants.rewards.offset,
        distance: node.constants.rewards.distance,
        milestones: node.constants.rewards.milestones
      });

      done();
    });
  });

  it('should report the same consensus as the blocks status endpoint', function (done) {
    node.get('/api/node/status', function (err, nodeStatus) {
      node.expect(nodeStatus.body).to.have.property('success').to.be.true;

      node.get('/api/blocks/getStatus', function (err, blocksStatus) {
        node.expect(blocksStatus.body).to.have.property('success').to.be.true;
        node.expect(nodeStatus.body.network.consensus).to.equal(blocksStatus.body.consensus);
        done();
      });
    });
  });
});
