'use strict';

var jsonSql = require('../lib')({
	dialect: 'postgresql',
	namedValues: false
});
var expect = require('chai').expect;

describe('PostgreSQL dialect', function() {
	describe('json', function() {
		it('should correctly wrap each part of json path', function() {
			var result = jsonSql.build({
				table: 'test',
				fields: ['params->a->>b'],
				condition: {
					'params->>c': {$like: '7%'}
				}
			});

			expect(result.query).to.be.equal(
				'select "params"->\'a\'->>\'b\' from "test" ' +
				'where "params"->>\'c\' like ${1};'
			);
		});

		it('should be ok with `$jsonContains` conditional operator', function() {
			var result = jsonSql.build({
				table: 'test',
				condition: {
					'params->a': {
						$jsonContains: {b: 1}
					}
				}
			});

			expect(result.query).to.be.equal(
				'select * from "test" where "params"->\'a\' @> ${1};'
			);
			expect(result.values).to.be.eql(['{"b":1}']);
		});

		it('should be ok with `$jsonIn` conditional operator', function() {
			var result = jsonSql.build({
				table: 'test',
				condition: {
					'params->a': {
						$jsonIn: {$field: 'data->b'}
					}
				}
			});

			expect(result.query).to.be.equal(
				'select * from "test" where "params"->\'a\' <@ "data"->\'b\';'
			);
			expect(result.values).to.be.eql([]);
		});

		it('should be ok with `$jsonHas` conditional operator', function() {
			var result = jsonSql.build({
				table: 'test',
				condition: {
					params: {$jsonHas: 'account'}
				}
			});

			expect(result.query).to.be.equal('select * from "test" where "params" ? ${1};');
			expect(result.values).to.be.eql(['account']);
		});

		it('should be ok with `$jsonHasAny` conditional operator', function() {
			var result = jsonSql.build({
				table: 'test',
				condition: {
					params: {$jsonHasAny: ['a', 'b']}
				}
			});

			expect(result.query).to.be.equal(
				'select * from "test" where "params" ?| array[${1}, ${2}];'
			);
			expect(result.values).to.be.eql(['a', 'b']);
		});

		it('should be ok with `$jsonHasAll` conditional operator', function() {
			var result = jsonSql.build({
				table: 'test',
				condition: {
					params: {$jsonHasAll: ['a', 'b']}
				}
			});

			expect(result.query).to.be.equal(
				'select * from "test" where "params" ?& array[${1}, ${2}];'
			);
			expect(result.values).to.be.eql(['a', 'b']);
		});

		it('should be ok with `$upper` conditional operator', function() {
			var result = jsonSql.build({
				table: 'test',
				condition: {
					params: {$upper: ['params', '3498862814541110459l']}
				}
			});

			expect(result.query).to.be.equal(
				'select * from "test" where upper("params") = upper(${1});'
			);
			expect(result.values).to.be.eql(['3498862814541110459l']);
		});

		it('should be ok with `$lower` conditional operator', function() {
			var result = jsonSql.build({
				table: 'test',
				condition: {
					params: {$lower: ['params', '3498862814541110459L']}
				}
			});

			expect(result.query).to.be.equal(
				'select * from "test" where lower("params") = lower(${1});'
			);
			expect(result.values).to.be.eql(['3498862814541110459L']);
		});

		it('should be ok with `$decode` conditional operator', function() {
			var result = jsonSql.build({
				table: 'test',
				condition: {
					params: {$decode: ['params', '3498862814541110459L', 'hex']}
				}
			});

			expect(result.query).to.be.equal(
				'select * from "test" where "params" = decode(${1}, ${2});'
			);
			expect(result.values).to.be.eql(['3498862814541110459L', 'hex']);
		});
	});
});
