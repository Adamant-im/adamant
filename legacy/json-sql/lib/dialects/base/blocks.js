'use strict';

var _ = require('underscore');
var scheme = require('./scheme.js');

function removeTopBrackets(condition) {
	if (condition.length && condition[0] === '(' &&
		condition[condition.length - 1] === ')') {
		condition = condition.slice(1, condition.length - 1);
	}

	return condition;
}

module.exports = function(dialect) {
	dialect.blocks.add('distinct', function() {
		return 'distinct';
	});


	dialect.blocks.add('field', function(params) {
		var field = params.field || params.$field;
		var expression = params.expression || params.$expression;

		if (!field && !expression) {
			throw new Error('Neither `field` nor `expression` properties aren\'t set');
		}

		if (field) {
			field = this.dialect._wrapIdentifier(field);

			var table = params.table || params.$table;
			if (table) {
				field = this.buildBlock('table', {table: table}) + '.' + field;
			}

			if (expression) {
				if (!_.isArray(expression)) expression = [expression];
				var exprSuffix = (new Array(expression.length + 1)).join(')');
				field = expression.join('(') + '(' + field + exprSuffix;
			}
		} else {
			field = expression;
		}

		var cast = params.cast || params.$cast;
		if (cast) {
			field = 'cast(' + field + ' as ' + cast + ')';
		}

		var alias = params.alias || params.$alias;
		if (alias) {
			field += ' ' + this.buildBlock('alias', {alias: alias});
		}

		return field;
	});


	dialect.blocks.add('fields', function(params) {
		var self = this;

		var fields = params.fields || {};
		var result = '';

		if (!_.isObject(fields) && !_.isString(fields)) {
			throw new Error('Invalid `fields` property type "' + (typeof fields) + '"');
		}

		if (_.isObject(fields)) {
			if (_.isEmpty(fields)) {
				result = '*';
			} else {
				// If fields is array: ['a', {b: 'c'}, {field: '', table: 't', alias: 'r'}]
				if (_.isArray(fields)) {
					result = _(fields).map(function(item) {

						if (_.isObject(item)) {
							// if field is field object: {field: '', table: 't', alias: 'r'}
							if (item.field || item.expression) {
								return self.buildBlock('field', item);

							// if field is non-field object: {b: 'c'}
							} else {
								return self.buildBlock('fields', {fields: item});
							}

						// if field is string: 'a'
						} else if (_.isString(item)) {
							return self.buildBlock('field', {field: item});
						}
					});

				// If fields is object: {a: 'u', b: {table: 't', alias: 'c'}}
				} else {
					// use keys as field names
					result = _(fields).map(function(item, field) {
						// b: {table: 't', alias: 'c'}
						if (_.isObject(item)) {
							if (!item.field) {
								item = _.clone(item);
								item.field = field;
							}

							return self.buildBlock('field', item);

						// a: 'u'
						} else if (_.isString(item)) {
							return self.buildBlock('field', {
								field: field,
								alias: item
							});
						}

						return '';
					});
				}

				result = result.join(', ');
			}
		} else {
			result = fields;
		}

		return result;
	});

	dialect.blocks.add('table', function(params) {
		return this.dialect._wrapIdentifier(params.table);
	});

	dialect.blocks.add('expression', function(params) {
		return params.expression;
	});

	dialect.blocks.add('name', function(params) {
		return this.dialect._wrapIdentifier(params.name);
	});

	dialect.blocks.add('alias', function(params) {
		var self = this;

		var result;

		if (_.isObject(params.alias)) {
			if (!params.alias.name) {
				throw new Error('Alias `name` property is required');
			}

			result = this.dialect._wrapIdentifier(params.alias.name);

			if (_.isArray(params.alias.columns)) {
				result += '(' + _(params.alias.columns).map(function(column) {
					return self.dialect._wrapIdentifier(column);
				}).join(', ') + ')';
			}
		} else {
			result = this.dialect._wrapIdentifier(params.alias);
		}

		return 'as ' + result;
	});

	dialect.blocks.add('condition', function(params) {
		var condition = params.condition;
		var result = '';

		if (_.isObject(condition)) {
			result = this.buildCondition({
				condition: condition,
				operator: '$eq'
			});
		} else if (_.isString(condition)) {
			result = condition;
		}

		if (result) {
			result = 'where ' + removeTopBrackets(result);
		}

		return result;
	});

	dialect.blocks.add('modifier', function(params) {
		var self = this;

		var modifier = params.modifier;
		var result = '';

		// if modifier is object -> call method for each operator
		if (_.isObject(modifier)) {
			result = _(modifier).map(function(values, field) {
				var modifierFn = self.dialect.modifiers.get(field);
				var methodParams = values;

				if (!modifierFn) {
					modifierFn = self.dialect.modifiers.get(self.dialect.config.defaultModifier);
					methodParams = {};
					methodParams[field] = values;
				}

				return modifierFn.call(self, methodParams);
			}).join(', ');

		// if modifier is string -> not process it
		} else if (_.isString(modifier)) {
			result = modifier;
		}

		if (result) {
			result = 'set ' + result;
		}

		return result;
	});

	dialect.blocks.add('join', function(params) {
		var self = this;

		var join = params.join;
		var result = '';

		// if join is array -> make each joinItem
		if (_.isArray(join)) {
			result = _(join).map(function(joinItem) {
				return self.buildTemplate('joinItem', joinItem);
			}).join(' ');

		// if join is object -> set table name from key and make each joinItem
		} else if (_.isObject(join)) {
			result = _(join).map(function(joinItem, table) {
				if (!joinItem.table && !joinItem.query && !joinItem.select) {
					joinItem = _.clone(joinItem);
					joinItem.table = table;
				}

				return self.buildTemplate('joinItem', joinItem);
			}).join(' ');

		// if join is string -> not process
		} else if (_.isString(join)) {
			result = join;
		}

		return result;
	});

	dialect.blocks.add('type', function(params) {
		return params.type.toLowerCase();
	});


	dialect.blocks.add('on', function(params) {
		var on = params.on;
		var result = '';

		// `on` block is use `$field` as default compare operator
		// because it most used case
		if (_.isObject(on)) {
			result = this.buildCondition({
				condition: on,
				operator: '$field'
			});
		} else if (_.isString(on)) {
			result = on;
		}

		if (result) {
			result = 'on ' + removeTopBrackets(result);
		}

		return result;
	});


	dialect.blocks.add('group', function(params) {
		var result = '';
		var group = params.group;

		if (_.isArray(group)) {
			var self = this;
			result = _(group).map(function(field) {
				return self.dialect._wrapIdentifier(field);
			}).join(', ');
		} else if (_.isString(group)) {
			result = this.dialect._wrapIdentifier(group);
		} else if (_.isObject(group)) {
			result = group.expression + (group.having ? " having " + this.buildCondition({
				condition: group.having
			}) : "");
		}

		if (result) {
			result = 'group by ' + result;
		}

		return result;
	});


	dialect.blocks.add('sort', function(params) {
		var result = '';
		var sort = params.sort;

		// if sort is array -> field1, field2, ...
		var self = this;
		if (_.isArray(sort)) {
			result = _(sort).map(function(sortField) {
				return self.dialect._wrapIdentifier(sortField);
			}).join(', ');

		// if sort is object -> field1 asc, field2 desc, ...
		} else if (_.isObject(sort)) {
			result = _(sort).map(function(direction, field) {
				return self.dialect._wrapIdentifier(field) + ' ' +
						(direction > 0 ? 'asc' : 'desc');
			}).join(', ');

		// if sort is string -> not process
		} else if (_.isString(sort)) {
			result = this.dialect._wrapIdentifier(sort);
		}

		if (result) {
			result = 'order by ' + result;
		}

		return result;
	});


	dialect.blocks.add('limit', function(params) {
		return 'limit ' + this._pushValue(params.limit);
	});


	dialect.blocks.add('offset', function(params) {
		return 'offset ' + this._pushValue(params.offset);
	});


	dialect.blocks.add('or', function(params) {
		return 'or ' + params.or;
	});


	dialect.blocks.add('values', function(params) {
		var self = this;

		var fieldValues = params.values;

		if (!_.isArray(fieldValues)) {
			fieldValues = [fieldValues];
		}

		var fields = params.fields || _(fieldValues).chain().map(function(values) {
			return _(values).keys();
		}).flatten().uniq().value();

		fieldValues = _(fieldValues).map(function(values) {
			return _(fields).map(function(field) {
				return self._pushValue(values[field]);
			});
		});

		return this.buildTemplate('insertValues', {
			fields: fields,
			fieldValues: fieldValues
		});
	});

	dialect.blocks.add('fieldValues', function(params) {
		return _(params.fieldValues).map(function(values) {
			return '(' + values.join(', ') + ')';
		}).join(', ');
	});

	dialect.blocks.add('queryBody', function(params) {
		var query = params.queryBody || {};

		return this.buildTemplate(query.type || 'select', query);
	});

	dialect.blocks.add('query', function(params) {
		return this.buildTemplate('subQuery', {queryBody: params.query});
	});

	dialect.blocks.add('select', function(params) {
		return this.buildTemplate('subQuery', {queryBody: params.select});
	});

	dialect.blocks.add('tableFields', function (params) {
		return scheme.parse.call(this, params.tableFields, params.foreignKeys);
	});

	dialect.blocks.add('queries', function(params) {
		var self = this;

		return _(params.queries).map(function(query) {
			return self.buildTemplate('subQuery', {queryBody: query});
		}).join(' ' + params.type + (params.all ? ' all' : '') + ' ');
	});

	dialect.blocks.add('indexOn', function (params) {
		return params.indexOn;
	});

	dialect.blocks.add('with', function(params) {
		var self = this;

		var withList = params['with'];
		var result = '';

		// if with clause is array -> make each withItem
		if (_.isArray(withList)) {
			result = _(withList).map(function(withItem) {
				return self.buildTemplate('withItem', withItem);
			}).join(', ');

		// if with clause is object -> set name from key and make each withItem
		} else if (_.isObject(withList)) {
			result = _(withList).map(function(withItem, name) {
				if (!withItem.name) {
					withItem = _.clone(withItem);
					withItem.name = name;
				}
				return self.buildTemplate('withItem', withItem);
			}).join(', ');

		// if with clause is string -> not process
		} else if (_.isString(withList)) {
			result = withList;
		}

		return 'with ' + result;
	});

	dialect.blocks.add('returning', function(params) {
		return 'returning ' + this.buildBlock('fields', {fields: params.returning});
	});
};
