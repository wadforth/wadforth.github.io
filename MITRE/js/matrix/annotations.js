function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function escapeSvgText(text) {
    return String(text || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;')
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
}

function sanitizeSvgAttr(value) {
    return String(value || '').replace(/["<>&]/g, '');
}

function getContrastColor(hexColor) {
    const hex = hexColor.replace('#', '');
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.5 ? '#1a1a1a' : '#ffffff';
}

function highlightText(text, query) {
    if (!query) return escapeHtml(text);
    const escaped = escapeHtml(text);
    const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    return escaped.replace(regex, '<mark class="search-highlight">$1</mark>');
}

function getTechniqueAnnotation(techniqueId) {
    if (!state.currentLayer?.techniques) return null;
    return state.currentLayer.techniques.find(t => t.techniqueID === techniqueId);
}

function setTechniqueAnnotation(techniqueId, updates) {
    if (!state.currentLayer) return;
    let ann = getTechniqueAnnotation(techniqueId);
    if (!ann) {
        ann = { techniqueID: techniqueId, enabled: true };
        if (!ann.monthAdded) {
            ann.monthAdded = new Date().toISOString().slice(0, 7);
        }
        state.currentLayer.techniques.push(ann);
    }
    Object.assign(ann, updates);
    renderMatrix();
}

function buildAutoLegendSections() {
    const sections = [];
    const techRules = state.autoColorRules.filter(r => r.type === 'query-count');
    const subRules = state.autoColorRules.filter(r => r.type === 'sub-coverage');
    const seen = new Set();

    if (techRules.length > 0) {
        const items = [];
        for (const rule of techRules) {
            const key = `${rule.color}-${rule.label}`;
            if (seen.has(key)) continue;
            seen.add(key);
            items.push({ label: rule.label, color: rule.color });
        }
        sections.push({ title: 'Sub-techniques', items });
    }

    if (subRules.length > 0) {
        const items = [];
        for (const rule of subRules) {
            const key = `${rule.color}-${rule.label}`;
            if (seen.has(key)) continue;
            seen.add(key);
            items.push({ label: rule.label, color: rule.color });
        }
        sections.push({ title: 'Techniques', items });
    }

    return sections;
}

function getAutoColorForTechnique(techniqueId, allSubs = []) {
    if (!state.autoColorByQueries) return null;
    
    const ann = getTechniqueAnnotation(techniqueId);
    const hasSubs = allSubs.length > 0;
    
    if (hasSubs) {
        let coveredCount = 0;
        for (const sub of allSubs) {
            const subId = sub.external_references?.[0]?.external_id || '';
            const subAnn = getTechniqueAnnotation(subId);
            if (subAnn?.queries?.length > 0) coveredCount++;
        }
        const pct = allSubs.length > 0 ? (coveredCount / allSubs.length) * 100 : 0;
        
        if (pct === 0) return null;
        
        const rules = state.autoColorRules.filter(r => r.type === 'sub-coverage');
        for (const rule of rules) {
            let match = false;
            switch (rule.operator) {
                case '>=': match = pct >= rule.value; break;
                case '>': match = pct > rule.value; break;
                case '<=': match = pct <= rule.value; break;
                case '<': match = pct < rule.value; break;
                case '=': match = pct === rule.value; break;
            }
            if (match) return rule.color + '80';
        }
        return null;
    } else {
        const queryCount = ann?.queries?.length || 0;
        
        if (queryCount === 0) return null;
        
        const rules = state.autoColorRules.filter(r => r.type === 'query-count');
        for (const rule of rules) {
            let match = false;
            switch (rule.operator) {
                case '>=': match = queryCount >= rule.value; break;
                case '>': match = queryCount > rule.value; break;
                case '<=': match = queryCount <= rule.value; break;
                case '<': match = queryCount < rule.value; break;
                case '=': match = queryCount === rule.value; break;
            }
            if (match) return rule.color + '80';
        }
        return null;
    }
}
