'use strict';

var _ = require('underscore');

module.exports = function(dialect) {
	dialect.operators.fetching.add('$field', {
		fn: function(value) {
			return dialect.buildBlock('term', {term: value, type: 'field'});
		}
	});

	dialect.operators.fetching.add('$value', {
		fn: function(value) {
			return dialect.buildBlock('term', {term: value, type: 'value'});
		}
	});

	dialect.operators.fetching.add('$func', {
		fn: function(value) {
			return dialect.buildBlock('term', {term: value, type: 'func'});
		}
	});

	dialect.operators.fetching.add('$expression', {
		fn: function(value) {
			return dialect.buildBlock('term', {term: value, type: 'expression'});
		}
	});

	dialect.operators.fetching.add('$select', {
		fn: function(value) {
			return dialect.buildTemplate('subQuery', {queryBody: value});
		}
	});

	dialect.operators.fetching.add('$query', {
		fn: function(value) {
			return dialect.buildTemplate('subQuery', {queryBody: value});
		}
	});

	dialect.operators.fetching.add('$boolean', {
		fn: function(value) {
			return Boolean(value);
		}
	});

	dialect.operators.fetching.add('$inValues', {
		fn: function(value) {
			if (!_.isObject(value)) {
				throw new Error('Invalid `$in/$nin` value type "' + (typeof value) + '"');
			}

			if (_.isArray(value)) {
				if (!value.length) value = [null];

				return '(' + _(value).map(function(item) {
					return dialect.builder._pushValue(item);
				}).join(', ') + ')';
			} else {
				return dialect.buildTemplate('subQuery', {queryBody: value});
			}
		}
	});

	dialect.operators.fetching.add('$betweenValues', {
		fn: function(value) {
			if (!_.isArray(value)) {
				throw new Error('Invalid `$between` value type "' + (typeof value) + '"');
			}

			if (value.length < 2) {
				throw new Error('`$between` array length should be 2 or greater');
			}

			return dialect.builder._pushValue(value[0]) + ' and ' + dialect.builder._pushValue(value[1]);
		}
	});
};
