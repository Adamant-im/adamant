'use strict';

var _ = require('underscore');
var ValuesStore = require('../../utils/valuesStore');
var objectUtils = require('../../utils/object');

var templatesInit = require('./templates');
var blocksInit = require('./blocks');
var operatorsInit = require('./operators');
var modifiersInit = require('./modifiers');

var blockRegExp = /\{([a-z0-9]+)\}(.|$)/ig;

var Dialect = module.exports = function(builder) {
	this.builder = builder;

	this.templates = new ValuesStore();
	this.blocks = new ValuesStore();
	this.operators = {
		comparison: new ValuesStore(),
		logical: new ValuesStore(),
		fetching: new ValuesStore(),
		state: new ValuesStore()
	};
	this.modifiers = new ValuesStore();

	// init templates
	templatesInit(this);

	// init blocks
	blocksInit(this);

	// init operators
	operatorsInit(this);

	// init modifiers
	modifiersInit(this);

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
	identifierSuffix: '"'
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

Dialect.prototype.buildLogicalOperator = function(params) {
	var self = this;

	var operator = params.operator;
	var value = params.value;

	if (objectUtils.isSimpleValue(value)) {
		value = _.object([params.defaultFetchingOperator], [value]);
	}

	if (_.isEmpty(value)) return '';

	var result;

	if (_.isArray(value)) {
		// if value is array: [{a: 1}, {b: 2}] process each item as logical operator
		result = _(value).map(function(item) {
			return self.buildOperator({
				context: 'logical',
				contextOperator: operator,
				operator: '$and',
				value: item,
				states: [],
				defaultFetchingOperator: params.defaultFetchingOperator
			});
		});
	} else {
		result = _(value).map(function(item, field) {
			// if field name is not a operator convert it to {$field: {name: 'a', $eq: 'b'}}
			if (field[0] !== '$') {
				if (objectUtils.isSimpleValue(item) || _.isArray(item)) {
					item = {$eq: item};
				}
				item = _.defaults({name: field}, item);
				field = '$field';
			}

			return self.buildOperator({
				context: 'logical',
				contextOperator: operator,
				operator: field,
				value: item,
				states: [],
				defaultFetchingOperator: params.defaultFetchingOperator
			});
		});
	}

	return this.operators.logical.get(operator).fn(_.compact(result));
};

Dialect.prototype.buildComparisonOperator = function(params) {
	var self = this;

	var operator = params.operator;

	_(params.states).each(function(state) {
		operator = self.operators.state.get(state).getOperator(operator);
	});

	var operatorParams = this.operators.comparison.get(operator);

	var value = this.buildEndFetchingOperator({
		context: 'comparison',
		contextOperator: operator,
		value: params.value,
		states: params.states,
		defaultFetchingOperator: operatorParams.defaultFetchingOperator ||
			params.defaultFetchingOperator
	});

	return operatorParams.fn(params.field, value);
};

Dialect.prototype.buildFetchingOperator = function(params) {
	var operator = params.operator;
	var value = params.value;

	var field = this.operators.fetching.get(operator).fn(value, params.end);

	var result;
	if (params.end || objectUtils.isSimpleValue(value)) {
		result = field;
	} else {
		result = this.buildOperatorsGroup({
			context: 'fetching',
			contextOperator: operator,
			operator: '$and',
			field: field,
			value: value,
			states: params.states,
			defaultFetchingOperator: params.defaultFetchingOperator
		});
	}

	return result;
};

Dialect.prototype.buildEndFetchingOperator = function(params) {
	var self = this;

	var value = params.value;
	var operator;

	if (objectUtils.isObjectObject(value)) {
		// get first query operator
		operator = _(value).findKey(function(item, operator) {
			return operator[0] === '$' && self.operators.fetching.has(operator);
		});

		if (operator) {
			value = value[operator];
		}
	}

	return this.buildOperator(_.extend({}, params, {
		operator: operator || params.defaultFetchingOperator,
		value: value,
		end: true
	}));
};

Dialect.prototype.buildStateOperator = function(params) {
	return this.buildOperatorsGroup(_.extend({}, params, {
		context: 'state',
		contextOperator: params.operator,
		operator: '$and',
		states: params.states.concat(params.operator)
	}));
};

Dialect.prototype.buildOperatorsGroup = function(params) {
	var self = this;

	var value = params.value;

	var result;
	if (objectUtils.isObjectObject(value)) {
		result = this.operators.logical.get(params.operator).fn(
			_(value)
				.chain()
				.map(function(item, operator) {
					if (operator[0] !== '$') return '';

					if (self.operators.fetching.has(operator)) {
						// convert {a: {$field: 'b'}} to {a: {$eq: {$field: 'b'}}}
						item = _.object([operator], [item]);
						operator = '$eq';
					}

					return self.buildOperator(_.extend({}, params, {
						operator: operator,
						value: item
					}));
				})
				.compact()
				.value()
		);

		if (!result) result = params.field;
	} else {
		result = this.buildEndFetchingOperator(params);
	}

	return result;
};

Dialect.prototype.buildOperator = function(params) {
	var isContextValid = function(expectedContexts, context) {
		return _.contains(expectedContexts, context);
	};

	var context = params.context;
	var operator = params.operator;

	var result;

	var contexts = _(this.operators).mapObject(function(operatorsGroup) {
		return operatorsGroup.has(operator);
	});

	if (!_(contexts).some()) {
		throw new Error('Unknown operator "' + operator + '"');
	}

	if (contexts.logical && isContextValid(['null', 'logical'], context)) {
		result = this.buildLogicalOperator(params);
	} else if (contexts.fetching && isContextValid(['logical', 'comparison'], context)) {
		result = this.buildFetchingOperator(params);
	} else if (contexts.comparison && isContextValid(['fetching', 'state'], context)) {
		result = this.buildComparisonOperator(params);
	} else if (contexts.state && isContextValid(['fetching', 'state'], context)) {
		result = this.buildStateOperator(params);
	} else {
		var errMessage = 'Unexpected operator "' + operator + '" at ' +
			(context === 'null' ? 'null ' : '') + 'context';

		if (params.contextOperator) {
			errMessage += ' of operator "' + params.contextOperator + '"';
		}

		throw new Error(errMessage);
	}

	return result;
};

Dialect.prototype.buildCondition = function(params) {
	return this.buildOperator({
		context: 'null',
		operator: '$and',
		value: params.value,
		states: [],
		defaultFetchingOperator: params.defaultFetchingOperator
	});
};

Dialect.prototype.buildModifier = function(params) {
	var self = this;

	return _(params.modifier)
		.chain()
		.map(function(values, field) {
			var modifier;

			if (field[0] === '$') {
				modifier = field;
			} else {
				modifier = '$set';
				values = _.object([field], [values]);
			}

			var modifierFn = self.modifiers.get(modifier);

			if (!modifierFn) {
				throw new Error('Unknown modifier "' + modifier + '"');
			}

			return _(values).map(function(value, field) {
				field = self._wrapIdentifier(field);
				value = self.buildBlock('term', {term: value, type: 'value'});

				return modifierFn(field, value);
			});
		})
		.flatten()
		.compact()
		.value()
		.join(', ');
};

Dialect.prototype.buildBlock = function(block, params) {
	var blockFn = this.blocks.get(block);

	if (!blockFn) {
		throw new Error('Unknown block "' + block + '"');
	}

	return blockFn(params);
};

Dialect.prototype.buildTemplate = function(type, params) {
	var self = this;

	var template = this.templates.get(type);
	if (!template) {
		throw new Error('Unknown template type "' + type + '"');
	}

	params = _.defaults({}, params, template.defaults);

	if (template.validate) {
		template.validate(type, params);
	}

	return template.pattern.replace(blockRegExp, function(fullMatch, block, space) {
		if (_.isUndefined(params[block])) {
			return '';
		} else {
			if (self.blocks.has(type + ':' + block)) block = type + ':' + block;
			return self.buildBlock(block, params) + space;
		}
	}).trim();
};
