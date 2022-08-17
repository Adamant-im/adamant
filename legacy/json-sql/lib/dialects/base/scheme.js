var SchemeParser = function () {
}

var types = {
	"Number": {syntax: "int"},
	"BigInt": {syntax: "bigint"},
	"SmallInt": {syntax: "smallint"},
	"String": {syntax: "varchar", length: true},
	"Text": {syntax: "text"},
	"Real": {syntax: "real"},
	"Boolean": {syntax: "boolean"},
	"Blob": {syntax: "blob"},
	"Binary": {syntax: "bytea"}
}

// for future
var onDeleteTrigger = {
	"set_null": "SET NULL",
	"cascade": "CASCADE"
}

function getType(field) {
	var s = "";
	var type = types[field.type];

	if (!type) {
		throw new Error("Invalid type of field: " + field.type);
	}

	s += type.syntax;

	if (type.length) {
		if (!field.length || field.length <= 0) {
			throw new Error("Field length can't be less or equal 0");
		}

		s += "(" + field.length + ")";
	} else if (type.default_length) {
		s += "(" + type.default_length + ")";
	}

	return s;
}

function foreignkeys(fields, keys) {
	if (!keys || keys.length == 0) {
		return "";
	}

	var s = ", ";
	var names = [];
	fields.forEach(function (field) {
		names.push(field.name)
	});

	keys.forEach(function (key, i) {
		if (!key.field) {
			throw new Error("Provide field for foreign key");
		}

		if (names.indexOf(key.field) < 0) {
			throw new Error("Not exists field to make foreign key: " + key.field);
		}

		if (!key.table || key.table.trim().length == 0) {
			throw new Error("Invalid reference table name");
		}

		if (!key.table_field || key.table_field.trim().length == 0) {
			throw new Error("Invalid reference table filed");
		}

		s += "FOREIGN KEY (\"" + key.field + "\") REFERENCES " + key.table + "(\"" + key.table_field + "\")" + (key.on_delete ? " ON DELETE " + key.on_delete : "");
		if (i != keys.length - 1) {
			s += ",";
		}
	});

	return s;
}

function parse(fields, fkeys) {
	var sql_fields = "";
	var checkPrimaryKey = false;
	var names = [];

	fields.forEach(function (field, i) {
		if (!field.name) {
			throw new Error("Name of field most be provided");
		}

		if (field.name.trim().length == 0) {
			throw new Error("Name most contains characters");
		}

		if (names.indexOf(field.name) >= 0) {
			throw new Error("Two parameters with same name: " + field.name);
		}

		var line = this.dialect._wrapIdentifier(field.name) + " " + getType(field);

		if (field.not_null) {
			line += " NOT NULL";
		}

		if (field.default !== undefined) {
			var _type = typeof field.default;
			var _default = field.default;
			if (_type === "string") {
				_default = "'" + field.default + "'";
			}
			line += " default " + _default;
		}

		if (field.unique) {
			line += " UNIQUE";
		}


		if (field.primary_key) {
			if (checkPrimaryKey) {
				throw new Error("Too much primary key '" + field.name + "' in table");
			} else {
				checkPrimaryKey = true;
			}

			line += " PRIMARY KEY";
		}

		sql_fields += line;

		names.push(field.name);

		if (i != fields.length - 1) {
			sql_fields += ",";
		}
	}.bind(this));

	sql_fields += foreignkeys(fields, fkeys);
	return sql_fields;
}

module.exports = {
	parse: parse,
	foreignkeys: foreignkeys
}
