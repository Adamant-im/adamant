'use strict';

var Builder = require('./builder');

module.exports = function(params) {
	return new Builder(params);
};
module.exports.Builder = Builder;
