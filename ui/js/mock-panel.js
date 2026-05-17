// Mock Panel - Compact layout with Modal editor
(function() {
  'use strict';

  var editModal = null;
  var editEditor = null;

  var MockPanel = {
    mocks: [],

    init: function() {
      this.loadMocks();
      this.createEditModal();
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

      var typeIcons = {
        'mock': '\u{1f3ad}',
        'redirect': '\u{2197}\u{fe0f}',
        'delay': '\u{23f1}\u{fe0f}',
        'throttle': '\u{1f40c}'
      };

      var html = '<div class="mock-list-compact">';
      this.mocks.forEach(function(mock) {
        var statusClass = mock.enabled ? 'enabled' : 'disabled';
        var ruleType = mock.ruleType || 'mock';
        var icon = typeIcons[ruleType] || typeIcons['mock'];
        
        // Build detail text
        var detail = '';
        if (ruleType === 'redirect' && mock.ruleContent) {
          detail = ' \u2192 ' + escapeHtml(mock.ruleContent);
        } else if (ruleType === 'delay' && mock.ruleContent) {
          detail = ' ' + mock.ruleContent + 'ms';
        } else if (ruleType === 'throttle' && mock.ruleContent) {
          detail = ' ' + mock.ruleContent + ' KB/s';
        }

        html += '<div class="mock-row ' + statusClass + '" data-id="' + mock.id + '">';
        html += '  <span class="mock-icon" title="' + ruleType + '">' + icon + '</span>';
        html += '  <span class="mock-url" title="' + escapeHtml(mock.urlPath || mock.url) + '">' + escapeHtml(mock.urlPath || mock.url) + detail + '</span>';
        html += '  <span class="mock-type">' + ruleType + '</span>';
        html += '  <span class="mock-status-dot ' + (mock.enabled ? 'active' : 'inactive') + '" title="' + (mock.enabled ? 'Active' : 'Inactive') + '"></span>';
        html += '  <span class="mock-actions">';
        html += '    <button class="mock-btn toggle" data-id="' + mock.id + '" title="' + (mock.enabled ? 'Disable' : 'Enable') + '">' + (mock.enabled ? '\u26a1' : '\u26a0') + '</button>';
        html += '    <button class="mock-btn edit" data-id="' + mock.id + '" title="Edit">\u270f\ufe0f</button>';
        html += '    <button class="mock-btn delete" data-id="' + mock.id + '" title="Delete">\u{1f5d1}\ufe0f</button>';
        html += '  </span>';
        html += '</div>';
      });
      html += '</div>';

      container.innerHTML = html;
      this.bindEvents();
    },

    bindEvents: function() {
      var self = this;

      document.querySelectorAll('.mock-btn.toggle').forEach(function(btn) {
        btn.addEventListener('click', function(e) {
          e.stopPropagation();
          self.toggleMock(this.dataset.id);
        });
      });

      document.querySelectorAll('.mock-btn.delete').forEach(function(btn) {
        btn.addEventListener('click', function(e) {
          e.stopPropagation();
          self.deleteMock(this.dataset.id);
        });
      });

      document.querySelectorAll('.mock-btn.edit').forEach(function(btn) {
        btn.addEventListener('click', function(e) {
          e.stopPropagation();
          self.openEditModal(this.dataset.id);
        });
      });
    },

    toggleMock: function(id) {
      var self = this;
      fetch('/plugin.postman/api/mock-rules/' + id + '/toggle', { method: 'POST' })
        .then(function(res) { return res.json(); })
        .then(function() {
          self.loadMocks();
          Components.Toast.success('Mock toggled');
        })
        .catch(function() {
          Components.Toast.error('Failed to toggle');
        });
    },

    deleteMock: function(id) {
      var self = this;
      Components.confirm({
        title: 'Delete Mock',
        message: 'Delete this mock rule?',
        confirmText: 'Delete',
        danger: true
      }).then(function(confirmed) {
        if (confirmed) {
          fetch('/plugin.postman/api/mock-rules/' + id, { method: 'DELETE' })
            .then(function(res) { return res.json(); })
            .then(function() {
              self.loadMocks();
              Components.Toast.success('Mock deleted');
            })
            .catch(function() {
              Components.Toast.error('Failed to delete');
            });
        }
      });
    },

    createEditModal: function() {
      if (editModal) return;

      editModal = document.createElement('div');
      editModal.className = 'mock-edit-modal hidden';
      editModal.innerHTML = 
        '<div class="mock-edit-content">' +
          '<div class="mock-edit-header">' +
            '<h3>Edit Mock Rule</h3>' +
            '<button class="mock-edit-close">\u00d7</button>' +
          '</div>' +
          '<div class="mock-edit-body">' +
            '<div class="mock-edit-field">' +
              '<label>Name:</label>' +
              '<input type="text" id="mock-edit-name" class="mock-edit-input">' +
            '</div>' +
            '<div class="mock-edit-field">' +
              '<label>Response Body:</label>' +
              '<div class="mock-edit-editor-wrap">' +
                '<textarea id="mock-edit-body"></textarea>' +
              '</div>' +
            '</div>' +
          '</div>' +
          '<div class="mock-edit-footer">' +
            '<button class="mock-edit-cancel">Cancel</button>' +
            '<button class="mock-edit-save">Save Changes</button>' +
          '</div>' +
        '</div>';

      document.body.appendChild(editModal);

      // Initialize CodeMirror
      var textarea = document.getElementById('mock-edit-body');
      if (textarea && window.CodeMirror) {
        editEditor = CodeMirror.fromTextArea(textarea, {
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

      // Bind events
      var self = this;
      editModal.querySelector('.mock-edit-close').addEventListener('click', function() {
        self.closeEditModal();
      });
      editModal.querySelector('.mock-edit-cancel').addEventListener('click', function() {
        self.closeEditModal();
      });
      editModal.querySelector('.mock-edit-save').addEventListener('click', function() {
        self.saveEditModal();
      });
      editModal.addEventListener('click', function(e) {
        if (e.target === editModal) {
          self.closeEditModal();
        }
      });
    },

    openEditModal: function(id) {
      var mock = this.mocks.find(function(m) { return m.id === id; });
      if (!mock) return;

      this._editingId = id;
      
      document.getElementById('mock-edit-name').value = mock.name || '';
      if (editEditor) {
        editEditor.setValue(mock.responseBody || '{}');
        setTimeout(function() { editEditor.refresh(); }, 100);
      }

      editModal.classList.remove('hidden');
    },

    closeEditModal: function() {
      editModal.classList.add('hidden');
      this._editingId = null;
    },

    saveEditModal: function() {
      var id = this._editingId;
      if (!id) return;

      var name = document.getElementById('mock-edit-name').value.trim();
      var body = editEditor ? editEditor.getValue().trim() : '';

      if (!name) {
        Components.Toast.warning('Name is required');
        return;
      }

      var self = this;
      fetch('/plugin.postman/api/mock-rules/' + id, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name, responseBody: body })
      })
      .then(function(res) { return res.json(); })
      .then(function() {
        self.closeEditModal();
        self.loadMocks();
        Components.Toast.success('Mock updated');
      })
      .catch(function() {
        Components.Toast.error('Failed to update');
      });
    },

    deleteAllMocks: function() {
      var self = this;
      Components.confirm({
        title: 'Delete All Mocks',
        message: 'Delete all mock rules? This cannot be undone.',
        confirmText: 'Delete All',
        danger: true
      }).then(function(confirmed) {
        if (confirmed) {
          fetch('/plugin.postman/api/mock-rules', { method: 'DELETE' })
            .then(function(res) { return res.json(); })
            .then(function() {
              self.loadMocks();
              Components.Toast.success('All mocks deleted');
            })
            .catch(function() {
              Components.Toast.error('Failed to delete');
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
