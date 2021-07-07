var EventEmitter = require('events').EventEmitter,
    util = require('util'),
    spawn = require('child_process').spawn,
    path = require('path'),
    querystring = require('querystring'),
    async = require('async');

var callbacks = {};
var magic = "=%5a$ng*a8=";
var magicData = "";
var debugPort = 5859;

function Sandbox(file, id, params, apiHandler, debug) {
	EventEmitter.call(this);

	if (typeof file !== "string" || file === undefined || file === null) {
		throw new Error("First argument should be a path to file to launch in vm");
	}

	if (typeof id !== "string" || id === undefined || id === null) {
		throw new Error("Second argument should be a id of dapp");
	}

	if (typeof apiHandler !== "function" || apiHandler === undefined || apiHandler === null) {
		throw new Error("Third argument should be a api hanlder callback");
	}

	this.params = params;
	this.file = file;
	this.id = id;
	this.apiHandler = apiHandler;
	this.child = null;
	this.queue = null;
	this.debug = debug || false;
}

util.inherits(Sandbox, EventEmitter);

Sandbox.prototype._parse = function (data) {
	try {
		var json = JSON.parse(data);
	} catch (e) {
		return this._onError(new Error("Can't parse JSON response from DApp: \n" + data + "\n" + e.toString()));
	}

	if (json.callback_id === null || json.callback_id === undefined) {
		return this._onError(new Error("Incorrect response from vm, missed callback id field"));
	}

	try {
		var callback_id = parseInt(json.callback_id);
	} catch (e) {
		return this._onError(new Error("Incorrect callback_id field, callback_id should be a number"));
	}

	if (isNaN(callback_id)) {
		return this._onError(new Error("Incorrect callback_id field, callback_id should be a number"));
	}

	if (json.type == "dapp_response") {
		var callback = callbacks[callback_id];

		if (!callback) {
			return this._onError(new Error("Lisk can't find callback_id from vm"));
		}

		var error = json.error;
		var response = json.response;

		setImmediate(callback, error, response);
	} else if (json.type == "dapp_call") {
		var message = json.message;

		if (message === null || message === undefined) {
			return this._onError(new Error("Lisk can't find message for request from vm"));
		}

		message.dappid = this.id;

		this.apiHandler(message, function (err, response) {
			var responseObj = {
				type: "lisk_response",
				callback_id: callback_id,
				error: err,
				response: response || {}
			};

			try {
				var responseString = JSON.stringify(responseObj);
			} catch (e) {
				return this._onError(new Error("Can't make response: " + e.toString()));
			}

			this.queue.push({message: responseString + magic});
		}.bind(this));
	} else {
		this._onError(new Error("Incorrect response type from vm"));
	}
}

Sandbox.prototype.run = function () {
	var params = [this.file].concat(this.params);
	if (this.debug) {
		params.unshift("--debug=" + debugPort);
		console.log("DebugPort " + params[1] + " : " + debugPort++);
	}
	this.child = spawn(path.join(__dirname, "../../nodejs/node"), params, {
		stdio: ['pipe', 'pipe', 'pipe', 'pipe', 'pipe']
	});

	var self = this;

	this.queue = async.queue(function (task, callback) {
		try {
			var size = Buffer.byteLength(task.message, 'utf8');
			if (size > 16000) {
				console.log("incoming " + (size) + " bytes");
			}
			self.child.stdio[3].write(task.message);
		} catch (e) {
			console.log(e.toString())
		} finally {
			setTimeout(callback, 10);
		}
	}, 1);

	// Catch errors...
	this.child.on('error', this._onError.bind(this));
	this.child.stdio[0].on('error', this._onError.bind(this));
	this.child.stdio[1].on('error', this._onError.bind(this));
	this.child.stdio[2].on('error', this._onError.bind(this));
	this.child.stdio[3].on('error', this._onError.bind(this));
	this.child.stdio[4].on('error', this._onError.bind(this));

	this.child.stdio[4].on('data', this._listen.bind(this));

	if (this.debug) {
		this.child.stdio[1].on('data', this._debug.bind(this));
	}

	this.child.stdio[2].on('data', this._debug.bind(this));
}

Sandbox.prototype.setApi = function (apiHanlder) {
	if (typeof apiHanlder != "function" || apiHanlder === null || apiHanlder === undefined) {
		throw new Error("First argument should be a function");
	}
	this.apiHandler = apiHanlder;
}

Sandbox.prototype.sendMessage = function (message, callback) {
	var callback_id = Object.keys(callbacks).length + 1;

	var messageObj = {
		callback_id: callback_id,
		type: "lisk_call",
		message: message
	};

	try {
		var messageString = JSON.stringify(messageObj);
	} catch (e) {
		return setImmediate(callback, "Can't stringify message: " + e.toString());
	}

	this.queue.push({message: messageString + magic});

	callbacks[callback_id] = callback;
}

Sandbox.prototype.exit = function () {
	if (this.child) {
		this.child.kill();
		this.emit("exit");
	}
}

Sandbox.prototype._debug = function (data) {
	console.log("Debug " + this.file + ": \n");
	console.log(data.toString('utf8'));
}

Sandbox.prototype._onError = function (err) {
	console.log(err.stack)
	this.exit();
	this.emit("error", err);
}

Sandbox.prototype._listen = function (dataraw) {
	var data = querystring.unescape(dataraw.toString('utf8'));
	magicData += data;
	if (data.substring(data.length - 11) == magic) {
		var fullMessage = magicData;
		magicData = "";

		var parts = fullMessage.split(magic);
		parts.pop();
		parts.forEach(function (jsonmessage) {
			this._parse(jsonmessage);
		}.bind(this));

	}
}

module.exports = Sandbox;
