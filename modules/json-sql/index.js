'use strict';

var Builder = require('./builder');

module.exports = function(options) {
	return new Builder(options);
};
module.exports.Builder = Builder;
