// GPG4Browsers - An OpenPGP implementation in javascript
// Copyright (C) 2011 Recurity Labs GmbH
// 
// This library is free software; you can redistribute it and/or
// modify it under the terms of the GNU Lesser General Public
// License as published by the Free Software Foundation; either
// version 2.1 of the License, or (at your option) any later version.
// 
// This library is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU
// Lesser General Public License for more details.
// 
// You should have received a copy of the GNU Lesser General Public
// License along with this library; if not, write to the Free Software
// Foundation, Inc., 51 Franklin Street, Fifth Floor, Boston, MA  02110-1301  USA

/**
 * @requires config
 * @requires crypto
 * @requires encoding/armor
 * @requires enums
 * @requires packet
 * @requires message
 * @module streamed_message
 */

var packet = require('./packet'),
  enums = require('./enums.js'),
  armor = require('./encoding/armor.js'),
  config = require('./config'),
  crypto = require('./crypto'),
  keyModule = require('./key.js'),
  message = require('./message.js'),
  stream = require('./stream.js'),
  util = require('./util.js');

config.debug = true;

/**
 * @class
 * @classdesc Class that represents an OpenPGP message.
 * Can be an encrypted message, signed message, compressed message or literal message
 * @param  {module:packet/packetlist} packetlist The packets that form this message
 * See {@link http://tools.ietf.org/html/rfc4880#section-11.3}
 */

function StreamedMessage(file, keys) {
  if (!(this instanceof StreamedMessage)) {
    return new StreamedMessage(file, keys);
  }
  this.buffer = new Array();
  this.length = 0;
  this.position = 0;
  this.eof = false;
  this.stream = stream;
  this.prefixGenerated = false;
  this.keys = keys;
  this.previous_chunk = null;

  this.symAlgo = keyModule.getPreferredSymAlgo(keys);
  this.algo = enums.read(enums.symmetric, this.symAlgo);

  this.sessionKey = crypto.generateSessionKey(this.algo);

  this.cipherfn = new crypto.cipher[this.algo](this.sessionKey);
  this.feedbackRegister = new Uint8Array(this.cipherfn.blockSize);
  this.feedbackRegisterEncrypted = new Uint8Array(this.cipherfn.blockSize);
  
  var prefix = '';
  prefix += String.fromCharCode(enums.write(enums.literal, 'utf8'));
  prefix += String.fromCharCode(stream.length);
  prefix += util.writeDate(new Date());
  prefix = packet.packet.writeHeader(enums.packet.literal, prefix.length + file.length) + prefix;

  this.file = file;
  this.stream = new stream.PrefixStreamer(prefix, file);
  this.generateHeader();
  this.length= this.buffer.length;
  this.length += this.stream.length + this.cipherfn.blockSize + 2;
}

StreamedMessage.prototype.generateHeader = function() {
  var that = this,
    packetList = new packet.List(),
    data = "";
  this.keys.forEach(function(key) {
    var encryptionKeyPacket = key.getEncryptionKeyPacket();
    if (encryptionKeyPacket) {
      var pkESKeyPacket = new packet.PublicKeyEncryptedSessionKey();
      pkESKeyPacket.publicKeyId = encryptionKeyPacket.getKeyId();
      pkESKeyPacket.publicKeyAlgorithm = encryptionKeyPacket.algorithm;
      pkESKeyPacket.sessionKey = that.sessionKey;
      pkESKeyPacket.sessionKeyAlgorithm = enums.read(enums.symmetric, that.symAlgo);
      pkESKeyPacket.encrypt(encryptionKeyPacket);
      packetList.push(pkESKeyPacket);
    } else {
      throw new Error('Could not find valid key packet for encryption in key ' + key.primaryKey.getKeyId().toHex());
    }
  });
  var packet_len = this.stream.length + this.cipherfn.blockSize + 2,
    first_packet_header = packet.packet.writeHeader(9, packet_len)
                      .split('');
  Array.prototype.push.apply(this.buffer, packetList.write().split(''));
  Array.prototype.push.apply(this.buffer, first_packet_header);
}

/**
 * Read some bytes of encrypted data.
 * @param  {Int} nbytes the number of bytes to read
 * @return {Array<module:packet~List>} the encrypted data
 */
StreamedMessage.prototype.read = function(nbytes, cb) {
  var that = this;
  if (typeof nbytes == 'function') {
    cb = nbytes;
    nbytes = (this.length - this.position) + this.buffer.length;
  }
  if (this.eof) {
    nbytes = this.buffer.length; 
  }
  if (this.buffer.length >= nbytes) {
    this.position += nbytes;
    return cb(this.buffer.splice(0, nbytes).join(''));
  } else {
    this.stream.once('data', function(data) {
      if (data === null) {
        that.eof = true;
        return cb(null);
      }
      that.encrypt_block(data);
      that.read(nbytes, cb);
    });
    var bytes_to_read = nbytes - this.buffer.length,
      padding = ((-bytes_to_read % this.cipherfn.blockSize) +
                 this.cipherfn.blockSize);
    bytes_to_read = bytes_to_read + padding;
    this.stream.read(bytes_to_read);
  }
};

StreamedMessage.prototype._generatePrefix = function(chunk) {
  var prefixrandom = crypto.getPrefixRandom(this.algo);
  var resync = true;
  var key = this.sessionKey;
  var block_size = this.cipherfn.blockSize;

  prefixrandom = prefixrandom + prefixrandom.charAt(block_size - 2) + prefixrandom.charAt(block_size - 1);
  var ciphertext = new Uint8Array(chunk.length + 2 + block_size * 2);
  var i, n, begin;
  var offset = resync ? 0 : 2;

  // 1.  The feedback register (FR) is set to the IV, which is all zeros.
  for (i = 0; i < block_size; i++) {
    this.feedbackRegister[i] = 0;
  }

  // 2.  FR is encrypted to produce FRE (FR Encrypted).  This is the
  //     encryption of an all-zero value.
  this.feedbackRegisterEncrypted = this.cipherfn.encrypt(this.feedbackRegister);
  // 3.  FRE is xored with the first BS octets of random data prefixed to
  //     the plaintext to produce C[1] through C[BS], the first BS octets
  //     of ciphertext.
  for (i = 0; i < block_size; i++) {
    ciphertext[i] = this.feedbackRegisterEncrypted[i] ^ prefixrandom.charCodeAt(i);
  }

  // 4.  FR is loaded with C[1] through C[BS].
  this.feedbackRegister.set(ciphertext.subarray(0, block_size));

  // 5.  FR is encrypted to produce FRE, the encryption of the first BS
  //     octets of ciphertext.
  this.feedbackRegisterEncrypted = this.cipherfn.encrypt(this.feedbackRegister);

  // 6.  The left two octets of FRE get xored with the next two octets of
  //     data that were prefixed to the plaintext.  This produces C[BS+1]
  //     and C[BS+2], the next two octets of ciphertext.
  ciphertext[block_size] = this.feedbackRegisterEncrypted[0] ^ prefixrandom.charCodeAt(block_size);
  ciphertext[block_size + 1] = this.feedbackRegisterEncrypted[1] ^ prefixrandom.charCodeAt(block_size + 1);

  if (resync) {
    // 7.  (The resync step) FR is loaded with C[3] through C[BS+2].
    this.feedbackRegister.set(ciphertext.subarray(2, block_size + 2));
  } else {
    this.feedbackRegister.set(ciphertext.subarray(0, block_size));
  }
  // 8.  FR is encrypted to produce FRE.
  this.feedbackRegisterEncrypted = this.cipherfn.encrypt(this.feedbackRegister);

  // 9.  FRE is xored with the first BS octets of the given plaintext, now
  //     that we have finished encrypting the BS+2 octets of prefixed
  //     data.  This produces C[BS+3] through C[BS+(BS+2)], the next BS
  //     octets of ciphertext.
  for (i = 0; i < block_size; i++) {
    ciphertext[block_size + 2 + i] = this.feedbackRegisterEncrypted[i + offset] ^ chunk.charCodeAt(i);
  }
  this.previous_chunk = ciphertext.subarray(block_size + 2 - offset, 2*block_size + 2 - offset);
  ciphertext = ciphertext.subarray(0, chunk.length + 2 + block_size);
  return util.Uint8Array2str(ciphertext);
}

/**
 * Encrypt the specified chunk. Chunks should always be in multiples of the
 * block size, unless it is the last chunk. 
 * XXX currently encryption is done without integrity protection. Support for
 * this MUST be added before deployment.  
 * @param {Array<module:message~Message}   chunk the message chunk to encrypt
 * @return {Array<module:message~Message>} new message with encrypted content
 */
StreamedMessage.prototype.encrypt_block = function(chunk) {
  var data = "";
  
  if ((chunk.length % this.cipherfn.blockSize) === 0 && this.eof != true) {
    throw new Error("encrypt_block must be called with a chunk multiple of the " +
                    "block size (" + this.cipherfn.blockSize + ")") ;
  }
  
  if (!this.prefixGenerated) {
    data = this._generatePrefix(chunk);
    this.prefixGenerated = true;
  } else {
    var ciphertext = new Uint8Array(chunk.length),
      block_size = this.cipherfn.blockSize,
      i, n, begin;
    for (n = 0; n < chunk.length; n += block_size) {
      // 10. FR is loaded with C[BS+3] to C[BS + (BS+2)] (which is C11-C18 for
      // an 8-octet block).
      this.feedbackRegister.set(this.previous_chunk);

      // 11. FR is encrypted to produce FRE.
      this.feedbackRegisterEncrypted = this.cipherfn.encrypt(this.feedbackRegister);

      // 12. FRE is xored with the next BS octets of plaintext, to produce
      // the next BS octets of ciphertext. These are loaded into FR, and
      // the process is repeated until the plaintext is used up.
      for (i = 0; i < block_size; i++) {
        ciphertext[n + i] = this.feedbackRegisterEncrypted[i] ^ chunk.charCodeAt(n + i);
      }
      this.previous_chunk = ciphertext.subarray(n, n + block_size);
    }
    ciphertext = ciphertext.subarray(0, chunk.length);
    data = util.Uint8Array2str(ciphertext);
  }
  Array.prototype.push.apply(this.buffer || [], data.split(''));
};

exports.StreamedMessage = StreamedMessage;
