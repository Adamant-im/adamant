var schema = require('../../../schema/dapps.js');
var expect = require('chai').expect;

describe('dapp', function () {
  it('should expose only read-only request schemas', function () {
    expect(Object.keys(schema)).to.deep.equal(['get', 'list', 'search']);
  });
});
