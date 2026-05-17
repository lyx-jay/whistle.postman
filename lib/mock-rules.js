var ValuesStore = require('./values-store');

function MockRulesManager(valuesDir) {
  this.values = new ValuesStore(valuesDir);
  this.MOCK_PREFIX = 'mock-';
  this.META_KEY = 'mock-meta';
}

MockRulesManager.prototype._generateId = function() {
  return this.MOCK_PREFIX + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
};

MockRulesManager.prototype.getMocks = function() {
  var metaJson = this.values.get(this.META_KEY);
  try {
    return metaJson ? JSON.parse(metaJson) : [];
  } catch (e) {
    return [];
  }
};

MockRulesManager.prototype._saveMocks = function(mocks) {
  this.values.set(this.META_KEY, JSON.stringify(mocks));
};

MockRulesManager.prototype.createMock = function(options) {
  var id = this._generateId();
  var ruleType = options.ruleType || 'mock';
  
  var mock = {
    id: id,
    name: options.name || (ruleType.charAt(0).toUpperCase() + ruleType.slice(1)) + ' ' + (options.method || 'GET') + ' ' + options.urlPath,
    url: options.url,
    urlPath: options.urlPath,
    method: options.method || 'GET',
    ruleType: ruleType,
    statusCode: options.statusCode || 200,
    headers: options.headers || { 'Content-Type': 'application/json' },
    responseBody: options.responseBody || '{}',
    ruleContent: options.ruleContent || '',
    enabled: true,
    createdAt: new Date().toISOString()
  };

  // Store the response body in Values (only for mock type)
  if (ruleType === 'mock') {
    this.values.set(id, mock.responseBody);
  }

  var mocks = this.getMocks();
  mocks.push(mock);
  this._saveMocks(mocks);

  return mock;
};

MockRulesManager.prototype.deleteMock = function(id) {
  this.values.delete(id);
  var mocks = this.getMocks();
  mocks = mocks.filter(function(m) { return m.id !== id; });
  this._saveMocks(mocks);
  return true;
};

MockRulesManager.prototype.toggleMock = function(id) {
  var mocks = this.getMocks();
  for (var i = 0; i < mocks.length; i++) {
    if (mocks[i].id === id) {
      mocks[i].enabled = !mocks[i].enabled;
      this._saveMocks(mocks);
      return mocks[i];
    }
  }
  return null;
};

MockRulesManager.prototype.updateMock = function(id, updates) {
  var mocks = this.getMocks();
  for (var i = 0; i < mocks.length; i++) {
    if (mocks[i].id === id) {
      if (updates.responseBody !== undefined) {
        mocks[i].responseBody = updates.responseBody;
        if (mocks[i].ruleType === 'mock') {
          this.values.set(id, updates.responseBody);
        }
      }
      if (updates.name !== undefined) {
        mocks[i].name = updates.name;
      }
      if (updates.enabled !== undefined) {
        mocks[i].enabled = updates.enabled;
      }
      if (updates.ruleType !== undefined) {
        mocks[i].ruleType = updates.ruleType;
      }
      if (updates.ruleContent !== undefined) {
        mocks[i].ruleContent = updates.ruleContent;
      }
      this._saveMocks(mocks);
      return mocks[i];
    }
  }
  return null;
};

MockRulesManager.prototype.generateRules = function() {
  var mocks = this.getMocks();
  var rules = [];
  var values = {};

  mocks.forEach(function(mock) {
    if (!mock.enabled) return;

    var pattern = mock.urlPath || mock.url;
    var rule = '';

    switch (mock.ruleType) {
      case 'redirect':
        // Redirect: pattern redirectUrl
        rule = pattern + ' ' + mock.ruleContent;
        break;
      case 'delay':
        // Delay: pattern resDelay://ms
        rule = pattern + ' resDelay://' + mock.ruleContent;
        break;
      case 'throttle':
        // Throttle: pattern resSpeed://kbps
        rule = pattern + ' resSpeed://' + mock.ruleContent;
        break;
      case 'mock':
      default:
        // Mock: pattern resBody://{value-id}
        rule = pattern + ' resBody://{' + mock.id + '}';
        if (mock.statusCode && mock.statusCode !== 200) {
          rule += ' statusCode://' + mock.statusCode;
        }
        values[mock.id] = mock.responseBody;
        break;
    }

    if (rule) {
      rules.push(rule);
    }
  });

  return {
    rules: rules.join('\n'),
    values: values
  };
};

MockRulesManager.prototype.getMock = function(id) {
  var mocks = this.getMocks();
  for (var i = 0; i < mocks.length; i++) {
    if (mocks[i].id === id) {
      return mocks[i];
    }
  }
  return null;
};

MockRulesManager.prototype.deleteAllMocks = function() {
  var mocks = this.getMocks();
  var self = this;
  mocks.forEach(function(mock) {
    self.values.delete(mock.id);
  });
  this._saveMocks([]);
  return true;
};

module.exports = MockRulesManager;
