'use strict';

var jsonSql = require('../lib')();
var expect = require('chai').expect;

describe('Update', function() {
	describe('modifier', function() {
		it('should throw error without `modifier` property', function() {
			expect(function() {
				jsonSql.build({
					type: 'update',
					table: 'users'
				});
			}).to.throw('`modifier` property is not set in `update` clause');
		});

		it('should be ok with default(`$set`)', function() {
			var result = jsonSql.build({
				type: 'update',
				table: 'users',
				modifier: {
					name: 'Max',
					age: 16,
					lastVisit: null,
					active: false
				}
			});

			expect(result.query).to.be.equal('update "users" set "name" = ${p1}, "age" = 16, ' +
				'"lastVisit" = null, "active" = false;');
			expect(result.values).to.be.eql({p1: 'Max'});
		});

		it('should be ok with `$set`', function() {
			var result = jsonSql.build({
				type: 'update',
				table: 'users',
				modifier: {
					$set: {
						name: 'Max'
					}
				}
			});

			expect(result.query).to.be.equal('update "users" set "name" = ${p1};');
			expect(result.values).to.be.eql({p1: 'Max'});
		});

		it('should be ok with `$inc`', function() {
			var result = jsonSql.build({
				type: 'update',
				table: 'users',
				modifier: {
					$inc: {
						age: 4
					}
				}
			});

			expect(result.query).to.be.equal('update "users" set "age" = "age" + 4;');
			expect(result.values).to.be.eql({});
		});

		it('should be ok with `$dec`', function() {
			var result = jsonSql.build({
				type: 'update',
				table: 'users',
				modifier: {
					$dec: {
						age: 2
					}
				}
			});

			expect(result.query).to.be.equal('update "users" set "age" = "age" - 2;');
			expect(result.values).to.be.eql({});
		});
	});

	describe('with', function() {
		it('should be ok', function() {
			var result = jsonSql.build({
				'with': [{
					name: 't_1',
					select: {
						table: 't_1'
					}
				}],
				type: 'update',
				table: 'users',
				modifier: {
					$dec: {
						age: 3
					}
				}
			});

			expect(result.query).to.be.equal('with "t_1" as (select * from "t_1") update "users" ' +
				'set "age" = "age" - 3;');
			expect(result.values).to.be.eql({});
		});
	});

	describe('returning', function() {
		it('should be ok', function() {
			var result = jsonSql.build({
				type: 'update',
				table: 'users',
				modifier: {
					$dec: {
						age: 3
					}
				},
				returning: ['users.*']
			});

			expect(result.query).to.be.equal(
				'update "users" set "age" = "age" - 3 returning "users".*;'
			);
			expect(result.values).to.be.eql({});
		});
	});
});
