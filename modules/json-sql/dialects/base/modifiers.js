'use strict';

module.exports = function(dialect) {
	dialect.modifiers.add('$set', function(field, value) {
		return [field, '=', value].join(' ');
	});

	dialect.modifiers.add('$inc', function(field, value) {
		return [field, '=', field, '+', value].join(' ');
	});

	dialect.modifiers.add('$dec', function(field, value) {
		return [field, '=', field, '-', value].join(' ');
	});

	dialect.modifiers.add('$mul', function(field, value) {
		return [field, '=', field, '*', value].join(' ');
	});

	dialect.modifiers.add('$div', function(field, value) {
		return [field, '=', field, '/', value].join(' ');
	});

	dialect.modifiers.add('$default', function(field) {
		return [field, '=', 'default'].join(' ');
	});
};
