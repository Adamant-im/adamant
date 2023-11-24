'use strict';

var jsonSql = require('../lib')();
var expect = require('chai').expect;

describe('Create', function () {
	it('should throw error without `tableFields` property', function () {
		expect(function () {
			jsonSql.build({
				type: 'create',
				table: 'users'
			});
		}).to.throw('`tableFields` property is not set in `create` clause');
	});

	it('should throw error with incorrect field type', function () {
		expect(function () {
			jsonSql.build({
				type: 'create',
				table: 'users',
				tableFields: [
					{
						name: "age",
						type: "NotNumber"
					}
				]
			});
		}).to.throw('Invalid type of field: NotNumber');
	});

	it('should be ok with `tableFields` property', function () {
		var result = jsonSql.build({
			type: 'create',
			table: 'users',
			tableFields: [
				{
					name: "age",
					type: "Number"
				}
			]
		});


		expect(result.query).to.be.equal('create table if not exists "users"("age" int);');
	});

	it('should throw error when length property for string field not provided', function () {
		expect(function () {
			jsonSql.build({
				type: 'create',
				table: 'users',
				tableFields: [
					{
						name: "name",
						type: "String"
					}
				]
			});
		}).to.throw('Field length can\'t be less or equal 0');
	});

	it('should throw error with empty name', function () {
		expect(function () {
			jsonSql.build({
				type: 'create',
				table: 'users',
				tableFields: [
					{
						name: "  ",
						type: "String"
					}
				]
			});
		}).to.throw('Name most contains characters');
	});

	it('should be ok with string field and length', function () {
		var result = jsonSql.build({
			type: 'create',
			table: 'users',
			tableFields: [
				{
					name: "name",
					type: "String",
					length: 16
				}
			]
		});

		expect(result.query).to.be.equal('create table if not exists "users"("name" varchar(16));');
	});

	it('should be ok with string field not null', function () {
		var result = jsonSql.build({
			type: 'create',
			table: 'users',
			tableFields: [
				{
					name: "name",
					type: "String",
					length: 16,
					not_null: true
				}
			]
		});

		expect(result.query).to.be.equal('create table if not exists "users"("name" varchar(16) NOT NULL);');
	});

	it('should be ok with string field not null primary key', function () {
		var result = jsonSql.build({
			type: 'create',
			table: 'users',
			tableFields: [
				{
					name: "name",
					type: "String",
					length: 16,
					not_null: true,
					primary_key: true
				}
			]
		});

		expect(result.query).to.be.equal('create table if not exists "users"("name" varchar(16) NOT NULL PRIMARY KEY);');
	});


	it('should be ok with string field not null unique', function () {
		var result = jsonSql.build({
			type: 'create',
			table: 'users',
			tableFields: [
				{
					name: "name",
					type: "String",
					length: 16,
					not_null: true,
					unique: true
				}
			]
		});

		expect(result.query).to.be.equal('create table if not exists "users"("name" varchar(16) NOT NULL UNIQUE);');
	});


	it('should be allow only one primary key field', function () {
		expect(function () {
			jsonSql.build({
				type: 'create',
				table: 'users',
				tableFields: [
					{
						name: "name",
						type: "String",
						length: 16,
						not_null: true,
						primary_key: true
					},
					{
						name: "secondname",
						type: "String",
						length: 16,
						not_null: true,
						primary_key: true
					}
				]
			})
		}).to.throw("Too much primary key 'secondname' in table");
	});

	it('should be allow only unique field name', function () {
		expect(function () {
			jsonSql.build({
				type: 'create',
				table: 'users',
				tableFields: [
					{
						name: "name",
						type: "String",
						length: 16,
						not_null: true,
						primary_key: true
					},
					{
						name: "name",
						type: "String",
						length: 16,
						not_null: true
					}
				]
			})
		}).to.throw("Two parameters with same name: name");
	});

	it("should allow few fields", function () {
		var result = jsonSql.build({
			type: 'create',
			table: 'users',
			tableFields: [
				{
					name: "name",
					type: "String",
					length: 16,
					not_null: true,
					primary_key: true
				},
				{
					name: "age",
					type: "Number",
					not_null: true
				}
			]
		});

		expect(result.query).to.be.equal('create table if not exists "users"("name" varchar(16) NOT NULL PRIMARY KEY,"age" int NOT NULL);');
	});

	it("should allow few fields", function () {
		var result = jsonSql.build({
			type: 'create',
			table: 'users',
			tableFields: [
				{
					name: "name",
					type: "String",
					length: 16,
					not_null: true,
					primary_key: true
				},
				{
					name: "age",
					type: "Number",
					not_null: true
				}
			],
			foreignKeys: [
				{
					field: "name",
					table: "person",
					table_field: "id"
				}
			]
		});

		expect(result.query).to.be.equal('create table if not exists "users"("name" varchar(16) NOT NULL PRIMARY KEY,"age" int NOT NULL, FOREIGN KEY ("name") REFERENCES person("id"));');
	});

	it("should allow few fields", function () {
		var result = jsonSql.build({
			type: 'create',
			table: 'users',
			tableFields: [
				{
					name: "name",
					type: "String",
					length: 16,
					not_null: true,
					primary_key: true
				},
				{
					name: "age",
					type: "Number",
					not_null: true
				}
			],
			foreignKeys: [
				{
					field: "name",
					table: "person",
					table_field: "id"
				}
			]
		});

		expect(result.query).to.be.equal('create table if not exists "users"("name" varchar(16) NOT NULL PRIMARY KEY,"age" int NOT NULL, FOREIGN KEY ("name") REFERENCES person("id"));');
	});
});
