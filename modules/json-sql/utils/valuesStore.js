'use strict';

module.exports = ValuesStore;

function ValuesStore(options) {
	options = options || {};
	this._values = options.values || {};
}

ValuesStore.prototype.add = ValuesStore.prototype.set = function(name, value) {
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
