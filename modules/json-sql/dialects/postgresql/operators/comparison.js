'use strict';

module.exports = function(dialect) {
	var buildComparisonCondition = function(field, operator, value) {
		return [field, operator, value].join(' ');
	};

	dialect.operators.comparison.add('$jsonContains', {
		defaultFetchingOperator: '$json',
		fn: function(field, value) {
			return buildComparisonCondition(field, '@>', value);
		}
	});

	dialect.operators.comparison.add('$jsonIn', {
		defaultFetchingOperator: '$json',
		fn: function(field, value) {
			return buildComparisonCondition(field, '<@', value);
		}
	});

	dialect.operators.comparison.add('$jsonHas', {
		defaultFetchingOperator: '$value',
		fn: function(field, value) {
			return buildComparisonCondition(field, '?', value);
		}
	});

	dialect.operators.comparison.add('$jsonHasAny', {
		defaultFetchingOperator: '$value',
		fn: function(field, value) {
			return buildComparisonCondition(field, '?|', value);
		}
	});

	dialect.operators.comparison.add('$jsonHasAll', {
		defaultFetchingOperator: '$value',
		fn: function(field, value) {
			return buildComparisonCondition(field, '?&', value);
		}
	});

	dialect.operators.comparison.add('$ilike', {
		inversedOperator: '$nilike',
		defaultFetchingOperator: '$value',
		fn: function(field, value) {
			return buildComparisonCondition(field, 'ilike', value);
		}
	});

	dialect.operators.comparison.add('$nilike', {
		inversedOperator: '$ilike',
		defaultFetchingOperator: '$value',
		fn: function(field, value) {
			return buildComparisonCondition(field, 'not ilike', value);
		}
	});

	dialect.operators.comparison.add('$arrayContains', {
		defaultFetchingOperator: '$array',
		fn: function(field, value) {
			return buildComparisonCondition(field, '@>', value);
		}
	});

	dialect.operators.comparison.add('$arrayIn', {
		defaultFetchingOperator: '$array',
		fn: function(field, value) {
			return buildComparisonCondition(field, '<@', value);
		}
	});

	dialect.operators.comparison.add('$arrayOverlap', {
		defaultFetchingOperator: '$array',
		fn: function(field, value) {
			return buildComparisonCondition(field, '&&', value);
		}
	});
};
