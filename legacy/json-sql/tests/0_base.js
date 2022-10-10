'use strict';

var jsonSql = require('../lib')();
var Builder = require('../lib').Builder;
var expect = require('chai').expect;

describe('Builder', function() {
	it('should have fields', function() {
		expect(jsonSql).to.be.ok;
		expect(jsonSql).to.be.an.instanceof(Builder);

		expect(jsonSql.dialect).to.be.ok;

		expect(jsonSql._query).to.be.equal('');
		expect(jsonSql._values).to.be.eql({});

		expect(jsonSql.dialect.blocks).to.be.ok;
		expect(jsonSql.dialect.templates).to.be.ok;
		expect(jsonSql.dialect.conditions).to.be.ok;
		expect(jsonSql.dialect.modifiers).to.be.ok;
		expect(jsonSql.dialect.logicalOperators).to.be.ok;
	});

	it('should throw error with wrong `type` property', function() {
		expect(function() {
			jsonSql.build({
				type: 'wrong'
			});
		}).to.throw('Unknown template type "wrong"');
	});

	it('should throw error without `table`, `query` and `select` properties', function() {
		expect(function() {
			jsonSql.build({});
		}).to.throw('Neither `table`, `query`, `select`, `expression` properties ' +
			'are not set in `select` clause');
	});

	it('should throw error with both `table` and `select` properties', function() {
		expect(function() {
			jsonSql.build({
				table: 'users',
				select: {table: 'payments'}
			});
		}).to.throw('Wrong using `table`, `select` properties together in `select` clause');
	});

	it('should throw error with both `table` and `query` properties', function() {
		expect(function() {
			jsonSql.build({
				table: 'users',
				query: {table: 'payments'}
			});
		}).to.throw('Wrong using `table`, `query` properties together in `select` clause');
	});

	it('should throw error with both `query` and `select` properties', function() {
		expect(function() {
			jsonSql.build({
				query: {table: 'payments'},
				select: {table: 'payments'}
			});
		}).to.throw('Wrong using `query`, `select` properties together in `select` clause');
	});

	it('should throw error without `name` property in `with` clause', function() {
		expect(function() {
			jsonSql.build({
				'with': [{
					select: {
						table: 'payments'
					}
				}],
				table: 'users'
			});
		}).to.throw('`name` property is not set in `with` clause');
	});

	it('should throw error without `query` and `select` properties in `with` clause', function() {
		expect(function() {
			jsonSql.build({
				'with': [{
					name: 'payments'
				}],
				table: 'users'
			});
		}).to.throw('Neither `query`, `select`, `expression` properties are not set in `with` clause');
	});

	it('should throw error with both `query` and `select` properties in `with` clause', function() {
		expect(function() {
			jsonSql.build({
				'with': [{
					name: 'payments',
					query: {table: 'table1'},
					select: {table: 'table2'}
				}],
				table: 'users'
			});
		}).to.throw('Wrong using `query`, `select` properties together in `with` clause');
	});

	it('should be ok with array in `with` clause', function() {
		var result = jsonSql.build({
			'with': [{
				name: 'payments',
				select: {
					table: 'payments'
				}
			}],
			table: 'users'
		});

		expect(result.query).to.be.equal('with "payments" as (select * from "payments") select * from ' +
			'"users";');
		expect(result.values).to.be.eql({});
	});

	it('should be ok with object in `with` clause', function() {
		var result = jsonSql.build({
			'with': {
				payments: {
					select: {
						table: 'payments'
					}
				}
			},
			table: 'users'
		});

		expect(result.query).to.be.equal('with "payments" as (select * from "payments") select * from ' +
			'"users";');
		expect(result.values).to.be.eql({});
	});

	it('should create array values with option `namedValues` = false', function() {
		jsonSql.configure({
			namedValues: false
		});

		expect(jsonSql._values).to.be.eql([]);

		var result = jsonSql.build({
			table: 'users',
			condition: {name: 'John'}
		});

		expect(result.query).to.be.equal('select * from "users" where "name" = ${1};');
		expect(result.values).to.be.eql(['John']);
	});

	it('should use prefix `@` for values with option `valuesPrefix` = @', function() {
		jsonSql.configure({
			valuesPrefix: '@'
		});

		var result = jsonSql.build({
			table: 'users',
			condition: {name: 'John'}
		});

		expect(result.query).to.be.equal('select * from "users" where "name" = @{p1};');
		expect(result.values).to.be.eql({p1: 'John'});
	});

	it('should return prefixed values with method `prefixValues`', function() {
		var result = jsonSql.build({
			table: 'users',
			condition: {name: 'John'}
		});

		expect(result.query).to.be.equal('select * from "users" where "name" = @{p1};');
		expect(result.values).to.be.eql({p1: 'John'});
		expect(result.prefixValues()).to.be.eql({'@{p1}': 'John'});
	});

	it('should return array values with method `getValuesArray`', function() {
		var result = jsonSql.build({
			table: 'users',
			condition: {name: 'John'}
		});

		expect(result.query).to.be.equal('select * from "users" where "name" = @{p1};');
		expect(result.values).to.be.eql({p1: 'John'});
		expect(result.getValuesArray()).to.be.eql(['John']);
	});

	it('should return object values with method `getValuesObject`', function() {
		jsonSql.configure({
			valuesPrefix: '$',
			namedValues: false
		});

		expect(jsonSql._values).to.be.eql([]);

		var result = jsonSql.build({
			table: 'users',
			condition: {name: 'John'}
		});

		expect(result.query).to.be.equal('select * from "users" where "name" = ${1};');
		expect(result.values).to.be.eql(['John']);
		expect(result.prefixValues()).to.be.eql({'${1}': 'John'});
		expect(result.getValuesObject()).to.be.eql({1: 'John'});
	});

	it('should create query without values with option `separatedValues` = false', function() {
		jsonSql.configure({
			separatedValues: false
		});

		expect(jsonSql._values).to.not.be.ok;
		expect(jsonSql._placeholderId).to.not.be.ok;

		var result = jsonSql.build({
			type: 'insert',
			table: 'users',
			values: {name: 'John', surname: 'Doe'}
		});

		expect(result.query).to.be.equal('insert into "users" ("name", "surname") values ' +
			'(\'John\', \'Doe\');');
		expect(result.values).to.not.be.ok;
	});

	it('should create query without wrapping identifiers with option `wrappedIdentifiers` = false',
		function() {
			jsonSql.configure({
				wrappedIdentifiers: false
			});

			var result = jsonSql.build({
				type: 'insert',
				table: 'users',
				values: {name: 'John'}
			});

			expect(result.query).to.be.equal('insert into users (name) values (${p1});');
		}
	);

	it('shouldn\'t wrap identifiers that already wrapped', function() {
		jsonSql.configure({
			wrappedIdentifiers: true
		});

		var result = jsonSql.build({
			type: 'insert',
			table: '"users"',
			values: {
				'"name"': 'John',
				'"users"."age"': 22
			}
		});

		expect(result.query).to.be.equal('insert into "users" ("name", "users"."age") values (${p1}, 22);');
	});

	it('shouldn\'t split identifiers by dots inside quotes', function() {
		jsonSql.configure({
			wrappedIdentifiers: true
		});

		var result = jsonSql.build({
			type: 'insert',
			table: '"users"',
			values: {
				'"users.age"': 22
			}
		});

		expect(result.query).to.be.equal('insert into "users" ("users.age") values (22);');
	});

	it('shouldn\'t wrap asterisk identifier parts', function() {
		jsonSql.configure({
			wrappedIdentifiers: true
		});

		var result = jsonSql.build({
			fields: ['users.*'],
			table: '"users"'
		});

		expect(result.query).to.be.equal('select "users".* from "users";');
	});

	it('should split identifiers by dots and wrap each part', function() {
		jsonSql.configure({
			wrappedIdentifiers: true
		});

		var result = jsonSql.build({
			type: 'insert',
			table: '"users"',
			values: {
				'name': 'John',
				'users.age': 22
			}
		});

		expect(result.query).to.be.equal('insert into "users" ("name", "users"."age") values (${p1}, 22);');
	});
});
