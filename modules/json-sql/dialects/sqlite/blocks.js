'use strict';

var	_ = require('underscore');

module.exports = function(dialect) {
	dialect.blocks.add('offset', function(params) {
		var limit = '';

		if (_.isUndefined(params.limit)) {
			limit = dialect.buildBlock('limit', {limit: -1}) + ' ';
		}

		return limit + 'offset ' + dialect.builder._pushValue(params.offset);
	});
};
