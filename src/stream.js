function Stream() {
  this.events = {};
  this.length = 0;
  this.position = 0;
}

Stream.prototype.on = function(type, callback, once) {
  this.events[type] = this.events[type] || [];
  this.events[type].push({f: callback, once: once});
}

Stream.prototype.once = function(type, callback) {
  this.on(type, callback, true);
}

Stream.prototype.off = function(type) {
  this.events[type] = [];
}

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

Stream.prototype.read = function(nbytes) {}

function FileStream(input_stream) {
  Stream.call(this);
  if (input_stream.constructor.name == "File") {
    this._initFile(input_stream);
    this.read = this._readFile;
  } else {
    throw new Error("Unsupported input stream type");
  }
}

FileStream.prototype = new Stream;

FileStream.prototype._initFile = function(file) {
    this.file = file;
    this.length = file.length;
}

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

function PrefixStreamer(prefix, otherstream) {
  Stream.call(this);
  this.prefix = prefix.split('');
  this.otherstream = otherstream;
  this.length = this.otherstream.length + this.prefix.length;
}

PrefixStreamer.prototype = new Stream;
PrefixStreamer.prototype.read = function(nbytes) {
  var that = this;
  prefix_bytes = this.prefix.splice(0, nbytes).join('');
  nbytes = nbytes - prefix_bytes.length;
  if (nbytes > 0) {
    this.otherstream.once("data", function(data){
      if (data != null) {
        that.emit("data", prefix_bytes + data);
      } else {
        that.emit("data", null);
      }
    });
    this.otherstream.read(nbytes);
  } else {
    this.emit("data", prefix_bytes);
  }
}

exports.PrefixStreamer = PrefixStreamer;
exports.FileStream = FileStream;
exports.Stream = Stream;
