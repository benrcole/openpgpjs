var util = require('../util.js'),
  packet_stream = require('./packet.js'),
  crypto_stream = require('./crypto.js'),
  packet = require('../packet'),
  enums = require('../enums.js'),
  armor = require('../encoding/armor.js'),
  config = require('../config'),
  crypto = require('../crypto'),
  keyModule = require('../key.js'),
  message = require('../message.js');

config.debug = true;
function MessageStream(file_length, keys, opts) {
  var self = this;
  opts = opts || {};
  packet_stream.HeaderPacketStream.call(this, opts);

  opts['algo'] = enums.read(enums.symmetric, keyModule.getPreferredSymAlgo(keys));
  opts['key'] = crypto.generateSessionKey(opts['algo']);
  opts['cipherfn'] = crypto.cipher[opts['algo']];
  opts['prefixrandom'] = crypto.getPrefixRandom(opts['algo']);

  this.cipher = new crypto_stream.CipherFeedback(opts);
  this.fileLength = file_length;
  this.keys = keys;

  this._prefixWritten = false;
  this.prefix = '';
  this.prefix += String.fromCharCode(enums.write(enums.literal, 'utf8'));
  this.prefix += String.fromCharCode(this.fileLength);
  //this.prefix += 'txt';
  this.prefix += util.writeDate(new Date(1002300030000));
  this.prefix = packet.packet.writeHeader(enums.packet.literal, 
                                          unescape(encodeURIComponent(this.prefix)).length + this.fileLength) + this.prefix;
  
  
  console.log("FL");
  console.log(this.fileLength);
  this.encryptedSize = 0;
  this.cipher.on('data', function(data) {
    //data = data.toString();
    console.log("I got this data "+data.length);
    util.pprint(data);
    self.encryptedSize += data.length;
    console.log('Encrypted size '+self.encryptedSize);
    self.push(data);
  });

  // this.on('end', function(){
  //   self.cipher.end(); 
  // });
}
util.inherits(MessageStream, packet_stream.HeaderPacketStream);

MessageStream.prototype.getHeader = function() {
  var that = this,
    packetList = new packet.List(),
    symAlgo = keyModule.getPreferredSymAlgo(this.keys);

  this.keys.forEach(function(key) {
    var encryptionKeyPacket = key.getEncryptionKeyPacket();
    if (encryptionKeyPacket) {
      var pkESKeyPacket = new packet.PublicKeyEncryptedSessionKey();
      pkESKeyPacket.publicKeyId = encryptionKeyPacket.getKeyId();
      pkESKeyPacket.publicKeyAlgorithm = encryptionKeyPacket.algorithm;
      pkESKeyPacket.sessionKey = that.cipher.sessionKey;
      pkESKeyPacket.sessionKeyAlgorithm = enums.read(enums.symmetric, symAlgo);
      pkESKeyPacket.encrypt(encryptionKeyPacket);
      packetList.push(pkESKeyPacket);
    } else {
      throw new Error('Could not find valid key packet for encryption in key ' + key.primaryKey.getKeyId().toHex());
    }
  });
  var packet_len = unescape(encodeURIComponent(this.prefix)).length + this.fileLength + this.cipher.blockSize + 2,
    first_packet_header = packet.packet.writeHeader(9, packet_len),
    header = packetList.write();

  console.log("First packet length " + packet_len);
  console.log(this.prefix.length);
  console.log(this.fileLength);
  console.log(this.cipher.blockSize);
  var d = header + first_packet_header;
  console.log("Data length "+new Buffer(d).length);
  util.pprint(header);
  util.pprint(first_packet_header);
  return new Buffer(d);
}

MessageStream.prototype._transform = function(chunk, encoding, cb) {
  packet_stream.HeaderPacketStream.prototype._transform.call(this, chunk, encoding);
  var self = this;
  if (this.prefix) {
    console.log(chunk.length);
    chunk = this.prefix + chunk;
    console.log("Writing prefix..");
    console.log(this.prefix.length);
    console.log(chunk.length);
    this.prefix = null;
  }
  this.cipher.once('encrypted', function(d) {
    cb();
    console.log("Encrypted");
    console.log(d);
  });
  console.log("Writing to cipher "+chunk);
  this.cipher.write(new Buffer(chunk));
}

MessageStream.prototype._flush = function(cb) {
  this.cipher.once('flushed', function(d) {
    cb();
  });
  this.cipher.end();
}
module.exports.MessageStream = MessageStream;
