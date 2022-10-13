'use strict';

var _ = require('underscore');
var ValuesStore = require('../../valuesStore');

var templatesInit = require('./templates');
var blocksInit = require('./blocks');
var conditionsInit = require('./conditions');
var logicalOperatorsInit = require('./logicalOperators');
var modifiersInit = require('./modifiers');

var Dialect = module.exports = function(builder) {
	this.builder = builder;

	this.blocks = new ValuesStore({context: builder});
	this.modifiers = new ValuesStore({context: builder});
	this.conditions = new ValuesStore({context: builder});
	this.logicalOperators = new ValuesStore({context: builder});
	this.templates = new ValuesStore({context: builder});

	templatesInit(this);
	blocksInit(this);
	conditionsInit(this);
	modifiersInit(this);
	logicalOperatorsInit(this);

	this.identifierPartsRegexp = new RegExp(
		'(\\' + this.config.identifierPrefix + '[^\\' + this.config.identifierSuffix + ']*\\' +
			this.config.identifierSuffix + '|[^\\.]+)', 'g'
	);
	this.wrappedIdentifierPartRegexp = new RegExp(
		'^\\' + this.config.identifierPrefix + '.*\\' + this.config.identifierSuffix + '$'
	);
};

Dialect.prototype.config = {
	identifierPrefix: '"',
	identifierSuffix: '"',
	defaultLogicalOperator: '$and',
	defaultModifier: '$set'
};

Dialect.prototype._wrapIdentifier = function(name) {
	if (this.builder.options.wrappedIdentifiers) {
		var self = this;
		var nameParts = name.match(this.identifierPartsRegexp);

		return _(nameParts).map(function(namePart) {
			if (namePart !== '*' && !self.wrappedIdentifierPartRegexp.test(namePart)) {
				namePart = self.config.identifierPrefix + namePart + self.config.identifierSuffix;
			}

			return namePart;
		}).join('.');
	}

	return name;
};
