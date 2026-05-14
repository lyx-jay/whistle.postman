var http = require('http');
var path = require('path');
var fs = require('fs');

var PLUGIN_NAME = 'whistle.postman';
var UI_PATH = path.join(__dirname, 'ui');
var PORT = 18899;

var storage = {
  _data: {},
  getProperty: function(key) {
    return this._data[key] || null;
  },
  setProperty: function(key, value) {
    this._data[key] = value;
  }
};

var indexModule = require('./index.js');

var fakeServer = new http.Server();
indexModule.uiServer(fakeServer, { storage: storage });

var server = http.createServer(function(req, res) {
  if (req.url.startsWith('/plugin.postman')) {
    req.url = req.url.replace('/plugin.postman', '') || '/';
  }
  fakeServer.emit('request', req, res);
});

server.listen(PORT, function() {
  console.log('Whistle Postman test server running at http://127.0.0.1:' + PORT);
  console.log('UI available at http://127.0.0.1:' + PORT + '/ui/index.html');
});
