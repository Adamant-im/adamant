'use strict';

var BaseDialect = require('../base');
var _ = require('underscore');
var util = require('util');

var Dialect = module.exports = function(builder) {
	BaseDialect.call(this, builder);
};

util.inherits(Dialect, BaseDialect);

Dialect.prototype.config = _({}).extend(BaseDialect.prototype.config, {
	identifierPrefix: '`',
	identifierSuffix: '`'
});
