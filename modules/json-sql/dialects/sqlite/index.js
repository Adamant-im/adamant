'use strict';

var BaseDialect = require('../base');
var _ = require('underscore');
var util = require('util');
var blocksInit = require('./blocks');

var Dialect = module.exports = function(builder) {
	BaseDialect.call(this, builder);

	// init blocks
	blocksInit(this);
};

util.inherits(Dialect, BaseDialect);

Dialect.prototype.config = _({}).extend(BaseDialect.prototype.config);
