var
	Writable = require('stream').Writable,
	util = require('util')
	;

function Input(args) {
	Writable.call(this, args);

	if (typeof args === 'undefined') args = {};
	if (args.channels != 1 && args.channels != 2) args.channels = 2;
	if (typeof args.sampleRate !== 'number' || args.sampleRate < 1) args.sampleRate = 44100; 
	if (typeof args.volume !== 'number' || args.volume < 0 || args.volume > 100) args.volume = 100;

	this.buffer = Buffer.alloc(0);

	if (args.channels == 1) this.readMono = this.read;
	if (args.channels == 2) this.readStereo = this.read;

	if (args.bitDepth == 8) {
		this.readSample = this.buffer.readInt8;
		this.writeSample = this.buffer.writeInt8;
		this.sampleByteLength = 1;
	}
	else if (args.bitDepth == 32) {
		this.readSample = this.buffer.readInt32LE;
		this.writeSample = this.buffer.writeInt32LE;
		this.sampleByteLength = 4;
	}
	else {
		args.bitDepth = 16;
		this.readSample = this.buffer.readInt16LE;
		this.writeSample = this.buffer.writeInt16LE;
		this.sampleByteLength = 2;
	}

	this.channels = args.channels;
	this.bitDepth = args.bitDepth;
	this.sampleRate = args.sampleRate;
	this.volume = args.volume;

	this.getMoreData = null;
}

util.inherits(Input, Writable);

Input.prototype.read = function (samples) {
	var as = this.availSamples();

	if(this.onRead) this.onRead(samples, as < samples);
	
	if(as < samples) {
		const silence = Buffer.alloc((this.bitDepth / 8) * this.channels * samples);
		
		this.write(silence);
	}

	var bytes = samples * (this.bitDepth / 8) * this.channels;
	if (this.buffer.length < bytes) bytes = this.buffer.length;
	var r = this.buffer.slice(0, bytes);
	this.buffer = this.buffer.slice(bytes);

	if (this.buffer.length <= 131072 && this.getMoreData !== null) {
		var getMoreData = this.getMoreData;
		this.getMoreData = null;
		process.nextTick(getMoreData);
	}
	for (var i = 0; i < r.length; i += 2) {
		r.writeInt16LE(Math.round(this.volume * r.readInt16LE(i) / 100), i);
	}

	return r;
}

Input.prototype.readMono = function (samples) {
	// This function will be overridden by this.read, if input already is mono.
	var stereoBuffer = this.read(samples);
	var monoBuffer = Buffer.alloc(stereoBuffer.length / 2);
	var s = this.availSamples(stereoBuffer.length);
	for (var i = 0; i < s; i++) {
		var l = this.readSample.call(stereoBuffer, i * this.sampleByteLength * 2);
		var r = this.readSample.call(stereoBuffer, (i * this.sampleByteLength * 2) + this.sampleByteLength);
		this.writeSample.call(monoBuffer, Math.round((l + r) / 2), i * this.sampleByteLength);
	}
	return monoBuffer;
}

Input.prototype.readStereo = function (samples) {
	// This function will be overridden by this.read, if input already is stereo.
	var monoBuffer = this.read(samples);
	var stereoBuffer = Buffer.alloc(monoBuffer.length * 2);
	var s = this.availSamples(monoBuffer.length);
	for (var i = 0; i < s; i++) {
		var m = this.readSample.call(monoBuffer, i * this.sampleByteLength);
		this.writeSample.call(stereoBuffer, m, i * this.sampleByteLength * 2);
		this.writeSample.call(stereoBuffer, m, (i * this.sampleByteLength * 2) + this.sampleByteLength);
	}
	return stereoBuffer;
}

Input.prototype.availSamples = function (length) {
	if (typeof length === 'undefined') length = this.buffer.length;
	return Math.floor(length / ((this.bitDepth / 8) * this.channels));
}

Input.prototype._write = function (chunk, encoding, next) {

	/*
	if (!Buffer.isBuffer(chunk)) {
		chunk = new Buffer(chunk, encoding);
	}
	*/
	this.buffer = Buffer.concat([this.buffer, chunk]);
	if (this.buffer.length > 131072) {
		this.getMoreData = next;
	} else {
		next();
	}
	
}

Input.prototype.setVolume = function(volume) {
	this.volume = Math.max(Math.min(volume, 100), 0);
};

Input.prototype.getVolume = function() {
	return this.volume;
}

module.exports = Input;
