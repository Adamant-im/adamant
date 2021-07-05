'use strict';

function buildLogicalOperator(operator, values) {
	if (!values.length) return '';

	var result = values.join(' ' + operator + ' ');
	if (values.length > 1) result = '(' + result + ')';

	return result;
}

module.exports = function(dialect) {
	dialect.operators.logical.add('$and', {
		fn: function(values) {
			return buildLogicalOperator('and', values);
		}
	});

	dialect.operators.logical.add('$or', {
		fn: function(values) {
			return buildLogicalOperator('or', values);
		}
	});

	dialect.operators.logical.add('$not', {
		fn: function(values) {
			return 'not ' + buildLogicalOperator('and', values);
		}
	});

	dialect.operators.logical.add('$nor', {
		fn: function(values) {
			return 'not ' + buildLogicalOperator('or', values);
		}
	});
};
