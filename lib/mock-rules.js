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
  var mock = {
    id: id,
    name: options.name || 'Mock ' + options.method + ' ' + options.urlPath,
    url: options.url,
    urlPath: options.urlPath,
    method: options.method || 'GET',
    statusCode: options.statusCode || 200,
    headers: options.headers || { 'Content-Type': 'application/json' },
    responseBody: options.responseBody || '{}',
    enabled: true,
    createdAt: new Date().toISOString()
  };

  this.values.set(id, mock.responseBody);

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
        this.values.set(id, updates.responseBody);
      }
      if (updates.name !== undefined) {
        mocks[i].name = updates.name;
      }
      if (updates.enabled !== undefined) {
        mocks[i].enabled = updates.enabled;
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
    if (mock.enabled) {
      var pattern = mock.urlPath || mock.url;
      var rule = pattern + ' resBody://{' + mock.id + '}';
      
      if (mock.statusCode && mock.statusCode !== 200) {
        rule += ' statusCode://' + mock.statusCode;
      }
      
      rules.push(rule);
      values[mock.id] = mock.responseBody;
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
