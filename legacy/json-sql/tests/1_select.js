'use strict';

var jsonSql = require('../lib')();
var expect = require('chai').expect;

describe('Select', function() {
	describe('type', function() {
		it('should be ok without `type` property', function() {
			var result = jsonSql.build({
				table: 'users'
			});

			expect(result.query).to.be.equal('select * from "users";');
			expect(result.values).to.be.eql({});
		});

		it('should be ok with "select" value', function() {
			var result = jsonSql.build({
				type: 'select',
				table: 'users'
			});

			expect(result.query).to.be.equal('select * from "users";');
			expect(result.values).to.be.eql({});
		});
	});

	describe('distinct', function() {
		it('should be ok with true value', function() {
			var result = jsonSql.build({
				table: 'users',
				distinct: true
			});

			expect(result.query).to.be.equal('select distinct * from "users";');
			expect(result.values).to.be.eql({});
		});
	});

	describe('fields', function() {
		it('should be ok with string array', function() {
			var result = jsonSql.build({
				table: 'users',
				fields: ['name', 'type']
			});

			expect(result.query).to.be.equal('select "name", "type" from "users";');
			expect(result.values).to.be.eql({});
		});

		it('should be ok with object(`name`: `alias`, ...)', function() {
			var result = jsonSql.build({
				table: 'users',
				fields: {userAge: 'age', userScore: 'score'}
			});

			expect(result.query).to.be.equal('select "userAge" as "age", "userScore" as "score" from ' +
				'"users";');
			expect(result.values).to.be.eql({});
		});

		it('should be ok with array of objects(`name`: `alias`, ...)', function() {
			var result = jsonSql.build({
				table: 'users',
				fields: [{userAge: 'age'}]
			});

			expect(result.query).to.be.equal('select "userAge" as "age" from "users";');
			expect(result.values).to.be.eql({});
		});

		it('should be ok with object(`field`) array', function() {
			var result = jsonSql.build({
				table: 'users',
				fields: [{field: 'address'}]
			});

			expect(result.query).to.be.equal('select "address" from "users";');
			expect(result.values).to.be.eql({});
		});

		it('should be ok with object(`field`, `table`) array', function() {
			var result = jsonSql.build({
				table: 'users',
				fields: [{field: 'score', table: 'users'}]
			});

			expect(result.query).to.be.equal('select "users"."score" from "users";');
			expect(result.values).to.be.eql({});
		});

		it('should be ok with object(`field`, `alias`) array', function() {
			var result = jsonSql.build({
				table: 'users',
				fields: [{field: 'zoneName', alias: 'zone'}]
			});

			expect(result.query).to.be.equal('select "zoneName" as "zone" from "users";');
			expect(result.values).to.be.eql({});
		});

		it('should be ok with object(`field`, `table`, `alias`) array', function() {
			var result = jsonSql.build({
				table: 'users',
				fields: [{field: 'zoneName', table: 'users', alias: 'zone'}]
			});

			expect(result.query).to.be.equal('select "users"."zoneName" as "zone" from "users";');
			expect(result.values).to.be.eql({});
		});

		it('should be ok with object(`table`)', function() {
			var result = jsonSql.build({
				table: 'users',
				fields: {score: {table: 'users'}}
			});

			expect(result.query).to.be.equal('select "users"."score" from "users";');
			expect(result.values).to.be.eql({});
		});

		it('should be ok with object(`field`, `alias`)', function() {
			var result = jsonSql.build({
				table: 'users',
				fields: {zone: {field: 'zone_1', alias: 'zone'}}
			});

			expect(result.query).to.be.equal('select "zone_1" as "zone" from "users";');
			expect(result.values).to.be.eql({});
		});

		it('should be ok with object(`table`, `alias`)', function() {
			var result = jsonSql.build({
				table: 'users',
				fields: {score: {table: 'users', alias: 's'}}
			});

			expect(result.query).to.be.equal('select "users"."score" as "s" from "users";');
			expect(result.values).to.be.eql({});
		});

		it('should be ok with object(`field`, `table`, `alias`)', function() {
			var result = jsonSql.build({
				table: 'users',
				fields: {name: {field: 'name_1', table: 'users', alias: 'name_2'}}
			});

			expect(result.query).to.be.equal('select "users"."name_1" as "name_2" from "users";');
			expect(result.values).to.be.eql({});
		});

		it('should be ok with object(`expression`)', function() {
			var result = jsonSql.build({
				table: 'users',
				fields: [{
					expression: 'count(*)'
				}]
			});

			expect(result.query).to.be.equal('select count(*) from "users";');
			expect(result.values).to.be.eql({});
		});

		it('should be ok with object(`expression`, `alias`)', function() {
			var result = jsonSql.build({
				table: 'users',
				fields: [{
					expression: 'count(*)',
					alias: 'count'
				}]
			});

			expect(result.query).to.be.equal('select count(*) as "count" from "users";');
			expect(result.values).to.be.eql({});
		});

		it('should be ok with object(`expression`, `field`, `alias`)', function() {
			var result = jsonSql.build({
				table: 'users',
				fields: [{
					expression: 'sum',
					field: 'income',
					alias: 'sum'
				}]
			});

			expect(result.query).to.be.equal('select sum("income") as "sum" from "users";');
			expect(result.values).to.be.eql({});
		});

		it('should be ok with object(`expression`[], `field`, `alias`)', function() {
			var result = jsonSql.build({
				table: 'users',
				fields: [{
					expression: ['abs', 'sum'],
					field: 'income',
					alias: 'sum'
				}]
			});

			expect(result.query).to.be.equal('select abs(sum("income")) as "sum" from "users";');
			expect(result.values).to.be.eql({});
		});
	});

	describe('alias', function() {
		it('should be ok with string `alias` property', function() {
			var result = jsonSql.build({
				table: 'users',
				alias: 'u'
			});

			expect(result.query).to.be.equal('select * from "users" as "u";');
			expect(result.values).to.be.eql({});
		});

		it('should throw error if object `alias` does not have `name` property', function() {
			expect(function() {
				jsonSql.build({
					table: 'users',
					alias: {}
				});
			}).to.throw('Alias `name` property is required');
		});

		it('should be ok with object `alias`(`name`) property', function() {
			var result = jsonSql.build({
				table: 'users',
				alias: {
					name: 'u'
				}
			});

			expect(result.query).to.be.equal('select * from "users" as "u";');
			expect(result.values).to.be.eql({});
		});

		it('should be ok with object `alias`(`name`, `columns`) property', function() {
			var result = jsonSql.build({
				table: 'users',
				alias: {
					name: 'u',
					columns: ['a', 'b']
				}
			});

			expect(result.query).to.be.equal('select * from "users" as "u"("a", "b");');
			expect(result.values).to.be.eql({});
		});
	});

	describe('query', function() {
		it('should be ok with `query` property', function() {
			var result = jsonSql.build({
				query: {
					type: 'select',
					table: 't'
				}
			});

			expect(result.query).to.be.equal('select * from (select * from "t");');
			expect(result.values).to.be.eql({});
		});
	});

	describe('select', function() {
		it('should be ok with `select` property', function() {
			var result = jsonSql.build({
				select: {
					table: 't'
				}
			});

			expect(result.query).to.be.equal('select * from (select * from "t");');
			expect(result.values).to.be.eql({});
		});
	});

	describe('expression', function() {
		it('should be ok with `expression` property', function() {
			var result = jsonSql.build({
				expression: 'function()'
			});

			expect(result.query).to.be.equal('select * from function();');
			expect(result.values).to.be.eql({});
		});
	});

	describe('join', function() {
		it('should throw error without `table`, `query` and `select` properties',
			function() {
				expect(function() {
					jsonSql.build({
						table: 'users',
						join: [{}]
					});
				}).to.throw('Neither `table`, `query`, `select`, `expression` properties ' +
					'are not set in `join` clause');
			}
		);

		it('should throw error with both `table` and `select` properties', function() {
			expect(function() {
				jsonSql.build({
					table: 'users',
					join: [{
						table: 'a',
						select: {table: 'b'}
					}]
				});
			}).to.throw('Wrong using `table`, `select` properties together in `join` clause');
		});

		it('should throw error with both `table` and `query` properties', function() {
			expect(function() {
				jsonSql.build({
					table: 'users',
					join: [{
						table: 'a',
						query: {table: 'b'}
					}]
				});
			}).to.throw('Wrong using `table`, `query` properties together in `join` clause');
		});

		it('should throw error with both `query` and `select` properties', function() {
			expect(function() {
				jsonSql.build({
					table: 'users',
					join: [{
						query: 'a',
						select: {table: 'b'}
					}]
				});
			}).to.throw('Wrong using `query`, `select` properties together in `join` clause');
		});

		it('should throw error with wrong `type` property', function() {
			expect(function() {
				jsonSql.build({
					table: 'users',
					join: [{
						type: 'wrong',
						table: 'payments'
					}]
				});
			}).to.throw('Invalid `type` property value "wrong" in `join` clause');
		});

		it('should be ok with correct `type` property', function() {
			var result = jsonSql.build({
				table: 'users',
				join: [{
					type: 'left outer',
					table: 'payments'
				}]
			});

			expect(result.query).to.be.equal('select * from "users" left outer join "payments";');
			expect(result.values).to.be.eql({});
		});

		it('should be ok with array `join`', function() {
			var result = jsonSql.build({
				table: 'users',
				join: [{
					table: 'payments'
				}]
			});

			expect(result.query).to.be.equal('select * from "users" join "payments";');
			expect(result.values).to.be.eql({});
		});

		it('should be ok with object `join`', function() {
			var result = jsonSql.build({
				table: 'users',
				join: {
					payments: {}
				}
			});

			expect(result.query).to.be.equal('select * from "users" join "payments";');
			expect(result.values).to.be.eql({});
		});

		it('should be ok with `on` property', function() {
			var result = jsonSql.build({
				table: 'users',
				join: {
					payments: {
						on: {'users.name': 'payments.name'}
					}
				}
			});

			expect(result.query).to.be.equal('select * from "users" join "payments" on "users"."name" = ' +
				'"payments"."name";');
			expect(result.values).to.be.eql({});
		});

		it('should be ok with `query` property', function() {
			var result = jsonSql.build({
				table: 'users',
				join: [{
					query: {
						table: 'payments'
					},
					on: {'users.name': 'payments.name'}
				}]
			});

			expect(result.query).to.be.equal(
				'select * from "users" ' +
					'join (select * from "payments") ' +
					'on "users"."name" = "payments"."name";'
			);
			expect(result.values).to.be.eql({});
		});

		it('should be ok with `select` property', function() {
			var result = jsonSql.build({
				table: 'users',
				join: [{
					select: {
						table: 'payments'
					},
					on: {'users.name': 'payments.name'}
				}]
			});

			expect(result.query).to.be.equal(
				'select * from "users" ' +
					'join (select * from "payments") ' +
					'on "users"."name" = "payments"."name";'
			);
			expect(result.values).to.be.eql({});
		});
	});

	describe('condition', function() {
		describe('compare operators', function() {
			it('should throw error with wrong operator', function() {
				expect(function() {
					jsonSql.build({
						table: 'users',
						condition: {
							name: {$wrong: 'John'}
						}
					});
				}).to.throw('Unknown operator "$wrong"');
			});

			it('should be ok with default operator(=)', function() {
				var result = jsonSql.build({
					table: 'users',
					condition: {
						name: 'John'
					}
				});

				expect(result.query).to.be.equal('select * from "users" where "name" = ${p1};');
				expect(result.values).to.be.eql({
					p1: 'John'
				});
			});

			it('should be ok with `$eq` operator', function() {
				var result = jsonSql.build({
					table: 'users',
					condition: {
						name: {$eq: 'John'}
					}
				});

				expect(result.query).to.be.equal('select * from "users" where "name" = ${p1};');
				expect(result.values).to.be.eql({
					p1: 'John'
				});
			});

			it('should be ok with `$ne` operator', function() {
				var result = jsonSql.build({
					table: 'users',
					condition: {
						name: {$ne: 'John'}
					}
				});

				expect(result.query).to.be.equal('select * from "users" where "name" != ${p1};');
				expect(result.values).to.be.eql({
					p1: 'John'
				});
			});

			it('should be ok with `$gt` operator', function() {
				var result = jsonSql.build({
					table: 'users',
					condition: {
						name: {$gt: 'John'}
					}
				});

				expect(result.query).to.be.equal('select * from "users" where "name" > ${p1};');
				expect(result.values).to.be.eql({
					p1: 'John'
				});
			});

			it('should be ok with `$lt` operator', function() {
				var result = jsonSql.build({
					table: 'users',
					condition: {
						name: {$lt: 'John'}
					}
				});

				expect(result.query).to.be.equal('select * from "users" where "name" < ${p1};');
				expect(result.values).to.be.eql({
					p1: 'John'
				});
			});

			it('should be ok with `$gte` operator', function() {
				var result = jsonSql.build({
					table: 'users',
					condition: {
						name: {$gte: 'John'}
					}
				});

				expect(result.query).to.be.equal('select * from "users" where "name" >= ${p1};');
				expect(result.values).to.be.eql({
					p1: 'John'
				});
			});

			it('should be ok with `$lte` operator', function() {
				var result = jsonSql.build({
					table: 'users',
					condition: {
						name: {$lte: 'John'}
					}
				});

				expect(result.query).to.be.equal('select * from "users" where "name" <= ${p1};');
				expect(result.values).to.be.eql({
					p1: 'John'
				});
			});

			it('should be ok with `$is` operator', function() {
				var result = jsonSql.build({
					table: 'users',
					condition: {
						name: {$is: null}
					}
				});

				expect(result.query).to.be.equal('select * from "users" where "name" is null;');
				expect(result.values).to.be.eql({});
			});

			it('should be ok with `$isnot` operator', function() {
				var result = jsonSql.build({
					table: 'users',
					condition: {
						name: {$isnot: null}
					}
				});

				expect(result.query).to.be.equal('select * from "users" where "name" is not null;');
				expect(result.values).to.be.eql({});
			});

			it('should be ok with `$like` operator', function() {
				var result = jsonSql.build({
					table: 'users',
					condition: {
						name: {$like: 'John%'}
					}
				});

				expect(result.query).to.be.equal('select * from "users" where "name" like ${p1};');
				expect(result.values).to.be.eql({
					p1: 'John%'
				});
			});

			it('should be ok with `$null`:true operator', function() {
				var result = jsonSql.build({
					table: 'users',
					condition: {
						name: {$null: true}
					}
				});

				expect(result.query).to.be.equal('select * from "users" where "name" is null;');
				expect(result.values).to.be.eql({});
			});

			it('should be ok with `$null`:false operator', function() {
				var result = jsonSql.build({
					table: 'users',
					condition: {
						name: {$null: false}
					}
				});

				expect(result.query).to.be.equal('select * from "users" where "name" is not null;');
				expect(result.values).to.be.eql({});
			});

			it('should be ok with `$field` operator', function() {
				var result = jsonSql.build({
					table: 'users',
					condition: {
						name: {$field: 'name_2'}
					}
				});

				expect(result.query).to.be.equal('select * from "users" where "name" = "name_2";');
				expect(result.values).to.be.eql({});
			});

			it('should be ok with object `$field` operator', function() {
				var result = jsonSql.build({
					table: 'users',
					condition: {
						name: {$field: {field: 'name_2'}}
					}
				});

				expect(result.query).to.be.equal('select * from "users" where "name" = "name_2";');
				expect(result.values).to.be.eql({});
			});

			it('should be ok with `$in` operator', function() {
				var result = jsonSql.build({
					table: 'users',
					condition: {
						age: {$in: [12, 13, 14]}
					}
				});

				expect(result.query).to.be.equal('select * from "users" where "age" in (12, 13, 14);');
				expect(result.values).to.be.eql({});
			});

			it('should add `null` value with empty array in `$in` operator', function() {
				var result = jsonSql.build({
					table: 'users',
					condition: {
						age: {$in: []}
					}
				});

				expect(result.query).to.be.equal('select * from "users" where "age" in (null);');
				expect(result.values).to.be.eql({});
			});

			it('should be ok with `$nin` operator', function() {
				var result = jsonSql.build({
					table: 'users',
					condition: {
						age: {$nin: [12, 13, 14]}
					}
				});

				expect(result.query).to.be.equal('select * from "users" where "age" not in (12, 13, 14);');
				expect(result.values).to.be.eql({});
			});

			it('should add `null` value with empty array in `$nin` operator', function() {
				var result = jsonSql.build({
					table: 'users',
					condition: {
						age: {$nin: []}
					}
				});

				expect(result.query).to.be.equal('select * from "users" where "age" not in (null);');
				expect(result.values).to.be.eql({});
			});

			it('should be ok with object subquery in `$in` operator', function() {
				var result = jsonSql.build({
					table: 'users',
					condition: {
						age: {$in: {
							table: 'test'
						}}
					}
				});

				expect(result.query).to.be.equal('select * from "users" where "age" in (select * from ' +
					'"test");');
				expect(result.values).to.be.eql({});
			});

			it('should be ok with `query` subquery in `$in` operator', function() {
				var result = jsonSql.build({
					table: 'users',
					condition: {
						age: {$in: {
							query: {
								table: 'test'
							}
						}}
					}
				});

				expect(result.query).to.be.equal('select * from "users" where "age" in (select * from ' +
					'(select * from "test"));');
				expect(result.values).to.be.eql({});
			});

			it('should be ok with `select` subquery in `$in` operator', function() {
				var result = jsonSql.build({
					table: 'users',
					condition: {
						age: {$in: {
							select: {
								table: 'test'
							}
						}}
					}
				});

				expect(result.query).to.be.equal('select * from "users" where "age" in (select * from ' +
					'(select * from "test"));');
				expect(result.values).to.be.eql({});
			});

			it('should be ok with `$between` operator', function() {
				var result = jsonSql.build({
					table: 'users',
					condition: {
						age: {$between: [12, 14]}
					}
				});

				expect(result.query).to.be.equal('select * from "users" where "age" between 12 and 14;');
				expect(result.values).to.be.eql({});
			});
		});

		describe('logical operators', function() {
			it('should throw error with wrong logical operator', function() {
				expect(function() {
					jsonSql.build({
						table: 'users',
						condition: {
							$wrong: [
								{name: 'John'},
								{age: 12}
							]
						}
					});
				}).to.throw('Unknown logical operator "$wrong"');
			});

			it('should be ok with default logical operator(`$and`)', function() {
				var result = jsonSql.build({
					table: 'users',
					condition: {
						name: 'John',
						age: 12
					}
				});

				expect(result.query).to.be.equal('select * from "users" where "name" = ${p1} and "age" = 12;');
				expect(result.values).to.be.eql({
					p1: 'John'
				});
			});

			it('should be ok with default logical operator(`$and`) for one field', function() {
				var result = jsonSql.build({
					table: 'users',
					condition: {
						age: {
							$gt: 5,
							$lt: 15,
							$ne: 10
						}
					}
				});

				expect(result.query).to.be.equal('select * from "users" where "age" > 5 and "age" < 15 and ' +
					'"age" != 10;');
				expect(result.values).to.be.eql({});
			});

			it('should be ok with array `$and`', function() {
				var result = jsonSql.build({
					table: 'users',
					condition: {
						$and: [
							{name: 'John'},
							{age: 12}
						]
					}
				});

				expect(result.query).to.be.equal('select * from "users" where "name" = ${p1} and "age" = 12;');
				expect(result.values).to.be.eql({
					p1: 'John'
				});
			});

			it('should be ok with object `$and`', function() {
				var result = jsonSql.build({
					table: 'users',
					condition: {
						$and: {
							name: 'John',
							age: 12
						}
					}
				});

				expect(result.query).to.be.equal('select * from "users" where "name" = ${p1} and "age" = 12;');
				expect(result.values).to.be.eql({
					p1: 'John'
				});
			});

			it('should be ok with array `$or`', function() {
				var result = jsonSql.build({
					table: 'users',
					condition: {
						$or: [
							{name: 'John'},
							{age: 12}
						]
					}
				});

				expect(result.query).to.be.equal('select * from "users" where "name" = ${p1} or "age" = 12;');
				expect(result.values).to.be.eql({
					p1: 'John'
				});
			});

			it('should be ok with object `$or`', function() {
				var result = jsonSql.build({
					table: 'users',
					condition: {
						$or: {
							name: 'John',
							age: 12
						}
					}
				});

				expect(result.query).to.be.equal('select * from "users" where "name" = ${p1} or "age" = 12;');
				expect(result.values).to.be.eql({
					p1: 'John'
				});
			});

			it('should be ok with array `$not`', function() {
				var result = jsonSql.build({
					table: 'users',
					condition: {
						$not: [
							{name: 'John'},
							{age: 12}
						]
					}
				});

				expect(result.query).to.be.equal('select * from "users" where not ("name" = ${p1} and ' +
					'"age" = 12);');
				expect(result.values).to.be.eql({
					p1: 'John'
				});
			});

			it('should be ok with object `$not`', function() {
				var result = jsonSql.build({
					table: 'users',
					condition: {
						$not: {
							name: 'John',
							age: 12
						}
					}
				});

				expect(result.query).to.be.equal('select * from "users" where not ("name" = ${p1} and ' +
					'"age" = 12);');
				expect(result.values).to.be.eql({
					p1: 'John'
				});
			});

			it('should be ok with object [`$or`, `$or`]', function() {
				var result = jsonSql.build({
					table: 'users',
					condition: [{
						$or: {
							name: 'John',
							age: 12
						}
					}, {
						$or: {
							name: 'Mark',
							age: 14
						}
					}]
				});

				expect(result.query).to.be.equal(
					'select * from "users" ' +
						'where ("name" = ${p1} or "age" = 12) and ' +
						'("name" = ${p2} or "age" = 14);'
				);
				expect(result.values).to.be.eql({
					p1: 'John',
					p2: 'Mark'
				});
			});

			it('should be ok with object `$and`:[`$or`, `$or`]', function() {
				var result = jsonSql.build({
					table: 'users',
					condition: {
						$and: [{
							$or: {
								name: 'John',
								age: 12
							}
						}, {
							$or: {
								name: 'Mark',
								age: 14
							}
						}]
					}
				});

				expect(result.query).to.be.equal(
					'select * from "users" ' +
						'where ("name" = ${p1} or "age" = 12) and ' +
						'("name" = ${p2} or "age" = 14);'
				);
				expect(result.values).to.be.eql({
					p1: 'John',
					p2: 'Mark'
				});
			});

			it('should be ok with object `$or`:[{},{}]', function() {
				var result = jsonSql.build({
					table: 'users',
					condition: {
						$or: [{
							name: 'John',
							age: 12
						}, {
							name: 'Mark',
							age: 14
						}]
					}
				});

				expect(result.query).to.be.equal(
					'select * from "users" ' +
						'where ("name" = ${p1} and "age" = 12) or ' +
						'("name" = ${p2} and "age" = 14);'
				);
				expect(result.values).to.be.eql({
					p1: 'John',
					p2: 'Mark'
				});
			});

			it('should be ok with object `$or`:[`$and`, `$and`]', function() {
				var result = jsonSql.build({
					table: 'users',
					condition: {
						$or: [{
							$and: {
								name: 'John',
								age: 12
							}
						}, {
							$and: {
								name: 'Mark',
								age: 14
							}
						}]
					}
				});

				expect(result.query).to.be.equal(
					'select * from "users" ' +
						'where ("name" = ${p1} and "age" = 12) or ' +
						'("name" = ${p2} and "age" = 14);'
				);
				expect(result.values).to.be.eql({
					p1: 'John',
					p2: 'Mark'
				});
			});

			it('should be ok with [{}, {}]', function() {
				var result = jsonSql.build({
					table: 'users',
					condition: [{
						name: 'John',
						age: 12
					}, {
						name: 'Mark',
						age: 14
					}]
				});

				expect(result.query).to.be.equal(
					'select * from "users" ' +
						'where ("name" = ${p1} and "age" = 12) and ' +
						'("name" = ${p2} and "age" = 14);');
				expect(result.values).to.be.eql({
					p1: 'John',
					p2: 'Mark'
				});
			});

			it('should be ok with `$and`:[{}, {}]', function() {
				var result = jsonSql.build({
					table: 'users',
					condition: {
						$and: [{
							name: 'John',
							age: 12
						}, {
							name: 'Mark',
							age: 14
						}]
					}
				});

				expect(result.query).to.be.equal(
					'select * from "users" ' +
						'where ("name" = ${p1} and "age" = 12) and ' +
						'("name" = ${p2} and "age" = 14);'
				);
				expect(result.values).to.be.eql({
					p1: 'John',
					p2: 'Mark'
				});
			});

			it('should be ok with `$and`:[`$and`, `$and`]', function() {
				var result = jsonSql.build({
					table: 'users',
					condition: {
						$and: [{
							$and: {
								name: 'John',
								age: 12
							}
						}, {
							$and: {
								name: 'Mark',
								age: 14
							}
						}]
					}
				});

				expect(result.query).to.be.equal(
					'select * from "users" ' +
						'where ("name" = ${p1} and "age" = 12) and ' +
						'("name" = ${p2} and "age" = 14);'
				);
				expect(result.values).to.be.eql({
					p1: 'John',
					p2: 'Mark'
				});
			});

			it('should be ok with `$or`:[`$or`, `$or`]', function() {
				var result = jsonSql.build({
					table: 'users',
					condition: {
						$or: [{
							$or: {
								name: 'John',
								age: 12
							}
						}, {
							$or: {
								name: 'Mark',
								age: 14
							}
						}]
					}
				});

				expect(result.query).to.be.equal(
					'select * from "users" ' +
						'where ("name" = ${p1} or "age" = 12) or ' +
						'("name" = ${p2} or "age" = 14);'
				);
				expect(result.values).to.be.eql({
					p1: 'John',
					p2: 'Mark'
				});
			});
		});
	});

	describe('group', function() {
		it('should be ok with string value', function() {
			var result = jsonSql.build({
				table: 'users',
				group: 'age'
			});

			expect(result.query).to.be.equal(
				'select * from "users" group by "age";'
			);
			expect(result.values).to.be.eql({});
		});

		it('should be ok with array value', function() {
			var result = jsonSql.build({
				table: 'users',
				group: ['age', 'gender']
			});

			expect(result.query).to.be.equal(
				'select * from "users" group by "age", "gender";'
			);
			expect(result.values).to.be.eql({});
		});
	});

	describe('sort', function() {
		it('should be ok with string value', function() {
			var result = jsonSql.build({
				table: 'users',
				sort: 'age'
			});

			expect(result.query).to.be.equal(
				'select * from "users" order by "age";'
			);
			expect(result.values).to.be.eql({});
		});

		it('should be ok with array value', function() {
			var result = jsonSql.build({
				table: 'users',
				sort: ['age', 'gender']
			});

			expect(result.query).to.be.equal(
				'select * from "users" order by "age", "gender";'
			);
			expect(result.values).to.be.eql({});
		});

		it('should be ok with object value', function() {
			var result = jsonSql.build({
				table: 'users',
				sort: {
					age: 1,
					gender: -1
				}
			});

			expect(result.query).to.be.equal(
				'select * from "users" order by "age" asc, "gender" desc;'
			);
			expect(result.values).to.be.eql({});
		});
	});

	describe('limit, offset', function() {
		it('should be ok with `limit` property', function() {
			var result = jsonSql.build({
				table: 'users',
				limit: 5
			});

			expect(result.query).to.be.equal(
				'select * from "users" limit 5;'
			);
			expect(result.values).to.be.eql({});
		});

		it('should be ok with `offset` property', function() {
			var result = jsonSql.build({
				table: 'users',
				offset: 5
			});

			expect(result.query).to.be.equal(
				'select * from "users" offset 5;'
			);
			expect(result.values).to.be.eql({});
		});

		it('should be ok with `limit` and `offset` properties', function() {
			var result = jsonSql.build({
				table: 'users',
				limit: 10,
				offset: 20
			});

			expect(result.query).to.be.equal(
				'select * from "users" limit 10 offset 20;'
			);
			expect(result.values).to.be.eql({});
		});
	});
});
