# Mock This - Whistle Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the "Mock This" feature from a placeholder that stores rule text into a fully functional feature that actually intercepts and mocks HTTP requests via Whistle's rule system.

**Architecture:** The plugin will use Whistle's `resBody://` rule with Values storage. When a user clicks "Mock This", the response body is stored as a Value, and a rule is generated that references that Value. The plugin's `rulesServer` will dynamically serve these rules to Whistle's rule engine.

**Tech Stack:** Node.js, Whistle Plugin API (rulesServer, Values), vanilla JavaScript frontend

---

## How Whistle Rules Actually Work

```
┌─────────────────────────────────────────────────────────────────┐
│                    Whistle Plugin Architecture                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Plugin Directory Structure:                                     │
│  whistle.postman/                                               │
│  ├── index.js          ← Main plugin entry                      │
│  ├── package.json      ← whistleConfig defines plugin behavior  │
│  ├── rules.txt         ← Static rules (auto-loaded)             │
│  ├── _rules.txt        ← Plugin-specific rules                  │
│  ├── values/           ← Values storage directory               │
│  └── ui/               ← Frontend assets                        │
│                                                                 │
│  Plugin can export:                                             │
│  ├── uiServer    ← UI web server (current - serves frontend)    │
│  ├── rulesServer ← Dynamic rules generator (NEED TO ADD)        │
│  ├── statsServer ← Request statistics                           │
│  └── server      ← Request interceptor                          │
│                                                                 │
│  Values System:                                                 │
│  ├── Stored as files in values/ directory                       │
│  ├── Referenced in rules as {value-name}                        │
│  ├── Can be read/written via whistle plugin options              │
│  └── Survives plugin restarts                                   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Current Problem Analysis

```
┌─────────────────────────────────────────────────────────────────┐
│                    CURRENT (Broken) FLOW                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  [User] → Click "Mock This"                                     │
│     │                                                           │
│     ▼                                                           │
│  [Frontend] → POST /api/rules                                   │
│     │        { rules: "pattern resBody://`...`" }               │
│     ▼                                                           │
│  [Backend] → writeStorage('active_rules', ...)                  │
│     │        (stores in memory only!)                           │
│     ▼                                                           │
│  [Toast] → "Mock rule created!"                                 │
│                                                                 │
│  ❌ Problem: Rules NEVER reach Whistle's rule engine            │
│  ❌ Problem: Next request to that URL goes to real server        │
│  ❌ Problem: No way to list/delete active mocks                 │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                    TARGET (Working) FLOW                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  [User] → Click "Mock This"                                     │
│     │                                                           │
│     ▼                                                           │
│  [Frontend] → POST /api/mock-rules                              │
│     │        { url, method, responseBody, name }                │
│     ▼                                                           │
│  [Backend] → 1. Store mock data in Values                       │
│              2. Generate rule referencing Value                  │
│              3. Trigger rulesServer to update rules              │
│     │                                                           │
│     ▼                                                           │
│  [Whistle] → rulesServer returns new rules                      │
│     │        Rule: pattern resBody://{mock-xxx}                 │
│     ▼                                                           │
│  [Whistle] → Intercepts matching requests                       │
│     │        Returns mock data instead of real response          │
│     ▼                                                           │
│  [User] → Request now returns mock data! ✅                     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## File Structure

```
whistle.postman/
├── index.js                    ← Modify: Add rulesServer export
├── lib/
│   ├── mock-rules.js           ← Create: Mock rules management logic
│   └── values-store.js         ← Create: Whistle values abstraction
├── ui/
│   ├── js/
│   │   ├── app.js              ← Modify: Update mock-related functions
│   │   └── mock-panel.js       ← Create: Mock rules management UI
│   └── css/
│       └── styles.css          ← Modify: Add mock panel styles
└── values/                     ← Auto-created: Stores mock values
```

---

## Test Plan

### E2E Scenarios

- [ ] **Mock Creation Flow**: Send request → Click Mock This → Enter name → Verify mock appears in list
- [ ] **Mock Interception**: Create mock → Send same request → Verify response is mock data (not real)
- [ ] **Mock Deletion**: Create mock → Delete mock → Send request → Verify real response returns
- [ ] **Mock List**: Create multiple mocks → Verify all appear in mock panel
- [ ] **Mock Toggle**: Create mock → Disable mock → Verify real response → Enable mock → Verify mock response
- [ ] **Mock Persistence**: Create mock → Reload page → Verify mock still active
- [ ] **Mock with AI**: Use AI to generate mock → Save → Verify mock works
- [ ] **Error Handling**: Mock invalid URL → Verify error message
- [ ] **Mock Panel UI**: Open mock panel → Verify list displays correctly
- [ ] **Bulk Operations**: Select multiple mocks → Delete all → Verify all removed

---

## Task 1: Create Values Store Abstraction

**Files:**
- Create: `lib/values-store.js`
- Modify: `index.js:1-50` (add require)

- [ ] **Step 1: Create values-store.js**

```javascript
// lib/values-store.js
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
  // Sanitize key for filesystem
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
```

- [ ] **Step 2: Add require to index.js**

```javascript
// At top of index.js, after existing requires
var ValuesStore = require('./lib/values-store');
```

- [ ] **Step 3: Commit**

```bash
git add lib/values-store.js index.js
git commit -m "feat: add values store abstraction for Whistle Values"
```

---

## Task 2: Create Mock Rules Manager

**Files:**
- Create: `lib/mock-rules.js`
- Modify: `index.js` (add require and initialize)

- [ ] **Step 1: Create mock-rules.js**

```javascript
// lib/mock-rules.js
var ValuesStore = require('./values-store');

function MockRulesManager(valuesDir) {
  this.values = new ValuesStore(valuesDir);
  this.MOCK_PREFIX = 'mock-';
  this.META_KEY = 'mock-meta';
}

// Generate a unique mock ID
MockRulesManager.prototype._generateId = function() {
  return this.MOCK_PREFIX + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
};

// Get all mock metadata
MockRulesManager.prototype.getMocks = function() {
  var metaJson = this.values.get(this.META_KEY);
  try {
    return metaJson ? JSON.parse(metaJson) : [];
  } catch (e) {
    return [];
  }
};

// Save mock metadata
MockRulesManager.prototype._saveMocks = function(mocks) {
  this.values.set(this.META_KEY, JSON.stringify(mocks));
};

// Create a new mock rule
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

  // Store the response body in Values
  this.values.set(id, mock.responseBody);

  // Store metadata
  var mocks = this.getMocks();
  mocks.push(mock);
  this._saveMocks(mocks);

  return mock;
};

// Delete a mock rule
MockRulesManager.prototype.deleteMock = function(id) {
  // Delete the value
  this.values.delete(id);

  // Remove from metadata
  var mocks = this.getMocks();
  mocks = mocks.filter(function(m) { return m.id !== id; });
  this._saveMocks(mocks);

  return true;
};

// Toggle mock enabled/disabled
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

// Update mock response body
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

// Generate Whistle rules string for all enabled mocks
MockRulesManager.prototype.generateRules = function() {
  var mocks = this.getMocks();
  var rules = [];
  var values = {};

  mocks.forEach(function(mock) {
    if (mock.enabled) {
      // Build the pattern (URL to match)
      var pattern = mock.urlPath || mock.url;
      
      // Build the rule
      var rule = pattern + ' resBody://{' + mock.id + '}';
      
      // Add status code if not 200
      if (mock.statusCode && mock.statusCode !== 200) {
        rule += ' statusCode://' + mock.statusCode;
      }
      
      rules.push(rule);
      
      // Reference the value
      values[mock.id] = mock.responseBody;
    }
  });

  return {
    rules: rules.join('\n'),
    values: values
  };
};

// Get a single mock by ID
MockRulesManager.prototype.getMock = function(id) {
  var mocks = this.getMocks();
  for (var i = 0; i < mocks.length; i++) {
    if (mocks[i].id === id) {
      return mocks[i];
    }
  }
  return null;
};

// Delete all mocks
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
```

- [ ] **Step 2: Initialize MockRulesManager in index.js**

```javascript
// In index.js, after requiring the module
var MockRulesManager = require('./lib/mock-rules');

// Initialize with values directory
var valuesDir = path.join(__dirname, 'values');
var mockManager = new MockRulesManager(valuesDir);
```

- [ ] **Step 3: Commit**

```bash
git add lib/mock-rules.js index.js
git commit -m "feat: add mock rules manager with Whistle values integration"
```

---

## Task 3: Add Mock Rules API Endpoints

**Files:**
- Modify: `index.js` (add API endpoints)

- [ ] **Step 1: Add mock-rules API endpoints**

```javascript
// In index.js, add these endpoints in the handleRequest function

// GET /api/mock-rules - List all mock rules
if (pathname === '/api/mock-rules' && req.method === 'GET') {
  var mocks = mockManager.getMocks();
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ result: 'ok', data: mocks }));
  return;
}

// POST /api/mock-rules - Create a new mock rule
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

// PUT /api/mock-rules/:id - Update a mock rule
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

// DELETE /api/mock-rules/:id - Delete a mock rule
if (pathname.match(/^\/api\/mock-rules\/[\w-]+$/) && req.method === 'DELETE') {
  var id = pathname.split('/').pop();
  mockManager.deleteMock(id);
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ result: 'ok' }));
  return;
}

// POST /api/mock-rules/:id/toggle - Toggle mock enabled/disabled
if (pathname.match(/^\/api\/mock-rules\/[\w-]+\/toggle$/) && req.method === 'POST') {
  var id = pathname.split('/')[3]; // Extract ID from /api/mock-rules/:id/toggle
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

// DELETE /api/mock-rules - Delete all mock rules
if (pathname === '/api/mock-rules' && req.method === 'DELETE') {
  mockManager.deleteAllMocks();
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ result: 'ok' }));
  return;
}
```

- [ ] **Step 2: Commit**

```bash
git add index.js
git commit -m "feat: add mock rules CRUD API endpoints"
```

---

## Task 4: Add rulesServer Export

**Files:**
- Modify: `index.js` (add rulesServer to exports)

- [ ] **Step 1: Add rulesServer function**

```javascript
// In index.js, before the exports

function createRulesServer(server, options) {
  server.on('request', function(req, res) {
    // Generate rules from mock manager
    var rulesData = mockManager.generateRules();
    
    // Return rules and values to Whistle
    res.end(JSON.stringify({
      rules: rulesData.rules,
      values: rulesData.values
    }));
  });
}
```

- [ ] **Step 2: Update exports**

```javascript
// Update the createServer function
function createServer(whistleStorage) {
  return {
    name: PLUGIN_NAME,
    uiServer: createUiServer(whistleStorage),
    rulesServer: createRulesServer
  };
}
```

- [ ] **Step 3: Update package.json whistleConfig**

```json
{
  "whistleConfig": {
    "name": "Postman",
    "tab": "/ui/index.html",
    "comTab": "/ui/index.html",
    "rulesServer": true,
    "networkMenus": [
      {
        "name": "Edit in Postman",
        "action": "/ui/index.html"
      }
    ]
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add index.js package.json
git commit -m "feat: add rulesServer export for dynamic mock rules"
```

---

## Task 5: Create Mock Rules Management UI

**Files:**
- Create: `ui/js/mock-panel.js`
- Modify: `ui/index.html` (add mock panel)
- Modify: `ui/css/styles.css` (add mock panel styles)

- [ ] **Step 1: Create mock-panel.js**

```javascript
// ui/js/mock-panel.js
(function() {
  'use strict';

  var MockPanel = {
    mocks: [],
    isOpen: false,

    init: function() {
      this.loadMocks();
      this.render();
    },

    loadMocks: function() {
      var self = this;
      fetch('/plugin.postman/api/mock-rules')
        .then(function(res) { return res.json(); })
        .then(function(data) {
          self.mocks = data.data || [];
          self.render();
        })
        .catch(console.error);
    },

    render: function() {
      var container = document.getElementById('mock-rules-list');
      if (!container) return;

      if (this.mocks.length === 0) {
        container.innerHTML = '<div class="mock-empty">No mock rules yet. Send a request and click "Mock This" to create one.</div>';
        return;
      }

      var html = '';
      this.mocks.forEach(function(mock) {
        var statusClass = mock.enabled ? 'enabled' : 'disabled';
        var toggleText = mock.enabled ? 'Disable' : 'Enable';
        
        html += '<div class="mock-rule-item ' + statusClass + '" data-id="' + mock.id + '">';
        html += '  <div class="mock-rule-header">';
        html += '    <span class="mock-method">' + (mock.method || 'GET') + '</span>';
        html += '    <span class="mock-name">' + escapeHtml(mock.name) + '</span>';
        html += '    <span class="mock-status">' + (mock.enabled ? '● Active' : '○ Inactive') + '</span>';
        html += '  </div>';
        html += '  <div class="mock-rule-url">' + escapeHtml(mock.urlPath || mock.url) + '</div>';
        html += '  <div class="mock-rule-actions">';
        html += '    <button class="mock-toggle-btn" data-id="' + mock.id + '">' + toggleText + '</button>';
        html += '    <button class="mock-edit-btn" data-id="' + mock.id + '">Edit</button>';
        html += '    <button class="mock-delete-btn" data-id="' + mock.id + '">Delete</button>';
        html += '  </div>';
        html += '</div>';
      });

      container.innerHTML = html;
      this.bindEvents();
    },

    bindEvents: function() {
      var self = this;

      // Toggle buttons
      document.querySelectorAll('.mock-toggle-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
          self.toggleMock(this.dataset.id);
        });
      });

      // Delete buttons
      document.querySelectorAll('.mock-delete-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
          self.deleteMock(this.dataset.id);
        });
      });

      // Edit buttons
      document.querySelectorAll('.mock-edit-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
          self.editMock(this.dataset.id);
        });
      });
    },

    toggleMock: function(id) {
      var self = this;
      fetch('/plugin.postman/api/mock-rules/' + id + '/toggle', { method: 'POST' })
        .then(function(res) { return res.json(); })
        .then(function() {
          self.loadMocks();
          Components.Toast.success('Mock rule toggled');
        })
        .catch(function(err) {
          Components.Toast.error('Failed to toggle mock');
        });
    },

    deleteMock: function(id) {
      var self = this;
      Components.confirm({
        title: 'Delete Mock Rule',
        message: 'Are you sure you want to delete this mock rule?',
        confirmText: 'Delete',
        danger: true
      }).then(function(confirmed) {
        if (confirmed) {
          fetch('/plugin.postman/api/mock-rules/' + id, { method: 'DELETE' })
            .then(function(res) { return res.json(); })
            .then(function() {
              self.loadMocks();
              Components.Toast.success('Mock rule deleted');
            })
            .catch(function(err) {
              Components.Toast.error('Failed to delete mock');
            });
        }
      });
    },

    editMock: function(id) {
      var mock = this.mocks.find(function(m) { return m.id === id; });
      if (!mock) return;

      Components.prompt({
        title: 'Edit Mock Response',
        message: 'Edit the mock response body:',
        defaultValue: mock.responseBody
      }).then(function(newBody) {
        if (newBody !== null) {
          fetch('/plugin.postman/api/mock-rules/' + id, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ responseBody: newBody })
          })
          .then(function(res) { return res.json(); })
          .then(function() {
            MockPanel.loadMocks();
            Components.Toast.success('Mock updated');
          })
          .catch(function(err) {
            Components.Toast.error('Failed to update mock');
          });
        }
      });
    },

    deleteAllMocks: function() {
      var self = this;
      Components.confirm({
        title: 'Delete All Mock Rules',
        message: 'Are you sure you want to delete all mock rules? This cannot be undone.',
        confirmText: 'Delete All',
        danger: true
      }).then(function(confirmed) {
        if (confirmed) {
          fetch('/plugin.postman/api/mock-rules', { method: 'DELETE' })
            .then(function(res) { return res.json(); })
            .then(function() {
              self.loadMocks();
              Components.Toast.success('All mock rules deleted');
            })
            .catch(function(err) {
              Components.Toast.error('Failed to delete mocks');
            });
        }
      });
    }
  };

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  window.MockPanel = MockPanel;
})();
```

- [ ] **Step 2: Add mock panel to index.html**

```html
<!-- Add after the Rules tab content, before the response section -->
<div class="mock-panel-section">
  <div class="mock-panel-header">
    <h3>Active Mock Rules</h3>
    <div class="mock-panel-actions">
      <button id="refresh-mocks-btn" class="btn btn-ghost btn-sm">Refresh</button>
      <button id="delete-all-mocks-btn" class="btn btn-danger btn-sm">Delete All</button>
    </div>
  </div>
  <div id="mock-rules-list" class="mock-rules-list">
    <!-- Mock rules will be rendered here -->
  </div>
</div>
```

- [ ] **Step 3: Add CSS styles for mock panel**

```css
/* Mock Panel Styles */
.mock-panel-section {
  border-top: 1px solid var(--color-hairline);
  background: var(--color-canvas);
}

.mock-panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--space-3) var(--space-4);
  border-bottom: 1px solid var(--color-hairline);
}

.mock-panel-header h3 {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-ink);
}

.mock-panel-actions {
  display: flex;
  gap: var(--space-2);
}

.mock-rules-list {
  max-height: 300px;
  overflow-y: auto;
  padding: var(--space-2);
}

.mock-empty {
  padding: var(--space-6);
  text-align: center;
  color: var(--color-muted);
  font-size: 13px;
}

.mock-rule-item {
  padding: var(--space-3);
  margin-bottom: var(--space-2);
  background: var(--color-surface-card);
  border: 1px solid var(--color-hairline);
  border-radius: var(--radius-lg);
  transition: all var(--transition-fast);
}

.mock-rule-item.disabled {
  opacity: 0.6;
}

.mock-rule-header {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-bottom: var(--space-1);
}

.mock-method {
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 600;
  padding: 2px 6px;
  background: rgba(93, 184, 166, 0.1);
  color: var(--color-info);
  border-radius: var(--radius-sm);
}

.mock-name {
  flex: 1;
  font-size: 13px;
  font-weight: 500;
  color: var(--color-ink);
}

.mock-status {
  font-size: 11px;
  color: var(--color-muted);
}

.mock-status .active {
  color: var(--color-success);
}

.mock-rule-url {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--color-muted);
  margin-bottom: var(--space-2);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mock-rule-actions {
  display: flex;
  gap: var(--space-2);
}

.mock-toggle-btn,
.mock-edit-btn,
.mock-delete-btn {
  padding: var(--space-1) var(--space-3);
  font-size: 12px;
  border: 1px solid var(--color-hairline);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.mock-toggle-btn {
  background: var(--color-surface-card);
  color: var(--color-body);
}

.mock-toggle-btn:hover {
  background: var(--color-primary);
  color: var(--color-on-primary);
  border-color: var(--color-primary);
}

.mock-edit-btn {
  background: var(--color-canvas);
  color: var(--color-body);
}

.mock-edit-btn:hover {
  background: var(--color-surface-card);
}

.mock-delete-btn {
  background: var(--color-canvas);
  color: var(--color-error);
  border-color: var(--color-hairline);
}

.mock-delete-btn:hover {
  background: var(--color-error);
  color: var(--color-on-primary);
  border-color: var(--color-error);
}
```

- [ ] **Step 4: Add script tag and initialize**

```html
<!-- In index.html, before app.js -->
<script src="/ui/js/mock-panel.js"></script>
```

```javascript
// In app.js init function, add:
if (window.MockPanel) {
  MockPanel.init();
}

// Add event listeners for mock panel buttons
var refreshMocksBtn = document.getElementById('refresh-mocks-btn');
if (refreshMocksBtn) {
  refreshMocksBtn.addEventListener('click', function() {
    MockPanel.loadMocks();
  });
}

var deleteAllMocksBtn = document.getElementById('delete-all-mocks-btn');
if (deleteAllMocksBtn) {
  deleteAllMocksBtn.addEventListener('click', function() {
    MockPanel.deleteAllMocks();
  });
}
```

- [ ] **Step 5: Commit**

```bash
git add ui/js/mock-panel.js ui/index.html ui/css/styles.css ui/js/app.js
git commit -m "feat: add mock rules management UI panel"
```

---

## Task 6: Update Mock This Button to Use New API

**Files:**
- Modify: `ui/js/app.js` (update mockThisUrl function)

- [ ] **Step 1: Update mockThisUrl function**

```javascript
// In ui/js/app.js, replace the existing mockThisUrl function
function mockThisUrl() {
  var req = state.currentRequest;
  var res = state.response;

  if (!req.url || !res || res.error) {
    Components.Toast.warning('No valid response to mock');
    return;
  }

  var urlPath = req.url.replace(/^https?:\/\/[^\/]+/, '');
  var host = req.url.match(/^https?:\/\/([^\/]+)/);
  var pattern = host ? host[1] + urlPath : urlPath;

  var mockBody = res.body || '{"message": "mock"}';

  Components.prompt({
    title: 'Mock This URL',
    message: 'Create a mock rule that returns the current response for this URL. The mock will be active immediately.',
    placeholder: 'Rule name',
    defaultValue: 'Mock ' + req.method + ' ' + urlPath
  }).then(function(ruleName) {
    if (!ruleName) return;

    // Create mock rule via new API
    api('/api/mock-rules', {
      method: 'POST',
      body: {
        name: ruleName,
        url: req.url,
        urlPath: pattern,
        method: req.method,
        statusCode: res.status || 200,
        headers: res.headers || { 'Content-Type': 'application/json' },
        responseBody: mockBody
      }
    }).then(function(data) {
      if (data.result === 'ok') {
        Components.Toast.success('Mock rule created! Requests to this URL will now return mock data.');
        // Refresh mock panel if it exists
        if (window.MockPanel) {
          MockPanel.loadMocks();
        }
      } else {
        Components.Toast.error('Failed to create mock: ' + (data.data || 'Unknown error'));
      }
    }).catch(function(err) {
      Components.Toast.error('Error creating mock: ' + err.message);
    });
  });
}
```

- [ ] **Step 2: Remove old /api/rules endpoint**

```javascript
// In index.js, remove or comment out the old /api/rules endpoint
// The new /api/mock-rules endpoints replace it
```

- [ ] **Step 3: Commit**

```bash
git add ui/js/app.js index.js
git commit -m "feat: update Mock This to use new mock rules API"
```

---

## Task 7: Add Mock Status Indicator to Response

**Files:**
- Modify: `ui/js/app.js` (add mock status check)
- Modify: `ui/index.html` (add mock indicator)

- [ ] **Step 1: Add mock status check function**

```javascript
// In ui/js/app.js
function checkMockStatus() {
  var req = state.currentRequest;
  if (!req.url) return;

  var urlPath = req.url.replace(/^https?:\/\/[^\/]+/, '');
  
  api('/api/mock-rules').then(function(data) {
    var mocks = data.data || [];
    var activeMock = mocks.find(function(m) {
      return m.enabled && (m.urlPath === urlPath || req.url.includes(m.urlPath));
    });
    
    updateMockIndicator(activeMock);
  });
}

function updateMockIndicator(mock) {
  var indicator = document.getElementById('mock-status-indicator');
  if (!indicator) return;

  if (mock) {
    indicator.innerHTML = '<span class="mock-active">🎭 Mocked: ' + escapeHtml(mock.name) + '</span>';
    indicator.classList.add('has-mock');
    indicator.title = 'This URL is being mocked. Click to manage mocks.';
  } else {
    indicator.innerHTML = '';
    indicator.classList.remove('has-mock');
  }
}
```

- [ ] **Step 2: Add mock indicator to HTML**

```html
<!-- In the response-header div, before response-meta -->
<div id="mock-status-indicator" class="mock-status-indicator"></div>
```

- [ ] **Step 3: Add CSS for mock indicator**

```css
.mock-status-indicator {
  display: inline-flex;
  align-items: center;
  margin-right: var(--space-3);
}

.mock-status-indicator.has-mock {
  padding: var(--space-1) var(--space-3);
  background: rgba(204, 120, 92, 0.1);
  border: 1px solid var(--color-primary);
  border-radius: var(--radius-md);
}

.mock-active {
  font-size: 12px;
  color: var(--color-primary);
  font-weight: 500;
}
```

- [ ] **Step 4: Call checkMockStatus after sending request**

```javascript
// In sendRequest function, after renderResponse()
checkMockStatus();
```

- [ ] **Step 5: Commit**

```bash
git add ui/js/app.js ui/index.html ui/css/styles.css
git commit -m "feat: add mock status indicator to response section"
```

---

## Task 8: Integration Testing

**Files:**
- None (testing only)

- [ ] **Step 1: Start test server**

```bash
cd /Users/yxl/projects/whistle.postman
node test-server.js
```

- [ ] **Step 2: Test mock creation flow**

1. Navigate to `http://127.0.0.1:18899/ui/index.html`
2. Enter URL: `https://httpbin.org/get`
3. Click "Send"
4. Click "Mock This"
5. Enter name: "Test Mock"
6. Verify toast: "Mock rule created!"
7. Verify mock appears in mock panel

- [ ] **Step 3: Verify mock rules API**

```bash
# List mocks
curl http://127.0.0.1:18899/plugin.postman/api/mock-rules

# Verify response contains the created mock
```

- [ ] **Step 4: Test mock toggle**

1. Click "Disable" on the mock
2. Verify status changes to "Inactive"
3. Click "Enable"
4. Verify status changes to "Active"

- [ ] **Step 5: Test mock deletion**

1. Click "Delete" on the mock
2. Confirm deletion
3. Verify mock is removed from list

- [ ] **Step 6: Commit test results**

```bash
git add -A
git commit -m "test: verify mock rules integration works correctly"
```

---

## Execution Order

```
Task 1 → Task 2 → Task 3 → Task 4 → Task 5 → Task 6 → Task 7 → Task 8
   │         │         │         │         │         │         │
   ▼         ▼         ▼         ▼         ▼         ▼         ▼
Values   Mock     API     Rules   Mock UI  Update  Status   Test
Store    Rules   Endpts  Server   Panel   MockBtn Indicator Verify
```

Each task builds on the previous ones. Task 8 is validation only.
