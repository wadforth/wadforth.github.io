function showToast(message, type = 'info', duration = 3000) {
    const container = document.getElementById('app-toast');
    if (!container) return;
    
    const icons = { 
        success: 'bi-check-circle-fill', 
        error: 'bi-x-circle-fill', 
        info: 'bi-info-circle-fill',
        warning: 'bi-exclamation-triangle-fill'
    };
    const id = 'toast-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    const html = `
        <div id="${id}" class="toast app-toast toast-${type} toast-enter" role="alert">
            <div class="toast-body">
                <i class="bi ${icons[type] || icons.info} toast-icon"></i>
                <span>${escapeHtml ? escapeHtml(message) : message}</span>
            </div>
        </div>
    `;
    container.insertAdjacentHTML('beforeend', html);
    
    const el = document.getElementById(id);
    setTimeout(() => {
        if (el) {
            el.classList.remove('toast-enter');
            el.classList.add('toast-exit');
            el.addEventListener('animationend', () => el.remove(), { once: true });
        }
    }, duration);
}

function showPrompt(title, defaultValue = '') {
    return new Promise((resolve) => {
        const modal = document.getElementById('custom-prompt-modal');
        document.getElementById('custom-prompt-title').textContent = title;
        const input = document.getElementById('custom-prompt-input');
        input.value = defaultValue;

        let resolved = false;
        const resolveOnce = (val) => {
            if (resolved) return;
            resolved = true;
            cleanup();
            resolve(val);
        };

        const onOk = () => { resolveOnce(input.value); };
        const onCancel = () => { resolveOnce(null); };

        const cleanup = () => {
            document.getElementById('custom-prompt-ok').removeEventListener('click', onOk);
            modal.removeEventListener('hidden.bs.modal', onCancel);
        };

        document.getElementById('custom-prompt-ok').addEventListener('click', onOk);
        modal.addEventListener('hidden.bs.modal', onCancel);

        const bsModal = bootstrap.Modal.getOrCreateInstance(modal);
        bsModal.show();
        setTimeout(() => input.focus(), 300);
    });
}

function showConfirm(title, message) {
    return new Promise((resolve) => {
        const modal = document.getElementById('custom-confirm-modal');
        document.getElementById('custom-confirm-title').textContent = title;
        document.getElementById('custom-confirm-message').textContent = message;

        let resolved = false;
        const resolveOnce = (val) => {
            if (resolved) return;
            resolved = true;
            cleanup();
            resolve(val);
        };

        const onOk = () => { 
            const bsModal = bootstrap.Modal.getOrCreateInstance(modal);
            bsModal.hide();
            resolveOnce(true); 
        };
        const onCancel = () => { resolveOnce(false); };

        const cleanup = () => {
            document.getElementById('custom-confirm-ok').removeEventListener('click', onOk);
            modal.removeEventListener('hidden.bs.modal', onCancel);
        };

        document.getElementById('custom-confirm-ok').addEventListener('click', onOk);
        modal.addEventListener('hidden.bs.modal', onCancel);

        const bsModal = bootstrap.Modal.getOrCreateInstance(modal);
        bsModal.show();
    });
}

/* ============================================
   Enhanced Toast System
   ============================================ */

function showToastWithOptions(message, options = {}) {
    const {
        type = 'info',
        duration = 3000,
        icon = null,
        action = null,
        actionLabel = 'Action'
    } = options;
    
    const container = document.getElementById('app-toast');
    if (!container) return;
    
    const icons = { 
        success: 'bi-check-circle-fill', 
        error: 'bi-x-circle-fill', 
        info: 'bi-info-circle-fill',
        warning: 'bi-exclamation-triangle-fill'
    };
    
    const id = 'toast-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    const actionHtml = action 
        ? `<button class="toast-action-btn" onclick="(${action.toString()})()">${actionLabel}</button>` 
        : '';
    
    const html = `
        <div id="${id}" class="toast app-toast toast-${type} toast-enter" role="alert">
            <div class="toast-body">
                <i class="bi ${icon || icons[type] || icons.info} toast-icon"></i>
                <span>${escapeHtml ? escapeHtml(message) : message}</span>
                ${actionHtml}
            </div>
        </div>
    `;
    container.insertAdjacentHTML('beforeend', html);
    
    const el = document.getElementById(id);
    setTimeout(() => {
        if (el) {
            el.classList.remove('toast-enter');
            el.classList.add('toast-exit');
            el.addEventListener('animationend', () => el.remove(), { once: true });
        }
    }, duration);
    
    return id;
}

function dismissToast(toastId) {
    const el = document.getElementById(toastId);
    if (el) {
        el.classList.remove('toast-enter');
        el.classList.add('toast-exit');
        el.addEventListener('animationend', () => el.remove(), { once: true });
    }
}

function dismissAllToasts() {
    document.querySelectorAll('#app-toast .toast').forEach(toast => {
        toast.classList.remove('toast-enter');
        toast.classList.add('toast-exit');
        toast.addEventListener('animationend', () => toast.remove(), { once: true });
    });
}

/* ============================================
   Keyboard Shortcuts System
   ============================================ */

const keyboardShortcuts = {
    handlers: {},
    
    register(key, handler, description = '') {
        this.handlers[key.toLowerCase()] = { handler, description };
    },
    
    unregister(key) {
        delete this.handlers[key.toLowerCase()];
    },
    
    handle(event) {
        if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA' || event.target.isContentEditable) {
            if (event.key === 'Escape') {
                event.target.blur();
            }
            return;
        }
        
        const key = event.key.toLowerCase();
        const combo = [
            event.ctrlKey ? 'ctrl' : '',
            event.shiftKey ? 'shift' : '',
            event.altKey ? 'alt' : '',
            key
        ].filter(Boolean).join('+');
        
        if (this.handlers[combo]) {
            event.preventDefault();
            this.handlers[combo].handler(event);
        }
    },
    
    showHelp() {
        const shortcuts = Object.entries(this.handlers).map(([key, { description }]) => ({
            key: key.toUpperCase(),
            description
        })).filter(s => s.description);
        
        if (shortcuts.length === 0) return;
        
        let html = '<div class="keyboard-shortcuts-help">';
        html += '<h5>Keyboard Shortcuts</h5>';
        html += '<div class="shortcuts-list">';
        shortcuts.forEach(({ key, description }) => {
            html += `<div class="shortcut-row"><kbd>${key}</kbd><span>${description}</span></div>`;
        });
        html += '</div></div>';
        
        showToast(html, 'info', 8000);
    }
};

document.addEventListener('keydown', (e) => keyboardShortcuts.handle(e));

function registerDefaultShortcuts() {
    keyboardShortcuts.register('ctrl+k', () => {
        const searchInput = document.querySelector('#matrix-search, #search-input');
        if (searchInput) {
            searchInput.focus();
            searchInput.select();
        }
    }, 'Focus search');
    
    keyboardShortcuts.register('escape', () => {
        const openModal = document.querySelector('.modal.show');
        if (openModal) {
            const bsModal = bootstrap.Modal.getInstance(openModal);
            if (bsModal) bsModal.hide();
        }
    }, 'Close modal');
    
    keyboardShortcuts.register('ctrl+s', () => {
        if (state.currentLayer) {
            saveCurrentLayer();
            showToast('Layer saved', 'success');
        }
    }, 'Save layer');
    
    keyboardShortcuts.register('ctrl+z', () => {
        if (typeof undo === 'function') {
            undo();
        }
    }, 'Undo');
    
    keyboardShortcuts.register('ctrl+y', () => {
        if (typeof redo === 'function') {
            redo();
        }
    }, 'Redo');
    
    keyboardShortcuts.register('?', () => {
        keyboardShortcuts.showHelp();
    }, 'Show shortcuts');
    
    keyboardShortcuts.register('1', () => {
        document.querySelector('[data-view="matrix"]')?.click();
    }, 'Switch to Matrix');
    
    keyboardShortcuts.register('2', () => {
        document.querySelector('[data-view="queries"]')?.click();
    }, 'Switch to Queries');
    
    keyboardShortcuts.register('3', () => {
        document.querySelector('[data-view="reports"]')?.click();
    }, 'Switch to Reports');
    
    keyboardShortcuts.register('4', () => {
        document.querySelector('[data-view="groups"]')?.click();
    }, 'Switch to Groups');
    
    keyboardShortcuts.register('5', () => {
        document.querySelector('[data-view="software"]')?.click();
    }, 'Switch to Software');
}

/* ============================================
   Loading Skeleton Helpers
   ============================================ */

function showSkeleton(container, type = 'card', count = 3) {
    if (!container) return;
    
    const skeletons = {
        card: `<div class="skeleton-card"><div class="skeleton skeleton-title"></div><div class="skeleton skeleton-paragraph"></div><div class="skeleton skeleton-paragraph"></div></div>`,
        list: `<div class="skeleton-list-item"><div class="skeleton skeleton-avatar"></div><div class="skeleton-content"><div class="skeleton skeleton-text"></div><div class="skeleton skeleton-text skeleton-text-sm"></div></div></div>`,
        stat: `<div class="skeleton-stat-card"><div class="skeleton skeleton-value"></div><div class="skeleton skeleton-label"></div></div>`,
        table: `<div class="skeleton-table-row"><div class="skeleton skeleton-text" style="flex:1"></div><div class="skeleton skeleton-text" style="flex:0.5"></div><div class="skeleton skeleton-text" style="flex:0.3"></div></div>`,
        report: `<div class="skeleton-report-card"><div class="skeleton skeleton-badge"></div><div class="skeleton-content"><div class="skeleton skeleton-text"></div><div class="skeleton skeleton-text skeleton-text-sm"></div></div></div>`
    };
    
    const skeletonHtml = skeletons[type] || skeletons.card;
    let html = '<div class="loading-container">';
    for (let i = 0; i < count; i++) {
        html += skeletonHtml;
    }
    html += '</div>';
    
    container.innerHTML = html;
}

function hideSkeleton(container) {
    if (container && container.querySelector('.loading-container')) {
        container.innerHTML = '';
    }
}

/* ============================================
   Auto-Save Indicator
   ============================================ */

let autoSaveTimeout = null;

function showAutoSaveIndicator(status = 'saving') {
    let indicator = document.getElementById('autosave-indicator');
    
    if (!indicator) {
        indicator = document.createElement('div');
        indicator.id = 'autosave-indicator';
        indicator.className = 'autosave-indicator';
        document.body.appendChild(indicator);
    }
    
    const icons = {
        saving: '<i class="bi bi-arrow-repeat rotate"></i> Saving...',
        saved: '<i class="bi bi-check-circle-fill"></i> Saved',
        error: '<i class="bi bi-x-circle-fill"></i> Save failed'
    };
    
    indicator.innerHTML = icons[status] || icons.saving;
    indicator.className = `autosave-indicator autosave-${status}`;
    indicator.classList.remove('hidden');
    
    if (status === 'saved' || status === 'error') {
        setTimeout(() => {
            indicator.classList.add('hidden');
        }, 2000);
    }
}

function debounceAutoSave(saveFn, delay = 1000) {
    if (autoSaveTimeout) {
        clearTimeout(autoSaveTimeout);
    }
    
    showAutoSaveIndicator('saving');
    
    autoSaveTimeout = setTimeout(async () => {
        try {
            await saveFn();
            showAutoSaveIndicator('saved');
        } catch (err) {
            showAutoSaveIndicator('error');
            console.error('Auto-save failed:', err);
        }
    }, delay);
}

/* ============================================
   Undo/Redo System
   ============================================ */

const undoStack = {
    history: [],
    future: [],
    maxSize: 50,
    
    push(action) {
        this.history.push(action);
        if (this.history.length > this.maxSize) {
            this.history.shift();
        }
        this.future = [];
    },
    
    undo() {
        const action = this.history.pop();
        if (!action) return false;
        
        action.undo();
        this.future.push(action);
        return true;
    },
    
    redo() {
        const action = this.future.pop();
        if (!action) return false;
        
        action.redo();
        this.history.push(action);
        return true;
    },
    
    clear() {
        this.history = [];
        this.future = [];
    },
    
    canUndo() {
        return this.history.length > 0;
    },
    
    canRedo() {
        return this.future.length > 0;
    }
};

function undo() {
    if (undoStack.undo()) {
        showToast('Undone', 'info');
    }
}

function redo() {
    if (undoStack.redo()) {
        showToast('Redone', 'info');
    }
}

function recordUndo(description, undoFn, redoFn) {
    undoStack.push({
        description,
        undo: undoFn,
        redo: redoFn
    });
}

/* ============================================
   Tooltip System
   ============================================ */

function initTooltips() {
    document.querySelectorAll('[data-tooltip]').forEach(el => {
        el.addEventListener('mouseenter', showTooltip);
        el.addEventListener('mouseleave', hideTooltip);
        el.addEventListener('focus', showTooltip);
        el.addEventListener('blur', hideTooltip);
    });
}

function showTooltip(event) {
    const el = event.target;
    const text = el.dataset.tooltip;
    const placement = el.dataset.tooltipPlacement || 'top';
    
    if (!text) return;
    
    let tooltip = document.getElementById('global-tooltip');
    
    if (!tooltip) {
        tooltip = document.createElement('div');
        tooltip.id = 'global-tooltip';
        tooltip.className = 'global-tooltip';
        document.body.appendChild(tooltip);
    }
    
    tooltip.textContent = text;
    tooltip.className = `global-tooltip tooltip-enter tooltip-${placement}`;
    
    const rect = el.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    
    let top, left;
    
    switch (placement) {
        case 'top':
            top = rect.top - tooltipRect.height - 8;
            left = rect.left + (rect.width / 2) - (tooltipRect.width / 2);
            break;
        case 'bottom':
            top = rect.bottom + 8;
            left = rect.left + (rect.width / 2) - (tooltipRect.width / 2);
            break;
        case 'left':
            top = rect.top + (rect.height / 2) - (tooltipRect.height / 2);
            left = rect.left - tooltipRect.width - 8;
            break;
        case 'right':
            top = rect.top + (rect.height / 2) - (tooltipRect.height / 2);
            left = rect.right + 8;
            break;
    }
    
    tooltip.style.top = `${top + window.scrollY}px`;
    tooltip.style.left = `${left + window.scrollX}px`;
    tooltip.classList.remove('hidden');
}

function hideTooltip(event) {
    const tooltip = document.getElementById('global-tooltip');
    if (tooltip) {
        tooltip.classList.add('hidden');
    }
}

function updateTooltip(text) {
    const tooltip = document.getElementById('global-tooltip');
    if (tooltip) {
        tooltip.textContent = text;
    }
}

/* ============================================
   Initialize UI Utilities
   ============================================ */

function initUI() {
    registerDefaultShortcuts();
    initTooltips();
}

