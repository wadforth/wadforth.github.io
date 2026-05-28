const presetColors = [
    '#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6',
    '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16', '#f43f5e',
    '#6366f1', '#14b8a6', '#f59e0b', '#10b981', '#64748b',
    '#dc2626', '#ea580c', '#ca8a04', '#16a34a', '#2563eb',
];

document.getElementById('btn-legend-editor').addEventListener('click', () => {
    renderLegendEditor();
    document.getElementById('auto-color-toggle').checked = state.autoColorByQueries;
    new bootstrap.Modal(document.getElementById('legend-modal')).show();
});

document.getElementById('auto-color-toggle').addEventListener('change', (e) => {
    state.autoColorByQueries = e.target.checked;
    if (state.currentLayer) {
        state.currentLayer.autoColorByQueries = state.autoColorByQueries;
        saveCurrentLayer();
    }
    renderLegendEditor();
    requestAnimationFrame(() => renderMatrix());
});

function renderLegendEditor() {
    if (!state.currentLayer.legend) {
        state.currentLayer.legend = JSON.parse(JSON.stringify(defaultLegend));
    }
    
    const container = document.getElementById('legend-items');
    const legend = state.currentLayer.legend;
    const isAutoColor = state.autoColorByQueries;
    
    if (isAutoColor) {
        let html = `
            <div class="alert alert-info small mb-3">
                <i class="bi bi-info-circle me-1"></i>
                Auto-color is enabled. Customize rules below.
            </div>
        `;
        
        const techRules = state.autoColorRules.filter(r => r.type === 'sub-coverage');
        const subRules = state.autoColorRules.filter(r => r.type === 'query-count');
        
        const renderRuleSection = (title, rules) => {
            if (rules.length === 0) return '';
            let sectionHtml = `<div class="legend-section mb-3"><div class="legend-section-title">${title}</div>`;
            rules.forEach((rule) => {
                const origIdx = state.autoColorRules.indexOf(rule);
                sectionHtml += `
                    <div class="legend-item" data-rule-idx="${origIdx}">
                        <div class="legend-color-swatch-wrapper">
                            <div class="legend-color-swatch" style="background: ${rule.color}" data-rule-idx="${origIdx}"></div>
                            <div class="legend-color-picker hidden" data-rule-idx="${origIdx}">
                                <div class="legend-color-grid">
                                    ${presetColors.map(c => `<div class="legend-preset-color" style="background: ${c}" data-color="${c}"></div>`).join('')}
                                </div>
                                <div class="legend-custom-color">
                                    <input type="color" class="legend-custom-input" value="${rule.color}" data-rule-idx="${origIdx}">
                                    <span class="small text-muted">Custom</span>
                                </div>
                            </div>
                        </div>
                        <select class="form-select form-select-sm me-2" style="width: 60px;" data-rule-idx="${origIdx}" data-field="operator">
                            <option value=">=" ${rule.operator === '>=' ? 'selected' : ''}>≥</option>
                            <option value=">" ${rule.operator === '>' ? 'selected' : ''}>></option>
                            <option value="<=" ${rule.operator === '<=' ? 'selected' : ''}>≤</option>
                            <option value="<" ${rule.operator === '<' ? 'selected' : ''}>&lt;</option>
                            <option value="=" ${rule.operator === '=' ? 'selected' : ''}>=</option>
                        </select>
                        <input type="number" class="form-control form-control-sm me-2" style="width: 60px;" value="${rule.value}" data-rule-idx="${origIdx}" data-field="value" min="0" max="100">
                        <input type="text" class="legend-label-input" value="${rule.label}" data-rule-idx="${origIdx}" data-field="label" placeholder="Label">
                    </div>
                `;
            });
            sectionHtml += '</div>';
            return sectionHtml;
        };
        
        html += renderRuleSection('Techniques (Coverage %)', techRules);
        html += renderRuleSection('Sub-techniques (Query Count)', subRules);
        
        html += `
            <div class="text-on-surface-tertiary text-sm mt-2">
                <i class="bi bi-lock me-1"></i>Manual colors disabled. Toggle off "Auto-color by query coverage" to edit legend.
            </div>
        `;
        
        container.innerHTML = html;
        
        container.querySelectorAll('.legend-color-swatch').forEach(swatch => {
            swatch.addEventListener('click', (e) => {
                e.stopPropagation();
                const idx = parseInt(swatch.dataset.ruleIdx);
                document.querySelectorAll('.legend-color-picker').forEach(p => p.classList.add('hidden'));
                const picker = swatch.parentElement.querySelector('.legend-color-picker');
                picker.classList.toggle('hidden');
            });
        });
        
        container.querySelectorAll('.legend-preset-color').forEach(preset => {
            preset.addEventListener('click', (e) => {
                e.stopPropagation();
                const idx = parseInt(preset.closest('.legend-color-picker').dataset.ruleIdx);
                state.autoColorRules[idx].color = preset.dataset.color;
                const swatch = document.querySelector(`.legend-color-swatch[data-rule-idx="${idx}"]`);
                if (swatch) swatch.style.background = preset.dataset.color;
                document.querySelector(`.legend-custom-input[data-rule-idx="${idx}"]`).value = preset.dataset.color;
                renderMatrix();
                saveCurrentLayer();
                preset.closest('.legend-color-picker').classList.add('hidden');
            });
        });
        
        container.querySelectorAll('.legend-custom-input').forEach(input => {
            input.addEventListener('change', (e) => {
                e.stopPropagation();
                const idx = parseInt(e.target.dataset.ruleIdx);
                state.autoColorRules[idx].color = e.target.value;
                const swatch = document.querySelector(`.legend-color-swatch[data-rule-idx="${idx}"]`);
                if (swatch) swatch.style.background = e.target.value;
                renderMatrix();
                saveCurrentLayer();
            });
        });
        
        container.querySelectorAll('[data-field="operator"]').forEach(select => {
            select.addEventListener('change', (e) => {
                const idx = parseInt(e.target.dataset.ruleIdx);
                state.autoColorRules[idx].operator = e.target.value;
                renderMatrix();
                saveCurrentLayer();
            });
        });
        
        container.querySelectorAll('[data-field="value"]').forEach(input => {
            input.addEventListener('change', (e) => {
                const idx = parseInt(e.target.dataset.ruleIdx);
                state.autoColorRules[idx].value = parseInt(e.target.value) || 0;
                renderMatrix();
                saveCurrentLayer();
            });
        });
        
        container.querySelectorAll('[data-field="label"]').forEach(input => {
            input.addEventListener('input', (e) => {
                const idx = parseInt(e.target.dataset.ruleIdx);
                state.autoColorRules[idx].label = e.target.value;
            });
        });
        
        return;
    }
    
    container.innerHTML = legend.map((item, i) => `
        <div class="legend-item" data-index="${i}">
            <div class="legend-color-swatch-wrapper">
                <div class="legend-color-swatch" style="background: ${item.color}" data-index="${i}" data-color="${item.color}"></div>
                <div class="legend-color-picker hidden" data-index="${i}">
                    <div class="legend-color-grid">
                        ${presetColors.map(c => `<div class="legend-preset-color" style="background: ${c}" data-color="${c}"></div>`).join('')}
                    </div>
                    <div class="legend-custom-color">
                        <input type="color" class="legend-custom-input" value="${item.color}" data-index="${i}">
                        <span class="small text-muted">Custom</span>
                    </div>
                </div>
            </div>
            <input type="text" class="legend-label-input" value="${item.label}" data-index="${i}" placeholder="Label">
            <span class="legend-delete-btn" data-index="${i}"><i class="bi bi-trash"></i></span>
        </div>
    `).join('');

    container.querySelectorAll('.legend-color-swatch').forEach(swatch => {
        swatch.addEventListener('click', (e) => {
            e.stopPropagation();
            const idx = parseInt(swatch.dataset.index);
            document.querySelectorAll('.legend-color-picker').forEach(p => p.classList.add('hidden'));
            const picker = swatch.parentElement.querySelector('.legend-color-picker');
            picker.classList.toggle('hidden');
        });
    });

    container.querySelectorAll('.legend-preset-color').forEach(preset => {
        preset.addEventListener('click', (e) => {
            e.stopPropagation();
            const picker = preset.closest('.legend-color-picker');
            const idx = parseInt(picker.dataset.index);
            const newColor = preset.dataset.color;
            if (state.currentLayer.legend[idx]) {
                const oldColor = state.currentLayer.legend[idx].color;
                state.currentLayer.legend[idx].color = newColor;
                
                if (oldColor && oldColor !== newColor) {
                    state.currentLayer.techniques.forEach(t => {
                        if (t.color && t.color.toLowerCase() === oldColor.toLowerCase()) {
                            t.color = newColor;
                        }
                    });
                }
                
                const swatch = document.querySelector(`.legend-color-swatch[data-index="${idx}"]`);
                if (swatch) swatch.style.background = newColor;
                const input = document.querySelector(`.legend-custom-input[data-index="${idx}"]`);
                if (input) input.value = newColor;
                renderMatrix();
                saveCurrentLayer();
            }
            picker.classList.add('hidden');
        });
    });

    container.querySelectorAll('.legend-custom-input').forEach(input => {
        input.addEventListener('change', (e) => {
            e.stopPropagation();
            const idx = parseInt(e.target.dataset.index);
            if (state.currentLayer.legend[idx]) {
                const oldColor = state.currentLayer.legend[idx].color;
                const newColor = e.target.value;
                state.currentLayer.legend[idx].color = newColor;
                
                if (oldColor && oldColor !== newColor) {
                    state.currentLayer.techniques.forEach(t => {
                        if (t.color && t.color.toLowerCase() === oldColor.toLowerCase()) {
                            t.color = newColor;
                        }
                    });
                }
                
                const swatch = document.querySelector(`.legend-color-swatch[data-index="${idx}"]`);
                if (swatch) swatch.style.background = newColor;
                renderMatrix();
                saveCurrentLayer();
            }
        });
    });

    container.querySelectorAll('.legend-label-input').forEach(input => {
        input.addEventListener('input', (e) => {
            const idx = parseInt(e.target.dataset.index);
            if (state.currentLayer.legend[idx]) {
                state.currentLayer.legend[idx].label = e.target.value;
            }
        });
    });

    container.querySelectorAll('.legend-delete-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const idx = parseInt(btn.dataset.index);
            state.currentLayer.legend.splice(idx, 1);
            renderLegendEditor();
            renderMatrix();
            saveCurrentLayer();
        });
    });
}

document.addEventListener('click', (e) => {
    if (!e.target.closest('.legend-color-swatch-wrapper')) {
        document.querySelectorAll('.legend-color-picker').forEach(p => p.classList.add('hidden'));
    }
});

document.getElementById('btn-add-legend-item').addEventListener('click', () => {
    if (!state.currentLayer.legend) state.currentLayer.legend = [];
    state.currentLayer.legend.push({ label: 'New', color: '#6366f1' });
    renderLegendEditor();
});
