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
    
    ['export-expand-subs', 'export-only-annotated', 'export-include-legend', 'export-include-header', 'export-include-footer', 'export-banner-hue', 'export-use-nebula-tint'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('change', updateExportPreview);
            el.addEventListener('input', updateExportPreview);
        }
    });
    
    updateExportPreview();
    new bootstrap.Modal(document.getElementById('export-options-modal')).show();
});

export function updateExportPreview() {
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

    // Apply Premium Accent and Nebula Live Preview
    const accentColor = document.getElementById('export-banner-hue')?.value || '#7c3aed';
    const textInput = document.getElementById('export-banner-hue-text');
    if (textInput) textInput.value = accentColor.toUpperCase();

    const useNebula = document.getElementById('export-use-nebula-tint')?.checked;
    const previewHeader = document.getElementById('export-preview-header');
    if (previewHeader) {
        if (useNebula) {
            previewHeader.style.background = `linear-gradient(135deg, #7c3aed 0%, ${accentColor} 100%)`;
            previewHeader.style.boxShadow = `0 4px 12px ${accentColor}30, 0 0 6px ${accentColor}20`;
        } else {
            previewHeader.style.background = accentColor;
            previewHeader.style.boxShadow = 'none';
        }
    }

    const domainLabel = state.currentDomain 
        ? (state.currentDomain.replace('-attack', '').charAt(0).toUpperCase() + state.currentDomain.replace('-attack', '').slice(1))
        : 'Enterprise';

    // Update cover page preview elements dynamically
    const titleEl = document.getElementById('preview-title');
    if (titleEl && state.currentLayer) {
        titleEl.textContent = state.currentLayer.name || 'Untitled Layer';
    }
    const subtitleEl = document.getElementById('preview-subtitle');
    if (subtitleEl) {
        subtitleEl.textContent = `${domainLabel} ATT&CK Matrix`;
    }
    const authorEl = document.getElementById('preview-author');
    if (authorEl) {
        authorEl.textContent = `Author: ${state.author || 'Kieran Wadforth'}`;
    }
    const dateEl = document.getElementById('preview-date');
    if (dateEl) {
        dateEl.textContent = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
    }

    // Dynamic stats calculations
    const layerTechs = state.currentLayer?.techniques || [];
    const totalQueries = layerTechs.reduce((sum, t) => sum + (t.queries ? t.queries.length : 0), 0);
    const stats = typeof getFullCoverageStats === 'function' ? getFullCoverageStats() : { pct: 0 };
    const coveragePct = stats.pct;

    const coverageStat = document.getElementById('preview-stats-coverage');
    if (coverageStat) {
        coverageStat.textContent = `${coveragePct % 1 === 0 ? coveragePct : coveragePct.toFixed(1)}%`;
    }
    const queriesStat = document.getElementById('preview-stats-queries');
    if (queriesStat) {
        queriesStat.textContent = totalQueries;
    }

    const logoPlaceholder = document.getElementById('preview-logo-placeholder');
    if (logoPlaceholder) {
        if (state.companyLogo) {
            logoPlaceholder.innerHTML = `<img src="${safeImageSrc(state.companyLogo)}" style="height: 100%; max-height: 14px; object-fit: contain;">`;
        } else if (state.companyName) {
            logoPlaceholder.textContent = state.companyName.substring(0, 8).toUpperCase();
        } else {
            logoPlaceholder.textContent = 'LOGO';
        }
    }
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
    const accentColor = document.getElementById('export-banner-hue')?.value || '#7c3aed';
    const useNebula = document.getElementById('export-use-nebula-tint')?.checked;
    
    try {
        await exportMatrixSVG(selectedTactics, expandSubs, onlyAnnotated, includeLegend, includeHeader, includeFooter, accentColor, useNebula);
        showToast('Matrix SVG exported successfully', 'success');
    } catch (err) {
        showToast('Failed to export: ' + err.message, 'error');
    } finally {
        btn.innerHTML = originalHtml;
        btn.disabled = false;
    }
});

function safeImageSrc(value) {
    const src = String(value || '').trim();
    if (/^(data:image\/|blob:|https?:\/\/)/i.test(src)) return escapeHtml(src);
    return '';
}

export async function exportMatrixSVG(selectedTactics, expandSubs, onlyAnnotated, includeLegend, includeHeader, includeFooter, accentColor = '#7c3aed', useNebula = true) {
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
    svg += `<defs>`;
    svg += `<style type="text/css">@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&amp;family=JetBrains+Mono:wght@400;600&amp;display=swap');</style>`;
    if (useNebula) {
        svg += `
            <linearGradient id="nebula-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#7c3aed"/>
                <stop offset="100%" stop-color="${accentColor}"/>
            </linearGradient>
        `;
    }
    svg += `</defs>`;
    svg += `<rect width="${sanitizeSvgAttr(width)}" height="${sanitizeSvgAttr(height)}" fill="${bgColor}"/>`;
    
    let yPos = marginTop;
    
    const svgHeaderBackground = useNebula ? 'url(#nebula-grad)' : accentColor;

    if (includeHeader) {
        // Draw decorative banner instead of raw text line
        svg += `<rect x="${padding}" y="${yPos}" width="${width - padding * 2}" height="48" fill="${svgHeaderBackground}" rx="6"/>`;
        
        let logoX = padding + 12;
        if (state.companyLogo) {
            svg += `<image x="${logoX}" y="${yPos + 9}" width="30" height="30" href="${safeImageSrc(state.companyLogo)}" preserveAspectRatio="xMidYMid meet"/>`;
            logoX += 40;
        }
        
        svg += `<text x="${logoX}" y="${yPos + 22}" font-family="'Inter', sans-serif" font-size="13" font-weight="700" fill="white">${escapeSvgText(domainLabel)} ATT&amp;CK Matrix</text>`;
        svg += `<text x="${logoX}" y="${yPos + 36}" font-family="'Inter', sans-serif" font-size="8.5" fill="rgba(255,255,255,0.85)">${escapeSvgText(state.currentLayer?.name || 'Untitled Layer')} \u2022 ATT&amp;CK ${sanitizeSvgAttr(version)}</text>`;
        
        if (state.companyName) {
            svg += `<text x="${width - padding - 12}" y="${yPos + 22}" font-family="'Inter', sans-serif" font-size="10.5" font-weight="600" fill="white" text-anchor="end">${escapeSvgText(state.companyName)}</text>`;
        }
        svg += `<text x="${width - padding - 12}" y="${yPos + 36}" font-family="'Inter', sans-serif" font-size="7.5" fill="rgba(255,255,255,0.7)" text-anchor="end">Generated ${new Date().toLocaleDateString()}</text>`;
        
        yPos += 58;
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
    
    const tacticBgFill = useNebula ? 'url(#nebula-grad)' : accentColor;

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
        const spectrumColor = window.getSpectrumColor ? window.getSpectrumColor(i) : accentColor;
        svg += `<rect x="${x}" y="0" width="${colWidth - 2}" height="${headerHeight}" fill="${tacticBgFill}" rx="3"/>`;
        svg += `<rect x="${x}" y="0" width="${colWidth - 2}" height="3" fill="${spectrumColor}"/>`;
        svg += `<text x="${x + colWidth / 2 - 1}" y="16" font-family="'Inter', sans-serif" font-size="9" font-weight="600" fill="white" text-anchor="middle">${escapeSvgText(tactic.name)}</text>`;
        svg += `<text x="${x + colWidth / 2 - 1}" y="26" font-family="'JetBrains Mono', monospace" font-size="7" fill="rgba(255,255,255,0.8)" text-anchor="middle">${sanitizeSvgAttr(short)}</text>`;
        svg += `<text x="${x + colWidth / 2 - 1}" y="33" font-family="'Inter', sans-serif" font-size="6" fill="rgba(255,255,255,0.6)" text-anchor="middle">${filtered.length}</text>`;
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
            const isAnnotated = effectiveColor || hasQueries;
            const textX = x + 7;
            
            svg += `<rect x="${x + 1}" y="${cellY}" width="${colWidth - 4}" height="${rowHeight - 1}" fill="${cellFill}"${cellOpacity} rx="2"/>`;
            if (isAnnotated) {
                const markerColor = effectiveColor ? cellText : accentColor;
                svg += `<rect x="${x + 1}" y="${cellY}" width="3" height="${rowHeight - 1}" fill="${markerColor}" opacity="0.8"/>`;
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
                    const isSubAnnotated = subColor || subHasQueries;
                    const subTextX = x + 14;
                    
                    svg += `<rect x="${x + 8}" y="${cellY}" width="${colWidth - 12}" height="${rowHeight - 2}" fill="${subFill}"${subOpacity} rx="2"/>`;
                    if (isSubAnnotated) {
                        const subMarkerColor = subColor ? subText : accentColor;
                        svg += `<rect x="${x + 8}" y="${cellY}" width="3" height="${rowHeight - 2}" fill="${subMarkerColor}" opacity="0.8"/>`;
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

// Legacy Window Bindings
window.updateExportPreview = updateExportPreview;
window.exportMatrixSVG = exportMatrixSVG;
