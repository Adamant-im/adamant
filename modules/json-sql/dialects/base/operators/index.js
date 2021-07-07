'use strict';

var comparisonOperatorsInit = require('./comparison');
var logicalOperatorsInit = require('./logical');
var fetchingOperatorsInit = require('./fetching');
var stateOperatorsInit = require('./state');

module.exports = function(dialect) {
	comparisonOperatorsInit(dialect);
	logicalOperatorsInit(dialect);
	fetchingOperatorsInit(dialect);
	stateOperatorsInit(dialect);
};
