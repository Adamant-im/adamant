'use strict';

var ip = require('neoip');
/**
 * Uses JSON Schema validator z_schema to register custom formats.
 * - id
 * - address
 * - username
 * - hex
 * - publicKey
 * - csv
 * - signature
 * - queryList
 * - delegatesList
 * - parsedInt
 * - ip
 * - os
 * - version
 * @see {@link https://github.com/zaggino/z-schema}
 *
 * @constructor
 * @memberof module:helpers
 * @requires ip
 * @return {boolean} True if the format is valid
 */
const zSchemaModule = require('z-schema');
const ZSchema = zSchemaModule.default;
const semver = require('semver');
const { isPublicKey } = require('./publicKey.js');

if (typeof ZSchema !== 'function' || typeof ZSchema.create !== 'function') {
  throw new Error('z-schema module shape mismatch: expected .default to expose ZSchema.create()');
}

/**
 * Preserves the legacy z-schema v6 API used throughout the node.
 * Validation remains synchronous, non-throwing, and pinned to Draft-04.
 * @param {object} options
 * @constructor
 */
function z_schema (options) {
  this.validator = ZSchema.create({
    ...options,
    safe: true,
    version: 'draft-04'
  });
  this.lastErrors = null;
}

/**
 * Restores error messages exposed by z-schema v6.
 * @param {object} error
 * @return {object}
 */
function normalizeError (error) {
  if (error.code === 'INVALID_FORMAT' && typeof error.params[1] === 'string') {
    try {
      const value = JSON.parse(error.params[1]);
      error.params[1] = value;
      error.message = `Object didn't pass validation for format ${error.params[0]}: ${value}`;
    } catch (err) {
      // Keep the upstream message when the value is not JSON-encoded.
    }
  }

  return error;
}

/**
 * Converts validation failures to the legacy error-array contract.
 * @param {object} result
 * @param {*} value
 * @param {object} schema
 * @return {Array}
 */
function getValidationErrors (result, value, schema) {
  if (Array.isArray(result.err && result.err.details)) {
    return result.err.details.map(normalizeError);
  }

  if (schema && schema.format) {
    return [{
      code: 'INVALID_FORMAT',
      params: [schema.format, value],
      message: `Object didn't pass validation for format ${schema.format}: ${value}`,
      path: '#/'
    }];
  }

  return [{
    code: 'VALIDATION_ERROR',
    params: [],
    message: result.err && result.err.message ? result.err.message : 'Validation failed',
    path: '#/'
  }];
}

/**
 * Validates a value using the legacy boolean/callback contract.
 * @param {*} value
 * @param {object} schema
 * @param {Function} callback
 *
 * @return {boolean}
 */
z_schema.prototype.validate = function (value, schema, callback) {
  const result = this.validator.validate(value, schema);
  this.lastErrors = result.valid ? null : getValidationErrors(result, value, schema);

  if (typeof callback === 'function') {
    callback(this.lastErrors, result.valid);
  }

  return result.valid;
};

/**
 * Returns errors from the latest validation attempt.
 * @return {Array|null}
 */
z_schema.prototype.getLastErrors = function () {
  return this.lastErrors;
};

z_schema.registerFormat = zSchemaModule.registerFormat;
z_schema.unregisterFormat = zSchemaModule.unregisterFormat;
z_schema.getRegisteredFormats = zSchemaModule.getRegisteredFormats;

z_schema.registerFormat('id', function (str) {
  if (str.length === 0) {
    return true;
  }

  return /^[0-9]+$/g.test(str);
});

z_schema.registerFormat('address', function (str) {
  return (
    typeof str === 'string' &&
    /^[U][0-9]{1,21}$/i.test(str)
  );
});

z_schema.registerFormat('username', function (str) {
  if (str.length === 0) {
    return true;
  }

  return /^[a-z0-9!@$&_.]+$/ig.test(str);
});

z_schema.registerFormat('hex', function (str) {
  try {
    Buffer.from(str, 'hex');
  } catch (e) {
    return false;
  }

  return true;
});

z_schema.registerFormat('publicKey', function (str) {
  if (str.length === 0) {
    return true;
  }

  return isPublicKey(str);
});

z_schema.registerFormat('csv', function (str) {
  try {
    var a = str.split(',');
    if (a.length > 0 && a.length <= 1000) {
      return true;
    } else {
      return false;
    }
  } catch (e) {
    return false;
  }
});

z_schema.registerFormat('signature', function (str) {
  if (str.length === 0) {
    return true;
  }

  try {
    var signature = Buffer.from(str, 'hex');
    return signature.length === 64;
  } catch (e) {
    return false;
  }
});

z_schema.registerFormat('queryList', function (obj) {
  obj.limit = 100;
  return true;
});

z_schema.registerFormat('delegatesList', function (obj) {
  obj.limit = 101;
  return true;
});

z_schema.registerFormat('parsedInt', function (value) {
  // Loose equality intentionally accepts integer-like strings such as "1.0".
  if (isNaN(value) || parseInt(value) != value || isNaN(parseInt(value, 10))) {
    return false;
  }

  value = parseInt(value);
  return true;
});

z_schema.registerFormat('ip', function (str) {
  return ip.isV4Format(str);
});

z_schema.registerFormat('os', function (str) {
  if (str.length === 0) {
    return true;
  }

  return /^[a-z0-9-_.+]+$/ig.test(str);
});

z_schema.registerFormat('version', function (str) {
  if (str.length === 0) {
    return true;
  }

  return !!semver.valid(str);
});

// var registeredFormats = z_schema.getRegisteredFormats();
// console.log(registeredFormats);

// Exports
module.exports = z_schema;
