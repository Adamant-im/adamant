'use strict';

var _ = require('underscore');

module.exports = function(dialect) {
	var parentValueBlock = dialect.blocks.get('value');
	dialect.blocks.set('value', function(params) {
		var value = params.value;

		var result;
		if (_.isArray(value)) {
			if (value.length) {
				result = 'array[' + _(value).map(function(item) {
					return dialect.builder._pushValue(item);
				}).join(', ') + ']';
			} else {
				result = dialect.builder._pushValue('{}');
			}
		} else if (_.isObject(value)) {
			result = dialect.builder._pushValue(JSON.stringify(value));
		} else {
			result = parentValueBlock(params);
		}

		return result;
	});

	dialect.blocks.add('explain:options', function(params) {
		return '(' +
			_(params.options)
				.chain()
				.pick(['analyze', 'verbose', 'costs', 'buffers', 'timing', 'format'])
				.map(function(value, key) {
					return key + ' ' + value;
				})
				.value()
				.join(', ') +
			')';
	});

	dialect.blocks.add('explain:analyze', function() {
		return 'analyze';
	});

	dialect.blocks.add('explain:verbose', function() {
		return 'verbose';
	});

	dialect.blocks.add('distinctOn', function(params) {
		var distinctOn = params.distinctOn;
		var result = '';

		if (_.isString(distinctOn)) distinctOn = [distinctOn];

		if (_.isArray(distinctOn)) {
			result = _(distinctOn).map(function(distinctOnField) {
				return dialect._wrapIdentifier(distinctOnField);
			}).join(', ');
		}

		if (result) {
			result = 'distinct on (' + result + ')';
		}

		return result;
	});
};
