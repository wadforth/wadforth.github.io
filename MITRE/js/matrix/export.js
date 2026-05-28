document.getElementById('btn-export-matrix')?.addEventListener('click', () => {
    if (!state.currentLayer) {
        showToast('No layer loaded', 'error');
        return;
    }
    
    const tacticOrder = state.tactics
        .filter(t => t.x_mitre_shortname)
        .sort((a, b) => (a.x_mitre_order || 0) - (b.x_mitre_order || 0));
    
    const grid = document.getElementById('tactic-checkbox-grid');
    grid.innerHTML = tacticOrder.map(t => {
        const short = t.x_mitre_shortname;
        const count = state.techniques.filter(tech => {
            const phases = tech.kill_chain_phases?.filter(k => k.kill_chain_name === 'mitre-attack').map(k => k.phase_name) || [];
            return phases.includes(short);
        }).length;
        return `
            <div class="tactic-checkbox-item">
                <input type="checkbox" class="tactic-check" id="tc-${short}" value="${short}" checked>
                <label for="tc-${short}">${t.name} (${count})</label>
            </div>
        `;
    }).join('');
    
    document.getElementById('btn-select-all-tactics').onclick = () => {
        grid.querySelectorAll('.tactic-check').forEach(cb => cb.checked = true);
        updateExportPreview();
    };
    
    document.getElementById('btn-deselect-all-tactics').onclick = () => {
        grid.querySelectorAll('.tactic-check').forEach(cb => cb.checked = false);
        updateExportPreview();
    };
    
    grid.querySelectorAll('.tactic-check').forEach(cb => {
        cb.addEventListener('change', updateExportPreview);
    });
    
    ['export-expand-subs', 'export-only-annotated', 'export-include-legend', 'export-include-header', 'export-include-footer'].forEach(id => {
        document.getElementById(id)?.addEventListener('change', updateExportPreview);
    });
    
    updateExportPreview();
    new bootstrap.Modal(document.getElementById('export-options-modal')).show();
});

function updateExportPreview() {
    const selectedTactics = [...document.querySelectorAll('.tactic-check:checked')].map(cb => cb.value);
    
    const filtered = state.techniques.filter(t => {
        const phases = t.kill_chain_phases?.filter(k => k.kill_chain_name === 'mitre-attack').map(k => k.phase_name) || [];
        const tacticMatch = phases.some(p => selectedTactics.includes(p));
        if (!tacticMatch) return false;
        
        const onlyAnnotated = document.getElementById('export-only-annotated')?.checked;
        if (onlyAnnotated) {
            const id = t.external_references?.[0]?.external_id || '';
            const ann = getTechniqueAnnotation(id);
            return ann?.color || ann?.queries?.length > 0;
        }
        return true;
    });
    
    document.getElementById('export-tactic-count').textContent = selectedTactics.length;
    document.getElementById('export-tech-count').textContent = filtered.length;
}

document.getElementById('btn-confirm-export')?.addEventListener('click', async () => {
    bootstrap.Modal.getInstance(document.getElementById('export-options-modal'))?.hide();
    
    const btn = document.getElementById('btn-export-matrix');
    const originalHtml = btn.innerHTML;
    btn.innerHTML = '<i class="bi bi-hourglass-split me-1"></i>Generating...';
    btn.disabled = true;
    
    const selectedTactics = [...document.querySelectorAll('.tactic-check:checked')].map(cb => cb.value);
    const expandSubs = document.getElementById('export-expand-subs')?.checked;
    const onlyAnnotated = document.getElementById('export-only-annotated')?.checked;
    const includeLegend = document.getElementById('export-include-legend')?.checked;
    const includeHeader = document.getElementById('export-include-header')?.checked;
    const includeFooter = document.getElementById('export-include-footer')?.checked;
    const format = document.querySelector('input[name="export-format"]:checked')?.value || 'png';
    
    try {
        if (format === 'pdf') {
            await exportMatrixPDF(selectedTactics, expandSubs, onlyAnnotated, includeLegend, includeHeader, includeFooter);
        } else if (format === 'svg') {
            await exportMatrixSVG(selectedTactics, expandSubs, onlyAnnotated, includeLegend, includeHeader, includeFooter);
        } else {
            await exportMatrixPNG(selectedTactics, expandSubs, onlyAnnotated, includeLegend, includeHeader, includeFooter);
        }
        showToast('Matrix exported successfully', 'success');
    } catch (err) {
        showToast('Failed to export: ' + err.message, 'error');
    } finally {
        btn.innerHTML = originalHtml;
        btn.disabled = false;
    }
});

async function exportMatrixPNG(selectedTactics, expandSubs, onlyAnnotated, includeLegend, includeHeader, includeFooter) {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const exportBg = isDark ? '#0f172a' : '#ffffff';
    const exportSurface = isDark ? '#1e293b' : '#ffffff';
    const exportSubtle = isDark ? '#162032' : '#f8f8f8';
    const exportText = isDark ? '#f1f5f9' : '#1a1a1a';
    const exportTextSec = isDark ? '#94a3b8' : '#666';
    const exportTextTer = isDark ? '#64748b' : '#999';
    const exportBorder = isDark ? '#334155' : '#eee';
    const exportLegend = isDark ? '#162032' : '#f5f5f5';
    const exportCellBg = isDark ? '#0f172a' : '#f8f8f8';
    const exportTechId = isDark ? '#818cf8' : '#6366f1';
    const exportTechName = isDark ? '#cbd5e1' : '#333';
    
    const exportContainer = document.createElement('div');
    exportContainer.className = 'matrix-export-container';
    exportContainer.style.width = '1600px';
    exportContainer.style.background = exportBg;
    exportContainer.style.color = exportText;
    document.body.appendChild(exportContainer);
    
    const domainLabel = state.currentDomain.replace('-attack', '').charAt(0).toUpperCase() + state.currentDomain.replace('-attack', '').slice(1);
    const version = state.currentVersion || 'master';
    const isAuto = state.autoColorByQueries;
    const legendSections = isAuto ? buildAutoLegendSections() : null;
    const legendItems = isAuto ? null : (state.currentLayer?.legend || defaultLegend);
    
    const tacticOrder = state.tactics
        .filter(t => t.x_mitre_shortname && selectedTactics.includes(t.x_mitre_shortname))
        .sort((a, b) => (a.x_mitre_order || 0) - (b.x_mitre_order || 0));
    
    const allTechniques = state.techniques.filter(t => {
        const platforms = t.x_mitre_platforms || [];
        const platformMatch = platforms.length === 0 || platforms.some(p => state.activePlatforms.has(p));
        return platformMatch;
    });
    
    const techniqueMap = {};
    for (const t of allTechniques) {
        const phaseNames = t.kill_chain_phases?.filter(k => k.kill_chain_name === 'mitre-attack').map(k => k.phase_name) || [];
        for (const phase of phaseNames) {
            if (!techniqueMap[phase]) techniqueMap[phase] = [];
            techniqueMap[phase].push(t);
        }
    }
    
    const isSub = (t) => t.x_mitre_is_subtechnique;
    const parentId = (t) => t.external_references?.[0]?.external_id?.split('.')[0];
    
    let totalCells = 0;
    for (const tactic of tacticOrder) {
        const short = tactic.x_mitre_shortname;
        const techniques = techniqueMap[short] || [];
        const parentTechs = (onlyAnnotated 
            ? techniques.filter(t => {
                const id = t.external_references?.[0]?.external_id || '';
                const ann = getTechniqueAnnotation(id);
                return !isSub(t) && (ann?.color || ann?.queries?.length > 0);
            })
            : techniques.filter(t => !isSub(t))
        );
        totalCells += parentTechs.length;
        if (expandSubs) {
            for (const tech of parentTechs) {
                const id = tech.external_references?.[0]?.external_id || '';
                const subs = techniques.filter(s => isSub(s) && parentId(s) === id);
                totalCells += subs.length;
            }
        }
    }
    
    const estimatedWidth = tacticOrder.length * 140;
    const willOverflow = estimatedWidth > 1600;
    
    if (willOverflow) {
        const confirmed = await showConfirm('Wide Export Warning', 
            `This export has ${tacticOrder.length} tactics (~${estimatedWidth}px wide). Columns may be compressed. Consider using PDF export or selecting fewer tactics.`);
        if (!confirmed) {
            document.body.removeChild(exportContainer);
            const btn = document.getElementById('btn-export-matrix');
            btn.innerHTML = '<i class="bi bi-camera me-1"></i>Export Image';
            btn.disabled = false;
            return;
        }
    }
    
    let html = '';
    
    if (includeHeader) {
        html += `
            <div class="matrix-export-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem; padding-bottom: 0.5rem; border-bottom: 2px solid #6366f1;">
                <div class="matrix-export-header-left" style="display: flex; align-items: center; gap: 1rem;">
                    ${state.companyLogo ? `<img src="${state.companyLogo}" class="matrix-export-logo" style="height: 30px; max-width: 120px; object-fit: contain;" alt="Logo">` : ''}
                    <div>
                        <h1 class="matrix-export-title" style="font-size: 1rem; font-weight: 700; color: #6366f1; margin: 0;">${domainLabel} ATT&CK Matrix</h1>
                        <p class="matrix-export-subtitle" style="font-size: 0.7rem; color: ${exportTextSec}; margin: 0.15rem 0 0;">${state.currentLayer?.name || 'Untitled Layer'} • ATT&CK ${version}</p>
                    </div>
                </div>
                <div class="matrix-export-header-right" style="text-align: right;">
                    ${state.companyName ? `<div class="matrix-export-company" style="font-size: 0.85rem; font-weight: 600; color: ${exportText};">${escapeHtml(state.companyName)}</div>` : ''}
                    <div class="matrix-export-meta" style="font-size: 0.6rem; color: ${exportTextTer};">Generated ${new Date().toLocaleDateString()}</div>
                </div>
            </div>
        `;
    }
    
    if (includeLegend) {
        if (legendSections) {
            html += `<div class="matrix-export-legend" style="display: flex; gap: 1.5rem; margin-bottom: 0.5rem; padding: 0.5rem; background: ${exportLegend}; border-radius: 4px; flex-wrap: wrap;">`;
            for (const section of legendSections) {
                html += '<div>';
                html += `<div class="matrix-export-legend-section-title" style="font-size: 0.6rem; font-weight: 700; color: ${exportTechId}; text-transform: uppercase; letter-spacing: 0.05em;">${escapeHtml(section.title)}</div>`;
                html += '<div style="display: flex; gap: 0.75rem; flex-wrap: wrap; margin-top: 0.25rem;">';
                for (const item of section.items) {
                    html += `<div class="matrix-export-legend-item" style="display: flex; align-items: center; gap: 0.35rem; font-size: 0.65rem; color: ${exportTextSec};"><span class="matrix-export-legend-color" style="background: ${item.color}; width: 12px; height: 12px; border-radius: 3px; border: 1px solid ${exportBorder};"></span>${escapeHtml(item.label)}</div>`;
                }
                html += '</div></div>';
            }
            html += '</div>';
        } else if (legendItems.length > 0) {
            html += `<div class="matrix-export-legend" style="display: flex; gap: 0.75rem; margin-bottom: 0.5rem; padding: 0.5rem; background: ${exportLegend}; border-radius: 4px; flex-wrap: wrap;">`;
            legendItems.forEach(l => {
                html += `<div class="matrix-export-legend-item" style="display: flex; align-items: center; gap: 0.35rem; font-size: 0.65rem; color: ${exportTextSec};"><span class="matrix-export-legend-color" style="background: ${l.color}; width: 12px; height: 12px; border-radius: 3px; border: 1px solid ${exportBorder};"></span>${escapeHtml(l.label)}</div>`;
            });
            html += '</div>';
        }
    }
    
    html += `<table class="matrix-export-table" style="border-spacing: 1px;"><thead><tr>`;
    for (const tactic of tacticOrder) {
        const short = tactic.x_mitre_shortname;
        const techniques = techniqueMap[short] || [];
        const filtered = onlyAnnotated 
            ? techniques.filter(t => {
                const id = t.external_references?.[0]?.external_id || '';
                const ann = getTechniqueAnnotation(id);
                return !isSub(t) && (ann?.color || ann?.queries?.length > 0);
            })
            : techniques.filter(t => !isSub(t));
        const count = filtered.length;
        html += `<th style="background: #6366f1; color: white; font-weight: 600; text-align: center; padding: 0.35rem; min-width: 120px; font-size: 0.65rem;"><div>${tactic.name}</div><div style="opacity:0.7;font-size:0.65rem">${short}</div><div style="opacity:0.6;font-size:0.6rem">${count}</div></th>`;
    }
    html += '</tr></thead><tbody><tr>';
    
    for (const tactic of tacticOrder) {
        const short = tactic.x_mitre_shortname;
        const techniques = techniqueMap[short] || [];
        const parentTechs = (onlyAnnotated 
            ? techniques.filter(t => {
                const id = t.external_references?.[0]?.external_id || '';
                const ann = getTechniqueAnnotation(id);
                return !isSub(t) && (ann?.color || ann?.queries?.length > 0);
            })
            : techniques.filter(t => !isSub(t))
        ).sort((a, b) => {
            const idA = a.external_references?.[0]?.external_id || '';
            const idB = b.external_references?.[0]?.external_id || '';
            return idA.localeCompare(idB, undefined, { numeric: true });
        });
        const subTechs = techniques.filter(t => isSub(t));
        
        html += `<td style="vertical-align: top; padding: 0; background: ${exportSubtle}; min-width: 120px;">`;
        for (const tech of parentTechs) {
            const id = tech.external_references?.[0]?.external_id || '';
            const name = tech.name;
            const subs = subTechs.filter(s => parentId(s) === id);
            const ann = getTechniqueAnnotation(id);
            const effectiveColor = state.autoColorByQueries ? getAutoColorForTechnique(id, subs) : ann?.color;
            const isAutoColor = state.autoColorByQueries && effectiveColor;
            const bgColor = effectiveColor ? `background: ${effectiveColor}${isAutoColor ? '' : 'cc'}; color: ${getContrastColor(effectiveColor.replace(/80$/, ''))};` : '';
            
            html += `<div class="matrix-export-cell" style="${bgColor} padding: 0.2rem 0.35rem; border-bottom: 1px solid ${exportBorder}; font-size: 0.6rem;">
                <div class="tech-id" style="font-family: monospace; font-weight: 600; color: ${effectiveColor ? getContrastColor(effectiveColor.replace(/80$/, '')) : exportTechId};">${id}</div>
                <div class="tech-name" style="color: ${effectiveColor ? getContrastColor(effectiveColor.replace(/80$/, '')) : exportTechName}; font-size: 0.55rem;">${escapeHtml(name)}</div>
            </div>`;
            
            if (expandSubs) {
                for (const sub of subs) {
                    const subId = sub.external_references?.[0]?.external_id || '';
                    const subName = sub.name;
                    const subAnn = getTechniqueAnnotation(subId);
                    const subColor = state.autoColorByQueries ? getAutoColorForTechnique(subId, []) : subAnn?.color;
                    const isSubAuto = state.autoColorByQueries && subColor;
                    const subBgColor = subColor ? `background: ${subColor}${isSubAuto ? '' : 'cc'}; color: ${getContrastColor(subColor.replace(/80$/, ''))}; margin-left: 0.5rem;` : `margin-left: 0.5rem; color: ${exportTextSec};`;
                    html += `<div class="matrix-export-cell sub-technique" style="${subBgColor} padding: 0.2rem 0.35rem; border-bottom: 1px solid ${exportBorder}; font-size: 0.6rem;">
                        <div class="tech-id" style="font-family: monospace; font-weight: 600; font-size: 0.6rem; color: ${subColor ? getContrastColor(subColor.replace(/80$/, '')) : exportTechId};">${subId}</div>
                        <div class="tech-name" style="font-size: 0.55rem; color: ${subColor ? getContrastColor(subColor.replace(/80$/, '')) : exportTechName};">${escapeHtml(subName)}</div>
                    </div>`;
                }
            }
        }
        html += '</td>';
    }
    html += '</tr></tbody></table>';
    
    if (includeFooter) {
        html += `
            <div class="matrix-export-footer" style="margin-top: 0.5rem; padding-top: 0.35rem; border-top: 1px solid ${exportBorder}; font-size: 0.55rem; color: ${exportTextTer}; text-align: center;">
                ${state.companyName ? `${escapeHtml(state.companyName)} • ` : ''}
                MITRE ATT&CK ${domainLabel} ${version} • Generated ${new Date().toLocaleString()}
            </div>
        `;
    }
    
    exportContainer.innerHTML = html;
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const canvas = await html2canvas(exportContainer, {
        scale: 2,
        useCORS: true,
        backgroundColor: exportBg,
        logging: false,
        width: 1600,
    });
    
    document.body.removeChild(exportContainer);
    
    const link = document.createElement('a');
    const domain = state.currentDomain.replace('-attack', '');
    const timestamp = new Date().toISOString().slice(0, 10);
    link.download = `mitre-${domain}-matrix-${timestamp}.png`;
    link.href = canvas.toDataURL('image/png', 1.0);
    link.click();
}

async function exportMatrixPDF(selectedTactics, expandSubs, onlyAnnotated, includeLegend, includeHeader, includeFooter) {
    const domainLabel = state.currentDomain.replace('-attack', '').charAt(0).toUpperCase() + state.currentDomain.replace('-attack', '').slice(1);
    const version = state.currentVersion || 'master';
    const isAuto = state.autoColorByQueries;
    const legendSections = isAuto ? buildAutoLegendSections() : null;
    const legendItems = isAuto ? null : (state.currentLayer?.legend || defaultLegend);
    
    const tacticOrder = state.tactics
        .filter(t => t.x_mitre_shortname && selectedTactics.includes(t.x_mitre_shortname))
        .sort((a, b) => (a.x_mitre_order || 0) - (b.x_mitre_order || 0));
    
    const allTechniques = state.techniques.filter(t => {
        const platforms = t.x_mitre_platforms || [];
        const platformMatch = platforms.length === 0 || platforms.some(p => state.activePlatforms.has(p));
        return platformMatch;
    });
    
    const techniqueMap = {};
    for (const t of allTechniques) {
        const phaseNames = t.kill_chain_phases?.filter(k => k.kill_chain_name === 'mitre-attack').map(k => k.phase_name) || [];
        for (const phase of phaseNames) {
            if (!techniqueMap[phase]) techniqueMap[phase] = [];
            techniqueMap[phase].push(t);
        }
    }
    
    const isSub = (t) => t.x_mitre_is_subtechnique;
    const parentId = (t) => t.external_references?.[0]?.external_id?.split('.')[0];
    
    const tacticsPerPage = 4;
    const pages = [];
    
    for (let i = 0; i < tacticOrder.length; i += tacticsPerPage) {
        const pageTactics = tacticOrder.slice(i, i + tacticsPerPage);
        pages.push(pageTactics);
    }
    
    const printWindow = window.open('', '_blank');
    
    let html = `
<!DOCTYPE html>
<html>
<head>
    <title>${escapeHtml(state.currentLayer?.name || 'ATT&CK Matrix')} - Export</title>
    <style>
        @page { size: landscape; margin: 1cm; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; color: #1a1a1a; }
        .page { page-break-after: always; padding: 1rem; }
        .page:last-child { page-break-after: auto; }
        .matrix-export-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem; padding-bottom: 0.5rem; border-bottom: 2px solid #6366f1; }
        .matrix-export-header-left { display: flex; align-items: center; gap: 1rem; }
        .matrix-export-logo { height: 30px; max-width: 120px; object-fit: contain; }
        .matrix-export-title { font-size: 1rem; font-weight: 700; color: #6366f1; margin: 0; }
        .matrix-export-subtitle { font-size: 0.7rem; color: #666; margin: 0.15rem 0 0; }
        .matrix-export-header-right { text-align: right; }
        .matrix-export-company { font-size: 0.85rem; font-weight: 600; }
        .matrix-export-meta { font-size: 0.6rem; color: #999; }
        .matrix-export-legend { display: flex; flex-direction: column; gap: 0.5rem; margin-bottom: 0.5rem; padding: 0.5rem; background: #f5f5f5; border-radius: 4px; }
        .matrix-export-legend-section-title { font-size: 0.6rem; font-weight: 700; color: #6366f1; text-transform: uppercase; letter-spacing: 0.05em; }
        .matrix-export-legend-item { display: flex; align-items: center; gap: 0.35rem; font-size: 0.65rem; }
        .matrix-export-legend-color { width: 12px; height: 12px; border-radius: 3px; border: 1px solid #ddd; }
        .matrix-export-table { width: 100%; border-collapse: separate; border-spacing: 1px; }
        .matrix-export-table th { background: #6366f1; color: white; font-weight: 600; text-align: center; padding: 0.35rem; min-width: 120px; font-size: 0.65rem; }
        .matrix-export-table td { vertical-align: top; padding: 0; background: #f8f8f8; min-width: 120px; }
        .matrix-export-cell { padding: 0.2rem 0.35rem; border-bottom: 1px solid #eee; font-size: 0.6rem; }
        .matrix-export-cell .tech-id { font-family: monospace; font-weight: 600; color: #6366f1; }
        .matrix-export-cell .tech-name { color: #333; font-size: 0.55rem; }
        .matrix-export-cell.sub-technique { margin-left: 0.35rem; }
        .matrix-export-footer { margin-top: 0.5rem; padding-top: 0.35rem; border-top: 1px solid #ddd; font-size: 0.55rem; color: #999; text-align: center; }
        @media print { body { margin: 0; } }
    </style>
</head>
<body>
    `;
    
    for (const pageTactics of pages) {
        html += '<div class="page">';
        
        if (includeHeader) {
            html += `
                <div class="matrix-export-header">
                    <div class="matrix-export-header-left">
                        ${state.companyLogo ? `<img src="${state.companyLogo}" class="matrix-export-logo" alt="Logo">` : ''}
                        <div>
                            <h1 class="matrix-export-title">${domainLabel} ATT&CK Matrix</h1>
                            <p class="matrix-export-subtitle">${state.currentLayer?.name || 'Untitled Layer'} • ATT&CK ${version}</p>
                        </div>
                    </div>
                    <div class="matrix-export-header-right">
                        ${state.companyName ? `<div class="matrix-export-company">${escapeHtml(state.companyName)}</div>` : ''}
                        <div class="matrix-export-meta">Generated ${new Date().toLocaleDateString()}</div>
                    </div>
                </div>
            `;
        }
        
        if (includeLegend) {
            if (legendSections) {
                html += '<div class="matrix-export-legend">';
                html += '<div style="display: flex; gap: 1.5rem; flex-wrap: wrap;">';
                for (const section of legendSections) {
                    html += '<div>';
                    html += `<div class="matrix-export-legend-section-title">${escapeHtml(section.title)}</div>`;
                    html += '<div style="display: flex; gap: 0.75rem; flex-wrap: wrap; margin-top: 0.25rem;">';
                    for (const item of section.items) {
                        html += `<div class="matrix-export-legend-item"><span class="matrix-export-legend-color" style="background-color: ${item.color}"></span>${escapeHtml(item.label)}</div>`;
                    }
                    html += '</div></div>';
                }
                html += '</div></div>';
            } else if (legendItems.length > 0) {
                html += '<div class="matrix-export-legend">';
                legendItems.forEach(l => {
                    html += `<div class="matrix-export-legend-item"><span class="matrix-export-legend-color" style="background-color: ${l.color}"></span>${escapeHtml(l.label)}</div>`;
                });
                html += '</div>';
            }
        }
        
        html += '<table class="matrix-export-table"><thead><tr>';
        for (const tactic of pageTactics) {
            const short = tactic.x_mitre_shortname;
            const techniques = techniqueMap[short] || [];
            const filtered = onlyAnnotated 
                ? techniques.filter(t => {
                    const id = t.external_references?.[0]?.external_id || '';
                    const ann = getTechniqueAnnotation(id);
                    return !isSub(t) && (ann?.color || ann?.queries?.length > 0);
                })
                : techniques.filter(t => !isSub(t));
            html += `<th><div>${tactic.name}</div><div style="opacity:0.7">${short}</div><div style="opacity:0.6">${filtered.length}</div></th>`;
        }
        html += '</tr></thead><tbody><tr>';
        
        for (const tactic of pageTactics) {
            const short = tactic.x_mitre_shortname;
            const techniques = techniqueMap[short] || [];
            const parentTechs = (onlyAnnotated 
                ? techniques.filter(t => {
                    const id = t.external_references?.[0]?.external_id || '';
                    const ann = getTechniqueAnnotation(id);
                    return !isSub(t) && (ann?.color || ann?.queries?.length > 0);
                })
                : techniques.filter(t => !isSub(t))
            ).sort((a, b) => {
                const idA = a.external_references?.[0]?.external_id || '';
                const idB = b.external_references?.[0]?.external_id || '';
                return idA.localeCompare(idB, undefined, { numeric: true });
            });
            const subTechs = techniques.filter(t => isSub(t));
            
            html += '<td>';
            for (const tech of parentTechs) {
                const id = tech.external_references?.[0]?.external_id || '';
                const name = tech.name;
                const subs = subTechs.filter(s => parentId(s) === id);
                const ann = getTechniqueAnnotation(id);
                const effectiveColor = state.autoColorByQueries ? getAutoColorForTechnique(id, subs) : ann?.color;
                const isAutoColor = state.autoColorByQueries && effectiveColor;
                const cleanColor = effectiveColor ? effectiveColor.replace(/80$/, '') : '';
                const bgColor = effectiveColor ? `background-color: ${effectiveColor}${isAutoColor ? '' : 'cc'}; color: ${getContrastColor(cleanColor)};` : '';
                const idColor = effectiveColor ? `color: ${getContrastColor(cleanColor)};` : '';
                const nameColor = effectiveColor ? `color: ${getContrastColor(cleanColor)};` : '';
                
                html += `<div class="matrix-export-cell" style="${bgColor}">
                    <div class="tech-id" style="${idColor}">${id}</div>
                    <div class="tech-name" style="${nameColor}">${escapeHtml(name)}</div>
                </div>`;
                
                if (expandSubs) {
                    for (const sub of subs) {
                        const subId = sub.external_references?.[0]?.external_id || '';
                        const subName = sub.name;
                        const subAnn = getTechniqueAnnotation(subId);
                        const subColor = state.autoColorByQueries ? getAutoColorForTechnique(subId, []) : subAnn?.color;
                        const isSubAuto = state.autoColorByQueries && subColor;
                        const subCleanColor = subColor ? subColor.replace(/80$/, '') : '';
                        const subBgColor = subColor ? `background-color: ${subColor}${isSubAuto ? '' : 'cc'}; color: ${getContrastColor(subCleanColor)}; margin-left: 0.35rem;` : 'margin-left: 0.35rem;';
                        const subIdColor = subColor ? `color: ${getContrastColor(subCleanColor)};` : '';
                        const subNameColor = subColor ? `color: ${getContrastColor(subCleanColor)};` : '';
                        html += `<div class="matrix-export-cell sub-technique" style="${subBgColor}">
                            <div class="tech-id" style="font-size:0.5rem;${subIdColor}">${subId}</div>
                            <div class="tech-name" style="font-size:0.5rem;${subNameColor}">${escapeHtml(subName)}</div>
                        </div>`;
                    }
                }
            }
            html += '</td>';
        }
        html += '</tr></tbody></table>';
        
        if (includeFooter) {
            html += `
                <div class="matrix-export-footer">
                    ${state.companyName ? `${escapeHtml(state.companyName)} • ` : ''}
                    MITRE ATT&CK ${domainLabel} ${version} • Generated ${new Date().toLocaleString()}
                </div>
            `;
        }
        
        html += '</div>';
    }
    
    html += '<script>window.onload = () => { window.print(); };</script>';
    html += '</body></html>';
    
    printWindow.document.write(html);
    printWindow.document.close();
}

async function exportMatrixSVG(selectedTactics, expandSubs, onlyAnnotated, includeLegend, includeHeader, includeFooter) {
    const domainLabel = state.currentDomain.replace('-attack', '').charAt(0).toUpperCase() + state.currentDomain.replace('-attack', '').slice(1);
    const version = state.currentVersion || 'master';
    const isAuto = state.autoColorByQueries;
    const legendSections = isAuto ? buildAutoLegendSections() : null;
    const legendItems = isAuto ? null : (state.currentLayer?.legend || defaultLegend);
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const bgColor = isDark ? '#070814' : '#ffffff';
    const textColor = isDark ? '#f3f4f6' : '#1a1a1a';
    const borderColor = isDark ? '#1f213d' : '#e2e8f0';
    const cellBg = isDark ? '#0f1026' : '#f8f8f8';
    
    const tacticOrder = state.tactics
        .filter(t => t.x_mitre_shortname && selectedTactics.includes(t.x_mitre_shortname))
        .sort((a, b) => (a.x_mitre_order || 0) - (b.x_mitre_order || 0));
    
    const allTechniques = state.techniques.filter(t => {
        const platforms = t.x_mitre_platforms || [];
        const platformMatch = platforms.length === 0 || platforms.some(p => state.activePlatforms.has(p));
        return platformMatch;
    });
    
    const techniqueMap = {};
    for (const t of allTechniques) {
        const phaseNames = t.kill_chain_phases?.filter(k => k.kill_chain_name === 'mitre-attack').map(k => k.phase_name) || [];
        for (const phase of phaseNames) {
            if (!techniqueMap[phase]) techniqueMap[phase] = [];
            techniqueMap[phase].push(t);
        }
    }
    
    const isSub = (t) => t.x_mitre_is_subtechnique;
    const parentId = (t) => t.external_references?.[0]?.external_id?.split('.')[0];
    
    const colWidth = 150;
    const rowHeight = 24;
    const headerHeight = 36;
    const marginTop = includeHeader ? 70 : 15;
    const legendHeight = includeLegend && (legendSections ? legendSections.length > 0 : legendItems.length > 0) ? (legendSections ? 50 : 30) : 0;
    const footerHeight = includeFooter ? 25 : 0;
    const padding = 15;
    const cellPadding = 4;
    
    let maxRows = 0;
    for (const tactic of tacticOrder) {
        const short = tactic.x_mitre_shortname;
        const techniques = techniqueMap[short] || [];
        const parentTechs = (onlyAnnotated 
            ? techniques.filter(t => {
                const id = t.external_references?.[0]?.external_id || '';
                const ann = getTechniqueAnnotation(id);
                return !isSub(t) && (ann?.color || ann?.queries?.length > 0);
            })
            : techniques.filter(t => !isSub(t))
        );
        let rowCount = parentTechs.length;
        if (expandSubs) {
            for (const tech of parentTechs) {
                const id = tech.external_references?.[0]?.external_id || '';
                const subs = techniques.filter(s => isSub(s) && parentId(s) === id);
                rowCount += subs.length;
            }
        }
        if (rowCount > maxRows) maxRows = rowCount;
    }
    
    const matrixHeight = Math.max(maxRows * rowHeight + cellPadding * 2, 100);
    const width = tacticOrder.length * colWidth + padding * 2;
    const height = marginTop + legendHeight + headerHeight + matrixHeight + footerHeight + 20;
    
    let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${sanitizeSvgAttr(width)}" height="${sanitizeSvgAttr(height)}" viewBox="0 0 ${sanitizeSvgAttr(width)} ${sanitizeSvgAttr(height)}">`;
    svg += `<defs><style type="text/css">@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&amp;family=JetBrains+Mono:wght@400;600&amp;display=swap');</style></defs>`;
    svg += `<rect width="${sanitizeSvgAttr(width)}" height="${sanitizeSvgAttr(height)}" fill="${bgColor}"/>`;
    
    let yPos = marginTop;
    
    if (includeHeader) {
        if (state.companyLogo) {
            svg += `<image x="${padding}" y="${yPos}" width="40" height="40" href="${state.companyLogo}" preserveAspectRatio="xMidYMid meet"/>`;
        }
        const textX = state.companyLogo ? padding + 50 : padding;
        svg += `<text x="${textX}" y="${yPos + 18}" font-family="'Inter', sans-serif" font-size="16" font-weight="700" fill="#7c3aed">${escapeSvgText(domainLabel)} ATT&amp;CK Matrix</text>`;
        svg += `<text x="${textX}" y="${yPos + 32}" font-family="'Inter', sans-serif" font-size="10" fill="${isDark ? '#94a3b8' : '#666'}">${escapeSvgText(state.currentLayer?.name || 'Untitled Layer')} \u2022 ATT&amp;CK ${sanitizeSvgAttr(version)}</text>`;
        if (state.companyName) {
            svg += `<text x="${width - padding}" y="${yPos + 18}" font-family="'Inter', sans-serif" font-size="12" font-weight="600" fill="${textColor}" text-anchor="end">${escapeSvgText(state.companyName)}</text>`;
        }
        svg += `<text x="${width - padding}" y="${yPos + 32}" font-family="'Inter', sans-serif" font-size="8" fill="${isDark ? '#64748b' : '#999'}" text-anchor="end">Generated ${new Date().toLocaleDateString()}</text>`;
        svg += `<line x1="${padding}" y1="${yPos + 42}" x2="${width - padding}" y2="${yPos + 42}" stroke="#7c3aed" stroke-width="2"/>`;
        yPos += 52;
    }
    
    if (includeLegend) {
        if (legendSections) {
            let legendY = yPos;
            for (const section of legendSections) {
                const sectionWidth = section.items.length * 130 + 80;
                svg += `<rect x="${padding}" y="${legendY}" width="${Math.min(sectionWidth, width - padding * 2)}" height="22" fill="${isDark ? '#162032' : '#f5f5f5'}" rx="3"/>`;
                svg += `<text x="${padding + 5}" y="${legendY + 14}" font-family="'Inter', sans-serif" font-size="7" font-weight="600" fill="${textColor}">${escapeSvgText(section.title)}</text>`;
                let legendX = padding + 80;
                for (const item of section.items) {
                    svg += `<rect x="${legendX}" y="${legendY + 5}" width="10" height="10" fill="${item.color}" rx="2" stroke="${borderColor}" stroke-width="0.5"/>`;
                    svg += `<text x="${legendX + 14}" y="${legendY + 14}" font-family="'Inter', sans-serif" font-size="7" fill="${textColor}">${escapeSvgText(item.label)}</text>`;
                    legendX += 130;
                }
                legendY += 25;
            }
            yPos += legendSections.length * 25;
        } else if (legendItems.length > 0) {
            let legendX = padding;
            svg += `<rect x="${padding}" y="${yPos}" width="${width - padding * 2}" height="24" fill="${isDark ? '#162032' : '#f5f5f5'}" rx="4"/>`;
            legendItems.forEach(l => {
                svg += `<rect x="${legendX + 5}" y="${yPos + 6}" width="12" height="12" fill="${l.color}" rx="2" stroke="${borderColor}" stroke-width="1"/>`;
                svg += `<text x="${legendX + 22}" y="${yPos + 16}" font-family="'Inter', sans-serif" font-size="8" fill="${textColor}">${escapeSvgText(l.label)}</text>`;
                legendX += 130;
            });
            yPos += 30;
        }
    }
    
    svg += `<g transform="translate(${padding}, ${yPos})">`;
    
    for (let i = 0; i < tacticOrder.length; i++) {
        const tactic = tacticOrder[i];
        const short = tactic.x_mitre_shortname;
        const techniques = techniqueMap[short] || [];
        const filtered = onlyAnnotated 
            ? techniques.filter(t => {
                const id = t.external_references?.[0]?.external_id || '';
                const ann = getTechniqueAnnotation(id);
                return !isSub(t) && (ann?.color || ann?.queries?.length > 0);
            })
            : techniques.filter(t => !isSub(t));
        
        const x = i * colWidth;
        svg += `<rect x="${x}" y="0" width="${colWidth - 2}" height="${headerHeight}" fill="#7c3aed" rx="3"/>`;
        svg += `<text x="${x + colWidth / 2 - 1}" y="16" font-family="'Inter', sans-serif" font-size="9" font-weight="600" fill="white" text-anchor="middle">${escapeSvgText(tactic.name)}</text>`;
        svg += `<text x="${x + colWidth / 2 - 1}" y="26" font-family="'JetBrains Mono', monospace" font-size="7" fill="rgba(255,255,255,0.7)" text-anchor="middle">${sanitizeSvgAttr(short)}</text>`;
        svg += `<text x="${x + colWidth / 2 - 1}" y="33" font-family="'Inter', sans-serif" font-size="6" fill="rgba(255,255,255,0.5)" text-anchor="middle">${filtered.length}</text>`;
    }
    
    for (let i = 0; i < tacticOrder.length; i++) {
        const tactic = tacticOrder[i];
        const short = tactic.x_mitre_shortname;
        const techniques = techniqueMap[short] || [];
        const parentTechs = (onlyAnnotated 
            ? techniques.filter(t => {
                const id = t.external_references?.[0]?.external_id || '';
                const ann = getTechniqueAnnotation(id);
                return !isSub(t) && (ann?.color || ann?.queries?.length > 0);
            })
            : techniques.filter(t => !isSub(t))
        ).sort((a, b) => {
            const idA = a.external_references?.[0]?.external_id || '';
            const idB = b.external_references?.[0]?.external_id || '';
            return idA.localeCompare(idB, undefined, { numeric: true });
        });
        const subTechs = techniques.filter(t => isSub(t));
        
        const x = i * colWidth;
        let cellY = headerHeight + cellPadding;
        
        for (const tech of parentTechs) {
            const id = tech.external_references?.[0]?.external_id || '';
            const name = tech.name;
            const subs = subTechs.filter(s => parentId(s) === id);
            const ann = getTechniqueAnnotation(id);
            const effectiveColor = state.autoColorByQueries ? getAutoColorForTechnique(id, subs) : ann?.color;
            const isAutoColor = state.autoColorByQueries && effectiveColor;
            const cleanColor = effectiveColor ? effectiveColor.replace(/80$/, '') : '';
            const cellFill = effectiveColor || cellBg;
            const cellText = effectiveColor ? getContrastColor(cleanColor) : textColor;
            const cellOpacity = (effectiveColor && !isAutoColor) ? ' fill-opacity="0.8"' : '';
            
            const hasQueries = ann?.queries && ann.queries.length > 0;
            const textX = hasQueries ? x + 7 : x + 4;
            
            svg += `<rect x="${x + 1}" y="${cellY}" width="${colWidth - 4}" height="${rowHeight - 1}" fill="${cellFill}"${cellOpacity} rx="2"/>`;
            if (hasQueries) {
                svg += `<rect x="${x + 2}" y="${cellY + 2}" width="2.5" height="${rowHeight - 5}" fill="#a855f7" rx="1.25"/>`;
            }
            svg += `<text x="${textX}" y="${cellY + 10}" font-family="'JetBrains Mono', monospace" font-size="7" font-weight="600" fill="${cellText}">${id}</text>`;
            svg += `<text x="${textX}" y="${cellY + 18}" font-family="'Inter', sans-serif" font-size="6" fill="${cellText}">${escapeSvgText(name).substring(0, 22)}</text>`;
            
            cellY += rowHeight;
            
            if (expandSubs) {
                for (const sub of subs) {
                    const subId = sub.external_references?.[0]?.external_id || '';
                    const subName = sub.name;
                    const subAnn = getTechniqueAnnotation(subId);
                    const subColor = state.autoColorByQueries ? getAutoColorForTechnique(subId, []) : subAnn?.color;
                    const isSubAuto = state.autoColorByQueries && subColor;
                    const subCleanColor = subColor ? subColor.replace(/80$/, '') : '';
                    const subFill = subColor || cellBg;
                    const subText = subColor ? getContrastColor(subCleanColor) : textColor;
                    const subOpacity = (subColor && !isSubAuto) ? ' fill-opacity="0.8"' : '';
                    
                    const subHasQueries = subAnn?.queries && subAnn.queries.length > 0;
                    const subTextX = subHasQueries ? x + 14 : x + 11;
                    
                    svg += `<rect x="${x + 8}" y="${cellY}" width="${colWidth - 12}" height="${rowHeight - 2}" fill="${subFill}"${subOpacity} rx="2"/>`;
                    if (subHasQueries) {
                        svg += `<rect x="${x + 9}" y="${cellY + 2}" width="2.5" height="${rowHeight - 6}" fill="#a855f7" rx="1.25"/>`;
                    }
                    svg += `<text x="${subTextX}" y="${cellY + 9}" font-family="'JetBrains Mono', monospace" font-size="6" font-weight="600" fill="${subText}">${subId}</text>`;
                    svg += `<text x="${subTextX}" y="${cellY + 16}" font-family="'Inter', sans-serif" font-size="5" fill="${subText}">${escapeSvgText(subName).substring(0, 18)}</text>`;
                    
                    cellY += rowHeight - 2;
                }
            }
        }
    }
    
    svg += '</g>';
    
    if (includeFooter) {
        const footerY = height - 10;
        svg += `<line x1="${padding}" y1="${footerY - 8}" x2="${width - padding}" y2="${footerY - 8}" stroke="${borderColor}" stroke-width="1"/>`;
        svg += `<text x="${width / 2}" y="${footerY}" font-family="'Inter', sans-serif" font-size="7" fill="${isDark ? '#64748b' : '#999'}" text-anchor="middle">${state.companyName ? escapeSvgText(state.companyName) + ' \u2022 ' : ''}MITRE ATT&amp;CK ${domainLabel} ${sanitizeSvgAttr(version)} \u2022 Generated ${new Date().toLocaleString()}</text>`;
    }
    
    svg += '</svg>';
    
    const cleanSvg = svg.replace(/\s+/g, ' ').replace(/>\s+</g, '><').trim();
    const blob = new Blob([cleanSvg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const domain = state.currentDomain.replace('-attack', '');
    const timestamp = new Date().toISOString().slice(0, 10);
    link.download = `mitre-${domain}-matrix-${timestamp}.svg`;
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
}
