// Custom Components - Claude Design Style
(function() {
  'use strict';

  // === Toast ===
  var Toast = {
    container: null,
    
    init: function() {
      if (this.container) return;
      this.container = document.createElement('div');
      this.container.className = 'toast-container';
      document.body.appendChild(this.container);
    },
    
    show: function(message, type, duration) {
      this.init();
      type = type || 'info';
      duration = duration || 3000;
      
      var iconMap = {
        success: 'check-circle',
        error: 'x-circle',
        warning: 'alert-circle',
        info: 'info'
      };
      
      var toast = document.createElement('div');
      toast.className = 'toast toast-' + type;
      toast.innerHTML = 
        '<span class="toast-icon">' + LucideIcons.get(iconMap[type] || 'info', 18) + '</span>' +
        '<span class="toast-message">' + escapeHtml(message) + '</span>' +
        '<button class="toast-close">' + LucideIcons.get('x', 14) + '</button>';
      
      var closeBtn = toast.querySelector('.toast-close');
      closeBtn.addEventListener('click', function() {
        removeToast(toast);
      });
      
      this.container.appendChild(toast);
      
      if (duration > 0) {
        setTimeout(function() {
          removeToast(toast);
        }, duration);
      }
      
      return toast;
    },
    
    success: function(message, duration) {
      return this.show(message, 'success', duration);
    },
    
    error: function(message, duration) {
      return this.show(message, 'error', duration);
    },
    
    warning: function(message, duration) {
      return this.show(message, 'warning', duration);
    },
    
    info: function(message, duration) {
      return this.show(message, 'info', duration);
    }
  };
  
  function removeToast(toast) {
    if (!toast || !toast.parentNode) return;
    toast.classList.add('toast-exit');
    setTimeout(function() {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 150);
  }

  // === Confirm Dialog ===
  function confirmDialog(options) {
    return new Promise(function(resolve) {
      options = options || {};
      
      var overlay = document.createElement('div');
      overlay.className = 'dialog-overlay';
      
      var iconHtml = '';
      if (options.icon) {
        iconHtml = '<span class="dialog-icon" style="color: ' + (options.iconColor || 'var(--color-text)') + '">' + 
                   LucideIcons.get(options.icon, 24) + '</span>';
      }
      
      overlay.innerHTML = 
        '<div class="dialog">' +
          '<div class="dialog-header">' +
            iconHtml +
            '<h3 class="dialog-title">' + escapeHtml(options.title || 'Confirm') + '</h3>' +
          '</div>' +
          '<div class="dialog-body">' +
            escapeHtml(options.message || 'Are you sure?') +
          '</div>' +
          '<div class="dialog-footer">' +
            '<button class="btn btn-secondary dialog-cancel">' + escapeHtml(options.cancelText || 'Cancel') + '</button>' +
            '<button class="btn ' + (options.danger ? 'btn-danger' : 'btn-primary') + ' dialog-confirm">' + escapeHtml(options.confirmText || 'Confirm') + '</button>' +
          '</div>' +
        '</div>';
      
      var cancelBtn = overlay.querySelector('.dialog-cancel');
      var confirmBtn = overlay.querySelector('.dialog-confirm');
      
      cancelBtn.addEventListener('click', function() {
        closeDialog(overlay);
        resolve(false);
      });
      
      confirmBtn.addEventListener('click', function() {
        closeDialog(overlay);
        resolve(true);
      });
      
      overlay.addEventListener('click', function(e) {
        if (e.target === overlay) {
          closeDialog(overlay);
          resolve(false);
        }
      });
      
      document.body.appendChild(overlay);
      confirmBtn.focus();
    });
  }

  // === Prompt Dialog ===
  function promptDialog(options) {
    return new Promise(function(resolve) {
      options = options || {};
      
      var overlay = document.createElement('div');
      overlay.className = 'dialog-overlay';
      
      overlay.innerHTML = 
        '<div class="dialog">' +
          '<div class="dialog-header">' +
            (options.icon ? '<span class="dialog-icon">' + LucideIcons.get(options.icon, 24) + '</span>' : '') +
            '<h3 class="dialog-title">' + escapeHtml(options.title || 'Input') + '</h3>' +
          '</div>' +
          '<div class="dialog-body">' +
            (options.message ? '<p>' + escapeHtml(options.message) + '</p>' : '') +
            '<input type="text" class="prompt-input" placeholder="' + escapeHtml(options.placeholder || '') + '" value="' + escapeHtml(options.defaultValue || '') + '">' +
          '</div>' +
          '<div class="dialog-footer">' +
            '<button class="btn btn-secondary dialog-cancel">' + escapeHtml(options.cancelText || 'Cancel') + '</button>' +
            '<button class="btn btn-primary dialog-confirm">' + escapeHtml(options.confirmText || 'OK') + '</button>' +
          '</div>' +
        '</div>';
      
      var input = overlay.querySelector('.prompt-input');
      var cancelBtn = overlay.querySelector('.dialog-cancel');
      var confirmBtn = overlay.querySelector('.dialog-confirm');
      
      function submit() {
        var value = input.value.trim();
        closeDialog(overlay);
        resolve(value || null);
      }
      
      cancelBtn.addEventListener('click', function() {
        closeDialog(overlay);
        resolve(null);
      });
      
      confirmBtn.addEventListener('click', submit);
      
      input.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          submit();
        }
        if (e.key === 'Escape') {
          closeDialog(overlay);
          resolve(null);
        }
      });
      
      overlay.addEventListener('click', function(e) {
        if (e.target === overlay) {
          closeDialog(overlay);
          resolve(null);
        }
      });
      
      document.body.appendChild(overlay);
      input.focus();
      input.select();
    });
  }

  function closeDialog(overlay) {
    if (overlay && overlay.parentNode) {
      overlay.parentNode.removeChild(overlay);
    }
  }

  // === Context Menu ===
  var activeContextMenu = null;
  
  function showContextMenu(options) {
    hideContextMenu();
    
    var menu = document.createElement('div');
    menu.className = 'context-menu';
    
    var html = '';
    options.items.forEach(function(item) {
      if (item.divider) {
        html += '<div class="context-menu-divider"></div>';
        return;
      }
      
      var cls = 'context-menu-item' + (item.danger ? ' danger' : '');
      html += '<div class="' + cls + '" data-action="' + escapeHtml(item.action || '') + '">';
      if (item.icon) {
        html += '<span class="item-icon">' + LucideIcons.get(item.icon, 16) + '</span>';
      }
      html += '<span class="item-label">' + escapeHtml(item.label) + '</span>';
      if (item.shortcut) {
        html += '<span class="item-shortcut">' + escapeHtml(item.shortcut) + '</span>';
      }
      html += '</div>';
    });
    
    menu.innerHTML = html;
    
    // Position
    menu.style.left = options.x + 'px';
    menu.style.top = options.y + 'px';
    
    // Event handlers
    menu.addEventListener('click', function(e) {
      var item = e.target.closest('.context-menu-item');
      if (item) {
        var action = item.dataset.action;
        if (options.onAction && action) {
          options.onAction(action);
        }
        hideContextMenu();
      }
    });
    
    document.body.appendChild(menu);
    activeContextMenu = menu;
    
    // Adjust position if off-screen
    var rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
      menu.style.left = (options.x - rect.width) + 'px';
    }
    if (rect.bottom > window.innerHeight) {
      menu.style.top = (options.y - rect.height) + 'px';
    }
    
    // Close on click outside
    setTimeout(function() {
      document.addEventListener('click', hideContextMenuHandler);
      document.addEventListener('contextmenu', hideContextMenuHandler);
    }, 0);
  }
  
  function hideContextMenu() {
    if (activeContextMenu && activeContextMenu.parentNode) {
      activeContextMenu.parentNode.removeChild(activeContextMenu);
      activeContextMenu = null;
    }
    document.removeEventListener('click', hideContextMenuHandler);
    document.removeEventListener('contextmenu', hideContextMenuHandler);
  }
  
  function hideContextMenuHandler(e) {
    if (activeContextMenu && !activeContextMenu.contains(e.target)) {
      hideContextMenu();
    }
  }

  // === Custom Select ===
  function createCustomSelect(container, options) {
    options = options || {};
    var items = options.items || [];
    var selectedValue = options.value || '';
    var onChange = options.onChange || function() {};
    
    var select = document.createElement('div');
    select.className = 'custom-select';
    
    var selected = items.find(function(item) { return item.value === selectedValue; });
    
    select.innerHTML = 
      '<span class="select-value">' + escapeHtml(selected ? selected.label : (options.placeholder || 'Select...')) + '</span>' +
      '<span class="select-arrow">' + LucideIcons.get('chevron-down', 14) + '</span>';
    
    var dropdown = document.createElement('div');
    dropdown.className = 'custom-select-dropdown';
    
    items.forEach(function(item) {
      var option = document.createElement('div');
      option.className = 'custom-select-option' + (item.value === selectedValue ? ' selected' : '');
      option.dataset.value = item.value;
      
      var html = '';
      if (item.icon) {
        html += '<span class="option-icon">' + LucideIcons.get(item.icon, 14) + '</span>';
      }
      html += escapeHtml(item.label);
      option.innerHTML = html;
      
      option.addEventListener('click', function(e) {
        e.stopPropagation();
        select.querySelector('.select-value').textContent = item.label;
        dropdown.querySelectorAll('.custom-select-option').forEach(function(opt) {
          opt.classList.remove('selected');
        });
        option.classList.add('selected');
        select.classList.remove('open');
        onChange(item.value);
      });
      
      dropdown.appendChild(option);
    });
    
    select.appendChild(dropdown);
    
    select.addEventListener('click', function(e) {
      e.stopPropagation();
      select.classList.toggle('open');
    });
    
    document.addEventListener('click', function() {
      select.classList.remove('open');
    });
    
    container.appendChild(select);
    
    return {
      element: select,
      getValue: function() {
        var selected = dropdown.querySelector('.custom-select-option.selected');
        return selected ? selected.dataset.value : '';
      },
      setValue: function(value) {
        var option = dropdown.querySelector('[data-value="' + value + '"]');
        if (option) {
          select.querySelector('.select-value').textContent = option.textContent;
          dropdown.querySelectorAll('.custom-select-option').forEach(function(opt) {
            opt.classList.remove('selected');
          });
          option.classList.add('selected');
        }
      }
    };
  }

  // === Helper ===
  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // === Export ===
  window.Components = {
    Toast: Toast,
    confirm: confirmDialog,
    prompt: promptDialog,
    showContextMenu: showContextMenu,
    hideContextMenu: hideContextMenu,
    createCustomSelect: createCustomSelect
  };

})();
