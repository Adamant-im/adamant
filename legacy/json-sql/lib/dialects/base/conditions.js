'use strict';

var _ = require('underscore');

// Compare conditions (e.g. $eq, $gt)
function buildCompareCondition(builder, field, operator, value) {
	var placeholder;

	// if value is object, than make field block from it
	if (value && _.isObject(value)) {
		placeholder = builder.buildBlock('field', value);
	} else {
		// if value is simple - create placeholder for it
		placeholder = builder._pushValue(value);
	}

	field = builder.dialect._wrapIdentifier(field);
	return [field, operator, placeholder].join(' ');
}

// Contain conditions ($in/$nin)
function buildContainsCondition(builder, field, operator, value) {
	var newValue;

	if (_.isArray(value)) {
		if (!value.length) value = [null];

		newValue = '(' + _(value).map(function(item) {
			return builder._pushValue(item);
		}).join(', ') + ')';
	} else if (_.isObject(value)) {
		newValue = builder.buildTemplate('subQuery', {queryBody: value});
	} else {
		throw new Error('Invalid `' + operator + '` value type "' + (typeof value) + '"');
	}

	field = builder.dialect._wrapIdentifier(field);
	return [field, operator, newValue].join(' ');
}

module.exports = function(dialect) {
	dialect.conditions.add('$eq', function(field, operator, value) {
		return buildCompareCondition(this, field, '=', value);
	});

	dialect.conditions.add('$ne', function(field, operator, value) {
		return buildCompareCondition(this, field, '!=', value);
	});

	dialect.conditions.add('$gt', function(field, operator, value) {
		return buildCompareCondition(this, field, '>', value);
	});

	dialect.conditions.add('$lt', function(field, operator, value) {
		return buildCompareCondition(this, field, '<', value);
	});

	dialect.conditions.add('$gte', function(field, operator, value) {
		return buildCompareCondition(this, field, '>=', value);
	});

	dialect.conditions.add('$lte', function(field, operator, value) {
		return buildCompareCondition(this, field, '<=', value);
	});

	dialect.conditions.add('$is', function(field, operator, value) {
		return buildCompareCondition(this, field, 'is', value);
	});

	dialect.conditions.add('$isnot', function(field, operator, value) {
		return buildCompareCondition(this, field, 'is not', value);
	});

	dialect.conditions.add('$like', function(field, operator, value) {
		return buildCompareCondition(this, field, 'like', value);
	});

	dialect.conditions.add('$null', function(field, operator, value) {
		return buildCompareCondition(this, field, 'is' + (value ? '' : ' not'), null);
	});

	dialect.conditions.add('$field', function(field, operator, value) {
		var placeholder;

		// if value is object, than make field block from it
		if (_.isObject(value)) {
			placeholder = this.buildBlock('field', value);
		} else {
			// $field - special operator, that not make placeholder for value
			placeholder = this.dialect._wrapIdentifier(value);
		}

		return [this.dialect._wrapIdentifier(field), '=', placeholder].join(' ');
	});


	dialect.conditions.add('$in', function(field, operator, value) {
		return buildContainsCondition(this, field, 'in', value);
	});

	dialect.conditions.add('$nin', function(field, operator, value) {
		return buildContainsCondition(this, field, 'not in', value);
	});

	dialect.conditions.add('$between', function(field, operator, value) {
		if (!_.isArray(value)) {
			throw new Error('Invalid `$between` value type "' + (typeof value) + '"');
		}

		if (value.length < 2) {
			throw new Error('`$between` array length should be 2 or greater');
		}

		return [
			this.dialect._wrapIdentifier(field),
			'between',
			this._pushValue(value[0]),
			'and',
			this._pushValue(value[1])
		].join(' ');
	});
};
