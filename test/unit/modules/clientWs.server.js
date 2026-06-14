'use strict';

const { expect } = require('chai');
const sinon = require('sinon');

const ClientWs = require('../../../modules/clientWs');

describe('ClientWs server', function () {
  it('should ignore transactions when disabled', function () {
    const clientWs = new ClientWs({ enabled: false });

    expect(function () {
      clientWs.emit({ id: '1' });
    }).to.not.throw();
  });

  it('should emit matching transactions and remove disconnected subscriptions', function () {
    const handlers = {};
    const socket = {
      id: 'socket-1',
      emit: sinon.spy(),
      on: function (event, handler) {
        handlers[event] = handler;
      }
    };
    const clientWs = new ClientWs({ enabled: false }, { debug: sinon.spy() });
    const transaction = { id: '2', type: 0 };

    clientWs.handleConnection(socket);
    handlers.types(0);
    clientWs.enabled = true;
    clientWs.emit(transaction);

    expect(socket.emit.calledOnceWith('newTrans', transaction)).to.equal(true);
    expect(clientWs.describes).to.have.property(socket.id);

    handlers.disconnect();

    expect(clientWs.describes).not.to.have.property(socket.id);
  });
});
