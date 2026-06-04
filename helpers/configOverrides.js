'use strict';

var fs = require('fs');
var path = require('path');

var unsafePathSegments = {
  __proto__: true,
  constructor: true,
  prototype: true
};

var sensitivePathPattern = /(secret|password|passphrase|privatekey|private_key|token|apikey|api_key|authorization|auth)/i;

/**
 * Resolves override sources into parsed config override entries.
 * @param {object} options - Override options.
 * @param {string} [options.file] - Env-style or JSON override file path.
 * @param {Array<string>} [options.sets] - Direct key=value overrides.
 * @param {Array<object>} [options.overrides] - Pre-parsed override entries.
 */
function resolveOverrides (options) {
  options = options || {};

  var entries = [];

  if (options.file) {
    entries = entries.concat(parseOverrideFile(options.file));
  }

  (options.sets || []).forEach(function (override) {
    entries.push(parseOverride(override, '--config-set'));
  });

  (options.overrides || []).forEach(function (override) {
    entries.push({
      path: parseOverridePath(override.path),
      value: override.value,
      source: override.source || 'command line'
    });
  });

  return entries;
}

/**
 * Applies parsed overrides to a config object.
 * @param {object} configData - Config object to mutate.
 * @param {Array<object>} entries - Parsed override entries.
 * @param {object} schema - Config schema used to reject unknown paths.
 * @param {Array<object>} [events] - Applied override event sink.
 */
function applyOverrides (configData, entries, schema, events) {
  entries.forEach(function (entry) {
    var value = typeof entry.value === 'function' ? entry.value(configData) : entry.value;

    setConfigValue(configData, entry.path, value, schema);

    if (events) {
      events.push({
        path: entry.path.join('.'),
        source: entry.source,
        value: redactConfigValue(entry.path, value)
      });
    }
  });

  return configData;
}

/**
 * Parses an override file. `.json` files use nested JSON object syntax;
 * all other extensions use env-style key=value syntax.
 * @param {string} filePath - Override file path.
 */
function parseOverrideFile (filePath) {
  var resolvedPath = path.resolve(process.cwd(), filePath);
  var content = fs.readFileSync(resolvedPath, 'utf8');

  if (path.extname(resolvedPath).toLowerCase() === '.json') {
    return parseJsonOverrideFile(content, resolvedPath);
  }

  return parseEnvOverrideFile(content, resolvedPath);
}

/**
 * Parses an env-style override file.
 * @param {string} content - File content.
 * @param {string} resolvedPath - Resolved file path.
 */
function parseEnvOverrideFile (content, resolvedPath) {
  var entries = [];

  content.split(/\r?\n/).forEach(function (line, index) {
    var trimmedLine = line.trim();

    if (!trimmedLine || trimmedLine[0] === '#') {
      return;
    }

    entries.push(parseOverride(trimmedLine, '--config-overrides ' + resolvedPath + ':' + (index + 1)));
  });

  return entries;
}

/**
 * Parses a JSON override file.
 * @param {string} content - File content.
 * @param {string} resolvedPath - Resolved file path.
 */
function parseJsonOverrideFile (content, resolvedPath) {
  var json;

  try {
    json = JSON.parse(content);
  } catch (error) {
    throw Error('Invalid JSON config override file "' + resolvedPath + '": ' + error.message);
  }

  if (!json || typeof json !== 'object' || Array.isArray(json)) {
    throw Error('Invalid JSON config override file "' + resolvedPath + '": root value must be an object');
  }

  return flattenJsonOverrideObject(json, [], '--config-overrides ' + resolvedPath);
}

/**
 * Converts a nested JSON override object into override entries.
 * @param {object} object - JSON object.
 * @param {Array<string>} prefix - Current dot path prefix.
 * @param {string} source - Human-readable source for logs and errors.
 */
function flattenJsonOverrideObject (object, prefix, source) {
  return Object.keys(object).reduce(function (entries, key) {
    var overridePath = prefix.concat(parseOverridePath(key));
    var value = object[key];

    if (isPlainObject(value)) {
      return entries.concat(flattenJsonOverrideObject(value, overridePath, source));
    } else {
      entries.push({
        path: overridePath,
        value: value,
        source: source
      });
    }

    return entries;
  }, []);
}

/**
 * Checks whether a value is a plain object.
 * @param {*} value - Value to check.
 */
function isPlainObject (value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}


/**
 * Parses a single key=value override.
 * @param {string} override - Override string.
 * @param {string} source - Human-readable source for error messages.
 */
function parseOverride (override, source) {
  var separatorIndex = override.indexOf('=');

  if (separatorIndex === -1) {
    throw Error('Invalid config override from ' + source + ': expected key=value');
  }

  var overridePath = override.slice(0, separatorIndex).trim();
  var rawValue = override.slice(separatorIndex + 1).trim();

  return {
    path: parseOverridePath(overridePath),
    value: parseOverrideValue(rawValue, overridePath),
    source: source
  };
}

/**
 * Parses and validates a dot-path.
 * @param {string} overridePath - Dot-separated config path.
 */
function parseOverridePath (overridePath) {
  if (!overridePath) {
    throw Error('Invalid config override path: path must not be empty');
  }

  var parts = overridePath.split('.');

  parts.forEach(function (part) {
    if (!part) {
      throw Error('Invalid config override path "' + overridePath + '": empty path segment');
    }

    if (unsafePathSegments[part]) {
      throw Error('Invalid config override path "' + overridePath + '": unsafe path segment');
    }
  });

  return parts;
}

/**
 * Parses JSON-compatible values and falls back to plain strings.
 * @param {string} rawValue - Raw override value.
 * @param {string} overridePath - Override path for error messages.
 */
function parseOverrideValue (rawValue, overridePath) {
  var value = rawValue.trim();

  if (value === '') {
    return '';
  }

  try {
    return JSON.parse(value);
  } catch (error) {
    var singleQuotedValue = stripSingleOuterQuotes(value);

    if (singleQuotedValue !== value) {
      try {
        return JSON.parse(singleQuotedValue);
      } catch (singleQuoteError) {
        if (singleQuotedValue[0] === '{' || singleQuotedValue[0] === '[') {
          throw Error(
              'Invalid JSON value for config override "' +
              overridePath +
              '": ' +
              singleQuoteError.message
          );
        }

        return singleQuotedValue;
      }
    }

    if (value[0] === '{' || value[0] === '[') {
      throw Error('Invalid JSON value for config override "' + overridePath + '": ' + error.message);
    }

    return value;
  }
}

/**
 * Removes matching single quotes around a value.
 * @param {string} value - Raw value.
 */
function stripSingleOuterQuotes (value) {
  if (value.length < 2) {
    return value;
  }

  var first = value[0];
  var last = value[value.length - 1];

  if (first === '\'' && last === '\'') {
    return value.slice(1, -1);
  }

  return value;
}

/**
 * Writes a config value at a dot path after checking the schema path exists.
 * @param {object} configData - Config object to mutate.
 * @param {Array<string>} overridePath - Parsed config path.
 * @param {*} value - Override value.
 * @param {object} schema - Config schema.
 */
function setConfigValue (configData, overridePath, value, schema) {
  if (!hasPathInSchema(schema, overridePath)) {
    throw Error('Invalid config override path "' + overridePath.join('.') + '": path is not defined in config schema');
  }

  var target = configData;
  var schemaNode = schema;

  for (var i = 0; i < overridePath.length - 1; i++) {
    var part = overridePath[i];

    schemaNode = schemaNode.properties[part];

    if (target[part] === undefined && schemaAllowsType(schemaNode, 'object')) {
      target[part] = {};
    }

    if (
      typeof target[part] !== 'object' ||
      target[part] === null ||
      Array.isArray(target[part])
    ) {
      throw Error('Invalid config override path "' + overridePath.join('.') + '": parent path is not an object');
    }

    target = target[part];
  }

  target[overridePath[overridePath.length - 1]] = value;
}

/**
 * Checks that a path is known by the JSON schema.
 * @param {object} schema - Current schema node.
 * @param {Array<string>} overridePath - Remaining path parts.
 */
function hasPathInSchema (schema, overridePath) {
  if (!overridePath.length) {
    return true;
  }

  if (!schema || !schema.properties) {
    return false;
  }

  var part = overridePath[0];

  if (!Object.prototype.hasOwnProperty.call(schema.properties, part)) {
    return false;
  }

  return hasPathInSchema(schema.properties[part], overridePath.slice(1));
}

/**
 * Checks whether a schema node allows a JSON type.
 * @param {object} schema - Schema node.
 * @param {string} type - JSON type.
 */
function schemaAllowsType (schema, type) {
  if (!schema) {
    return false;
  }

  if (Array.isArray(schema.type)) {
    return schema.type.indexOf(type) !== -1;
  }

  return schema.type === type;
}

/**
 * Redacts sensitive config override values based on their dot path.
 * @param {Array<string>} overridePath - Parsed config path.
 * @param {*} value - Applied override value.
 */
function redactConfigValue (overridePath, value) {
  if (overridePath.some(function (part) {
    return sensitivePathPattern.test(part);
  })) {
    return 'XXXXXXXXXX';
  }

  return redactNestedConfigValue(value);
}

/**
 * Redacts sensitive keys inside object override values.
 * @param {*} value - Value to redact.
 */
function redactNestedConfigValue (value) {
  if (!value || typeof value !== 'object') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(function (item) {
      return redactNestedConfigValue(item);
    });
  }

  return Object.keys(value).reduce(function (result, key) {
    result[key] = sensitivePathPattern.test(key) ?
      'XXXXXXXXXX' :
      redactNestedConfigValue(value[key]);

    return result;
  }, {});
}

module.exports = {
  applyOverrides: applyOverrides,
  parseOverride: parseOverride,
  parseOverrideFile: parseOverrideFile,
  parseOverridePath: parseOverridePath,
  parseOverrideValue: parseOverrideValue,
  redactConfigValue: redactConfigValue,
  resolveOverrides: resolveOverrides
};
