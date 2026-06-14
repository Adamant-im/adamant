'use strict';

const { expect } = require('chai');

const ClientWs = require('../../../modules/clientWs');

describe('ClientWs server', function () {
  it('should ignore transactions when disabled', function () {
    const clientWs = new ClientWs({ enabled: false });

    expect(function () {
      clientWs.emit({ id: '1' });
    }).to.not.throw();
  });
});
