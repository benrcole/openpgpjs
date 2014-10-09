'use strict';

var cryptoStream = require('../../src/stream/crypto.js'),
  enums = require('../../src/enums.js'),
  crypto = require('../../src/crypto');


var chai = require('chai'),
	expect = chai.expect;

describe("CFB Stream", function() {
  it("should work when calling write once", function(done) {
    var opts = {};
    opts['symAlgo'] = enums.symmetric.aes256;
    opts['algo'] = enums.read(enums.symmetric, opts['symAlgo']);
    opts['key'] = crypto.generateSessionKey(opts['algo']);
    opts['cipherfn'] = crypto.cipher[opts['algo']];
    opts['prefixrandom'] = crypto.getPrefixRandom(opts['algo']);
    
    var plaintext_a = "This is the end,";
    var plaintext_b = "my only friend,";
    var plaintext_c = "the end.";

    var encrypted_data = '';
    var cs = new cryptoStream.CipherFeedback(opts);
    
    cs.on('data', function(d) {
      encrypted_data += d.toString();
    });

    cs.on('end', function(d) {
      var decrypted = crypto.cfb.decrypt(opts['algo'], opts['key'],
                                         encrypted_data, true); 
      expect(decrypted).equal(plaintext_a+plaintext_b+plaintext_c);
      done();
    });
    cs.write(plaintext_a+plaintext_b);
    cs.end(plaintext_c);

  });

  it("should decrypt when calling write multiple times", function(done) {
    var opts = {};
    opts['symAlgo'] = enums.symmetric.aes256;
    opts['algo'] = enums.read(enums.symmetric, opts['symAlgo']);
    opts['key'] = crypto.generateSessionKey(opts['algo']);
    opts['cipherfn'] = crypto.cipher[opts['algo']];
    opts['prefixrandom'] = crypto.getPrefixRandom(opts['algo']);
    
    var plaintext_a = "This is the end,";
    var plaintext_b = "my only friend,";
    var plaintext_c = "the end.";

    var encrypted_data = '';
    var cs = new cryptoStream.CipherFeedback(opts);
    
    cs.on('data', function(d) {
      encrypted_data += d.toString();
    });

    cs.on('end', function(d) {
      var decrypted = crypto.cfb.decrypt(opts['algo'], opts['key'],
                                         encrypted_data, true); 
      expect(decrypted).equal(plaintext_a+plaintext_b+plaintext_c);
      done();
    });
    cs.write(plaintext_a);
    cs.write(plaintext_b);
    cs.end(plaintext_c);

  });

});
