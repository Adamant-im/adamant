# Documentation

## Table of contents

* [API](#api)
    - [Initialization](#initialization)
    - __[build(query)](#buildquery)__
    - [configure(options)](#configureoptions)
    - [setDialect(name)](#setdialectname)
* __[Queries](#queries)__
    - [type: 'create'](#type-create)
    - [type: 'select'](#type-select)
    - [type: 'insert'](#type-insert)
    - [type: 'update'](#type-update)
    - [type: 'remove'](#type-remove)
    - [type: 'union' | 'intersect' | 'except'](#type-union--intersect--except)
* __[Blocks](#blocks)__
* __[Condition operators](#condition-operators)__

---

## API

### Initialization

To create new instance of json-sql builder you can use factory function:

``` js
var jsonSql = require('json-sql')(options);
```

or create instance by class constructor:

``` js
var jsonSql = new (require('json-sql').Builder)(options);
```

`options` are similar to [configure method options](#available-options).

---

### build(query)

Create sql query from mongo-style query object.

`query` is a json object that has required property `type` and a set of query-specific properties. `type` property determines the type of query. List of available values of `type` property you can see at [Queries section](#queries).

Returns object with properties:

| Property | Description |
| -------- | ----------- |
| `query` | SQL query string |
| `value` | Array or object with values.<br>Exists only if `separatedValues = true`. |
| `prefixValues()` | Method to get values with `valuesPrefix`.<br>Exists only if `separatedValues = true`. |
| `getValuesArray()` | Method to get values as array.<br>Exists only if `separatedValues = true`. |
| `getValuesObject()` | Method to get values as object.<br>Exists only if `separatedValues = true`. |

---

### configure(options)

Set options of json-sql builder instance.

#### Available options

| Option name | Default value | Description |
| ----------- | ------------- | ----------- |
| `separatedValues` | `true` | If `true` - create placeholder for each string value and put it value to result `values`.<br>If `false` - put string values into sql query without placeholder (potential threat of sql injection). |
| `namedValues` | `true` | If `true` - create hash of values with placeholders p1, p2, ...<br>If `false` - put all values into array.<br>Option is used if `separatedValues = true`. |
| `valuesPrefix` | `'$'` | Prefix for values placeholders<br>Option is used if `namedValues = true`. |
| `dialect` | `'base'` | Active dialect. See setDialect for dialects list. |
| `wrappedIdentifiers` | `true` | If `true` - wrap all identifiers with dialect wrapper (name -> "name"). |

---

### setDialect(name)

Set active dialect, name can has value `'base'`, `'mssql'`, `'mysql'`, `'postrgresql'` or `'sqlite'`.

---

## Queries

### type: 'create'

>[ [tableFields](#tableFields) ]<br>
>[ [table](#table) ]<br>
>[ [foreignKeys](#foreignKeys) ]

__Example:__

``` js
var sql = jsonSql.build({
	type: 'create',
	table: 'users',
	tableFields: [
		{
			name: "name",
			type: "String",
			length: 16,
			not_null: true,
			unique: true,
			default: "empty"
		}
	]
});

sql.query
// create table if not exists "users"("name" varchar(16) NOT NULL default "empty" UNIQUE);
```

---

### type: 'select'

>[ [with](#with-withrecursive) | [withRecursive](#with-withrecursive) ]<br>
>[ [distinct](#distinct) ]<br>
>[ [fields](#fields) ]<br>
>[table](#table) | [query](#query) | [select](#select) | [expression](#expression)<br>
>[ [alias](#alias) ]<br>
>[ [join](#join) ]<br>
>[ [condition](#condition) ]<br>
>[ [group](#group) ]<br>
>[ [sort](#sort) ]<br>
>[ [limit](#limit) ]<br>
>[ [offset](#offset) ]

__Example:__

``` js
var sql = jsonSql.build({
    type: 'select',
    fields: ['a', 'b']
    table: 'table'
});

sql.query
// select "a", "b" from "table";
```

If `fields` is not specified in query, result fields is `*` (all columns of the selected rows).

__Example:__

``` js
var sql = jsonSql.build({
    type: 'select',
    table: 'table'
});

sql.query
// select * from "table";
```

---

### type: 'insert'

>[ [with](#with-withrecursive) | [withRecursive](#with-withrecursive) ]<br>
>[ [or](#or) ]<br>
>[table](#table)<br>
>[values](#values)<br>
>[ [condition](#condition) ]<br>
>[ [returning](#returning) ]

__Example:__

``` js
var sql = jsonSql.build({
    type: 'insert',
    table: 'table',
    values: {a: 4}
});

sql.query
// insert into "table" ("a") values (4);
```

---

### type: 'update'

>[ [with](#with-withrecursive) | [withRecursive](#with-withrecursive) ]<br>
>[ [or](#or) ]<br>
>[table](#table)<br>
>[modifier](#modifier)<br>
>[ [condition](#condition) ]<br>
>[ [returning](#returning) ]

__Example:__

``` js
var sql = jsonSql.build({
    type: 'update',
    table: 'table',
    modifier: {a: 5}
});

sql.query
// update "table" set a = 5;
```

---

### type: 'remove'

>[ [with](#with-withrecursive) | [withRecursive](#with-withrecursive) ]<br>
>[table](#table)<br>
>[ [condition](#condition) ]<br>
>[ [returning](#returning) ]

__Example:__

``` js
var sql = jsonSql.build({
    type: 'remove',
    table: 'table'
});

sql.query
// delete from "table";
```

---

### type: 'union' | 'intersect' | 'except'

>[ [all](#all) ]<br>
>[ [with](#with-withrecursive) | [withRecursive](#with-withrecursive) ]<br>
>[queries](#queries)<br>
>[ [sort](#sort) ]<br>
>[ [limit](#limit) ]<br>
>[ [offset](#offset) ]

__`type: 'union'` example:__

``` js
var sql = jsonSql.build({
    type: 'union',
    queries: [
        {type: 'select', table: 'table1'},
        {type: 'select', table: 'table2'}
    ]
});

sql.query
// (select * from "table1") union (select * from "table2");
```

__`type: 'intersect'` example:__

``` js
var sql = jsonSql.build({
    type: 'intersect',
    queries: [
        {type: 'select', table: 'table1'},
        {type: 'select', table: 'table2'}
    ]
});

sql.query
// (select * from "table1") intersect (select * from "table2");
```

__`type: 'except'` example:__

``` js
var sql = jsonSql.build({
    type: 'except',
    queries: [
        {type: 'select', table: 'table1'},
        {type: 'select', table: 'table2'}
    ]
});

sql.query
// (select * from "table1") except (select * from "table2");
```

---

## Blocks

Blocks are small chunks of query.

### with, withRecursive

Should be an `array` or an `object`.

If value is an `array`, each item of array should be an `object` and should conform the scheme:

>name<br>
>[ [fields](#fields) ]<br>
>[query](#query) | [select](#select) | [expression](#expression)

__Example:__

``` js
var sql = jsonSql.build({
    'with': [{
        name: 'table',
        select: {table: 'withTable'}
    }],
    table: 'table'
});

sql.query
// with "table" as (select * from "withTable") select * from "table";
```

If value is an `object`, keys of object interpret as names and each value should be an `object` and should conform the scheme:

>[ name ]<br>
>[ [fields](#fields) ]<br>
>[query](#query) | [select](#select) | [expression](#expression)

__Example:__

``` js
var sql = jsonSql.build({
    'with': {
        table: {
            select: {table: 'withTable'}
        }
    },
    table: 'table'
});

sql.query
// with "table" as (select * from "withTable") select * from "table";
```

---

### distinct

Should be a `boolean`:

```
distinct: true
```

__Example:__

``` js
var sql = jsonSql.build({
    distinct: true,
    table: 'table'
});

sql.query
// select distinct * from "table";
```

---

### tableFields

Should be an `array`

Contains array of table`s fields 

---

### foreignKeys

Should be an `array`

__Example:__

``` js
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

sql.query
// create table "users"(name varchar(16) NOT NULL PRIMARY KEY,age int NOT NULL, FOREIGN KEY (name) REFERENCES person(id));
```

---

### fields

Should be an `array` or an `object`.

If value is an `array`, each item interprets as [term block](#term).

__Example:__

``` js
var sql = jsonSql.build({
    fields: [
        'a',
        {b: 'c'},
        {table: 'd', name: 'e', alias: 'f'},
        ['g']
    ],
    table: 'table'
});

sql.query
// select "a", "b" as "c", "d"."e" as "f", "g" from "table";
```

If value is an `object`, keys of object interpret as field names and each value should be an `object` and should conform the scheme:

>[ name ]<br>
>[ [table](#table) ]<br>
>[ cast ]<br>
>[ [alias](#alias) ]

__Example:__

``` js
var sql = jsonSql.build({
    fields: {
        a: 'b',
        d: {table: 'c', alias: 'e'}
    },
    table: 'table'
});

sql.query
// select "a" as "b", "c"."d" as "e" from "table";
```

---

### term

Should be:
* a `string` - interprets as field name;
* another simple type or an `array` - interprets as value;
* an `object` - should conform the scheme:

>[query](#query) | [select](#select) | [field](#field) | [value](#value) | [func](#func) | [expression](#expression)<br>
>[ cast ]<br>
>[ [alias](#alias) ]

---

### field

Should be a `string` or an `object`.

If value is a `string`:

```
field: 'fieldName'
```

__Example:__

``` js
var sql = jsonSql.build({
    fields: [{field: 'a'}],
    table: 'table'
});

sql.query
// select "a" from "table";
```

If value is an `object` it should conform the scheme:

>name<br>
>[ [table](#table) ]

__Example:__

``` js
var sql = jsonSql.build({
    fields: [{field: {name: 'a', table: 'table'}}],
    table: 'table'
});

sql.query
// select "table"."a" from "table";
```

---

### value

Can have any type.

__Example:__

``` js
var sql = jsonSql.build({
    fields: [
        {value: 5},
        {value: 'test'}
    ],
    table: 'table'
});

sql.query
// select 5, $p1 from "table";

sql.values
// {p1: 'test'}
```

---

### table

Should be a `string`:

```
table: 'tableName'
```

__Example:__

``` js
var sql = jsonSql.build({
    table: 'table'
});

sql.query
// select * from "table";
```

---

### query

Should be an `object`. Value interprets as sub-query and process recursively with [build(query)](#buildquery) method.

__Example:__

``` js
var sql = jsonSql.build({
    query: {type: 'select', table: 'table'}
});

sql.query
// select * from (select * from "table");
```

---

### select

Should be an `object`. Value interprets as sub-select and process recursively with [build(query)](#buildquery) method.

__Example:__

``` js
var sql = jsonSql.build({
    select: {table: 'table'}
});

sql.query
// select * from (select * from "table");
```

---

### func

Should be a `string` or an `object`.

If value is a `string`:

```
func: 'random'
```

__Example:__

``` js
var sql = jsonSql.build({
    fields: [{func: 'random'}],
    table: 'table'
});

sql.query
// select random() from "table";
```

If value is an `object` it should conform the scheme:

>name<br>
>[ args ]

where `name` is a `string` name of function, `args` is an `array` that contains it arguments.

__Example:__

``` js
var sql = jsonSql.build({
    fields: [{
        func: {
            name: 'sum',
            args: [{field: 'a'}]
        }
    }],
    table: 'table'
});

sql.query
// select sum("a") from table;
```

---

### expression

Should be a `string` or an `object`.

If value is a `string`:

```
expression: 'random()'
```

__Example:__

``` js
var sql = jsonSql.build({
    expression: 'generate_series(2, 4)'
});

sql.query
// select * from generate_series(2, 4);
```

If value is an `object` it should conform the scheme:

>pattern<br>
>[ values ]

where `pattern` is a `string` pattern with placeholders `{placeholderName}`, `values` is a hash that contains values for each `placeholderName`.

__Example:__

``` js
var sql = jsonSql.build({
    expression: {
        pattern: 'generate_series({start}, {stop})',
        values: {start: 2, stop: 4}
    }
});

sql.query
// select * from generate_series(2, 4);
```

---

### alias

Should be a `string` or an `object`.

If value is a `string`:

```
alias: 'aliasName'
```

__Example:__

``` js
var sql = jsonSql.build({
    table: 'table',
    alias: 'alias'
});

sql.query
// select * from "table" as "alias";
```

If value is an `object` it should conform the scheme:

>name<br>
>[ columns ]

__Example:__

``` js
var sql = jsonSql.build({
    table: 'table',
    alias: {name: 'alias'}
});

sql.query
// select * from "table" as "alias";
```

---

### join

Should be an `array` or an `object`.

If value is an `array`, each item of array should be an `object` and should conform the scheme:

>[ type ]<br>
>[table](#table) | [query](#query) | [select](#select) | [expression](#expression)<br>
>[ [alias](#alias) ]<br>
>[ on ]

__Example:__

``` js
var sql = jsonSql.build({
    table: 'table',
    join: [{
        type: 'right',
        table: 'joinTable',
        on: {'table.a': 'joinTable.b'}
    }]
});

sql.query
// select * from "table" right join "joinTable" on "table"."a" = "joinTable"."b";
```

If value is an `object`, keys of object interpret as table names and each value should be an `object` and should conform the scheme:

>[ type ]<br>
>[ [table](#table) | [query](#query) | [select](#select) | [expression](#expression) ]<br>
>[ [alias](#alias) ]<br>
>[ on ]

__Example:__

``` js
var sql = jsonSql.build({
    table: 'table',
    join: {
        joinTable: {
            type: 'inner',
            on: {'table.a': 'joinTable.b'}
        }
    }]
});

sql.query
// select * from "table" inner join "joinTable" on "table"."a" = "joinTable"."b";
```

__Join with sub-select example:__

``` js
var sql = jsonSql.build({
    table: 'table',
    join: [{
        select: {table: 'joinTable'},
        alias: 'joinTable',
        on: {'table.a': 'joinTable.b'}
    }]
});

sql.query
// select * from "table" join (select * from "joinTable") as "joinTable" on "table"."a" = "joinTable"."b";
```

---

### condition

Should be an `array` or an `object`.

__`array` example:__

``` js
var sql = jsonSql.build({
    table: 'table',
    condition: [
        {a: {$gt: 1}},
        {b: {$lt: 10}}
    ]
});

sql.query
// select * from "table" where "a" > 1 and "b" < 10;
```

__`object` example:__

``` js
var sql = jsonSql.build({
    table: 'table',
    condition: {
        a: {$gt: 1},
        b: {$lt: 10}
    }
});

sql.query
// select * from "table" where "a" > 1 and "b" < 10;
```

---

### group

Should be a `string` or an `array`.

If value is a `string`:

```
group: 'fieldName'
```

__Example:__

``` js
var sql = jsonSql.build({
    table: 'table',
    group: 'a'
});

sql.query
// select * from "table" group by "a";
```

If value is an `array`:

```
group: ['fieldName1', 'fieldName2']
```

__Example:__

``` js
var sql = jsonSql.build({
    table: 'table',
    group: ['a', 'b']
});

sql.query
// select * from "table" group by "a", "b";
```

---

### sort

Should be a `string`, an `array` or an `object`.

If value is a `string`:

```
sort: 'fieldName'
```

__Example:__

``` js
var sql = jsonSql.build({
    table: 'table',
    sort: 'a'
});

sql.query
// select * from "table" order by "a";
```

If value is an `array`:

```
sort: ['fieldName1', 'fieldName2']
```

__Example:__

``` js
var sql = jsonSql.build({
    table: 'table',
    sort: ['a', 'b']
});

sql.query
// select * from "table" order by "a", "b";
```

If value is an `object`:

```
sort: {
    fieldName1: 1,
    fieldName2: -1
}
```

__Example__:

``` js
var sql = jsonSql.build({
    table: 'table',
    sort: {a: 1, b: -1}
});

sql.query
// select * from "table" order by "a" asc, "b" desc;
```

---

### limit

Should be a `number`.

```
limit: limitValue
```

__Example:__

``` js
var sql = jsonSql.build({
    table: 'table',
    limit: 5
});

sql.query
// select * from "table" limit 5;
```

---

### offset

Should be a `number`.

```
offset: offsetValue
```

__Example:__

``` js
var sql = jsonSql.build({
    table: 'table',
    offset: 5
});

sql.query
// select * from "table" offset 5;
```

---

### or

Should be a `string`.

Available values: 'rollback', 'abort', 'replace', 'fail', 'ignore'.

```
or: 'orValue'
```

__Example:__

``` js
var sql = jsonSql.build({
    type: 'insert',
    or: 'replace',
    table: 'table',
    values: {a: 5}
});

sql.query
// insert or replace into "table" ("a") values (5);
```

---

### values

Should be an `array` or an `object`.

If value is an `array`, each item should be an `object` and interprets as single inserted row where keys are field names and corresponding values are field values.

__Example:__

``` js
var sql = jsonSql.build({
    type: 'insert',
    table: 'table',
    values: [
        {a: 5, b: 'text1'},
        {a: 6, b: 'text2'}
    ]
});

sql.query
// insert into "table" ("a", "b") values (5, $p1), (6, $p2);

sql.values
// {p1: 'text1', p2: 'text2'}
```

If value is an `object`, it interprets as single inserted row where keys are field names and corresponding values are field values.

__Example:__

``` js
var sql = jsonSql.build({
    type: 'insert',
    table: 'table',
    values: {a: 5, b: 'text'}
});

sql.query
// insert into "table" ("a", "b") values (5, $p1);

sql.values
// {p1: 'text'}
```

Also you can specify fields array. If there no key in value object it value is `null`.

__Example:__

``` js
var sql = jsonSql.build({
    type: 'insert',
    table: 'table',
    fields: ['a', 'b', 'c'],
    values: {c: 'text', b: 5}
});

sql.query
// insert into "table" ("a", "b", "c") values (null, 5, $p1);

sql.values
// {p1: 'text'}
```

---

### modifier

Should be an `object`.

You can specify modifier operator.
Available operators: `$set`, `$inc`, `$dec`, `$mul`, `$div`, `$default`.

__Example:__

``` js
var sql = jsonSql.build({
    type: 'update',
    table: 'table',
    modifier: {
        $set: {a: 5},
        $default: {b: true},
        $inc: {c: 10}
    }
});

sql.query
// update "table" set "a" = 5, "b" = default, "c" = "c" + 10;
```

If modifier operator is not specified it uses default operator `$set`.

__Example:__

``` js
var sql = jsonSql.build({
    type: 'update',
    table: 'table',
    modifier: {a: 5}
});

sql.query
// update "table" set "a" = 5;
```

---

### returning

Format is similar to [fields](#fields) block.

__Example:__

``` js
var sql = jsonSql.build({
    type: 'insert',
    table: 'table',
    values: {a: 5},
    returning: ['a']
});

sql.query
// insert into "table" ("a") values (5) returning "a";
```

---

### all

Should be a `boolean`.

__Example:__

``` js
var sql = jsonSql.build({
    type: 'union',
    all: true,
    queries: [
        {type: 'select', table: 'table1'},
        {type: 'select', table: 'table2'}
    ]
});

sql.query
// (select * from "table1") union all (select * from "table2");
```

---

### queries

Should be an `array` with minimum 2 items. Each item interprets as sub-query and process recursively with [build(query)](#buildquery) method.

__Example:__

``` js
var sql = jsonSql.build({
    type: 'union',
    queries: [
        {type: 'select', table: 'table1'},
        {type: 'select', table: 'table2'}
    ]
});

sql.query
// (select * from "table1") union (select * from "table2");

//or for sqlite3
jsonSql.setDialect("sqlite");
var sql = jsonSql.build({
    type: 'union',
    unionqueries: [
        {type: 'select', table: 'table1'},
        {type: 'select', table: 'table2'}
    ]
});

sql.query
// select * from "table1" union select * from "table2";
```

---

## Condition operators

TODO: write this section