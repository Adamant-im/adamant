'use strict';

var buildComparisonOperator = function(field, operator, value) {
	return [field, operator, value].join(' ');
};

var buildBooleanOperator = function(field, operator, value) {
	return buildComparisonOperator(field, 'is' + (value ? '' : ' not'), operator);
};

module.exports = function(dialect) {
	dialect.operators.comparison.add('$eq', {
		inversedOperator: '$ne',
		fn: function(field, value) {
			return buildComparisonOperator(field, '=', value);
		}
	});

	dialect.operators.comparison.add('$ne', {
		inversedOperator: '$eq',
		fn: function(field, value) {
			return buildComparisonOperator(field, '!=', value);
		}
	});

	dialect.operators.comparison.add('$gt', {
		inversedOperator: '$lte',
		fn: function(field, value) {
			return buildComparisonOperator(field, '>', value);
		}
	});

	dialect.operators.comparison.add('$lt', {
		inversedOperator: '$gte',
		fn: function(field, value) {
			return buildComparisonOperator(field, '<', value);
		}
	});

	dialect.operators.comparison.add('$gte', {
		inversedOperator: '$lt',
		fn: function(field, value) {
			return buildComparisonOperator(field, '>=', value);
		}
	});

	dialect.operators.comparison.add('$lte', {
		inversedOperator: '$gt',
		fn: function(field, value) {
			return buildComparisonOperator(field, '<=', value);
		}
	});

	dialect.operators.comparison.add('$is', {
		inversedOperator: '$isNot',
		fn: function(field, value) {
			return buildComparisonOperator(field, 'is', value);
		}
	});

	dialect.operators.comparison.add('$isNot', {
		inversedOperator: '$is',
		fn: function(field, value) {
			return buildComparisonOperator(field, 'is not', value);
		}
	});

	dialect.operators.comparison.add('$isDistinct', {
		inversedOperator: '$isNotDistinct',
		fn: function(field, value) {
			return buildComparisonOperator(field, 'is distinct from', value);
		}
	});

	dialect.operators.comparison.add('$isNotDistinct', {
		inversedOperator: '$isDistinct',
		fn: function(field, value) {
			return buildComparisonOperator(field, 'is not distinct from', value);
		}
	});

	dialect.operators.comparison.add('$like', {
		inversedOperator: '$nlike',
		defaultFetchingOperator: '$value',
		fn: function(field, value) {
			return buildComparisonOperator(field, 'like', value);
		}
	});

	dialect.operators.comparison.add('$nlike', {
		inversedOperator: '$like',
		defaultFetchingOperator: '$value',
		fn: function(field, value) {
			return buildComparisonOperator(field, 'not like', value);
		}
	});

	dialect.operators.comparison.add('$similarTo', {
		inversedOperator: '$nsimilarTo',
		defaultFetchingOperator: '$value',
		fn: function(field, value) {
			return buildComparisonOperator(field, 'similar to', value);
		}
	});

	dialect.operators.comparison.add('$nsimilarTo', {
		inversedOperator: '$similarTo',
		defaultFetchingOperator: '$value',
		fn: function(field, value) {
			return buildComparisonOperator(field, 'not similar to', value);
		}
	});


	dialect.operators.comparison.add('$match', {
		inversedOperator: '$nmatch',
		defaultFetchingOperator: '$value',
		fn: function(field, value) {
			return buildComparisonOperator(field, '~', value);
		}
	});

	dialect.operators.comparison.add('$nmatch', {
		inversedOperator: '$match',
		defaultFetchingOperator: '$value',
		fn: function(field, value) {
			return buildComparisonOperator(field, '!~', value);
		}
	});

	dialect.operators.comparison.add('$imatch', {
		inversedOperator: '$nimatch',
		defaultFetchingOperator: '$value',
		fn: function(field, value) {
			return buildComparisonOperator(field, '~*', value);
		}
	});

	dialect.operators.comparison.add('$nimatch', {
		inversedOperator: '$imatch',
		defaultFetchingOperator: '$value',
		fn: function(field, value) {
			return buildComparisonOperator(field, '!~*', value);
		}
	});


	dialect.operators.comparison.add('$null', {
		inversedOperator: '$nnull',
		defaultFetchingOperator: '$boolean',
		fn: function(field, value) {
			return buildBooleanOperator(field, 'null', value);
		}
	});

	dialect.operators.comparison.add('$nnull', {
		inversedOperator: '$null',
		defaultFetchingOperator: '$boolean',
		fn: function(field, value) {
			return buildBooleanOperator(field, 'null', !value);
		}
	});

	dialect.operators.comparison.add('$true', {
		inversedOperator: '$ntrue',
		defaultFetchingOperator: '$boolean',
		fn: function(field, value) {
			return buildBooleanOperator(field, 'true', value);
		}
	});

	dialect.operators.comparison.add('$ntrue', {
		inversedOperator: '$true',
		defaultFetchingOperator: '$boolean',
		fn: function(field, value) {
			return buildBooleanOperator(field, 'true', !value);
		}
	});

	dialect.operators.comparison.add('$false', {
		inversedOperator: '$nfalse',
		defaultFetchingOperator: '$boolean',
		fn: function(field, value) {
			return buildBooleanOperator(field, 'false', value);
		}
	});

	dialect.operators.comparison.add('$nfalse', {
		inversedOperator: '$false',
		defaultFetchingOperator: '$boolean',
		fn: function(field, value) {
			return buildBooleanOperator(field, 'false', !value);
		}
	});

	dialect.operators.comparison.add('$unknown', {
		inversedOperator: '$nunknown',
		defaultFetchingOperator: '$boolean',
		fn: function(field, value) {
			return buildBooleanOperator(field, 'unknown', value);
		}
	});

	dialect.operators.comparison.add('$nunknown', {
		inversedOperator: '$unknown',
		defaultFetchingOperator: '$boolean',
		fn: function(field, value) {
			return buildBooleanOperator(field, 'unknown', !value);
		}
	});


	dialect.operators.comparison.add('$in', {
		inversedOperator: '$nin',
		defaultFetchingOperator: '$inValues',
		fn: function(field, value) {
			return buildComparisonOperator(field, 'in', value);
		}
	});

	dialect.operators.comparison.add('$nin', {
		inversedOperator: '$in',
		defaultFetchingOperator: '$inValues',
		fn: function(field, value) {
			return buildComparisonOperator(field, 'not in', value);
		}
	});


	dialect.operators.comparison.add('$between', {
		inversedOperator: '$nbetween',
		defaultFetchingOperator: '$betweenValues',
		fn: function(field, value) {
			return buildComparisonOperator(field, 'between', value);
		}
	});

	dialect.operators.comparison.add('$nbetween', {
		inversedOperator: '$between',
		defaultFetchingOperator: '$betweenValues',
		fn: function(field, value) {
			return buildComparisonOperator(field, 'not between', value);
		}
	});
};
