'use strict';

var _ = require('underscore');

exports.requiredProp = function(type, params, propName) {
	if (_.isUndefined(params[propName])) {
		throw new Error('`' + propName + '` property is not set in `' + type + '` clause');
	}
};

exports.atLeastOneOfProps = function(type, params, expectedPropNames) {
	var propNames = _(params).chain().keys().intersection(expectedPropNames).value();

	if (!propNames.length) {
		throw new Error('Neither `' + expectedPropNames.join('`, `') +
			'` properties are not set in `' + type + '` clause');
	}
};

exports.onlyOneOfProps = function(type, params, expectedPropNames) {
	var propNames = _(params).chain().keys().intersection(expectedPropNames).value();

	if (propNames.length > 1) {
		throw new Error('Wrong using `' + propNames.join('`, `') + '` properties together in `' +
			type + '` clause');
	}
};

exports.propType = function(type, params, propName, expectedTypes) {
	if (_.isUndefined(params[propName])) return;

	var propValue = params[propName];

	if (!_.isArray(expectedTypes)) expectedTypes = [expectedTypes];

	var hasSomeType = _(expectedTypes).some(function(expectedType) {
		return _['is' + expectedType.charAt(0).toUpperCase() + expectedType.slice(1)](propValue);
	});

	if (!hasSomeType) {
		throw new Error('`' + propName + '` property should have ' +
			(expectedTypes.length > 1 ? 'one of expected types:' : 'type') +
			' "' + expectedTypes.join('", "') + '" in `' + type + '` clause');
	}
};

exports.minPropLength = function(type, params, propName, length) {
	if (_.isUndefined(params[propName])) return;

	if (params[propName].length < length) {
		throw new Error('`' + propName + '` property should not have length less than ' + length +
			' in `' + type + '` clause');
	}
};

exports.propMatch = function(type, params, propName, regExp) {
	if (_.isUndefined(params[propName])) return;

	if (!params[propName].match(regExp)) {
		throw new Error('Invalid `' + propName + '` property value "' + params[propName] + '" in `' +
			type + '` clause');
	}
};

exports.customProp = function(type, params, propName, fn) {
	if (_.isUndefined(params[propName])) return;

	if (!fn(params[propName])) {
		throw new Error('Invalid `' + propName + '` property value "' + params[propName] + '" in `' +
			type + '` clause');
	}
};
