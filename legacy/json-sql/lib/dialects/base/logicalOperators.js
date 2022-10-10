'use strict';

var _ = require('underscore');

function buildJoinOperator(conditions, operator) {
	var isBracketsNeeded = conditions.length > 1;
	var result = conditions.join(' ' + operator + ' ');

	if (result && isBracketsNeeded) result = '(' + result + ')';

	return result;
}

module.exports = function(dialect) {
	dialect.logicalOperators.add('$and', function(conditions) {
		return buildJoinOperator(conditions, 'and');
	});

	dialect.logicalOperators.add('$or', function(conditions) {
		return buildJoinOperator(conditions, 'or');
	});

	dialect.logicalOperators.add('$not', function(conditions) {
		var result = '';

		if (_.isArray(conditions)) {
			result = dialect.logicalOperators
				.get(dialect.config.defaultLogicalOperator)(conditions);
		} else if (_.isString(conditions)) {
			result = conditions;
		}

		if (result) result = 'not ' + result;

		return result;
	});
};
