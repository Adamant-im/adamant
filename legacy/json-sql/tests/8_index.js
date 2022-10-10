'use strict';

var jsonSql = require('../lib')();
var expect = require('chai').expect;

/*
 jsonSql.build({
 type: 'index',
 table: 'users',
 index: {
 name: "user_id",
 field: "id"
 }
 });
 */

describe('Index', function() {
	it('should throw error without name  property', function() {
		expect(function() {
			jsonSql.build({
				type: 'index',
				table: 'users'
			});
		}).to.throw('`name` property is not set in `index` clause');
	});

	it('should throw error without indexOn property', function() {
		expect(function() {
			jsonSql.build({
				type: 'index',
				table: 'users',
				name: 'index_id'
			});
		}).to.throw('`indexOn` property is not set in `index` clause');
	});

	it('should be ok with name and field property', function () {
		var result = jsonSql.build({
			type: "index",
			table: "users",
			name: "index_id",
			indexOn: "id"
		});
	});
});
