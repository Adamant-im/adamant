'use strict';

var jsonSql = require('../lib')();
var expect = require('chai').expect;

describe('Union, except, intersect', function() {
	describe('queries', function() {
		it('should throw error without `queries` property', function() {
			expect(function() {
				jsonSql.build({
					type: 'union'
				});
			}).to.throw('`queries` property is not set in `union` clause');
		});

		it('should throw error with non-array value', function() {
			expect(function() {
				jsonSql.build({
					type: 'union',
					queries: 'wrong'
				});
			}).to.throw('`queries` property should be an array in `union` clause');
		});

		it('should throw error with value length < 2', function() {
			expect(function() {
				jsonSql.build({
					type: 'union',
					queries: [{
						table: 'users'
					}]
				});
			}).to.throw('`queries` property should not have length less than 2 in `union` clause');
		});

		it('should be ok with value length = 2', function() {
			var result = jsonSql.build({
				type: 'union',
				queries: [{
					table: 'users'
				}, {
					table: 'vipUsers'
				}]
			});

			expect(result.query).to.be.equal('(select * from "users") union (select * from "vipUsers");');
			expect(result.values).to.be.eql({});
		});
	});

	describe('type & all combinations', function() {
		it('should be ok with `type` = "union", `all` = true', function() {
			var result = jsonSql.build({
				type: 'union',
				all: true,
				queries: [{
					table: 'users'
				}, {
					table: 'vipUsers'
				}]
			});

			expect(result.query).to.be.equal('(select * from "users") union all (select * from ' +
				'"vipUsers");');
			expect(result.values).to.be.eql({});
		});

		it('should be ok with `type` = "except"', function() {
			var result = jsonSql.build({
				type: 'except',
				queries: [{
					table: 'users'
				}, {
					table: 'vipUsers'
				}]
			});

			expect(result.query).to.be.equal('(select * from "users") except (select * from "vipUsers");');
			expect(result.values).to.be.eql({});
		});

		it('should be ok with `type` = "except", `all` = true', function() {
			var result = jsonSql.build({
				type: 'except',
				all: true,
				queries: [{
					table: 'users'
				}, {
					table: 'vipUsers'
				}]
			});

			expect(result.query).to.be.equal('(select * from "users") except all (select * from ' +
				'"vipUsers");');
			expect(result.values).to.be.eql({});
		});

		it('should be ok with `type` = "intersect"', function() {
			var result = jsonSql.build({
				type: 'intersect',
				queries: [{
					table: 'users'
				}, {
					table: 'vipUsers'
				}]
			});

			expect(result.query).to.be.equal('(select * from "users") intersect (select * from ' +
				'"vipUsers");');
			expect(result.values).to.be.eql({});
		});

		it('should be ok with `type` = "intersect", `all` = true', function() {
			var result = jsonSql.build({
				type: 'intersect',
				all: true,
				queries: [{
					table: 'users'
				}, {
					table: 'vipUsers'
				}]
			});

			expect(result.query).to.be.equal('(select * from "users") intersect all (select * from ' +
				'"vipUsers");');
			expect(result.values).to.be.eql({});
		});

		it('should be ok with `type` = "union" subquery', function() {
			var result = jsonSql.build({
				query: {
					type: 'union',
					queries: [{
						table: 'users'
					}, {
						table: 'vipUsers'
					}]
				}
			});

			expect(result.query).to.be.equal('select * from ((select * from "users") union (select * ' +
				'from "vipUsers"));');
			expect(result.values).to.be.eql({});
		});
	});

	describe('sort', function() {
		it('should be ok with string value', function() {
			var result = jsonSql.build({
				type: 'union',
				queries: [{
					table: 'users'
				}, {
					table: 'vipUsers'
				}],
				sort: 'age'
			});

			expect(result.query).to.be.equal(
				'(select * from "users") union (select * from "vipUsers") order by "age";'
			);
			expect(result.values).to.be.eql({});
		});

		it('should be ok with array value', function() {
			var result = jsonSql.build({
				type: 'union',
				queries: [{
					table: 'users'
				}, {
					table: 'vipUsers'
				}],
				sort: ['age', 'gender']
			});

			expect(result.query).to.be.equal(
				'(select * from "users") union (select * from "vipUsers") order by "age", "gender";'
			);
			expect(result.values).to.be.eql({});
		});

		it('should be ok with object value', function() {
			var result = jsonSql.build({
				type: 'union',
				queries: [{
					table: 'users'
				}, {
					table: 'vipUsers'
				}],
				sort: {
					age: 1,
					gender: -1
				}
			});

			expect(result.query).to.be.equal(
				'(select * from "users") union (select * from "vipUsers") order by "age" asc, "gender" desc;'
			);
			expect(result.values).to.be.eql({});
		});
	});

	describe('limit, offset', function() {
		it('should be ok with `limit` property', function() {
			var result = jsonSql.build({
				type: 'union',
				queries: [{
					table: 'users'
				}, {
					table: 'vipUsers'
				}],
				limit: 5
			});

			expect(result.query).to.be.equal(
				'(select * from "users") union (select * from "vipUsers") limit 5;'
			);
			expect(result.values).to.be.eql({});
		});

		it('should be ok with `offset` property', function() {
			var result = jsonSql.build({
				type: 'union',
				queries: [{
					table: 'users'
				}, {
					table: 'vipUsers'
				}],
				offset: 5
			});

			expect(result.query).to.be.equal(
				'(select * from "users") union (select * from "vipUsers") offset 5;'
			);
			expect(result.values).to.be.eql({});
		});

		it('should be ok with `limit` and `offset` properties', function() {
			var result = jsonSql.build({
				type: 'union',
				queries: [{
					table: 'users'
				}, {
					table: 'vipUsers'
				}],
				limit: 10,
				offset: 20
			});

			expect(result.query).to.be.equal(
				'(select * from "users") union (select * from "vipUsers") limit 10 offset 20;'
			);
			expect(result.values).to.be.eql({});
		});
	});
});
