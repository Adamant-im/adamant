'use strict';

var _ = require('underscore');
var templateChecks = require('../../utils/templateChecks');

module.exports = function(dialect) {
	var availableJoinTypes = ['natural', 'cross', 'inner', 'outer', 'left', 'right', 'full', 'self'];
	var orRegExp = /^(rollback|abort|replace|fail|ignore)$/i;

	// private templates

	dialect.templates.add('query', {
		pattern: '{queryBody}',
		validate: function(type, params) {
			templateChecks.requiredProp(type, params, 'queryBody');
			templateChecks.propType(type, params, 'queryBody', 'object');
		}
	});


	dialect.templates.add('subQuery', {
		pattern: '({queryBody}) {alias}',
		validate: function(type, params) {
			templateChecks.requiredProp(type, params, 'queryBody');
			templateChecks.propType(type, params, 'queryBody', 'object');

			templateChecks.propType(type, params, 'alias', ['string', 'object']);
		}
	});


	dialect.templates.add('queriesCombination', {
		pattern: '{with} {withRecursive} {queries} {sort} {limit} {offset}',
		validate: function(type, params) {
			templateChecks.onlyOneOfProps(type, params, ['with', 'withRecursive']);
			templateChecks.propType(type, params, 'with', 'object');
			templateChecks.propType(type, params, 'withRecursive', 'object');

			templateChecks.requiredProp(type, params, 'queries');
			templateChecks.propType(type, params, 'queries', 'array');
			templateChecks.minPropLength(type, params, 'queries', 2);

			templateChecks.propType(type, params, 'sort', ['string', 'array', 'object']);

			templateChecks.propType(type, params, 'limit', ['number', 'string']);

			templateChecks.propType(type, params, 'offset', ['number', 'string']);
		}
	});


	dialect.templates.add('insertValues', {
		pattern: '({fields}) values {values}',
		validate: function(type, params) {
			templateChecks.requiredProp('values', params, 'fields');
			templateChecks.propType('values', params, 'fields', 'array');
			templateChecks.minPropLength('values', params, 'fields', 1);

			templateChecks.requiredProp('values', params, 'values');
			templateChecks.propType('values', params, 'values', 'array');
			templateChecks.minPropLength('values', params, 'values', 1);
		}
	});


	dialect.templates.add('joinItem', {
		pattern: '{type} join {table} {query} {select} {expression} {alias} {on}',
		validate: function(type, params) {
			templateChecks.propType('join', params, 'type', 'string');
			templateChecks.customProp('join', params, 'type', function(value) {
				var splitType = _(value.toLowerCase().split(' ')).compact();
				return !_.difference(splitType, availableJoinTypes).length;
			});

			templateChecks.atLeastOneOfProps('join', params, ['table', 'query', 'select', 'expression']);
			templateChecks.onlyOneOfProps('join', params, ['table', 'query', 'select', 'expression']);

			templateChecks.propType('join', params, 'table', 'string');
			templateChecks.propType('join', params, 'query', 'object');
			templateChecks.propType('join', params, 'select', 'object');
			templateChecks.propType('join', params, 'expression', ['string', 'object']);

			templateChecks.propType('join', params, 'alias', ['string', 'object']);

			templateChecks.propType('join', params, 'on', ['array', 'object']);
		}
	});


	dialect.templates.add('withItem', {
		pattern: '{name} {fields} as {query} {select} {expression}',
		validate: function(type, params) {
			templateChecks.requiredProp('with', params, 'name');
			templateChecks.propType('with', params, 'name', 'string');

			templateChecks.propType(type, params, 'fields', ['array', 'object']);

			templateChecks.atLeastOneOfProps('with', params, ['query', 'select', 'expression']);
			templateChecks.onlyOneOfProps('with', params, ['query', 'select', 'expression']);

			templateChecks.propType('with', params, 'query', 'object');
			templateChecks.propType('with', params, 'select', 'object');
			templateChecks.propType('with', params, 'expression', ['string', 'object']);
		}
	});


	dialect.templates.add('fromItem', {
		pattern: '{table} {query} {select} {expression} {alias}',
		validate: function(type, params) {
			templateChecks.atLeastOneOfProps('from', params, ['table', 'query', 'select', 'expression']);
			templateChecks.onlyOneOfProps('from', params, ['table', 'query', 'select', 'expression']);

			templateChecks.propType('from', params, 'table', 'string');
			templateChecks.propType('from', params, 'query', 'object');
			templateChecks.propType('from', params, 'select', 'object');
			templateChecks.propType('from', params, 'expression', ['string', 'object']);

			templateChecks.propType('from', params, 'alias', ['string', 'object']);
		}
	});


	// public templates

	dialect.templates.add('select', {
		pattern: '{with} {withRecursive} select {distinct} {fields} ' +
			'from {from} {table} {query} {select} {expression} {alias} ' +
			'{join} {condition} {group} {having} {sort} {limit} {offset}',
		defaults: {
			fields: {}
		},
		validate: function(type, params) {
			templateChecks.onlyOneOfProps(type, params, ['with', 'withRecursive']);
			templateChecks.propType(type, params, 'with', 'object');
			templateChecks.propType(type, params, 'withRecursive', 'object');

			templateChecks.propType(type, params, 'distinct', 'boolean');

			templateChecks.propType(type, params, 'fields', ['array', 'object']);

			templateChecks.propType(type, params, 'from', ['string', 'array', 'object']);

			templateChecks.atLeastOneOfProps(type, params, ['table', 'query', 'select', 'expression']);
			templateChecks.onlyOneOfProps(type, params, ['table', 'query', 'select', 'expression']);

			templateChecks.propType(type, params, 'table', 'string');
			templateChecks.propType(type, params, 'query', 'object');
			templateChecks.propType(type, params, 'select', 'object');
			templateChecks.propType(type, params, 'expression', ['string', 'object']);

			templateChecks.propType(type, params, 'alias', ['string', 'object']);

			templateChecks.propType(type, params, 'join', ['array', 'object']);

			templateChecks.propType(type, params, 'condition', ['array', 'object']);
			templateChecks.propType(type, params, 'having', ['array', 'object']);

			templateChecks.propType(type, params, 'group', ['string', 'array']);

			templateChecks.propType(type, params, 'sort', ['string', 'array', 'object']);

			templateChecks.propType(type, params, 'limit', ['number', 'string']);

			templateChecks.propType(type, params, 'offset', ['number', 'string']);
		}
	});


	dialect.templates.add('insert', {
		pattern: '{with} {withRecursive} insert {or} into {table} {values} {condition} ' +
			'{returning}',
		validate: function(type, params) {
			templateChecks.onlyOneOfProps(type, params, ['with', 'withRecursive']);
			templateChecks.propType(type, params, 'with', 'object');
			templateChecks.propType(type, params, 'withRecursive', 'object');

			templateChecks.propType(type, params, 'or', 'string');
			templateChecks.propMatch(type, params, 'or', orRegExp);

			templateChecks.requiredProp(type, params, 'table');
			templateChecks.propType(type, params, 'table', 'string');

			templateChecks.requiredProp(type, params, 'values');
			templateChecks.propType(type, params, 'values', ['array', 'object']);

			templateChecks.propType(type, params, 'condition', ['array', 'object']);

			templateChecks.propType(type, params, 'returning', ['array', 'object']);
		}
	});


	dialect.templates.add('update', {
		pattern: '{with} {withRecursive} update {or} {table} {alias} {modifier} {condition} {returning}',
		validate: function(type, params) {
			templateChecks.onlyOneOfProps(type, params, ['with', 'withRecursive']);
			templateChecks.propType(type, params, 'with', 'object');
			templateChecks.propType(type, params, 'withRecursive', 'object');

			templateChecks.propType(type, params, 'or', 'string');
			templateChecks.propMatch(type, params, 'or', orRegExp);

			templateChecks.requiredProp(type, params, 'table');
			templateChecks.propType(type, params, 'table', 'string');

			templateChecks.propType(type, params, 'alias', 'string');

			templateChecks.requiredProp(type, params, 'modifier');
			templateChecks.propType(type, params, 'modifier', 'object');

			templateChecks.propType(type, params, 'condition', ['array', 'object']);

			templateChecks.propType(type, params, 'returning', ['array', 'object']);
		}
	});


	dialect.templates.add('remove', {
		pattern: '{with} {withRecursive} delete from {table} {alias} {condition} {returning}',
		validate: function(type, params) {
			templateChecks.onlyOneOfProps(type, params, ['with', 'withRecursive']);
			templateChecks.propType(type, params, 'with', 'object');
			templateChecks.propType(type, params, 'withRecursive', 'object');

			templateChecks.requiredProp(type, params, 'table');
			templateChecks.propType(type, params, 'table', 'string');

			templateChecks.propType(type, params, 'alias', 'string');

			templateChecks.propType(type, params, 'condition', ['array', 'object']);

			templateChecks.propType(type, params, 'returning', ['array', 'object']);
		}
	});


	dialect.templates.add('union', dialect.templates.get('queriesCombination'));


	dialect.templates.add('intersect', dialect.templates.get('queriesCombination'));


	dialect.templates.add('except', dialect.templates.get('queriesCombination'));
};
