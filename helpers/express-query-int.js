function parseNums(obj, options) {
  var result = Array.isArray(obj) ? [] : {},
      key,
      value,
      parsedValue;

  for (key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      value = obj[key];
      parsedValue = options.parser.call(null, value, 10, key);

      if (typeof value === 'string' && !isNaN(parsedValue)) {
        result[key] = parsedValue;
      }
      else if (value.constructor === Object || Array.isArray(value)) {
        result[key] = parseNums(value, options);
      }
      else {
        result[key] = value;
      }
    }
  }

  return result;
}

module.exports = function(options) {
  options = options || {
    parser: Number
  };

  return function (req, res, next) {
    req.parsedQuery = parseNums(req.query, options);
    next();
  };
};
