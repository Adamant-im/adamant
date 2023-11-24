'use strict';

var _ = require('underscore');

module.exports = function(dialect) {
	var availableSourceProps = ['table', 'query', 'select', 'expression'];
	var availableJoinTypes = ['natural', 'cross', 'inner', 'outer', 'left', 'right', 'full', 'self'];
	var orRegExp = /^(rollback|abort|replace|fail|ignore)$/i;

	// private templates

	dialect.templates.add('query', {
		pattern: '{queryBody}',
		validate: function(type, params) {
			hasRequiredProp(type, params, 'queryBody');
			hasObjectProp(type, params, 'queryBody');
		}
	});

	dialect.templates.add('subQuery', {
		pattern: '({queryBody})',
		validate: function(type, params) {
			hasRequiredProp(type, params, 'queryBody');
			hasObjectProp(type, params, 'queryBody');
		}
	});

	dialect.templates.add('subUnionQuery', {
		pattern: '{queryBody}',
		validate: function(type, params) {
			hasRequiredProp(type, params, 'queryBody');
			hasObjectProp(type, params, 'queryBody');
		}
	});

	dialect.templates.add('create', {
		pattern: 'create table if not exists {table}({tableFields})',
		validate: function (type, params) {
			hasRequiredProp(type, params, 'table');
			hasRequiredProp(type, params, 'tableFields');
			hasArrayProp(type, params, 'tableFields');
		}
	});

	dialect.templates.add('index', {
		pattern: 'create index if not exists {name} ON {table}({indexOn}) {condition}',
		validate: function (type, params) {
			hasRequiredProp(type, params, 'table');
			hasRequiredProp(type, params, 'name')
			hasRequiredProp(type, params, 'indexOn');
			hasMinPropLength(type, params, 'name', 1);
			hasMinPropLength(type, params, 'indexOn', 1);
		}
	})


	dialect.templates.add('queriesCombination', {
		pattern: '{with} {queries} {sort} {limit} {offset}',
		validate: function(type, params) {
			hasRequiredProp(type, params, 'queries');
			hasArrayProp(type, params, 'queries');
			hasMinPropLength(type, params, 'queries', 2);
		}
	});

	dialect.templates.add('queriesUnionCombination', {
		pattern: '{with} {unionqueries} {sort} {limit} {offset}',
		validate: function(type, params) {
			hasRequiredProp(type, params, 'unionqueries');
			hasArrayProp(type, params, 'unionqueries');
			hasMinPropLength(type, params, 'unionqueries', 2);
		}
	});


	dialect.templates.add('insertValues', {
		pattern: '({fields}) values {fieldValues}',
		validate: function(type, params) {
			hasRequiredProp('values', params, 'fields');
			hasArrayProp('values', params, 'fields');
			hasMinPropLength('values', params, 'fields', 1);

			hasRequiredProp('values', params, 'fieldValues');
			hasArrayProp('values', params, 'fieldValues');
			hasMinPropLength('values', params, 'fieldValues', 1);
		}
	});


	dialect.templates.add('joinItem', {
		pattern: '{type} join {table} {query} {select} {expression} {alias} {on}',
		validate: function(type, params) {
			hasOneOfProps('join', params, availableSourceProps);

			if (params.type) {
				hasStringProp('join', params, 'type');

				var splitType = _(params.type.toLowerCase().split(' ')).compact();
				if (_.difference(splitType, availableJoinTypes).length) {
					throw new Error('Invalid `type` property value "' + params.type + '" in `join` clause');
				}
			}
		}
	});


	dialect.templates.add('withItem', {
		pattern: '{name} {fields} as {query} {select} {expression}',
		validate: function(type, params) {
			hasRequiredProp('with', params, 'name');
			hasOneOfProps('with', params, ['query', 'select', 'expression']);
		}
	});


	dialect.templates.add('fromItem', {
		pattern: '{table} {query} {select} {expression}',
		validate: function(type, params) {
			hasOneOfProps('from', params, availableSourceProps);
		}
	});


	// public templates

	dialect.templates.add('select', {
		pattern: '{with} select {distinct} {fields} ' +
			'from {from} {table} {query} {select} {expression} {alias} ' +
			'{join} {condition} {group} {sort} {limit} {offset}',
		defaults: {
			fields: {}
		},
		validate: function(type, params) {
			hasOneOfProps(type, params, availableSourceProps);
		}
	});


	dialect.templates.add('insert', {
		pattern: '{with} insert {or} into {table} {values} {condition} {returning}',
		validate: function(type, params) {
			hasRequiredProp(type, params, 'values');
			hasObjectProp(type, params, 'values');
			hasOneOfProps(type, params, availableSourceProps);
			if (params.or) {
				hasStringProp(type, params, 'or');
				matchesRegExpProp(type, params, 'or', orRegExp);
			}
		}
	});


	dialect.templates.add('insertornothing', {
		pattern: '{with} insert {or} into {table} {values} on conflict do nothing {returning} {condition}',
		validate: function(type, params) {
			hasRequiredProp(type, params, 'values');
			hasObjectProp(type, params, 'values');
			hasOneOfProps(type, params, availableSourceProps);
			if (params.or) {
				hasStringProp(type, params, 'or');
				matchesRegExpProp(type, params, 'or', orRegExp);
			}
		}
	});


	dialect.templates.add('insertorupdate', {
		pattern: '{with} insert {or} into {table} {values} on conflict {conflictFields} do update {modifier} {condition} {returning}',
		validate: function(type, params) {
			hasRequiredProp(type, params, 'table');
			hasRequiredProp(type, params, 'values');
			hasObjectProp(type, params, 'values');
			hasRequiredProp('conflictFields', params, 'conflictFields');
			hasArrayProp('conflictFields', params, 'conflictFields');
			hasMinPropLength('conflictFields', params, 'conflictFields', 1);
			hasRequiredProp(type, params, 'modifier');
			hasOneOfProps(type, params, availableSourceProps);
			if (params.or) {
				hasStringProp(type, params, 'or');
				matchesRegExpProp(type, params, 'or', orRegExp);
			}
		}
	});


	dialect.templates.add('update', {
		pattern: '{with} update {or} {table} {modifier} {condition} {returning}',
		validate: function(type, params) {
			hasRequiredProp(type, params, 'modifier');
			hasRequiredProp(type, params, 'table');
			if (params.or) {
				hasStringProp(type, params, 'or');
				matchesRegExpProp(type, params, 'or', orRegExp);
			}
		}
	});


	dialect.templates.add('remove', {
		pattern: '{with} delete from {table} {condition} {returning}',
		validate: function(type, params) {
			hasRequiredProp(type, params, 'table');
		}
	});


	dialect.templates.add('union', dialect.templates.get('queriesUnionCombination'));


	dialect.templates.add('intersect', dialect.templates.get('queriesCombination'));


	dialect.templates.add('except', dialect.templates.get('queriesCombination'));


	// validation helpers

	function hasRequiredProp(type, params, propName) {
		if (!params[propName]) {
			throw new Error('`' + propName + '` property is not set in `' + type + '` clause');
		}
	}

	function hasObjectProp(type, params, propName) {
		if (!_.isObject(params[propName])) {
			throw new Error('`' + propName + '` property should be an object in `' + type + '` clause');
		}
	}

	function hasArrayProp(type, params, propName) {
		if (!_.isArray(params[propName])) {
			throw new Error('`' + propName + '` property should be an array in `' + type + '` clause');
		}
	}

	function hasStringProp(type, params, propName) {
		if (!_.isString(params.type)) {
			throw new Error('`' + propName + '` property should be a string in `' + type + '` clause');
		}
	}

	function hasMinPropLength(type, params, propName, length) {
		if (params[propName].length < length) {
			throw new Error('`' + propName + '` property should not have length less than ' + length +
				' in `' + type + '` clause');
		}
	}

	function hasOneOfProps(type, params, expectedPropNames) {
		var propNames = _(params).chain().keys().intersection(expectedPropNames).value();

		if (!propNames.length) {
			throw new Error('Neither `' + expectedPropNames.join('`, `') +
				'` properties are not set in `' + type + '` clause');
		}

		if (propNames.length > 1) {
			throw new Error('Wrong using `' + propNames.join('`, `') + '` properties together in `' +
				type + '` clause');
		}
	}

	function matchesRegExpProp(type, params, propName, regExp) {
		if (!params[propName].match(regExp)) {
			throw new Error('Invalid `' + propName + '` property value "' + params[propName] + '" in `' +
				type + '` clause');
		}
	}
};
