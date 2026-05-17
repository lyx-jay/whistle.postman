(function() {
  'use strict';

  var MockPanel = {
    mocks: [],

    init: function() {
      this.loadMocks();
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
        var ruleType = mock.ruleType || 'mock';
        
        // Rule type icons and labels
        var typeIcons = {
          'mock': '\u{1f3ad}',      // 🎭
          'redirect': '\u{2197}\u{fe0f}',  // ↗️
          'delay': '\u{23f1}\u{fe0f}',     // ⏱️
          'throttle': '\u{1f40c}'   // 🐌
        };
        var typeLabels = {
          'mock': 'Mock',
          'redirect': 'Redirect',
          'delay': 'Delay',
          'throttle': 'Throttle'
        };
        
        html += '<div class="mock-rule-item ' + statusClass + ' mock-type-' + ruleType + '" data-id="' + mock.id + '">';
        html += '  <div class="mock-rule-header">';
        html += '    <span class="mock-type-icon" title="' + (typeLabels[ruleType] || 'Mock') + '">' + (typeIcons[ruleType] || typeIcons['mock']) + '</span>';
        html += '    <span class="mock-name">' + escapeHtml(mock.name) + '</span>';
        html += '    <span class="mock-status">' + (mock.enabled ? '\u25cf Active' : '\u25cb Inactive') + '</span>';
        html += '  </div>';
        html += '  <div class="mock-rule-url">' + escapeHtml(mock.urlPath || mock.url) + '</div>';
        html += '  <div class="mock-rule-info">';
        html += '    <span class="mock-rule-type">' + (typeLabels[ruleType] || 'Mock') + '</span>';
        if (ruleType === 'redirect' && mock.ruleContent) {
          html += '    <span class="mock-rule-detail">\u2192 ' + escapeHtml(mock.ruleContent) + '</span>';
        } else if (ruleType === 'delay' && mock.ruleContent) {
          html += '    <span class="mock-rule-detail">' + mock.ruleContent + 'ms</span>';
        } else if (ruleType === 'throttle' && mock.ruleContent) {
          html += '    <span class="mock-rule-detail">' + mock.ruleContent + ' KB/s</span>';
        }
        html += '  </div>';
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

      document.querySelectorAll('.mock-toggle-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
          self.toggleMock(this.dataset.id);
        });
      });

      document.querySelectorAll('.mock-delete-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
          self.deleteMock(this.dataset.id);
        });
      });

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
        .catch(function() {
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
            .catch(function() {
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
          .catch(function() {
            Components.Toast.error('Failed to update mock');
          });
        }
      });
    },

    deleteAllMocks: function() {
      var self = this;
      Components.confirm({
        title: 'Delete All Mock Rules',
        message: 'Are you sure you want to delete all mock rules?',
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
            .catch(function() {
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
