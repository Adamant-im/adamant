'use strict';

/**
 * Query fields accepted by GET/POST /api/states/get.
 * `and:` prefixes map onto these names. Any other field is rejected.
 */
const STATES_QUERY_FIELDS = Object.freeze([
  'type',
  'senderId',
  'senderIds',
  'key',
  'keyIds',
  'fromHeight',
  'toHeight',
  'orderBy',
  'limit',
  'offset',
  'returnUnconfirmed'
]);

/**
 * Comma-separated states filters that the schema validates as arrays.
 */
const STATES_CSV_FIELDS = Object.freeze([
  'senderIds',
  'keyIds'
]);

/**
 * Query fields accepted by GET /api/chats/get.
 */
const CHATS_QUERY_FIELDS = Object.freeze([
  'type',
  'senderId',
  'recipientId',
  'inId',
  'isIn',
  'fromHeight',
  'toHeight',
  'orderBy',
  'limit',
  'offset',
  'returnUnconfirmed',
  'includeDirectTransfers',
  'withoutDirectTransfers'
]);

/**
 * Query fields accepted by GET /api/chatrooms.
 */
const CHATROOMS_QUERY_FIELDS = Object.freeze([
  'type',
  'senderId',
  'recipientId',
  'orderBy',
  'limit',
  'offset',
  'returnUnconfirmed',
  'includeDirectTransfers',
  'withoutDirectTransfers'
]);

/**
 * Fields supplied internally from the chatroom request path.
 */
const CHATROOMS_PATH_FIELDS = Object.freeze([
  'userId',
  'companionId'
]);

/**
 * Compares filter values after `and:` has been mapped to a plain name.
 * @param {*} left
 * @param {*} right
 * @return {boolean} True when both values are the same primitive or CSV list.
 */
function valuesEqual (left, right) {
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
      return false;
    }

    for (let i = 0; i < left.length; i++) {
      if (left[i] !== right[i]) {
        return false;
      }
    }

    return true;
  }

  return left === right;
}

/**
 * Maps `and:` filters to plain names for endpoints whose only combiner is AND.
 * `or:` and any other condition prefix are rejected instead of being ignored.
 * @param {object} source - Request query or body.
 * @param {object} [options]
 * @param {string[]} [options.supportedFields] - Plain names the endpoint applies.
 * @param {string[]} [options.csvFields] - Fields stored as comma-separated strings.
 * @return {{filter: object}|{error: string}} Normalized filter or a request error.
 */
function normalizeAndOnlyFilters (source, options) {
  const csvFields = options && options.csvFields ? options.csvFields : [];
  const supportedFields = options && options.supportedFields ? options.supportedFields : null;
  const filter = {};

  if (typeof source === 'undefined') {
    source = {};
  }

  if (source === null || typeof source !== 'object' || Array.isArray(source)) {
    return { error: 'Filter parameters must be an object' };
  }

  const sourcePrototype = Object.getPrototypeOf(source);
  if (sourcePrototype !== Object.prototype && sourcePrototype !== null) {
    return { error: 'Filter parameters must be an object' };
  }

  const entries = Object.entries(source);

  for (let i = 0; i < entries.length; i++) {
    const key = String(entries[i][0]);
    const value = entries[i][1];

    if (typeof value === 'undefined') {
      continue;
    }

    const separator = key.indexOf(':');
    let name = key;

    if (separator !== -1) {
      const condition = key.slice(0, separator).toLowerCase();
      name = key.slice(separator + 1);

      if (condition === 'or') {
        return { error: 'OR filters are not supported' };
      }

      if (condition !== 'and' || name.length === 0 || name.indexOf(':') !== -1) {
        return { error: 'Invalid parameter supplied: ' + key };
      }
    }

    if (supportedFields && supportedFields.indexOf(name) === -1) {
      return { error: 'Parameter is not supported: ' + name };
    }

    const isCsvField = csvFields.indexOf(name) !== -1;

    if (value === null || (
      typeof value === 'object' &&
      (!Array.isArray(value) || !isCsvField)
    )) {
      return { error: 'Invalid value for parameter: ' + name };
    }

    let normalized = value;
    if (isCsvField && !Array.isArray(value)) {
      if (typeof value !== 'string') {
        return { error: 'Invalid value for parameter: ' + name };
      }

      normalized = value.split(',');
    }

    if (Object.prototype.hasOwnProperty.call(filter, name) && !valuesEqual(filter[name], normalized)) {
      return { error: 'Conflicting values for parameter: ' + name };
    }

    filter[name] = normalized;
  }

  return { filter: filter };
}

module.exports = {
  CHATROOMS_PATH_FIELDS,
  CHATROOMS_QUERY_FIELDS,
  CHATS_QUERY_FIELDS,
  STATES_CSV_FIELDS,
  STATES_QUERY_FIELDS,
  normalizeAndOnlyFilters
};
