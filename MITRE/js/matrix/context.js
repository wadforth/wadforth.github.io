import { debounce } from '../utils/performance.js';

export function showContextMenu(e, techniqueId) {
    state.contextTarget = techniqueId;
    
    let menu = document.getElementById('context-menu');
    if (!menu) return;
    
    const ann = getTechniqueAnnotation(techniqueId);
    
    document.getElementById('context-menu-title').textContent = techniqueId;
    
    const isAutoColor = state.autoColorByQueries;
    const colorSection = menu.querySelector('.context-menu-section:first-child');
    
    if (isAutoColor) {
        colorSection.innerHTML = `
            <div class="context-menu-label">Color <span class="badge bg-secondary ms-1" style="font-size: 0.6rem;">Auto</span></div>
            <div class="text-on-surface-tertiary text-sm px-3 py-2">
                <i class="bi bi-info-circle me-1"></i>
                Disable auto-color in Legend to set manual colors.
            </div>
        `;
    } else {
        const legend = state.currentLayer?.legend || defaultLegend;
        const colorsHtml = legend.map(l =>
            `<div class="context-color-swatch" style="background: ${l.color}" data-color="${l.color}" title="${l.label}"></div>`
        ).join('');
        colorSection.innerHTML = `
            <div class="context-menu-label">Color</div>
            <div class="context-colors" id="context-colors">${colorsHtml}</div>
            <div class="context-menu-item" id="context-clear-color">
                <i class="bi bi-x-circle me-2"></i>Clear Color
            </div>
        `;
        
        requestAnimationFrame(() => {
            menu.querySelectorAll('.context-color-swatch').forEach(swatch => {
                swatch.addEventListener('click', () => {
                    setTechniqueAnnotation(techniqueId, { color: swatch.dataset.color });
                    logActivity('color_change', techniqueId, swatch.dataset.color);
                    hideContextMenu();
                });
            });
        });
        
        document.getElementById('context-clear-color').onclick = () => {
            setTechniqueAnnotation(techniqueId, { color: null });
            logActivity('color_clear', techniqueId, '');
            hideContextMenu();
        };
    }
    
    document.getElementById('context-add-comment').onclick = () => {
        hideContextMenu();
        document.getElementById('comment-text').value = ann?.comment || '';
        new bootstrap.Modal(document.getElementById('comment-modal')).show();
    };
    
    document.getElementById('context-set-score').onclick = () => {
        hideContextMenu();
        document.getElementById('score-value').value = ann?.score || 0;
        new bootstrap.Modal(document.getElementById('score-modal')).show();
    };
    
    document.getElementById('context-view-details').onclick = () => {
        hideContextMenu();
        showTechniqueModal(techniqueId);
    };
    
    document.getElementById('context-add-query').onclick = () => {
        hideContextMenu();
        openQueryEditor(null, techniqueId);
    };
    
    if (menu.parentElement !== document.body) {
        document.body.appendChild(menu);
    }
    
    const menuRect = menu.getBoundingClientRect();
    const menuWidth = menuRect.width || 220;
    const menuHeight = menuRect.height || 300;
    
    let x = e.clientX;
    let y = e.clientY;
    
    if (x + menuWidth > window.innerWidth - 10) {
        x = window.innerWidth - menuWidth - 10;
    }
    if (y + menuHeight > window.innerHeight - 10) {
        y = window.innerHeight - menuHeight - 10;
    }
    
    menu.style.left = `${Math.max(10, x)}px`;
    menu.style.top = `${Math.max(10, y)}px`;
    menu.classList.remove('hidden');
}

export function hideContextMenu() {
    document.getElementById('context-menu').classList.add('hidden');
    state.contextTarget = null;
}

document.addEventListener('click', (e) => {
    if (e.button !== 0) return;
    if (!e.target.closest('.context-menu')) hideContextMenu();
});

document.addEventListener('contextmenu', (e) => {
    const cell = e.target.closest('.technique-cell[data-id]');
    if (!cell) {
        hideContextMenu();
    }
});

document.getElementById('btn-save-comment').addEventListener('click', () => {
    if (state.contextTarget) {
        setTechniqueAnnotation(state.contextTarget, { comment: document.getElementById('comment-text').value });
    }
    bootstrap.Modal.getInstance(document.getElementById('comment-modal')).hide();
});

document.getElementById('btn-save-score').addEventListener('click', () => {
    if (state.contextTarget) {
        setTechniqueAnnotation(state.contextTarget, { score: parseInt(document.getElementById('score-value').value) || 0 });
    }
    bootstrap.Modal.getInstance(document.getElementById('score-modal')).hide();
});

document.getElementById('btn-expand-all').addEventListener('click', () => {
    document.querySelectorAll('.sub-techniques-container').forEach(el => {
        el.classList.remove('hidden');
        state.expandedTechniques.add(el.dataset.parent);
    });
    document.querySelectorAll('.sub-toggle i').forEach(i => {
        i.classList.remove('bi-caret-right-fill');
        i.classList.add('bi-caret-down-fill');
    });
    document.querySelectorAll('.expand-btn').forEach(btn => {
        btn.classList.add('expanded');
        btn.querySelector('i').classList.remove('bi-chevron-down');
        btn.querySelector('i').classList.add('bi-chevron-up');
    });
});

document.getElementById('btn-collapse-all').addEventListener('click', () => {
    document.querySelectorAll('.sub-techniques-container').forEach(el => {
        el.classList.add('hidden');
        state.expandedTechniques.delete(el.dataset.parent);
    });
    document.querySelectorAll('.sub-toggle i').forEach(i => {
        i.classList.remove('bi-caret-down-fill');
        i.classList.add('bi-caret-right-fill');
    });
    document.querySelectorAll('.expand-btn').forEach(btn => {
        btn.classList.remove('expanded');
        btn.querySelector('i').classList.remove('bi-chevron-up');
        btn.querySelector('i').classList.add('bi-chevron-down');
    });
});

export const matrixSearchInput = document.getElementById('matrix-search-input');
export const matrixSearchClear = document.getElementById('matrix-search-clear');

if (matrixSearchInput) {
    matrixSearchInput.addEventListener('input', debounce((e) => {
        state.matrixSearchQuery = e.target.value.trim();
        matrixSearchClear?.classList.toggle('hidden', !state.matrixSearchQuery);
        renderMatrix();
    }, 250));
}

if (matrixSearchClear) {
    matrixSearchClear.addEventListener('click', () => {
        state.matrixSearchQuery = '';
        matrixSearchInput.value = '';
        matrixSearchClear.classList.add('hidden');
        renderMatrix();
    });
}

// Legacy Window Bindings
window.showContextMenu = showContextMenu;
window.hideContextMenu = hideContextMenu;
window.matrixSearchInput = matrixSearchInput;
window.matrixSearchClear = matrixSearchClear;
