var
	Readable = require('stream').Readable,
	util = require('util'),

	Input = require('./input.js')
	;

function Mixer(args) {
	Readable.call(this, args);

	if (typeof args === 'undefined') args = {};
	if (args.channels != 1 && args.channels != 2) args.channels = 2;
	if (typeof args.sampleRate === 'number' || args.sampleRate < 1) args.sampleRate = 44100; 

	this.buffer = Buffer.alloc(0);

	this.bitDepth = args.bitDepth;
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
	this.sampleRate = args.sampleRate;

	this.inputs = [];
}

util.inherits(Mixer, Readable);

Mixer.prototype._read = function() {

	var samples = Number.MAX_VALUE;
	this.inputs.forEach(function (input, i) {
		var as = input.availSamples();

		if(i === 1) as = samples; // Secondary stream
		// console.log(`${i}: ${as} samples available`);

		if (as < samples) samples = as;
	});
	if (samples > 0 && samples != Number.MAX_VALUE) {

		var mixedBuffer = Buffer.alloc(samples * this.sampleByteLength * this.channels);
		mixedBuffer.fill(0);
		this.inputs.forEach(function (input, i) {
			var inputBuffer = this.channels == 1 ? input.readMono(samples) : input.readStereo(samples);
			// console.log(`${i}: ${inputBuffer.length}`);
			
			for (var i = 0; i < samples * this.channels; i++) {
				var sample = this.readSample.call(mixedBuffer, i * this.sampleByteLength) + Math.round(this.readSample.call(inputBuffer, i * this.sampleByteLength) / this.inputs.length);
				this.writeSample.call(mixedBuffer, sample, i * this.sampleByteLength);
			}
		}.bind(this));

		this.push(mixedBuffer);
	} else {
		setImmediate(this._read.bind(this));
	}
}

Mixer.prototype.input = function (args) {
	if (typeof args === 'undefined') args = {};

	var input = new Input({
		mixer: this,
		channels: args.channels || this.channels,
		bitDepth: args.bitDepth || this.bitDepth,
		sampleRate: args.sampleRate || this.sampleRate
	});
	this.inputs.push(input);

	return input;
}

module.exports = Mixer;
