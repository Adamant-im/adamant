'use strict';

var _ = require('underscore');

module.exports = function(dialect) {
	dialect.blocks.add('offset', function(params) {
		var limit = '';

		if (typeof params.limit === 'undefined') {
			limit = this.buildBlock('limit', {limit: -1}) + ' ';
		}

		return limit + 'offset ' + this._pushValue(params.offset);
	});

	dialect.blocks.add('unionqueries', function(params) {
		var self = this;

		return _(params.unionqueries).map(function(query) {
			return self.buildTemplate('subUnionQuery', {queryBody: query});
		}).join(' ' + params.type + (params.all ? ' all' : '') + ' ');
	});
};
