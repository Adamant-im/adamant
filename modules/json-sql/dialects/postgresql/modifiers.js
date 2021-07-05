'use strict';

module.exports = function(dialect) {
	dialect.modifiers.add('$jsonConcatenate', function(field, value) {
		return [field, '=', field, '||', value].join(' ');
	});

	dialect.modifiers.add('$jsonDelete', function(field, value) {
		return [field, '=', field, '-', value].join(' ');
	});

	dialect.modifiers.add('$jsonDeleteByPath', function(field, value) {
		return [field, '=', field, '#-', value].join(' ');
	});
};
