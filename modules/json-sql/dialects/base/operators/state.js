'use strict';

module.exports = function(dialect) {
	dialect.operators.state.add('$not', {
		getOperator: function(operator) {
			var operatorParams = dialect.operators.comparison.get(operator);

			if (!operatorParams || !operatorParams.inversedOperator) {
				throw new Error('Cannot get inversed operator for operator `' + operator +'`');
			}

			return operatorParams.inversedOperator;
		}
	});
};