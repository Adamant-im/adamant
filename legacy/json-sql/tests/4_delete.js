'use strict';

var jsonSql = require('../lib')();
var expect = require('chai').expect;

describe('Delete', function() {
	it('should be ok without `condition` property', function() {
		var result = jsonSql.build({
			type: 'remove',
			table: 'users'
		});

		expect(result.query).to.be.equal('delete from "users";');
		expect(result.values).to.be.eql({});
	});

	it('should be ok with `condition` property', function() {
		var result = jsonSql.build({
			type: 'remove',
			table: 'users',
			condition: {
				a: 5
			}
		});

		expect(result.query).to.be.equal('delete from "users" where "a" = 5;');
		expect(result.values).to.be.eql({});
	});

	it('should be ok with `with` property', function() {
		var result = jsonSql.build({
			'with': [{
				name: 't_1',
				select: {
					table: 't_1'
				}
			}],
			type: 'remove',
			table: 'users'
		});

		expect(result.query).to.be.equal('with "t_1" as (select * from "t_1") delete from "users";');
		expect(result.values).to.be.eql({});
	});

	it('should be ok with `returning` property', function() {
		var result = jsonSql.build({
			type: 'remove',
			table: 'users',
			returning: ['users.*']
		});

		expect(result.query).to.be.equal(
			'delete from "users" returning "users".*;'
		);
		expect(result.values).to.be.eql({});
	});
});
