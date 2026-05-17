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
        'mock': LucideIcons.get('wand-2', 14),
        'redirect': LucideIcons.get('external-link', 14),
        'delay': LucideIcons.get('clock', 14),
        'throttle': LucideIcons.get('loader', 14)
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
        html += '    <button class="mock-btn toggle" data-id="' + mock.id + '" title="' + (mock.enabled ? 'Disable' : 'Enable') + '"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/></svg></button>';
        html += '    <button class="mock-btn edit" data-id="' + mock.id + '" title="Edit"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg></button>';
        html += '    <button class="mock-btn delete" data-id="' + mock.id + '" title="Delete"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg></button>';
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
            '<button class="mock-edit-close"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg></button>' +
          '</div>' +
          '<div class="mock-edit-body">' +
            '<div class="mock-edit-field">' +
              '<label>Name:</label>' +
              '<input type="text" id="mock-edit-name" class="mock-edit-input">' +
            '</div>' +
            '<div class="mock-edit-field">' +
              '<div class="mock-edit-label-row">' +
                '<label>Response Body:</label>' +
                '<div class="mock-edit-tools">' +
                  '<button class="mock-tool-btn" id="mock-format-btn" title="Format JSON"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg> Format</button>' +
                  '<button class="mock-tool-btn" id="mock-search-btn" title="Search (Ctrl+F)"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg> Search</button>' +
                  '<button class="mock-tool-btn" id="mock-replace-btn" title="Replace (Ctrl+H)"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h6v6"/><path d="M10 20H4v-6"/><path d="m21 21-14-14"/></svg> Replace</button>' +
                '</div>' +
              '</div>' +
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
          lineWrapping: true,
          extraKeys: {
            'Ctrl-F': 'findPersistent',
            'Cmd-F': 'findPersistent',
            'Ctrl-H': 'replace',
            'Cmd-H': 'replace'
          }
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

      // Format JSON button
      document.getElementById('mock-format-btn').addEventListener('click', function() {
        if (!editEditor) return;
        try {
          var parsed = JSON.parse(editEditor.getValue());
          editEditor.setValue(JSON.stringify(parsed, null, 2));
          Components.Toast.success('JSON formatted');
        } catch (e) {
          Components.Toast.error('Invalid JSON: ' + e.message);
        }
      });

      // Search button
      document.getElementById('mock-search-btn').addEventListener('click', function() {
        if (!editEditor) return;
        editEditor.execCommand('findPersistent');
      });

      // Replace button
      document.getElementById('mock-replace-btn').addEventListener('click', function() {
        if (!editEditor) return;
        editEditor.execCommand('replace');
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
