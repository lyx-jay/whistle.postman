(function() {
  'use strict';

  var API_BASE = '/plugin.postman';
  var bodyEditorCm = null;
  var schemaEditorCm = null;
  var mockOutputCm = null;
  var scriptEditors = { preScript: null, tests: null };
  
  var state = {
    currentRequest: {
      method: 'GET',
      url: '',
      headers: {},
      params: {},
      body: { type: 'none', content: '' },
      auth: { type: 'none' }
    },
    environments: {},
    currentEnv: '',
    collections: { folders: [], requests: [] },
    config: {},
    history: [],
    response: null
  };

  var $ = function(selector) {
    return document.querySelector(selector);
  };

  var $$ = function(selector) {
    return document.querySelectorAll(selector);
  };

  function api(endpoint, options) {
    options = options || {};
    var method = options.method || 'GET';
    var body = options.body ? JSON.stringify(options.body) : undefined;
    
    return fetch(API_BASE + endpoint, {
      method: method,
      headers: { 'Content-Type': 'application/json' },
      body: body
    }).then(function(res) {
      return res.json();
    });
  }

  function detectFormat(input) {
    input = input.trim();
    if (input.startsWith('curl ')) {
      return 'curl';
    }
    if (input.startsWith('{') || input.startsWith('[')) {
      try {
        var obj = JSON.parse(input);
        if (obj.log && obj.log.entries) return 'har';
        return 'json';
      } catch (e) {}
    }
    if (input.includes('HTTP/1.') || input.includes('HTTP/2')) {
      return 'raw';
    }
    if (input.includes('openapi') || input.includes('swagger')) {
      return 'openapi';
    }
    return 'unknown';
  }

  function parseCurl(curlStr) {
    var request = {
      method: 'GET',
      url: '',
      headers: {},
      params: {},
      body: { type: 'none', content: '' },
      auth: { type: 'none' }
    };

    try {
      var tokens = [];
      var current = '';
      var inQuote = false;
      var inSingleQuote = false;
      
      for (var i = 0; i < curlStr.length; i++) {
        var ch = curlStr[i];
        
        if (ch === '"' && !inSingleQuote) {
          inQuote = !inQuote;
        } else if (ch === "'" && !inQuote) {
          inSingleQuote = !inSingleQuote;
        } else if ((ch === ' ' || ch === '\n' || ch === '\r' || ch === '\t') && !inQuote && !inSingleQuote) {
          if (current) {
            tokens.push(current);
            current = '';
          }
        } else {
          current += ch;
        }
      }
      if (current) tokens.push(current);

      var i = 0;
      while (i < tokens.length) {
        var token = tokens[i];
        
        if (token === '-X' || token === '--request') {
          request.method = (tokens[++i] || '').toUpperCase();
        } else if (token === '-H' || token === '--header') {
          var header = tokens[++i] || '';
          var colonIdx = header.indexOf(':');
          if (colonIdx > 0) {
            var key = header.substring(0, colonIdx).trim();
            var value = header.substring(colonIdx + 1).trim();
            request.headers[key] = value;
          }
        } else if (token === '-d' || token === '--data' || token === '--data-raw' || token === '--data-binary' || token === '--data-urlencode') {
          request.method = request.method === 'GET' ? 'POST' : request.method;
          request.body.type = 'raw';
          request.body.content = tokens[++i] || '';
          
          if (request.body.content.startsWith('{') || request.body.content.startsWith('[')) {
            request.body.type = 'json';
            if (!request.headers['Content-Type']) {
              request.headers['Content-Type'] = 'application/json';
            }
          }
        } else if (token === '-u' || token === '--user') {
          var credentials = tokens[++i] || '';
          request.headers['Authorization'] = 'Basic ' + btoa(credentials);
          request.auth = { type: 'basic', username: credentials.split(':')[0] };
        } else if (token === '-b' || token === '--cookie') {
          var cookieStr = tokens[++i] || '';
          request.headers['Cookie'] = cookieStr;
        } else if (token === '-k' || token === '--insecure') {
          // skip
        } else if (token === '-L' || token === '--location') {
          // skip
        } else if (token === '-A' || token === '--user-agent') {
          request.headers['User-Agent'] = tokens[++i] || '';
        } else if (token.startsWith('http://') || token.startsWith('https://')) {
          request.url = token;
        }
        
        i++;
      }

      if (request.url) {
        var hashIdx = request.url.indexOf('#');
        if (hashIdx > 0) request.url = request.url.substring(0, hashIdx);
        
        var queryIdx = request.url.indexOf('?');
        if (queryIdx > 0) {
          var queryStr = request.url.substring(queryIdx + 1);
          request.url = request.url.substring(0, queryIdx);
          var params = queryStr.split('&');
          for (var j = 0; j < params.length; j++) {
            var pair = params[j].split('=');
            if (pair[0]) {
              request.params[decodeURIComponent(pair[0])] = decodeURIComponent(pair[1] || '');
            }
          }
        }
      }

    } catch (e) {
      console.error('Failed to parse cURL:', e);
    }

    return request;
  }

  function parseHar(harStr) {
    var request = {
      method: 'GET',
      url: '',
      headers: {},
      params: {},
      body: { type: 'none', content: '' },
      auth: { type: 'none' }
    };

    try {
      var har = JSON.parse(harStr);
      var entry = har.log && har.log.entries && har.log.entries[0];
      if (!entry) return request;

      var req = entry.request;
      request.method = req.method;
      request.url = req.url;

      for (var i = 0; i < req.headers.length; i++) {
        request.headers[req.headers[i].name] = req.headers[i].value;
      }

      if (req.queryString) {
        for (var j = 0; j < req.queryString.length; j++) {
          request.params[req.queryString[j].name] = req.queryString[j].value;
        }
      }

      if (req.postData) {
        request.body.type = req.postData.mimeType || 'raw';
        request.body.content = req.postData.text || '';
      }

    } catch (e) {
      console.error('Failed to parse HAR:', e);
    }

    return request;
  }

  function parseRawHttp(rawStr) {
    var request = {
      method: 'GET',
      url: '',
      headers: {},
      params: {},
      body: { type: 'none', content: '' },
      auth: { type: 'none' }
    };

    try {
      var lines = rawStr.split('\n');
      var firstLine = lines[0].trim().split(' ');
      
      if (firstLine.length >= 2) {
        request.method = firstLine[0].toUpperCase();
        request.url = firstLine[1];
      }

      var bodyStartIdx = -1;
      for (var i = 1; i < lines.length; i++) {
        var line = lines[i];
        if (line.trim() === '') {
          bodyStartIdx = i + 1;
          break;
        }
        
        var colonIdx = line.indexOf(':');
        if (colonIdx > 0) {
          var key = line.substring(0, colonIdx).trim();
          var value = line.substring(colonIdx + 1).trim();
          request.headers[key] = value;
        }
      }

      if (bodyStartIdx > 0 && bodyStartIdx < lines.length) {
        request.body.content = lines.slice(bodyStartIdx).join('\n').trim();
        request.body.type = request.body.content ? 'raw' : 'none';
      }

    } catch (e) {
      console.error('Failed to parse raw HTTP:', e);
    }

    return request;
  }

  function detectAndParse(input) {
    var format = detectFormat(input);
    
    switch (format) {
      case 'curl':
        return { format: 'cURL', request: parseCurl(input) };
      case 'har':
        return { format: 'HAR', request: parseHar(input) };
      case 'raw':
        return { format: 'Raw HTTP', request: parseRawHttp(input) };
      default:
        return { format: 'Unknown', request: null };
    }
  }

  function renderKvList(containerId, data, onChange) {
    var container = $('#' + containerId);
    container.innerHTML = '';
    
    for (var key in data) {
      var row = document.createElement('div');
      row.className = 'kv-row';
      row.innerHTML = 
        '<input type="text" value="' + escapeHtml(key) + '" placeholder="Key">' +
        '<input type="text" value="' + escapeHtml(data[key]) + '" placeholder="Value">' +
        '<button class="kv-delete">×</button>';
      
      var inputs = row.querySelectorAll('input');
      inputs[0].addEventListener('change', function() {
        var oldKey = key;
        var newKey = this.value;
        var value = inputs[1].value;
        delete data[oldKey];
        data[newKey] = value;
        onChange && onChange();
      });
      inputs[1].addEventListener('change', function() {
        data[key] = this.value;
        onChange && onChange();
      });
      row.querySelector('.kv-delete').addEventListener('click', function() {
        delete data[key];
        renderKvList(containerId, data, onChange);
        onChange && onChange();
      });
      
      container.appendChild(row);
    }
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&')
      .replace(/</g, '<')
      .replace(/>/g, '>')
      .replace(/"/g, '"');
  }

  function formatJson(str) {
    try {
      return JSON.stringify(JSON.parse(str), null, 2);
    } catch (e) {
      return str;
    }
  }

  function formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function loadHistory() {
    api('/api/history').then(function(data) {
      state.history = data.data || [];
      renderHistory();
    }).catch(console.error);
  }

  function renderHistory() {
    var container = $('#recent-list');
    container.innerHTML = '';
    
    (state.history || []).slice(0, 10).forEach(function(item) {
      var el = document.createElement('div');
      el.className = 'request-item';
      var method = item.request.method || 'GET';
      var url = item.request.url || '/';
      var path = url.replace(/^https?:\/\/[^\/]+/, '');
      el.innerHTML = 
        '<span class="method-badge ' + method.toLowerCase() + '">' + method + '</span>' +
        '<span>' + (path.length > 20 ? path.substring(0, 20) + '...' : path) + '</span>' +
        '<button class="kv-delete" data-id="' + item.id + '">×</button>';
      el.addEventListener('click', function(e) {
        if (e.target.classList.contains('kv-delete')) {
          e.stopPropagation();
          deleteHistoryItem(item.id);
        } else {
          loadRequest(item.request);
        }
      });
      container.appendChild(el);
    });
  }

  function deleteHistoryItem(id) {
    var idx = -1;
    var history = state.history || [];
    for (var i = 0; i < history.length; i++) {
      if (history[i].id === id) { idx = i; break; }
    }
    if (idx === -1) return;
    
    var deletedRequest = history[idx].request;
    var isCurrentRequest = state.currentRequest.url === deletedRequest.url &&
                           state.currentRequest.method === deletedRequest.method;
    
    history.splice(idx, 1);
    state.history = history;
    
    api('/api/import', {
      method: 'POST',
      body: { request: null, clear: true, history: state.history }
    });
    
    if (isCurrentRequest) {
      if (history.length > 0) {
        var nextIdx = Math.min(idx, history.length - 1);
        loadRequest(history[nextIdx].request);
      } else {
        clearEditor();
      }
    }
    
    renderHistory();
  }

  function clearEditor() {
    state.currentRequest = {
      method: 'GET',
      url: '',
      headers: {},
      params: {},
      body: { type: 'none', content: '' },
      auth: { type: 'none' }
    };
    renderCurrentRequest();
    $$('.tab-btn[data-tab]').forEach(function(b) { b.classList.remove('active'); });
    $$('.tab-content[id^="tab-"]').forEach(function(c) { c.classList.remove('active'); });
    var paramsBtn = document.querySelector('.tab-btn[data-tab="params"]');
    var paramsTab = document.getElementById('tab-params');
    if (paramsBtn) paramsBtn.classList.add('active');
    if (paramsTab) paramsTab.classList.add('active');
  }

  function loadCollections(callback) {
    api('/api/collections').then(function(data) {
      state.collections = data.data || { folders: [], requests: [] };
      renderCollections();
      if (callback) callback();
    }).catch(console.error);
  }

  function renderCollections() {
    var container = $('#collections-tree');
    container.innerHTML = '';
    
    state.collections.folders.forEach(function(folder) {
      var folderEl = document.createElement('div');
      folderEl.className = 'folder-item';
      folderEl.innerHTML = '<span class="folder-icon">📁</span>' + escapeHtml(folder.name);
      container.appendChild(folderEl);
      
      var folderRequests = state.collections.requests.filter(function(r) {
        return r.folderId === folder.id;
      });
      
      folderRequests.forEach(function(req) {
        var reqEl = document.createElement('div');
        reqEl.className = 'request-item';
        reqEl.style.paddingLeft = '24px';
        var method = req.request.method || 'GET';
        reqEl.innerHTML = 
          '<span class="method-badge ' + method.toLowerCase() + '">' + method + '</span>' +
          '<span>' + escapeHtml(req.name) + '</span>';
        reqEl.addEventListener('click', function() {
          loadRequest(req.request);
        });
        container.appendChild(reqEl);
      });
    });
  }

  function loadEnvironments() {
    api('/api/environments').then(function(data) {
      state.environments = data.data || {};
      renderEnvironmentSelect();
    }).catch(console.error);
  }

  function renderEnvironmentSelect() {
    var select = $('#environment-select');
    select.innerHTML = '<option value="">No Environment</option>';
    
    for (var name in state.environments) {
      var opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      select.appendChild(opt);
    }
    
    select.value = state.currentEnv;
  }

  function loadConfig() {
    api('/api/config').then(function(data) {
      state.config = data.data || {};
      renderSettings();
    }).catch(console.error);
  }

  function loadRequest(req) {
    state.currentRequest = JSON.parse(JSON.stringify(req));
    renderCurrentRequest();
    switchToAppropriateTab();
  }

  function switchToAppropriateTab() {
    var req = state.currentRequest;
    var method = (req.method || 'GET').toUpperCase();
    var bodyType = req.body ? req.body.type : 'none';
    
    var targetTab = 'params';
    
    if (method === 'GET' || method === 'DELETE' || method === 'HEAD') {
      targetTab = 'params';
    } else if (bodyType === 'json' || bodyType === 'raw' || bodyType === 'form-data') {
      targetTab = 'body';
    } else if (req.params && Object.keys(req.params).length > 0) {
      targetTab = 'params';
    } else if (req.headers && Object.keys(req.headers).length > 0) {
      targetTab = 'headers';
    }
    
    $$('.tab-btn[data-tab]').forEach(function(b) { b.classList.remove('active'); });
    $$('.tab-content[id^="tab-"]').forEach(function(c) { c.classList.remove('active'); });
    
    var tabBtn = document.querySelector('.tab-btn[data-tab="' + targetTab + '"]');
    var tabContent = document.getElementById('tab-' + targetTab);
    if (tabBtn) tabBtn.classList.add('active');
    if (tabContent) tabContent.classList.add('active');
  }

  function renderCurrentRequest() {
    var req = state.currentRequest;
    
    $('#method-select').value = req.method;
    $('#url-input').value = req.url;
    
    renderKvList('params-list', req.params || {}, function() {
      updateRequestFromUI();
    });
    
    renderKvList('headers-list', req.headers || {}, function() {
      updateRequestFromUI();
    });
    
    $('#body-type-select').value = req.body ? req.body.type : 'none';
    renderBodyEditor();
    var content = req.body ? req.body.content : '';
    if (bodyEditorCm) {
      bodyEditorCm.setValue(content);
      bodyEditorCm.refresh();
    }
    
    $('#auth-type-select').value = req.auth ? req.auth.type : 'none';
    renderAuthConfig();
  }

  function renderBodyEditor() {
    var bodyType = $('#body-type-select').value;
    var jsonEditor = $('#body-json-editor');
    var formDataEditor = $('#body-form-data-editor');
    var formatBtn = $('#format-json-btn');
    
    jsonEditor.style.display = bodyType === 'json' ? 'block' : 'none';
    var rawEditor = document.getElementById('body-editor');
    rawEditor.style.display = bodyType === 'raw' ? 'block' : 'none';
    formDataEditor.style.display = bodyType === 'form-data' ? 'block' : 'none';
    formatBtn.style.display = bodyType === 'json' ? 'inline-block' : 'none';
    
    if (bodyType === 'json') {
      if (!bodyEditorCm) {
        bodyEditorCm = CodeMirror.fromTextArea($('#body-editor-cm'), {
          mode: { name: 'javascript', json: true },
          theme: 'atom-one-dark',
          lineNumbers: true,
          matchBrackets: true,
          autoCloseBrackets: true,
          indentUnit: 2,
          tabSize: 2,
          indentWithTabs: false,
          lineWrapping: true,
          extraKeys: {
            'Ctrl-Space': 'autocomplete'
          }
        });
        bodyEditorCm.on('change', function() {
          state.currentRequest.body.content = bodyEditorCm.getValue();
        });
      }
      setTimeout(function() {
        bodyEditorCm.refresh();
      }, 50);
    }
    
    if (bodyType === 'form-data') {
      var formData = state.currentRequest.body && state.currentRequest.body.formData ? state.currentRequest.body.formData : {};
      renderKvList('body-form-data-list', formData, function() {
        state.currentRequest.body.formData = formData;
      });
    }
  }

  function formatJsonBody() {
    if (!bodyEditorCm) return;
    try {
      var parsed = JSON.parse(bodyEditorCm.getValue());
      bodyEditorCm.setValue(JSON.stringify(parsed, null, 2));
    } catch (e) {
      alert('Invalid JSON: ' + e.message);
    }
  }

  function updateRequestFromUI() {
    state.currentRequest.method = $('#method-select').value;
    state.currentRequest.url = $('#url-input').value;
    var bodyType = $('#body-type-select').value;
    var bodyContent = '';
    if (bodyType === 'json' && bodyEditorCm) {
      bodyContent = bodyEditorCm.getValue();
    } else if (bodyType === 'raw') {
      var rawEditor = document.getElementById('body-editor');
      bodyContent = rawEditor ? rawEditor.value : '';
    }
    state.currentRequest.body = {
      type: bodyType,
      content: bodyContent
    };
    state.currentRequest.auth = {
      type: $('#auth-type-select').value
    };
  }

  function renderAuthConfig() {
    var container = $('#auth-config');
    var authType = $('#auth-type-select').value;
    
    container.innerHTML = '';
    
    if (authType === 'bearer') {
      container.innerHTML = 
        '<div class="form-group">' +
          '<label>Token:</label>' +
          '<input type="text" id="auth-token" class="text-input" placeholder="Enter token">' +
        '</div>';
    } else if (authType === 'basic') {
      container.innerHTML = 
        '<div class="form-group">' +
          '<label>Username:</label>' +
          '<input type="text" id="auth-username" class="text-input">' +
        '</div>' +
        '<div class="form-group">' +
          '<label>Password:</label>' +
          '<input type="password" id="auth-password" class="text-input">' +
        '</div>';
    } else if (authType === 'apikey') {
      container.innerHTML = 
        '<div class="form-group">' +
          '<label>Key:</label>' +
          '<input type="text" id="auth-key-name" class="text-input" placeholder="X-API-Key">' +
        '</div>' +
        '<div class="form-group">' +
          '<label>Value:</label>' +
          '<input type="text" id="auth-key-value" class="text-input">' +
        '</div>' +
        '<div class="form-group">' +
          '<label>Add to:</label>' +
          '<select id="auth-key-location" class="text-input">' +
            '<option value="header">Header</option>' +
            '<option value="query">Query Param</option>' +
          '</select>' +
        '</div>';
    }
  }

  function renderSettings() {
    $('#ai-provider-select').value = state.config.aiProvider || 'openai';
    $('#ai-endpoint-input').value = state.config.aiEndpoint || '';
    $('#ai-apikey-input').value = state.config.aiApiKey || '';
    $('#ai-model-input').value = state.config.aiModel || 'gpt-4o-mini';
    
    renderEnvEditor();
  }

  function renderEnvEditor() {
    var container = $('#env-editor');
    container.innerHTML = '';

    for (var name in state.environments) {
      var envItem = document.createElement('div');
      envItem.className = 'env-item';
      envItem.innerHTML =
        '<input type="text" value="' + escapeHtml(name) + '" placeholder="Env name" class="env-name-input">' +
        '<input type="text" value="" placeholder="key=value, key2=value2" class="env-vars-input">' +
        '<button class="kv-delete">×</button>';

      var vars = state.environments[name];
      var varsStr = [];
      for (var k in vars) {
        varsStr.push(k + '=' + vars[k]);
      }
      envItem.querySelector('.env-vars-input').value = varsStr.join(', ');

      envItem.querySelector('.kv-delete').addEventListener('click', function() {
        container.removeChild(envItem);
      });

      container.appendChild(envItem);
    }
  }

  function sendRequest() {
    var req = JSON.parse(JSON.stringify(state.currentRequest));
    var envName = $('#environment-select').value;

    var filteredHeaders = {};
    for (var key in (req.headers || {})) {
      if (key.trim()) {
        filteredHeaders[key] = req.headers[key];
      }
    }
    req.headers = filteredHeaders;

    var sendBtn = $('#send-btn');
    sendBtn.innerHTML = '<span class="spinner"></span>';
    sendBtn.classList.add('loading');

    api('/api/send', {
      method: 'POST',
      body: {
        request: req,
        environment: envName
      }
    }).then(function(data) {
      state.response = data;
      renderResponse();
    }).catch(function(err) {
      state.response = { error: err.message };
      renderResponse();
    }).finally(function() {
      sendBtn.innerHTML = 'Send';
      sendBtn.classList.remove('loading');
    });
  }

  function renderResponse() {
    var res = state.response;
    if (!res) return;
    
    if (res.error) {
      $('#response-status').textContent = 'Error';
      $('#response-status').className = 'response-status error';
      $('#response-body').textContent = res.error;
      $('#response-time').textContent = '';
      $('#response-size').textContent = '';
      return;
    }
    
    $('#response-status').textContent = (res.status || 200) + ' ' + (res.statusText || 'OK');
    $('#response-status').className = 'response-status ' + ((res.status || 200) >= 400 ? 'error' : '');
    $('#response-time').textContent = (res.time || 0) + 'ms';
    $('#response-size').textContent = formatSize(res.size || 0);
    
    renderResponseBody(res.body || '');
    $('#response-headers').textContent = res.headers ? JSON.stringify(res.headers, null, 2) : '';
    $('#response-cookies').textContent = res.cookies ? JSON.stringify(res.cookies, null, 2) : '';
  }

  function renderResponseBody(body) {
    var container = $('#response-body');
    container.innerHTML = '';
    
    var pre = document.createElement('pre');
    pre.className = 'hljs';
    pre.style.background = 'transparent';
    pre.style.padding = '0';
    pre.style.margin = '0';
    
    try {
      var parsed = JSON.parse(body);
      var formatted = JSON.stringify(parsed, null, 2);
      pre.textContent = formatted;
    } catch (e) {
      pre.textContent = body;
    }
    
    container.appendChild(pre);
    
    try {
      hljs.highlightElement(pre);
    } catch (e) {}
  }

  function copyResponse() {
    var bodyEl = $('#response-body');
    var text = bodyEl.textContent || bodyEl.innerText;
    if (!text) return;
    
    navigator.clipboard.writeText(text).then(function() {
      var btn = $('#copy-response-btn');
      var orig = btn.textContent;
      btn.textContent = '✓';
      setTimeout(function() { btn.textContent = orig; }, 1500);
    });
  }

  function searchResponse(direction) {
    var query = $('#response-search-input').value;
    var container = $('#response-body');
    var pre = container.querySelector('pre');
    var countEl = $('#search-match-count');

    if (!query) {
      countEl.textContent = '';
      clearSearchHighlights();
      return;
    }

    var marks = pre ? pre.querySelectorAll('mark') : [];

    if (marks.length === 0) {
      doSearchHighlight(query);
      pre = container.querySelector('pre');
      marks = pre ? pre.querySelectorAll('mark') : [];
    }

    if (marks.length === 0) {
      countEl.textContent = 'No matches';
      return;
    }

    var currentIdx = -1;
    for (var i = 0; i < marks.length; i++) {
      if (marks[i].classList.contains('current-match')) {
        currentIdx = i;
        marks[i].classList.remove('current-match');
        break;
      }
    }

    var nextIdx;
    if (currentIdx === -1) {
      nextIdx = direction === 'prev' ? marks.length - 1 : 0;
    } else {
      nextIdx = direction === 'prev'
        ? (currentIdx - 1 + marks.length) % marks.length
        : (currentIdx + 1) % marks.length;
    }

    marks[nextIdx].classList.add('current-match');
    marks[nextIdx].scrollIntoView({ behavior: 'smooth', block: 'center' });

    countEl.textContent = (nextIdx + 1) + '/' + marks.length;
  }

  function doSearchHighlight(query) {
    var container = $('#response-body');
    var pre = container.querySelector('pre');
    if (!pre) return;

    clearSearchHighlights();

    var text = pre.textContent || '';
    var regex = new RegExp(escapeRegex(query), 'gi');
    var html = text.replace(regex, function(match) {
      return '<mark>' + match + '</mark>';
    });

    pre.innerHTML = html;
  }

  function clearSearchHighlights() {
    var container = $('#response-body');
    var pre = container.querySelector('pre');
    if (!pre) return;

    var marks = pre.querySelectorAll('mark');
    marks.forEach(function(m) {
      var parent = m.parentNode;
      parent.replaceChild(document.createTextNode(m.textContent), m);
      parent.normalize();
    });
  }

  function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function copyAsCurl() {
    var req = state.currentRequest;
    var parts = ['curl'];
    
    if (req.method && req.method !== 'GET') {
      parts.push("-X " + req.method);
    }
    
    var url = req.url || '';
    if (req.params && Object.keys(req.params).length > 0) {
      var params = [];
      for (var k in req.params) {
        params.push(encodeURIComponent(k) + '=' + encodeURIComponent(req.params[k]));
      }
      url += (url.indexOf('?') > 0 ? '&' : '?') + params.join('&');
    }
    parts.push("'" + url + "'");
    
    var headers = req.headers || {};
    for (var h in headers) {
      parts.push("-H '" + h + ': ' + headers[h] + "'");
    }
    
    if (req.body && req.body.content) {
      parts.push("--data-raw '" + req.body.content + "'");
    }
    
    var curlCmd = parts.join(' \\\n  ');
    
    navigator.clipboard.writeText(curlCmd).then(function() {
      var btn = $('#copy-curl-btn');
      var orig = btn.textContent;
      btn.textContent = '✓ Copied!';
      setTimeout(function() { btn.textContent = orig; }, 1500);
    });
  }

  function generateMock() {
    var schema = null;
    if (schemaEditorCm) {
      var schemaVal = schemaEditorCm.getValue().trim();
      if (schemaVal) {
        try {
          schema = JSON.parse(schemaVal);
        } catch (e) {
          alert('Invalid JSON schema');
          return;
        }
      }
    }
    
    var prompt = $('#prompt-input').value.trim();
    
    var btn = $('#generate-mock-btn');
    btn.innerHTML = '<span class="spinner"></span>';
    
    api('/api/ai-mock', {
      method: 'POST',
      body: {
        request: state.currentRequest,
        schema: schema,
        prompt: prompt
      }
    }).then(function(data) {
      var formatted = JSON.stringify(data.mock, null, 2);
      if (mockOutputCm) {
        mockOutputCm.setValue(formatted);
        mockOutputCm.setOption('readOnly', true);
        mockOutputCm.refresh();
      }
      showMockFeedback(true, 'AI Mock generated successfully');
    }).catch(function(err) {
      if (mockOutputCm) {
        mockOutputCm.setValue('Error: ' + err.message);
        mockOutputCm.setOption('readOnly', true);
        mockOutputCm.refresh();
      }
      showMockFeedback(false, err.message);
    }).finally(function() {
      btn.textContent = 'Generate';
    });
  }

  function showMockFeedback(success, message) {
    var btn = $('#generate-mock-btn');
    btn.textContent = success ? '✓ Success' : '✗ Failed';
    btn.style.background = success ? '#49cc18' : '#f93e3e';
    
    setTimeout(function() {
      btn.textContent = 'Generate';
      btn.style.background = '';
    }, 2000);
  }

  function importRequest(input) {
    var result = detectAndParse(input);
    
    if (result.request) {
      state.currentRequest = result.request;
      renderCurrentRequest();
      switchToAppropriateTab();
      api('/api/import', {
        method: 'POST',
        body: { request: result.request }
      }).then(function() {
        loadHistory();
      });
      
      closeModal('import-modal');
    }
  }

  function saveToCollection() {
    var name = $('#save-name-input').value || 'Untitled';
    var folderId = $('#save-folder-select').value;
    
    if (!folderId) {
      alert('Please select a folder');
      return;
    }
    
    api('/api/collections', {
      method: 'POST',
      body: {
        type: 'request',
        name: name,
        folderId: folderId,
        request: state.currentRequest
      }
    }).then(function() {
      loadCollections();
      closeModal('save-modal');
    }).catch(alert);
  }

  function renderSaveFolderDropdown() {
    var list = $('#save-folder-list');
    var display = $('#save-folder-display-text');
    var hiddenInput = $('#save-folder-select');
    list.innerHTML = '';
    
    var folders = state.collections.folders || [];
    if (folders.length === 0) {
      var emptyItem = document.createElement('div');
      emptyItem.className = 'folder-list-item';
      emptyItem.textContent = 'No folders yet';
      emptyItem.style.color = 'var(--text-muted)';
      emptyItem.style.cursor = 'default';
      list.appendChild(emptyItem);
      display.textContent = 'No folders';
      return;
    }
    
    folders.forEach(function(folder) {
      var item = document.createElement('div');
      item.className = 'folder-list-item';
      if (folder.id === hiddenInput.value) {
        item.classList.add('selected');
        display.textContent = folder.name;
      }
      item.innerHTML = '<span class="folder-icon">📁</span><span>' + escapeHtml(folder.name) + '</span>';
      item.addEventListener('click', function(e) {
        e.stopPropagation();
        hiddenInput.value = folder.id;
        display.textContent = folder.name;
        list.classList.add('hidden');
        $('#save-folder-dropdown').classList.remove('open');
        
        list.querySelectorAll('.folder-list-item').forEach(function(i) {
          i.classList.remove('selected');
        });
        item.classList.add('selected');
      });
      list.appendChild(item);
    });
    
    if (!hiddenInput.value) {
      display.textContent = 'Select a folder';
    }
  }

  function saveConfig() {
    var config = {
      aiProvider: $('#ai-provider-select').value,
      aiEndpoint: $('#ai-endpoint-input').value,
      aiApiKey: $('#ai-apikey-input').value,
      aiModel: $('#ai-model-input').value || 'gpt-4o-mini'
    };
    
    api('/api/config', {
      method: 'POST',
      body: config
    }).then(function() {
      state.config = config;
      closeModal('settings-modal');
    }).catch(alert);
  }

  function loadMockTemplates() {
    api('/api/mock-templates').then(function(data) {
      state.mockTemplates = data.data || [];
      renderMockTemplates();
    }).catch(console.error);
  }

  function renderMockTemplates() {
    var container = $('#mock-templates-list');
    if (!container) return;
    container.innerHTML = '';
    
    (state.mockTemplates || []).forEach(function(tpl) {
      var item = document.createElement('div');
      item.className = 'mock-template-item';
      item.innerHTML = 
        '<span>' + escapeHtml(tpl.name) + '</span>' +
        '<button class="kv-delete" data-id="' + tpl.id + '">×</button>';
      item.querySelector('.kv-delete').addEventListener('click', function() {
        deleteMockTemplate(tpl.id);
      });
      container.appendChild(item);
    });
  }

  function deleteMockTemplate(id) {
    api('/api/mock-templates', {
      method: 'DELETE',
      body: { id: id }
    }).then(function() {
      loadMockTemplates();
    }).catch(alert);
  }

  function saveCurrentMockAsTemplate() {
    var mockContent = mockOutputCm ? mockOutputCm.getValue().trim() : '';
    if (!mockContent) {
      alert('No mock generated yet');
      return;
    }

    var name = prompt('Enter template name:');
    if (!name) return;

    try {
      var mock = JSON.parse(mockContent);
      api('/api/mock-templates', {
        method: 'POST',
        body: { name: name, mock: mock }
      }).then(function() {
        loadMockTemplates();
      }).catch(alert);
    } catch (e) {
      alert('Invalid mock JSON');
    }
  }

  function applyMockTemplate(tpl) {
    if (mockOutputCm) {
      mockOutputCm.setValue(formatJson(JSON.stringify(tpl.mock)));
      mockOutputCm.refresh();
    }
  }

  function batchSaveRequests() {
    if (state.history.length === 0) {
      alert('No requests to save');
      return;
    }
    
    var folderId = prompt('Enter folder ID to save all requests:');
    if (!folderId) return;
    
    var promises = state.history.map(function(item) {
      return api('/api/collections', {
        method: 'POST',
        body: {
          type: 'request',
          name: (item.request.url || 'untitled').split('/').pop(),
          folderId: folderId,
          request: item.request
        }
      });
    });
    
    Promise.all(promises).then(function() {
      alert('Saved ' + state.history.length + ' requests');
      loadCollections();
    }).catch(function(err) {
      alert('Error: ' + err.message);
    });
  }

  function saveEnvironments() {
    var envInputs = $$('#env-editor .env-item');
    var newEnvs = {};
    
    envInputs.forEach(function(item) {
      var name = item.querySelector('.env-name-input').value.trim();
      if (!name) return;
      
      var varsStr = item.querySelector('.env-vars-input').value;
      var vars = {};
      varsStr.split(',').forEach(function(pair) {
        pair = pair.trim();
        var idx = pair.indexOf('=');
        if (idx > 0) {
          vars[pair.substring(0, idx).trim()] = pair.substring(idx + 1).trim();
        }
      });
      newEnvs[name] = vars;
    });
    
    for (var name in newEnvs) {
      api('/api/environments', {
        method: 'POST',
        body: { name: name, variables: newEnvs[name] }
      });
    }
    
    setTimeout(function() {
      loadEnvironments();
    }, 500);
  }

  function openModal(id) {
    $('#' + id).classList.remove('hidden');
  }

  function closeModal(id) {
    $('#' + id).classList.add('hidden');
  }

  function initEventListeners() {
    $('#import-btn').addEventListener('click', function() {
      openModal('import-modal');
    });

    $('#import-confirm-btn').addEventListener('click', function() {
      importRequest($('#import-input').value);
    });

    $('#import-input').addEventListener('input', function() {
      var format = detectFormat(this.value);
      $('#detected-format').textContent = format;
    });

    initResponseResize();

    $('#send-btn').addEventListener('click', sendRequest);

    $('#method-select').addEventListener('change', updateRequestFromUI);
    $('#url-input').addEventListener('change', updateRequestFromUI);
    $('#body-type-select').addEventListener('change', function() {
      updateRequestFromUI();
      renderBodyEditor();
    });
    $('#auth-type-select').addEventListener('change', function() {
      updateRequestFromUI();
      renderAuthConfig();
    });

    $('#format-json-btn').addEventListener('click', formatJsonBody);

    $('#copy-curl-btn').addEventListener('click', copyAsCurl);

    $('#copy-response-btn').addEventListener('click', copyResponse);

    var searchInput = $('#response-search-input');
    var searchTimeout;
    searchInput.addEventListener('input', function() {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(function() { searchResponse('next'); }, 300);
    });
    searchInput.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        searchResponse(e.shiftKey ? 'prev' : 'next');
      }
      if (e.key === 'Escape') {
        this.value = '';
        clearSearchHighlights();
        $('#search-match-count').textContent = '';
        this.blur();
      }
    });

    $('#search-prev-btn').addEventListener('click', function() { searchResponse('prev'); });
    $('#search-next-btn').addEventListener('click', function() { searchResponse('next'); });

    $('#generate-mock-btn').addEventListener('click', generateMock);

    $('#copy-mock-btn').addEventListener('click', function() {
      var text = mockOutputCm ? mockOutputCm.getValue() : '';
      if (text) navigator.clipboard.writeText(text);
    });

    $('#save-btn').addEventListener('click', function() {
      loadCollections(function() {
        renderSaveFolderDropdown();
        openModal('save-modal');
      });
    });

    $('#save-confirm-btn').addEventListener('click', saveToCollection);

    $('#new-folder-in-save').addEventListener('click', function() {
      var inline = $('#save-new-folder-inline');
      inline.classList.toggle('hidden');
      if (!inline.classList.contains('hidden')) {
        $('#save-new-folder-input').focus();
      }
    });

    $('#save-new-folder-confirm').addEventListener('click', function() {
      var folderName = $('#save-new-folder-input').value.trim();
      if (!folderName) return;
      
      api('/api/collections', {
        method: 'POST',
        body: { type: 'folder', name: folderName, parentId: null }
      }).then(function() {
        $('#save-new-folder-input').value = '';
        $('#save-new-folder-inline').classList.add('hidden');
        loadCollections(function() {
          renderSaveFolderDropdown();
        });
      }).catch(alert);
    });

    $('#save-new-folder-cancel').addEventListener('click', function() {
      $('#save-new-folder-input').value = '';
      $('#save-new-folder-inline').classList.add('hidden');
    });

    $('#save-new-folder-input').addEventListener('keydown', function(e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        $('#save-new-folder-confirm').click();
      }
      if (e.key === 'Escape') {
        $('#save-new-folder-cancel').click();
      }
    });

    $('#save-folder-display').addEventListener('click', function(e) {
      e.stopPropagation();
      var list = $('#save-folder-list');
      var dropdown = $('#save-folder-dropdown');
      var isHidden = list.classList.contains('hidden');
      
      if (isHidden) {
        var rect = this.getBoundingClientRect();
        list.style.top = (rect.bottom + 4) + 'px';
        list.style.left = rect.left + 'px';
        list.style.width = rect.width + 'px';
        list.classList.remove('hidden');
        dropdown.classList.add('open');
      } else {
        list.classList.add('hidden');
        dropdown.classList.remove('open');
      }
    });

    document.addEventListener('click', function(e) {
      var dropdown = $('#save-folder-dropdown');
      if (dropdown && !dropdown.contains(e.target)) {
        $('#save-folder-list').classList.add('hidden');
        $('#save-folder-dropdown').classList.remove('open');
      }
    });

    $('#settings-btn').addEventListener('click', function() {
      loadConfig();
      loadMockTemplates();
      openModal('settings-modal');
    });

    $('#settings-save-btn').addEventListener('click', function() {
      saveConfig();
      saveEnvironments();
    });

    $('#add-env-btn').addEventListener('click', function() {
      var container = $('#env-editor');
      var envItem = document.createElement('div');
      envItem.className = 'env-item';
      envItem.innerHTML =
        '<input type="text" value="" placeholder="Env name" class="env-name-input">' +
        '<input type="text" value="" placeholder="key=value, key2=value2" class="env-vars-input">' +
        '<button class="kv-delete">×</button>';
      envItem.querySelector('.kv-delete').addEventListener('click', function() {
        container.removeChild(envItem);
      });
      container.appendChild(envItem);
    });

    $('#add-mock-template-btn').addEventListener('click', saveCurrentMockAsTemplate);

    $('#save-all-btn').addEventListener('click', batchSaveRequests);

    $('#new-folder-btn').addEventListener('click', function() {
      var inline = $('#new-folder-inline');
      inline.classList.toggle('hidden');
      if (!inline.classList.contains('hidden')) {
        $('#new-folder-input').focus();
      }
    });

    $('#new-folder-confirm').addEventListener('click', function() {
      var folderName = $('#new-folder-input').value.trim();
      if (!folderName) return;
      
      api('/api/collections', {
        method: 'POST',
        body: { type: 'folder', name: folderName, parentId: null }
      }).then(function() {
        $('#new-folder-input').value = '';
        $('#new-folder-inline').classList.add('hidden');
        loadCollections();
      }).catch(alert);
    });

    $('#new-folder-cancel').addEventListener('click', function() {
      $('#new-folder-input').value = '';
      $('#new-folder-inline').classList.add('hidden');
    });

    $('#new-folder-input').addEventListener('keydown', function(e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        $('#new-folder-confirm').click();
      }
      if (e.key === 'Escape') {
        $('#new-folder-cancel').click();
      }
    });

    $$('.close-modal').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var modal = this.closest('.modal');
        if (modal) closeModal(modal.id);
      });
    });

    $$('.modal').forEach(function(modal) {
      modal.addEventListener('click', function(e) {
        if (e.target === modal) closeModal(modal.id);
      });
    });

    $$('.tab-btn[data-tab]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var tab = this.dataset.tab;
        
        $$('.tab-btn[data-tab]').forEach(function(b) { b.classList.remove('active'); });
        $$('.tab-content').forEach(function(c) { c.classList.remove('active'); });
        
        this.classList.add('active');
        $('#tab-' + tab).classList.add('active');
        
        if (tab === 'ai-mock') {
          setTimeout(function() {
            if (schemaEditorCm) schemaEditorCm.refresh();
            if (mockOutputCm) mockOutputCm.refresh();
          }, 50);
        }
        if (tab === 'pre-script' || tab === 'tests') {
          setTimeout(function() {
            if (scriptEditors.preScript) scriptEditors.preScript.refresh();
            if (scriptEditors.tests) scriptEditors.tests.refresh();
          }, 50);
        }
      });
    });

    $$('.tab-btn[data-res-tab]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var tab = this.dataset.resTab;
        
        $$('.tab-btn[data-res-tab]').forEach(function(b) { b.classList.remove('active'); });
        $$('.tab-content[id^="res-tab-"]').forEach(function(c) { c.classList.remove('active'); });
        
        this.classList.add('active');
        $('#res-tab-' + tab).classList.add('active');
      });
    });

    $$('.snippet-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var snippet = this.dataset.snippet;
        var activeTab = document.querySelector('.tab-btn[data-tab].active');
        if (activeTab) {
          var tab = activeTab.dataset.tab;
          if (tab === 'pre-script' && scriptEditors.preScript) {
            scriptEditors.preScript.replaceSelection(snippet);
          } else if (tab === 'tests' && scriptEditors.tests) {
            scriptEditors.tests.replaceSelection(snippet);
          }
        }
      });
    });

    $$('.add-row-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var target = this.dataset.target;
        var data = target === 'params' ? state.currentRequest.params : state.currentRequest.headers;
        data[''] = '';
        renderKvList(target + '-list', data, updateRequestFromUI);
      });
    });

    document.addEventListener('keydown', function(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        if (!$('.modal:not(.hidden)')) {
          $('#save-btn').click();
        }
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        sendRequest();
      }
    });
  }

  function initResponseResize() {
    var section = document.querySelector('.response-section');
    var handle = document.querySelector('.response-resize-handle');
    if (!section || !handle) return;
    
    var startY, startHeight;
    
    handle.addEventListener('mousedown', function(e) {
      e.preventDefault();
      startY = e.clientY;
      startHeight = section.offsetHeight;
      
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });
    
    function onMouseMove(e) {
      var delta = startY - e.clientY;
      var newHeight = Math.max(120, startHeight + delta);
      section.style.height = newHeight + 'px';
    }
    
    function onMouseUp() {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    }
  }

  function initAiMockEditors() {
    if (!schemaEditorCm) {
      schemaEditorCm = CodeMirror.fromTextArea($('#schema-input'), {
        mode: { name: 'javascript', json: true },
        theme: 'atom-one-dark',
        lineNumbers: true,
        matchBrackets: true,
        autoCloseBrackets: true,
        indentUnit: 2,
        tabSize: 2,
        lineWrapping: true
      });
    }
    if (!mockOutputCm) {
      mockOutputCm = CodeMirror.fromTextArea($('#mock-output-cm'), {
        mode: { name: 'javascript', json: true },
        theme: 'atom-one-dark',
        lineNumbers: true,
        matchBrackets: true,
        indentUnit: 2,
        tabSize: 2,
        lineWrapping: true,
        readOnly: true
      });
    }
    setTimeout(function() {
      if (schemaEditorCm) schemaEditorCm.refresh();
      if (mockOutputCm) mockOutputCm.refresh();
    }, 100);
  }

  function initScriptEditors() {
    if (!scriptEditors.preScript) {
      scriptEditors.preScript = CodeMirror.fromTextArea($('#pre-script-editor'), {
        mode: { name: 'javascript' },
        theme: 'atom-one-dark',
        lineNumbers: true,
        matchBrackets: true,
        autoCloseBrackets: true,
        indentUnit: 2,
        tabSize: 2,
        lineWrapping: true
      });
    }
    if (!scriptEditors.tests) {
      scriptEditors.tests = CodeMirror.fromTextArea($('#tests-editor'), {
        mode: { name: 'javascript' },
        theme: 'atom-one-dark',
        lineNumbers: true,
        matchBrackets: true,
        autoCloseBrackets: true,
        indentUnit: 2,
        tabSize: 2,
        lineWrapping: true
      });
    }
    setTimeout(function() {
      if (scriptEditors.preScript) scriptEditors.preScript.refresh();
      if (scriptEditors.tests) scriptEditors.tests.refresh();
    }, 100);
  }

  function init() {
    initEventListeners();
    initAiMockEditors();
    initScriptEditors();
    loadHistory();
    loadCollections();
    loadEnvironments();
    loadMockTemplates();
    renderCurrentRequest();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();