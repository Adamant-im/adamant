'use strict';

var comparisonOperatorsInit = require('./comparison');
var fetchingOperatorsInit = require('./fetching');

module.exports = function(dialect) {
	comparisonOperatorsInit(dialect);
	fetchingOperatorsInit(dialect);
};
