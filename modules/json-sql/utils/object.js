'use strict';

var _ = require('underscore');

// check if object contains any of expected keys
exports.hasSome = function(obj, keys) {
	var objKeys = _(obj).keys();
	return _(keys).some(function(key) {
		return _(objKeys).contains(key);
	});
};

exports.isSimpleValue = function(value) {
	return (
		_.isString(value) ||
		_.isNumber(value) ||
		_.isBoolean(value) ||
		_.isNull(value) ||
		_.isUndefined(value) ||
		_.isRegExp(value) ||
		_.isDate(value)
	);
};

exports.isObjectObject = function(obj) {
	return _.isObject(obj) && Object.prototype.toString.call(obj) === '[object Object]';
};
