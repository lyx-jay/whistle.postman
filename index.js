var http = require('http');
var https = require('https');
var url = require('url');
var path = require('path');
var fs = require('fs');

var ValuesStore = require('./lib/values-store');
var MockRulesManager = require('./lib/mock-rules');

var PLUGIN_NAME = 'whistle.postman';
var valuesDir = path.join(__dirname, 'values');
var mockManager = new MockRulesManager(valuesDir);
var UI_PATH = path.join(__dirname, 'ui');

var storage = {
  _data: {},
  getProperty: function(key) {
    return this._data[key] || null;
  },
  setProperty: function(key, value) {
    this._data[key] = value;
  }
};

function readStorage(storageObj, key, defaultValue) {
  try {
    var data = storageObj.getProperty(PLUGIN_NAME + '_' + key);
    return data ? JSON.parse(data) : defaultValue;
  } catch (e) {
    return defaultValue;
  }
}

function writeStorage(storageObj, key, data) {
  try {
    storageObj.setProperty(PLUGIN_NAME + '_' + key, JSON.stringify(data));
    return true;
  } catch (e) {
    return false;
  }
}

function resolveEnvVariables(text, envVars) {
  if (!text || !envVars) return text;
  return text.replace(/\{\{(\w+)\}\}/g, function(match, key) {
    return envVars.hasOwnProperty(key) ? envVars[key] : match;
  });
}

function generateMockResponse(request, schema) {
  var url = request.url || '';
  
  if (schema) {
    return generateFromSchema(schema);
  }
  
  if (url.includes('/users') || url.includes('/user')) {
    return { id: 1, name: "John Doe", email: "john@example.com" };
  }
  if (url.includes('/orders') || url.includes('/order')) {
    return { id: 1, orderNumber: "ORD-001", status: "pending" };
  }
  if (url.includes('/products') || url.includes('/product')) {
    return { id: 1, name: "Product Name", price: 29.99 };
  }
  
  return { message: "Mock response", timestamp: new Date().toISOString() };
}

function generateFromSchema(schema) {
  var result = {};
  if (!schema || !schema.properties) return result;
  
  for (var key in schema.properties) {
    var prop = schema.properties[key];
    var type = prop.type;
    
    if (type === 'string') {
      if (prop.format === 'email') result[key] = "user@example.com";
      else if (prop.format === 'date-time') result[key] = new Date().toISOString();
      else result[key] = "sample string";
    } else if (type === 'integer' || type === 'number') {
      result[key] = 1;
    } else if (type === 'boolean') {
      result[key] = true;
    } else if (type === 'array') {
      result[key] = [];
    } else if (type === 'object') {
      result[key] = generateFromSchema(prop);
    }
  }
  
  return result;
}

function generateMockViaAI(request, schema, prompt, config, callback) {
  var endpoint = config.aiEndpoint || 'https://api.openai.com/v1/chat/completions';
  var apiKey = config.aiApiKey;
  
  var systemPrompt = 'You are a mock data generator. Generate realistic, well-structured JSON data based on the request context. Return ONLY valid JSON, no markdown, no explanation, no code blocks.';
  
  var userPrompt = 'Request: ' + (request.method || 'GET') + ' ' + (request.url || '/') + '\n';
  if (schema) {
    userPrompt += 'Schema: ' + JSON.stringify(schema) + '\n';
  }
  if (prompt) {
    userPrompt += 'Requirements: ' + prompt + '\n';
  }
  userPrompt += 'Return only valid JSON.';
  
  var payload = JSON.stringify({
    model: config.aiModel || 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    temperature: 0.7,
    max_tokens: 4000
  });
  
  var parsedUrl = require('url').parse(endpoint);
  var isHttps = parsedUrl.protocol === 'https:';
  var httpModule = isHttps ? require('https') : require('http');
  
  var options = {
    hostname: parsedUrl.hostname,
    port: parsedUrl.port || (isHttps ? 443 : 80),
    path: parsedUrl.path,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + apiKey,
      'HTTP-Referer': 'http://127.0.0.1:8899',
      'X-Title': 'Whistle Postman',
      'Content-Length': Buffer.byteLength(payload)
    },
    rejectUnauthorized: false,
    timeout: 60000
  };
  
  var aiReq = httpModule.request(options, function(aiRes) {
    var aiBody = '';
    aiRes.on('data', function(chunk) { aiBody += chunk; });
    aiRes.on('end', function() {
      try {
        var aiData = JSON.parse(aiBody);
        var content = aiData.choices && aiData.choices[0] && aiData.choices[0].message && aiData.choices[0].message.content;
        if (!content) {
          var errMsg = aiData.error ? JSON.stringify(aiData.error) : 'No content from AI';
          callback(new Error(errMsg));
          return;
        }
        content = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        var mock = JSON.parse(content);
        callback(null, mock);
      } catch (e) {
        callback(e);
      }
    });
  });
  
  aiReq.on('error', function(err) {
    callback(err);
  });
  
  aiReq.on('timeout', function() {
    aiReq.abort();
    callback(new Error('AI request timeout (60s)'));
  });
  
  aiReq.write(payload);
  aiReq.end();
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
      if (key === 'expires') result.expires = kv[1] || '';
      if (key === 'path') result.path = kv[1] || '';
      if (key === 'domain') result.domain = kv[1] || '';
      if (key === 'httponly') result.httpOnly = true;
      if (key === 'secure') result.secure = true;
    });
    return result;
  });
}

function handleRequest(req, res, storageObj) {
  var parsedUrl = url.parse(req.url, true);
  var pathname = parsedUrl.pathname;
  
  if (pathname === '/api/history' && req.method === 'GET') {
    var history = readStorage(storageObj, 'history', []);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ result: 'ok', data: history }));
    return;
  }
  
  if (pathname === '/api/import' && req.method === 'POST') {
    var body = '';
    req.on('data', function(chunk) { body += chunk; });
    req.on('end', function() {
      try {
        var data = JSON.parse(body);
        if (data.clear && data.history) {
          writeStorage(storageObj, 'history', data.history);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ result: 'ok' }));
          return;
        }
        var history = readStorage(storageObj, 'history', []);
        history.unshift({
          id: 'req_' + Date.now(),
          request: data.request,
          importedAt: new Date().toISOString()
        });
        if (history.length > 50) history = history.slice(0, 50);
        writeStorage(storageObj, 'history', history);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ result: 'ok', data: data.request }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ result: 'error', data: e.message }));
      }
    });
    return;
  }
  
  if (pathname === '/api/collections') {
    if (req.method === 'GET') {
      var collections = readStorage(storageObj, 'collections', { folders: [], requests: [] });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ result: 'ok', data: collections }));
    } else if (req.method === 'POST') {
      var body = '';
      req.on('data', function(chunk) { body += chunk; });
      req.on('end', function() {
        try {
          var data = JSON.parse(body);
          var collections = readStorage(storageObj, 'collections', { folders: [], requests: [] });
          
          if (data.type === 'folder') {
            collections.folders.push({
              id: 'f_' + Date.now(),
              name: data.name,
              parentId: data.parentId || null
            });
          } else if (data.type === 'request') {
            collections.requests.push({
              id: 'r_' + Date.now(),
              folderId: data.folderId,
              name: data.name,
              request: data.request
            });
          }
          
          writeStorage(storageObj, 'collections', collections);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ result: 'ok' }));
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ result: 'error', data: e.message }));
        }
      });
    }
    return;
  }
  
  if (pathname === '/api/environments') {
    if (req.method === 'GET') {
      var envs = readStorage(storageObj, 'environments', {});
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ result: 'ok', data: envs }));
    } else if (req.method === 'POST') {
      var body = '';
      req.on('data', function(chunk) { body += chunk; });
      req.on('end', function() {
        try {
          var data = JSON.parse(body);
          var envs = readStorage(storageObj, 'environments', {});
          envs[data.name] = data.variables;
          writeStorage(storageObj, 'environments', envs);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ result: 'ok' }));
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ result: 'error', data: e.message }));
        }
      });
    }
    return;
  }
  
  if (pathname === '/api/config') {
    if (req.method === 'GET') {
      var config = readStorage(storageObj, 'config', { aiProvider: 'openai', aiEndpoint: '', aiApiKey: '' });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ result: 'ok', data: config }));
    } else if (req.method === 'POST') {
      var body = '';
      req.on('data', function(chunk) { body += chunk; });
      req.on('end', function() {
        try {
          var data = JSON.parse(body);
          writeStorage(storageObj, 'config', data);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ result: 'ok' }));
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ result: 'error', data: e.message }));
        }
      });
    }
    return;
  }
  
  if (pathname === '/api/ai-mock' && req.method === 'POST') {
    var body = '';
    req.on('data', function(chunk) { body += chunk; });
    req.on('end', function() {
      try {
        var data = JSON.parse(body);
        var config = readStorage(storageObj, 'config', { aiProvider: 'openai', aiEndpoint: '', aiApiKey: '' });
        
        if (config.aiApiKey && (config.aiProvider === 'openai' || config.aiEndpoint)) {
          generateMockViaAI(data.request, data.schema, data.prompt, config, function(err, mock) {
            if (err) {
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ result: 'ok', mock: generateMockResponse(data.request, data.schema) }));
            } else {
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ result: 'ok', mock: mock }));
            }
          });
        } else {
          var mock = generateMockResponse(data.request, data.schema);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ result: 'ok', mock: mock }));
        }
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ result: 'error', data: e.message }));
      }
    });
    return;
  }
  
  if (pathname === '/api/send' && req.method === 'POST') {
    var body = '';
    req.on('data', function(chunk) { body += chunk; });
    req.on('end', function() {
      try {
        var data = JSON.parse(body);
        var request = data.request;
        var envs = readStorage(storageObj, 'environments', {});
        var envVars = envs[data.environment] || {};
        
        var method = (request.method || 'GET').toUpperCase();
        var urlStr = request.url || '';
        var headers = request.headers || {};
        var bodyContent = request.body && request.body.content ? request.body.content : null;
        
        var parsedUrl = url.parse(urlStr);
        var isHttps = parsedUrl.protocol === 'https:';
        var httpModule = isHttps ? https : http;
        
        if (bodyContent && !headers['Content-Type']) {
          headers['Content-Type'] = 'application/json';
        }
        
        var options = {
          hostname: parsedUrl.hostname,
          port: parsedUrl.port || (isHttps ? 443 : 80),
          path: parsedUrl.path,
          method: method,
          headers: headers,
          rejectUnauthorized: false
        };
        
        var startTime = Date.now();
        
        var clientReq = httpModule.request(options, function(clientRes) {
          var responseBody = '';
          var cookies = [];
          var resHeaders = {};
          
          clientRes.on('data', function(chunk) { responseBody += chunk; });
          clientRes.on('end', function() {
            for (var key in clientRes.headers) {
              resHeaders[key] = clientRes.headers[key];
              if (key.toLowerCase() === 'set-cookie') {
                cookies = clientRes.headers[key];
              }
            }
            
            var response = {
              result: 'ok',
              status: clientRes.statusCode,
              statusText: clientRes.statusMessage,
              headers: resHeaders,
              body: responseBody,
              cookies: parseCookies(cookies),
              size: Buffer.byteLength(responseBody, 'utf8'),
              time: Date.now() - startTime
            };
            
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(response));
          });
        });
        
        clientReq.on('error', function(err) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ result: 'error', data: err.message }));
        });
        
        if (bodyContent) {
          clientReq.write(bodyContent);
        }
        
        clientReq.end();
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ result: 'error', data: e.message }));
      }
    });
    return;
  }
  
  if (pathname === '/api/mock-templates') {
    if (req.method === 'GET') {
      var templates = readStorage(storageObj, 'mock_templates', []);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ result: 'ok', data: templates }));
    } else if (req.method === 'POST') {
      var body = '';
      req.on('data', function(chunk) { body += chunk; });
      req.on('end', function() {
        try {
          var data = JSON.parse(body);
          var templates = readStorage(storageObj, 'mock_templates', []);
          templates.push({
            id: 'tpl_' + Date.now(),
            name: data.name,
            mock: data.mock,
            createdAt: new Date().toISOString()
          });
          writeStorage(storageObj, 'mock_templates', templates);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ result: 'ok' }));
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ result: 'error', data: e.message }));
        }
      });
    } else if (req.method === 'DELETE') {
      var body = '';
      req.on('data', function(chunk) { body += chunk; });
      req.on('end', function() {
        try {
          var data = JSON.parse(body);
          var templates = readStorage(storageObj, 'mock_templates', []);
          templates = templates.filter(function(t) { return t.id !== data.id; });
          writeStorage(storageObj, 'mock_templates', templates);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ result: 'ok' }));
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ result: 'error', data: e.message }));
        }
      });
    }
    return;
  }
  
  if (pathname === '/api/mock-rules' && req.method === 'GET') {
    var mocks = mockManager.getMocks();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ result: 'ok', data: mocks }));
    return;
  }

  if (pathname === '/api/mock-rules' && req.method === 'POST') {
    var body = '';
    req.on('data', function(chunk) { body += chunk; });
    req.on('end', function() {
      try {
        var data = JSON.parse(body);
        var mock = mockManager.createMock(data);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ result: 'ok', data: mock }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ result: 'error', data: e.message }));
      }
    });
    return;
  }

  if (pathname.match(/^\/api\/mock-rules\/[\w-]+$/) && req.method === 'PUT') {
    var id = pathname.split('/').pop();
    var body = '';
    req.on('data', function(chunk) { body += chunk; });
    req.on('end', function() {
      try {
        var data = JSON.parse(body);
        var mock = mockManager.updateMock(id, data);
        if (mock) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ result: 'ok', data: mock }));
        } else {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ result: 'error', data: 'Mock not found' }));
        }
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ result: 'error', data: e.message }));
      }
    });
    return;
  }

  if (pathname.match(/^\/api\/mock-rules\/[\w-]+$/) && req.method === 'DELETE') {
    var id = pathname.split('/').pop();
    mockManager.deleteMock(id);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ result: 'ok' }));
    return;
  }

  if (pathname.match(/^\/api\/mock-rules\/[\w-]+\/toggle$/) && req.method === 'POST') {
    var id = pathname.split('/')[3];
    var mock = mockManager.toggleMock(id);
    if (mock) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ result: 'ok', data: mock }));
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ result: 'error', data: 'Mock not found' }));
    }
    return;
  }

  if (pathname === '/api/mock-rules' && req.method === 'DELETE') {
    mockManager.deleteAllMocks();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ result: 'ok' }));
    return;
  }

  if (pathname === '/api/rules') {
    if (req.method === 'GET') {
      var rulesData = readStorage(storageObj, 'active_rules', { rules: '', values: {}, updatedAt: null });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ result: 'ok', data: rulesData }));
    } else if (req.method === 'POST') {
      var body = '';
      req.on('data', function(chunk) { body += chunk; });
      req.on('end', function() {
        try {
          var data = JSON.parse(body);
          var rulesEntry = {
            rules: data.rules || '',
            values: data.values || {},
            name: data.name || '',
            updatedAt: new Date().toISOString()
          };
          writeStorage(storageObj, 'active_rules', rulesEntry);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ result: 'ok', rules: rulesEntry.rules, values: rulesEntry.values }));
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ result: 'error', data: e.message }));
        }
      });
    } else if (req.method === 'DELETE') {
      writeStorage(storageObj, 'active_rules', { rules: '', values: {}, updatedAt: new Date().toISOString() });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ result: 'ok' }));
    }
    return;
  }
  
  if (pathname.startsWith('/ui/')) {
    var filePath = path.join(UI_PATH, pathname.slice(4));
    if (!fs.existsSync(filePath)) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    var ext = path.extname(filePath);
    var contentType = {
      '.html': 'text/html',
      '.js': 'application/javascript',
      '.css': 'text/css',
      '.json': 'application/json'
    }[ext] || 'text/plain';
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(fs.readFileSync(filePath));
    return;
  }
  
  if (pathname === '/' || pathname === '/index.html') {
    var filePath = path.join(UI_PATH, 'index.html');
    if (fs.existsSync(filePath)) {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(fs.readFileSync(filePath));
    } else {
      res.writeHead(404);
      res.end('Not found');
    }
    return;
  }
  
  res.writeHead(404);
  res.end('Not found');
}

function createUiServer(server, options) {
  var storageObj = (options && options.storage) || storage;
  
  server.on('request', function(req, res) {
    handleRequest(req, res, storageObj);
  });
}

function createServer(whistleStorage) {
  return {
    name: PLUGIN_NAME,
    uiServer: createUiServer(whistleStorage)
  };
}

exports.default = createServer;
exports.uiServer = createUiServer;
exports.server = createServer;