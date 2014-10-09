var stream = require('./stream.js'),
  message = require('./message.js');

module.exports = {
  Stream: stream.Stream,
  FileStream: stream.FileStream,
  MessageStream: message.MessageStream
}
