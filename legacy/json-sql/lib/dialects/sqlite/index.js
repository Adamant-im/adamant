'use strict';

var BaseDialect = require('../base');
var _ = require('underscore');
var util = require('util');
var blocksInit = require('./blocks');
var templatesInit = require('./templates');

var Dialect = module.exports = function (builder) {
	BaseDialect.call(this, builder);
	blocksInit(this);
	templatesInit(this);
};

util.inherits(Dialect, BaseDialect);

Dialect.prototype.config = _({}).extend(BaseDialect.prototype.config);
