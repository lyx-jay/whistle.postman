var http = require('http');
var https = require('https');
var url = require('url');

function sendRequest(request, callback) {
  var startTime = Date.now();
  
  var method = (request.method || 'GET').toUpperCase();
  var urlStr = request.url;
  
  if (!urlStr) {
    return callback(new Error('No URL provided'));
  }
  
  var parsedUrl = url.parse(urlStr);
  var isHttps = parsedUrl.protocol === 'https:';
  var httpModule = isHttps ? https : http;
  
  var headers = request.headers || {};
  
  if (request.body && request.body.content) {
    if (!headers['Content-Type']) {
      if (request.body.type === 'json') {
        headers['Content-Type'] = 'application/json';
      } else {
        headers['Content-Type'] = 'application/x-www-form-urlencoded';
      }
    }
  }
  
  var options = {
    hostname: parsedUrl.hostname,
    port: parsedUrl.port || (isHttps ? 443 : 80),
    path: parsedUrl.path,
    method: method,
    headers: headers,
    rejectUnauthorized: false
  };
  
  var req = httpModule.request(options, function(res) {
    var body = '';
    
    res.on('data', function(chunk) {
      body += chunk;
    });
    
    res.on('end', function() {
      var cookies = [];
      var resHeaders = {};
      
      for (var key in res.headers) {
        resHeaders[key] = res.headers[key];
        if (key.toLowerCase() === 'set-cookie') {
          cookies = res.headers[key];
        }
      }
      
      var response = {
        status: res.statusCode,
        statusText: res.statusMessage,
        headers: resHeaders,
        body: body,
        cookies: parseCookies(cookies),
        size: Buffer.byteLength(body, 'utf8'),
        time: Date.now() - startTime
      };
      
      try {
        response.body = JSON.stringify(JSON.parse(body), null, 2);
      } catch (e) {}
      
      callback(null, response);
    });
  });
  
  req.on('error', function(err) {
    callback(err);
  });
  
  if (request.body && request.body.content) {
    req.write(request.body.content);
  }
  
  req.end();
}

function parseCookies(cookies) {
  if (!cookies || !Array.isArray(cookies)) return [];
  
  return cookies.map(function(cookie) {
    var parts = cookie.split(';');
    var first = parts[0].split('=');
    var result = {
      name: first[0].trim(),
      value: first.slice(1).join('=').trim()
    };
    
    parts.slice(1).forEach(function(part) {
      var kv = part.trim().split('=');
      var key = kv[0].toLowerCase();
      var value = kv[1] || '';
      
      if (key === 'expires') result.expires = value;
      if (key === 'path') result.path = value;
      if (key === 'domain') result.domain = value;
      if (key === 'httponly') result.httpOnly = true;
      if (key === 'secure') result.secure = true;
    });
    
    return result;
  });
}

module.exports = {
  send: sendRequest
};