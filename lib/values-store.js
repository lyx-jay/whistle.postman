var fs = require('fs');
var path = require('path');

function ValuesStore(baseDir) {
  this.baseDir = baseDir || path.join(process.cwd(), 'values');
  this._ensureDir();
}

ValuesStore.prototype._ensureDir = function() {
  if (!fs.existsSync(this.baseDir)) {
    fs.mkdirSync(this.baseDir, { recursive: true });
  }
};

ValuesStore.prototype._getKeyPath = function(key) {
  var safeKey = key.replace(/[^a-zA-Z0-9_-]/g, '_');
  return path.join(this.baseDir, safeKey + '.txt');
};

ValuesStore.prototype.get = function(key) {
  var filePath = this._getKeyPath(key);
  try {
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath, 'utf8');
    }
  } catch (e) {}
  return null;
};

ValuesStore.prototype.set = function(key, value) {
  var filePath = this._getKeyPath(key);
  try {
    fs.writeFileSync(filePath, value, 'utf8');
    return true;
  } catch (e) {
    return false;
  }
};

ValuesStore.prototype.delete = function(key) {
  var filePath = this._getKeyPath(key);
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return true;
    }
  } catch (e) {}
  return false;
};

ValuesStore.prototype.list = function() {
  try {
    var files = fs.readdirSync(this.baseDir);
    return files
      .filter(function(f) { return f.endsWith('.txt'); })
      .map(function(f) { return f.replace('.txt', ''); });
  } catch (e) {
    return [];
  }
};

ValuesStore.prototype.getMultiple = function(keys) {
  var result = {};
  var self = this;
  keys.forEach(function(key) {
    result[key] = self.get(key);
  });
  return result;
};

module.exports = ValuesStore;
