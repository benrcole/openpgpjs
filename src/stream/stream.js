/**
 * @module stream
 */

'use strict';

var util = require('../util.js'),
  EventEmitter = require('events').EventEmitter;

/**
 * @class
 * @classdesc Class that represents a stream.
 */
function Stream() {
  EventEmitter.call(this);
  this.length = 0;
  this.position = 0;
  return this;
}

// Fuck you!
// https://github.com/joyent/node/issues/7157

util.inherits(Stream, EventEmitter);

// Stream.prototype = new EventEmitter();
// Stream.prototype.constructor = Stream;
// Stream.prototype.parent = EventEmitter.prototype;

// /**
//  * Register a callback for an event of the given type.
//  * @param {String} type name of the event the callback is being registered for.
//  * @param {Function} callback what should be called once the event is fired.
//  * @param {Boolean} once (optional) if the callback should be fired only once.
//  */
// Stream.prototype.on = function(type, callback, once, ctx) {
//   this.events[type] = this.events[type] || [];
//   this.events[type].push({f: callback, once: once, ctx: ctx});
// }
// 
// /**
//  * Register a callback for an event of the given type to be fired only once.
//  * @param {String} type name of the event the callback is being registered for.
//  * @param {Function} callback what should be called once the event is fired.
//  */
// Stream.prototype.once = function(type, callback, ctx) {
//   this.on(type, callback, true, ctx);
// }
// 
// /**
//  * Remove all callbacks for the given event type.
//  * @param {String} type name of the event the callback is being registered for.
//  */
// Stream.prototype.off = function(type) {
//   this.events[type] = [];
// }
// 
// /**
//  * Fire an event of the given type with the specified arguments.
//  * Example: stream.emit("data", {'spam': 'ham'})
//  *          will lead to all the "data" callbacks to be called with argument
//  *          {'spam': 'ham'}.
//  * @param {String} type name of the event to be fired.
//  * @param {Object} args what are the arguments to be passed to the callbacks.
//  */
// Stream.prototype.emit = function() {
//   var args = Array.apply([], arguments),
//     type = args.shift(),
//     triggerred = this.events[type] || [],
//     i=0, event;
//   for (;event=triggerred[i++];) {
//     event.f.apply(ctx, args);
//     if (event.once) this.events[type].splice(i, 1);
//   }
// }

Stream.prototype.read = function(needed_bytes) {
  this._read(needed_bytes);
}

function ConcatStream() {
  Stream.call(this);
  var streams = Array.apply([], arguments),
    that = this;

  this._current = streams.shift();
  this._streams = streams;
  this.buffer = '';
  this.length = this._current.length;

  streams.forEach(function(s) {
    that.length += s.length;
  });
}

util.inherits(ConcatStream, Stream);

ConcatStream.prototype._nextStream = function() {
  this._current = null;
  var stream = this._streams.shift();
  if (typeof stream === 'undefined') {
    return null;
  } else {
    this._current = stream;
    return stream;
  }
}

ConcatStream.prototype.read = function(needed_bytes) {
  var that = this;
  console.log("Read called with "+needed_bytes);
  var getbytes = function(d, nbytes) {
    console.log("NBYTES "+nbytes);
    if (d === null) {
      // This means I have finished reading the current chunk.
      if (nbytes === 0) {
        // If the needed bytes are zero then we have done.
        console.log("If the needed bytes are zero then we have done.");
        console.log(that.buffer);
        var d = that.buffer;
        that.buffer = '';
        that.emit("data", d);
      } else if (that._nextStream() !== null) {
        // If that is not the case and there is another chunk let's read it.
        console.log("If that is not the case and there is another chunk let's read it.");
        that.read(nbytes);
      } else if (that.buffer.length > 0){
        // We write what we have in the buffer
        console.log("We write what we have in the buffer");
        console.log(that.buffer);
        console.log(nbytes);
        var d = that.buffer;
        that.buffer = '';
        that.emit("data", d, nbytes);
      } else {
        that.emit("data", null, nbytes);
      }
    } else {
      // We have gotten back some data
      that.buffer += d;
      nbytes -= d.length;
      if (nbytes === 0) {
        // We need no more data
        console.log("We need no more data");
        console.log(that.buffer);
        var d = that.buffer;
        that.buffer = '';
        that.emit("data", d);
      } else if (that._nextStream() !== null){
        // We still need to read some more data and there is more to read.
        console.log("We still need to read some more data and there is more to read.");
        that.read(nbytes);
      } else {
        // No more data and no more streams
        console.log("No more data and no more streams");
        console.log(that.buffer);
        var d = that.buffer;
        that.buffer = '';
        that.emit("data", d, nbytes);
      }
    }
  }
  if (this._current != null) {
    console.log("current != null");
    this._current.once("data", getbytes);
    this._current._read(needed_bytes);
  } else {
    console.log("There is no more..");
    this.emit("data", null, needed_bytes); 
  }
}


function StringStream(string) {
  Stream.call(this);
  this.string = string;
  this.length = string.length;
  return this;
}

util.inherits(StringStream, Stream);

StringStream.prototype.toString = function() {
  return "[StringStream '" + this.string + "']";
}

StringStream.prototype._read = function(nbytes) {
  var data = this.string.substr(0, nbytes);
  this.string = this.string.substr(nbytes);
  //console.log(this._events.data[0].listener);
  if (data.length > 0) {
    console.log("Emitting shit..");
    this.emit("data", data, nbytes);
  } else {
    console.log("Emitting tihs..");
    this.emit("data", null, nbytes);
  }
}


/**
 * @class
 * @classdesc Class that represents a FileStream.
 * @param {File} input_stream an instance of File as is defined in
 * http://dev.w3.org/2006/webapi/FileAPI/
 */
function FileStream(input_stream) {
  if (!(this instanceof FileStream)) {
    return new FileStream(input_stream);
  }
  Stream.call(this);
  if (input_stream.constructor.name == "File") {
    this._initFile(input_stream);
    this._read = this._readFile;
  } else {
    throw new Error("Unsupported input stream type");
  }
}

util.inherits(FileStream, Stream);

/**
 * Private method for initializing the file. 
 * @param {File} file the file to be added to the stream.
 */
FileStream.prototype._initFile = function(file) {
    this.file = file;
    this.length = file.length;
}

/**
 * Private method for reading asynchronously N bytes from the file.
 * @param {Int} nbytes the number of bytes to read from the file.
 */
FileStream.prototype._readFile = function(nbytes) {
  var reader = new FileReader(),
    start = this.position,
    end = this.position + nbytes,
    that = this,
    blob;

  if (start >= this.length) return this.emit("data", null);
  if (end > this.length) {
    end = this.length;
    nbytes = end - start;
  }

  blob = this.file.slice(start, end);
  reader.onload = function(e) {
    that.position += nbytes;
    this.emit("data", e.target.result, nbytes);
  };
  reader.readAsBinaryString(blob);
}


exports.FileStream = FileStream;
exports.Stream = Stream;
exports.StringStream = StringStream;
exports.ConcatStream = ConcatStream;
