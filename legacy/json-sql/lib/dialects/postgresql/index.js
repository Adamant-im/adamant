'use strict';

var BaseDialect = require('../base');
var _ = require('underscore');
var util = require('util');
var blocksInit = require('./blocks');
var conditionsInit = require('./conditions');
var templatesInit = require('./templates');

var Dialect = module.exports = function (builder) {
	BaseDialect.call(this, builder);
	blocksInit(this)
	conditionsInit(this);
	templatesInit(this);
};

Dialect.prototype.config = _({}).extend(BaseDialect.prototype.config);

util.inherits(Dialect, BaseDialect);

Dialect.prototype.config = _({
	jsonSeparatorRegexp: /->>?/g
}).extend(BaseDialect.prototype.config);

Dialect.prototype._wrapIdentifier = function(name) {
	// split by json separator
	var nameParts = name.split(this.config.jsonSeparatorRegexp);
	var separators = name.match(this.config.jsonSeparatorRegexp);

	// wrap base identifier
	var identifier = BaseDialect.prototype._wrapIdentifier.call(this, nameParts[0]);

	// wrap all json identifier and join them with separators
	identifier += _(separators).reduce(function(memo, separator, index) {
		return memo + separator + '\'' + nameParts[index + 1] + '\'';
	}, '');

	return identifier;
};
