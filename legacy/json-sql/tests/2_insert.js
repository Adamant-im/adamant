'use strict';

var jsonSql = require('../lib')();
var expect = require('chai').expect;

describe('Insert', function() {
	it('should throw error without `values` property', function() {
		expect(function() {
			jsonSql.build({
				type: 'insert',
				table: 'users'
			});
		}).to.throw('`values` property is not set in `insert` clause');
	});

	it('should be ok with `values` property', function() {
		var result = jsonSql.build({
			type: 'insert',
			table: 'users',
			values: {
				name: 'Max'
			}
		});

		expect(result.query).to.be.equal('insert into "users" ("name") values (${p1});');
		expect(result.values).to.be.eql({p1: 'Max'});
	});

	it('should be ok with `with` property', function() {
		var result = jsonSql.build({
			'with': [{
				name: 't_1',
				select: {
					table: 't_1'
				}
			}],
			type: 'insert',
			table: 'users',
			values: {
				name: 'Max',
				age: 17,
				lastVisit: null,
				active: true
			}
		});

		expect(result.query).to.be.equal(
			'with "t_1" as (select * from "t_1") insert into "users" ' +
			'("name", "age", "lastVisit", "active") values (${p1}, 17, null, true);'
		);
		expect(result.values).to.be.eql({p1: 'Max'});
	});

	it('should be ok with `returning` property', function() {
		var result = jsonSql.build({
			type: 'insert',
			table: 'users',
			values: {
				name: 'Max',
				age: 17,
				lastVisit: null,
				active: true
			},
			returning: ['users.*']
		});

		expect(result.query).to.be.equal(
			'insert into "users" ("name", "age", "lastVisit", "active") ' +
			'values (${p1}, 17, null, true) returning "users".*;'
		);
		expect(result.values).to.be.eql({p1: 'Max'});
	});
});
