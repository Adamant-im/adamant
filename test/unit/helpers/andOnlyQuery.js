'use strict';

const { expect } = require('chai');
const chatsSchema = require('../../../schema/chats.js');
const chatroomsSchema = require('../../../schema/chatrooms.js');
const statesSchema = require('../../../schema/states.js');
const {
  CHATROOMS_QUERY_FIELDS,
  CHATS_QUERY_FIELDS,
  STATES_CSV_FIELDS,
  STATES_QUERY_FIELDS,
  normalizeAndOnlyFilters
} = require('../../../helpers/andOnlyQuery.js');

describe('helpers/andOnlyQuery', () => {
  const options = {
    supportedFields: STATES_QUERY_FIELDS,
    csvFields: STATES_CSV_FIELDS
  };

  it('keeps plain filter names', () => {
    const normalized = normalizeAndOnlyFilters({
      senderId: 'U1',
      key: 'eth:address',
      limit: 10
    }, options);

    expect(normalized).to.deep.equal({
      filter: {
        senderId: 'U1',
        key: 'eth:address',
        limit: 10
      }
    });
  });

  it('maps and: filters to the same plain names', () => {
    const normalized = normalizeAndOnlyFilters({
      'and:senderId': 'U1',
      'AND:key': 'eth:address',
      'and:keyIds': 'eth:address,btc:address'
    }, options);

    expect(normalized.filter).to.deep.equal({
      senderId: 'U1',
      key: 'eth:address',
      keyIds: ['eth:address', 'btc:address']
    });
  });

  it('accepts the same value supplied with and without and:', () => {
    const normalized = normalizeAndOnlyFilters({
      senderId: 'U1',
      'and:senderId': 'U1'
    }, options);

    expect(normalized.filter).to.deep.equal({ senderId: 'U1' });
  });

  it('rejects conflicting values for one field', () => {
    const normalized = normalizeAndOnlyFilters({
      key: 'eth:address',
      'and:key': 'btc:address'
    }, options);

    expect(normalized.error).to.equal('Conflicting values for parameter: key');
  });

  it('rejects or: instead of ignoring it', () => {
    expect(normalizeAndOnlyFilters({ 'or:senderId': 'U1' }, options).error)
        .to.equal('OR filters are not supported');
    expect(normalizeAndOnlyFilters({ 'OR:key': 'eth:address' }, options).error)
        .to.equal('OR filters are not supported');
  });

  it('rejects unsupported condition prefixes and unknown fields', () => {
    expect(normalizeAndOnlyFilters({ 'not:senderId': 'U1' }, options).error)
        .to.equal('Invalid parameter supplied: not:senderId');
    expect(normalizeAndOnlyFilters({ 'and:or:senderId': 'U1' }, options).error)
        .to.equal('Invalid parameter supplied: and:or:senderId');
    expect(normalizeAndOnlyFilters({ blockId: '1' }, options).error)
        .to.equal('Parameter is not supported: blockId');
    expect(normalizeAndOnlyFilters({ keysIds: 'eth:address' }, options).error)
        .to.equal('Parameter is not supported: keysIds');
    expect(normalizeAndOnlyFilters({ 'and:fromTimestamp': 1 }, options).error)
        .to.equal('Parameter is not supported: fromTimestamp');
  });

  it('keeps query schemas aligned with the fields each endpoint applies', () => {
    expect(Object.keys(statesSchema.getTransactions.properties).sort())
        .to.deep.equal(STATES_QUERY_FIELDS.slice().sort());
    expect(statesSchema.getTransactions.additionalProperties).to.equal(false);

    expect(Object.keys(chatsSchema.getTransactions.properties).sort())
        .to.deep.equal(CHATS_QUERY_FIELDS.slice().sort());
    expect(chatsSchema.getTransactions.additionalProperties).to.equal(false);

    expect(Object.keys(chatroomsSchema.getChats.properties).sort())
        .to.deep.equal(CHATROOMS_QUERY_FIELDS.slice().sort());
    expect(chatroomsSchema.getChats.additionalProperties).to.equal(false);
  });

  it('validates keyIds as KVS keys', () => {
    const ZSchema = require('../../../helpers/z_schema.js');
    const validator = new ZSchema();

    expect(validator.validate({
      keyIds: ['eth:address', 'btc:address']
    }, statesSchema.getTransactions)).to.equal(true);

    expect(validator.validate({
      keyIds: ['this-key-is-way-too-long']
    }, statesSchema.getTransactions)).to.equal(false);

    expect(validator.validate({
      blockId: '1'
    }, statesSchema.getTransactions)).to.equal(false);

    expect(validator.validate({
      withoutDirectTransfers: 'true',
      includeDirectTransfers: 0,
      returnUnconfirmed: 1
    }, chatsSchema.getTransactions)).to.equal(true);

    expect(validator.validate({
      toHeight: 1
    }, chatroomsSchema.getChats)).to.equal(false);
  });
});
