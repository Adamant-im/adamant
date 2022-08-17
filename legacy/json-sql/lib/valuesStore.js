'use strict';

var _ = require('underscore');

module.exports = ValuesStore;

function ValuesStore(options) {
	options = options || {};
	this.context = options.context || null;
	this._values = options.values || {};
}

ValuesStore.prototype.add = ValuesStore.prototype.set = function(name, value) {
	if (_.isFunction(value) && this.context) {
		value = _(value).bind(this.context);
	}

	this._values[name] = value;
};

ValuesStore.prototype.get = function(name) {
	return this._values[name] || null;
};

ValuesStore.prototype.remove = function(name) {
	delete this._values[name];
};

ValuesStore.prototype.has = function(name) {
	return this._values.hasOwnProperty(name);
};
