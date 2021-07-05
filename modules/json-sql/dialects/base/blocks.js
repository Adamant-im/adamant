'use strict';

var _ = require('underscore');
var objectUtils = require('../../utils/object');

var removeTopBrackets = function(condition) {
	if (condition.length && condition[0] === '(' &&
		condition[condition.length - 1] === ')') {
		condition = condition.slice(1, condition.length - 1);
	}

	return condition;
};

var termKeys = ['select', 'query', 'field', 'value', 'func', 'expression'];
var isTerm = function(obj) {
	return objectUtils.isObjectObject(obj) && objectUtils.hasSome(obj, termKeys);
};

module.exports = function(dialect) {
	dialect.blocks.add('distinct', function() {
		return 'distinct';
	});

	dialect.blocks.add('fields', function(params) {
		var fields = params.fields || {};

		if (!_.isObject(fields)) {
			throw new Error('Invalid `fields` property type "' + (typeof fields) + '"');
		}

		if (_.isEmpty(fields)) return '*';

		// If fields is array: ['a', {b: 'c'}, {name: '', table: 't', alias: 'r'}]
		if (_.isArray(fields)) {
			fields = _(fields).map(function(field) {
				if (objectUtils.isSimpleValue(field) || isTerm(field) || _.has(field, 'name')) {
					// if field has simple type or is field object: {name: '', table: 't', alias: 'r'}
					return dialect.buildBlock('term', {term: field, type: 'field'});
				} else {
					// if field is non-field object: {b: 'c'}
					return dialect.buildBlock('fields', {fields: field});
				}
			});

		// If fields is object: {a: 'u', b: {table: 't', alias: 'c'}}
		} else {
			// use keys as field names
			fields = _(fields).map(function(field, name) {
				// if field is not an object value, use it as alias
				if (_.isString(field)) field = {alias: field};

				// if field does not have name, get it from key
				if (!_.has(field, 'name')) field = _.defaults({name: name}, field);

				return dialect.buildBlock('term', {term: field, type: 'field'});
			});
		}

		return _(fields).compact().join(', ');
	});

	dialect.blocks.add('term', function(params) {
		var term = params.term;
		var type = params.type || 'field';

		var isSimpleValue = objectUtils.isSimpleValue(term);
		var isArray = _.isArray(term);

		if (isSimpleValue && !_.isString(term) || isArray) type = 'value';

		if (isSimpleValue || !isTerm(term) || isArray) {
			term = _(term).chain().pick('cast', 'alias').extend(_.object([type], [term])).value();
		}

		type = _(termKeys).find(function(key) {
			return _.has(term, key);
		});

		var result = dialect.buildBlock(type, _(term).pick(type));

		if (_.has(term, 'cast')) {
			result = 'cast(' + result + ' as ' + term.cast + ')';
		}

		if (_.has(term, 'alias')) {
			result += ' ' + dialect.buildBlock('alias', {alias: term.alias});
		}

		return result;
	});

	dialect.blocks.add('table', function(params) {
		return dialect.buildBlock('name', {name: params.table});
	});

	dialect.blocks.add('func', function(params) {
		var func = params.func;

		if (_.isString(func)) func = {name: func};

		if (!_.isObject(func)) {
			throw new Error('Invalid `func` property type "' + (typeof func) + '"');
		}

		if (!_.has(func, 'name')) {
			throw new Error('`func.name` property is required');
		}

		var args = '';

		if (_.isArray(func.args)) {
			args = _(func.args).map(function(arg) {
				return dialect.buildBlock('term', {term: arg, type: 'value'});
			}).join(', ');
		}

		return func.name + '(' + args + ')';
	});

	dialect.blocks.add('expression', function(params) {
		var expression = params.expression;

		if (_.isString(expression)) expression = {pattern: expression};

		if (!_.isObject(expression)) {
			throw new Error('Invalid `expression` property type "' + (typeof expression) + '"');
		}

		if (!_.has(expression, 'pattern')) {
			throw new Error('`expression.pattern` property is required');
		}

		var values = expression.values || {};

		return expression.pattern.replace(/\{([a-z0-9]+)\}/ig, function(fullMatch, block) {
			if (!_.has(values, block)) {
				throw new Error('Field `' + block + '` is required in `expression.values` property');
			}

			return dialect.buildBlock('term', {term: values[block], type: 'value'});
		}).trim();
	});

	dialect.blocks.add('field', function(params) {
		var field = params.field;

		if (_.isString(field)) field = {name: field};

		if (!_.isObject(field)) {
			throw new Error('Invalid `field` property type "' + (typeof field) + '"');
		}

		if (!_.has(field, 'name')) {
			throw new Error('`field.name` property is required');
		}

		var result = dialect.buildBlock('name', {name: field.name});

		if (_.has(field, 'table')) {
			result = dialect.buildBlock('table', {table: field.table}) + '.' + result;
		}

		return result;
	});

	dialect.blocks.add('value', function(params) {
		var value = params.value;
		if (_.isRegExp(value)) value = value.source;
		return dialect.builder._pushValue(value);
	});

	dialect.blocks.add('name', function(params) {
		return dialect._wrapIdentifier(params.name);
	});

	dialect.blocks.add('alias', function(params) {
		var alias = params.alias;

		if (_.isString(alias)) alias = {name: alias};

		if (!_.isObject(alias)) {
			throw new Error('Invalid `alias` property type "' + (typeof alias) + '"');
		}
		if (!_.has(alias, 'name')) {
			throw new Error('`alias.name` property is required');
		}

		var result = 'as ' + dialect._wrapIdentifier(alias.name);

		if (_.isArray(alias.columns)) {
			result += '(' + _(alias.columns).map(function(column) {
				return dialect._wrapIdentifier(column);
			}).join(', ') + ')';
		}

		return result;
	});

	dialect.blocks.add('condition', function(params) {
		var result = dialect.buildCondition({
			value: params.condition,
			defaultFetchingOperator: '$value'
		});

		if (result) {
			result = 'where ' + removeTopBrackets(result);
		}

		return result;
	});

	dialect.blocks.add('modifier', function(params) {
		var result = dialect.buildModifier({
			modifier: params.modifier
		});

		if (result) {
			result = 'set ' + result;
		}

		return result;
	});

	dialect.blocks.add('join', function(params) {
		var join = params.join;
		var result = '';

		// if join is array -> make each joinItem
		if (_.isArray(join)) {
			result = _(join).map(function(joinItem) {
				return dialect.buildTemplate('joinItem', joinItem);
			}).join(' ');

		// if join is object -> set table name from key and make each joinItem
		} else if (_.isObject(join)) {
			result = _(join).map(function(joinItem, table) {
				if (!objectUtils.hasSome(joinItem, ['table', 'query', 'select', 'expression'])) {
					joinItem = _.defaults({table: table}, joinItem);
				}

				return dialect.buildTemplate('joinItem', joinItem);
			}).join(' ');
		}

		return result;
	});

	dialect.blocks.add('joinItem:type', function(params) {
		return params.type.toLowerCase();
	});

	dialect.blocks.add('joinItem:on', function(params) {
		// `on` block is use `$field` as default query operator because it most used case
		var result = dialect.buildCondition({
			value: params.on,
			defaultFetchingOperator: '$field'
		});

		if (result) {
			result = 'on ' + removeTopBrackets(result);
		}

		return result;
	});

	dialect.blocks.add('group', function(params) {
		var group = params.group;
		var result = '';

		if (_.isString(group)) group = [group];

		if (_.isArray(group)) {
			result = _(group).map(function(field) {
				return dialect.buildBlock('term', {term: field, type: 'field'});
			}).join(', ');
		}

		if (result) {
			result = 'group by ' + result;
		}

		return result;
	});

	dialect.blocks.add('having', function(params) {
		var result = dialect.buildCondition({
			value: params.having,
			defaultFetchingOperator: '$value'
		});

		if (result) {
			result = 'having ' + removeTopBrackets(result);
		}

		return result;
	});

	dialect.blocks.add('sort', function(params) {
		var sort = params.sort;
		var result = '';

		if (_.isString(sort)) sort = [sort];

		if (_.isArray(sort)) {
			result = _(sort).map(function(sortField) {
				return dialect._wrapIdentifier(sortField);
			}).join(', ');
		} else if (_.isObject(sort)) {
			result = _(sort).map(function(direction, field) {
				return dialect._wrapIdentifier(field) + ' ' + (direction > 0 ? 'asc' : 'desc');
			}).join(', ');
		}

		if (result) {
			result = 'order by ' + result;
		}

		return result;
	});

	dialect.blocks.add('limit', function(params) {
		return 'limit ' + dialect.builder._pushValue(params.limit);
	});

	dialect.blocks.add('offset', function(params) {
		return 'offset ' + dialect.builder._pushValue(params.offset);
	});

	dialect.blocks.add('or', function(params) {
		return 'or ' + params.or;
	});

	dialect.blocks.add('insert:values', function(params) {
		var values = params.values;

		if (!_.isArray(values)) values = [values];

		var fields = params.fields || _(values)
			.chain()
			.map(function(row) {
				return _(row).keys();
			})
			.flatten()
			.uniq()
			.value();

		return dialect.buildTemplate('insertValues', {
			fields: fields,
			values: _(values).map(function(row) {
				return _(fields).map(function(field) {
					return dialect.buildBlock('value', {value: row[field]});
				});
			})
		});
	});

	dialect.blocks.add('insertValues:values', function(params) {
		return _(params.values).map(function(row) {
			return '(' + row.join(', ') + ')';
		}).join(', ');
	});

	dialect.blocks.add('queryBody', function(params) {
		var queryBody = params.queryBody || {};

		return dialect.buildTemplate(queryBody.type || 'select', queryBody);
	});

	dialect.blocks.add('query', function(params) {
		var templateParams = {
			queryBody: params.query
		};
		if (params.query && params.query.type === 'union') {
			templateParams.alias = params.query.alias;
		}

		return dialect.buildTemplate('subQuery', templateParams);
	});

	dialect.blocks.add('select', function(params) {
		var templateParams = {
			queryBody: params.select
		};
		if (params.select && params.select.type === 'union') {
			templateParams.alias = params.select.alias;
		}

		return dialect.buildTemplate('subQuery', templateParams);
	});

	dialect.blocks.add('queries', function(params) {
		return _(params.queries).map(function(query) {
			return dialect.buildTemplate('query', {queryBody: query});
		}).join(' ' + params.type + (params.all ? ' all' : '') + ' ');
	});

	function buildWith(withList) {
		var result = '';

		// if with clause is array -> make each withItem
		if (_.isArray(withList)) {
			result = _(withList).map(function(withItem) {
				return dialect.buildTemplate('withItem', withItem);
			}).join(', ');

		// if with clause is object -> set name from key and make each withItem
		} else if (_.isObject(withList)) {
			result = _(withList).map(function(withItem, name) {
				if (!withItem.name) {
					withItem = _.clone(withItem);
					withItem.name = name;
				}
				return dialect.buildTemplate('withItem', withItem);
			}).join(', ');
		}

		return result;
	}

	dialect.blocks.add('with', function(params) {
		var result = buildWith(params['with']);

		if (result) result = 'with ' + result;

		return result;
	});

	dialect.blocks.add('withRecursive', function(params) {
		var result = buildWith(params.withRecursive);

		if (result) result = 'with recursive ' + result;

		return result;
	});

	dialect.blocks.add('returning', function(params) {
		var result = dialect.buildBlock('fields', {fields: params.returning});

		if (result) result = 'returning ' + result;

		return result;
	});
};
