/**
 * @module stream
 */

'use strict';

var util = require('../util.js');

/**
 * @class
 * @classdesc Class that represents a stream.
 */
function Stream() {
  if (!(this instanceof Stream)) {
    return new Stream();
  }
  this.events = {};
  this.length = 0;
  this.position = 0;
  this.buffer = '';
  this.current = this;
  this.next = null;
}

/**
 * Register a callback for an event of the given type.
 * @param {String} type name of the event the callback is being registered for.
 * @param {Function} callback what should be called once the event is fired.
 * @param {Boolean} once (optional) if the callback should be fired only once.
 */
Stream.prototype.on = function(type, callback, once) {
  this.events[type] = this.events[type] || [];
  this.events[type].push({f: callback, once: once});
}

/**
 * Register a callback for an event of the given type to be fired only once.
 * @param {String} type name of the event the callback is being registered for.
 * @param {Function} callback what should be called once the event is fired.
 */
Stream.prototype.once = function(type, callback) {
  this.on(type, callback, true);
}

/**
 * Remove all callbacks for the given event type.
 * @param {String} type name of the event the callback is being registered for.
 */
Stream.prototype.off = function(type) {
  this.events[type] = [];
}

/**
 * Fire an event of the given type with the specified arguments.
 * Example: stream.emit("data", {'spam': 'ham'})
 *          will lead to all the "data" callbacks to be called with argument
 *          {'spam': 'ham'}.
 * @param {String} type name of the event to be fired.
 * @param {Object} args what are the arguments to be passed to the callbacks.
 */
Stream.prototype.emit = function() {
  var args = Array.apply([], arguments),
    type = args.shift(),
    triggerred = this.events[type] || [],
    i=0, event;
  for (;event=triggerred[i++];) {
    if (event.once) this.events[type].splice(i, 1);
    event.f.apply(this, args);
  }
}

Stream.prototype.concat = function() { 
  var streams = Array.apply([], arguments),
    that = this, current;

  this.current = util.clone(this);
  this.current.events = {};
  this.current.length = this.length;
  this.current._read = this._read;

  current = this.current;
  streams.forEach(function(s) {
    that.length += s.length;
    current.next = s;
    current = s;
    console.log(that.length);
  });
  return this;
}

Stream.prototype.read = function(nbytes) {
  var that = this;
  console.log("Read called with "+nbytes);
  this.current.once("data", function(d) {
    if (nbytes == 0) {
      console.log("CALLING WITH 0");
    }
    if (d === null) {
      // This means I have finished reading the current chunk.
      if (nbytes === 0) {
        // If the needed bytes are zero then we have done.
        console.log("If the needed bytes are zero then we have done.");
        console.log(that.buffer);
        var d = that.buffer;
        that.buffer = '';
        that.emit("data", d);
      } else if (that.current.next !== null && nbytes > 0) {
        // If that is not the case and there is another chunk let's read it.
        console.log("If that is not the case and there is another chunk let's read it.");
        that.current = that.current.next;
        that.read(nbytes);
      } else if (that.buffer.length > 0){
        // We write what we have in the buffer
        console.log("We write what we have in the buffer");
        console.log(that.buffer);
        console.log(nbytes);
        var d = that.buffer;
        that.buffer = '';
        that.emit("data", d);
      } else {
        that.emit("data", null); 
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
        that.current.off("data");
        that.emit("data", d);
      } else if (that.current.next !== null && nbytes > 0){
        // We still need to read some more data and there is more to read.
        that.current = that.current.next;
        that.read(nbytes);
      } else {
        // No more data and no more streams
        console.log("No more data and no more streams");
        console.log(that.buffer);
        var d = that.buffer;
        that.buffer = '';
        that.current.off("data");
        that.emit("data", that.buffer);
      }
    }
  });
  this.current._read(nbytes);
}

function StringStream(string) {
  Stream.call(this);
  this.string = string;
  this.length = string.length;
}

StringStream.prototype = new Stream;

StringStream.prototype.toString = function() {
  return "[StringStream '" + this.string + "']";
}

StringStream.prototype._read = function(nbytes) {
  var data = this.string.substr(0, nbytes);
  this.string = this.string.substr(nbytes);
  if (data.length > 0) {
    this.emit("data", data);
  } else {
    this.emit("data", null);
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

FileStream.prototype = new Stream;

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
    this.emit("data", e.target.result);
  };
  reader.readAsBinaryString(blob);
}

exports.FileStream = FileStream;
exports.Stream = Stream;
exports.StringStream = StringStream;
