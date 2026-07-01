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

    const accentColor = document.getElementById('export-banner-hue')?.value || '#89b7ae';
    const textInput = document.getElementById('export-banner-hue-text');
    if (textInput) textInput.value = accentColor.toUpperCase();

    const useNebula = document.getElementById('export-use-nebula-tint')?.checked;
    const previewHeader = document.getElementById('export-preview-header');
    if (previewHeader) {
        if (useNebula) {
            previewHeader.style.background = `linear-gradient(135deg, #89b7ae 0%, ${accentColor} 100%)`;
            previewHeader.style.boxShadow = `0 4px 12px ${accentColor}20`;
        } else {
            previewHeader.style.background = accentColor;
            previewHeader.style.boxShadow = 'none';
        }
    }

    const domainLabel = state.currentDomain
        ? (state.currentDomain.replace('-attack', '').charAt(0).toUpperCase() + state.currentDomain.replace('-attack', '').slice(1))
        : 'Enterprise';

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
        if (state.companyName) {
            logoPlaceholder.textContent = state.companyName.substring(0, 8).toUpperCase();
        } else {
            logoPlaceholder.textContent = 'SVG';
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
    const accentColor = document.getElementById('export-banner-hue')?.value || '#89b7ae';
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

const SVG_EXPORT_COLORS = {
    bg: '#050708',
    panel: '#0b1116',
    cell: '#0d1318',
    line: '#2a3735',
    text: '#e9efea',
    muted: '#9aa8a6',
    faint: '#64716f',
    accent: '#89b7ae',
    gold: '#c9aa68',
    good: '#65b687',
    warn: '#c9aa68',
    bad: '#d46a63',
    query: '#7ba8d8'
};

function svgEscape(value) {
    return escapeSvgText(String(value ?? ''));
}

function toSvgNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.round(number * 100) / 100 : 0;
}

function normalizeHexColor(value, fallback = SVG_EXPORT_COLORS.accent) {
    const raw = String(value || '').trim();
    if (/^#[0-9a-f]{3}$/i.test(raw)) {
        return '#' + raw.slice(1).split('').map(ch => ch + ch).join('').toLowerCase();
    }
    if (/^#[0-9a-f]{6}$/i.test(raw)) return raw.toLowerCase();
    if (/^#[0-9a-f]{8}$/i.test(raw)) return raw.slice(0, 7).toLowerCase();
    return fallback;
}

function getSvgOpacity(value, fallback = 1) {
    const raw = String(value || '').trim();
    if (!/^#[0-9a-f]{8}$/i.test(raw)) return fallback;
    return Math.round((parseInt(raw.slice(7, 9), 16) / 255) * 100) / 100;
}

function wrapSvgText(value, maxChars, maxLines = 2) {
    const text = String(value || '').replace(/\s+/g, ' ').trim();
    if (!text) return [''];

    const words = text.split(' ');
    const lines = [];
    let line = '';

    for (const word of words) {
        const candidate = line ? `${line} ${word}` : word;
        if (candidate.length <= maxChars) {
            line = candidate;
            continue;
        }

        if (line) lines.push(line);
        if (word.length > maxChars) {
            lines.push(word.slice(0, Math.max(maxChars - 3, 1)) + '...');
            line = '';
        } else {
            line = word;
        }

        if (lines.length >= maxLines) break;
    }

    if (line && lines.length < maxLines) lines.push(line);

    if (text.length > lines.join(' ').length && lines.length > 0) {
        const last = lines.length - 1;
        lines[last] = lines[last].length > maxChars - 3
            ? lines[last].slice(0, Math.max(maxChars - 3, 1)) + '...'
            : lines[last] + '...';
    }

    return lines.length ? lines : [''];
}

function renderSvgTextLines(lines, x, y, className, lineHeight = 15, attrs = '') {
    const safeLines = (lines && lines.length ? lines : ['']).map(svgEscape);
    const tspans = safeLines.map((line, index) => {
        const dy = index === 0 ? 0 : lineHeight;
        return `<tspan x="${toSvgNumber(x)}" dy="${toSvgNumber(dy)}">${line}</tspan>`;
    }).join('');
    return `<text class="${className}" x="${toSvgNumber(x)}" y="${toSvgNumber(y)}"${attrs}>${tspans}</text>`;
}

function renderExportLogo(x, y, size = 68) {
    const scale = size / 64;
    return `
        <g transform="translate(${toSvgNumber(x)} ${toSvgNumber(y)}) scale(${toSvgNumber(scale)})">
            <rect x="6" y="6" width="52" height="52" rx="14" fill="#0b1116" stroke="#89b7ae" stroke-opacity="0.5"/>
            <path d="M18 48 30 17h8l12 31h-7.2l-2.4-6.4H27.7L25.2 48H18Zm12.2-12h8L34.2 25.5 30.2 36Z" fill="#e8ece8"/>
            <path d="M14 16h13v4H14zM41 16h13v4H41zM14 54h40v-4H14z" fill="#c9aa68"/>
            <path d="M18 59 59 18" stroke="#89b7ae" stroke-width="2.5" stroke-linecap="round" stroke-opacity="0.55"/>
        </g>
    `;
}

function getTechniqueId(tech) {
    return tech?.external_references?.[0]?.external_id || '';
}

function getLayerLegendLabel(color) {
    const clean = normalizeHexColor(color, '').toLowerCase();
    const legend = state.autoColorByQueries
        ? buildAutoLegendSections().flatMap(section => section.items || [])
        : (state.currentLayer?.legend || defaultLegend || []);
    const match = legend.find(item => normalizeHexColor(item.color, '').toLowerCase() === clean);
    return match?.label || '';
}

function getTechniqueExportState(tech, subs = []) {
    const id = getTechniqueId(tech);
    const ann = getTechniqueAnnotation(id);
    const queryCount = ann?.queries?.length || 0;
    const activeQueryCount = ann?.queries?.filter(q => !q.archived).length || 0;
    const subActiveQueryCount = subs.reduce((count, sub) => {
        const subAnn = getTechniqueAnnotation(getTechniqueId(sub));
        return count + (subAnn?.queries?.some(q => !q.archived) ? 1 : 0);
    }, 0);
    const effectiveColor = state.autoColorByQueries ? getAutoColorForTechnique(id, subs) : ann?.color;

    if (effectiveColor) {
        const fill = normalizeHexColor(effectiveColor, SVG_EXPORT_COLORS.accent);
        const text = getContrastColor(fill);
        const legendLabel = getLayerLegendLabel(fill);
        return {
            key: 'mapped',
            label: activeQueryCount > 0 ? 'Covered' : (legendLabel || 'Mapped'),
            fill,
            stroke: fill,
            marker: text,
            text,
            opacity: getSvgOpacity(effectiveColor, state.autoColorByQueries ? 0.72 : 0.82),
            queryCount,
            activeQueryCount
        };
    }

    if (activeQueryCount > 0) {
        return { key: 'covered', label: 'Covered', fill: '#11271f', stroke: SVG_EXPORT_COLORS.good, marker: SVG_EXPORT_COLORS.good, text: SVG_EXPORT_COLORS.text, opacity: 1, queryCount, activeQueryCount };
    }
    if (subActiveQueryCount > 0) {
        return { key: 'partial', label: 'Partial', fill: '#2a2413', stroke: SVG_EXPORT_COLORS.warn, marker: SVG_EXPORT_COLORS.warn, text: SVG_EXPORT_COLORS.text, opacity: 1, queryCount, activeQueryCount };
    }
    if (queryCount > 0) {
        return { key: 'planned', label: 'Archived', fill: '#132333', stroke: SVG_EXPORT_COLORS.query, marker: SVG_EXPORT_COLORS.query, text: SVG_EXPORT_COLORS.text, opacity: 1, queryCount, activeQueryCount };
    }
    if (ann) {
        return { key: 'mapped', label: 'Mapped', fill: '#162126', stroke: SVG_EXPORT_COLORS.accent, marker: SVG_EXPORT_COLORS.accent, text: SVG_EXPORT_COLORS.text, opacity: 1, queryCount, activeQueryCount };
    }
    return { key: 'gap', label: 'Gap', fill: SVG_EXPORT_COLORS.cell, stroke: '#26343d', marker: SVG_EXPORT_COLORS.faint, text: SVG_EXPORT_COLORS.text, opacity: 1, queryCount, activeQueryCount };
}

function renderLegendItems(items, x, y, availableWidth) {
    let cursorX = x;
    let cursorY = y;
    const rowHeight = 28;
    const parts = [];

    for (const item of items) {
        const label = String(item.label || 'State');
        const width = Math.max(112, Math.min(220, label.length * 8 + 42));
        if (cursorX + width > x + availableWidth && cursorX > x) {
            cursorX = x;
            cursorY += rowHeight;
        }
        const fill = normalizeHexColor(item.fill || item.color, SVG_EXPORT_COLORS.cell);
        const stroke = normalizeHexColor(item.stroke || item.color, SVG_EXPORT_COLORS.line);
        parts.push(`<rect x="${toSvgNumber(cursorX)}" y="${toSvgNumber(cursorY - 14)}" width="18" height="18" rx="4" fill="${fill}" stroke="${stroke}"/>`);
        parts.push(`<text class="legend" x="${toSvgNumber(cursorX + 28)}" y="${toSvgNumber(cursorY)}">${svgEscape(label)}</text>`);
        cursorX += width;
    }

    return { svg: parts.join(''), height: cursorY - y + rowHeight };
}

export async function exportMatrixSVG(selectedTactics, expandSubs, onlyAnnotated, includeLegend, includeHeader, includeFooter, accentColor = '#89b7ae', useNebula = true) {
    const domain = state.currentDomain?.replace('-attack', '') || 'enterprise';
    const domainLabel = domain.charAt(0).toUpperCase() + domain.slice(1);
    const version = state.currentVersion || 'master';
    const accent = normalizeHexColor(accentColor, SVG_EXPORT_COLORS.accent);
    const generated = new Date();

    const tacticOrder = state.tactics
        .filter(t => t.x_mitre_shortname && selectedTactics.includes(t.x_mitre_shortname))
        .sort((a, b) => (a.x_mitre_order || 0) - (b.x_mitre_order || 0));

    const allTechniques = state.techniques.filter(t => {
        const platforms = t.x_mitre_platforms || [];
        return platforms.length === 0 || platforms.some(p => state.activePlatforms.has(p));
    });

    const techniqueMap = {};
    for (const technique of allTechniques) {
        const phaseNames = technique.kill_chain_phases?.filter(k => k.kill_chain_name === 'mitre-attack').map(k => k.phase_name) || [];
        for (const phase of phaseNames) {
            if (!techniqueMap[phase]) techniqueMap[phase] = [];
            techniqueMap[phase].push(technique);
        }
    }

    const isSub = (technique) => technique.x_mitre_is_subtechnique;
    const parentId = (technique) => getTechniqueId(technique).split('.')[0];
    const colWidth = 156;
    const colGap = 8;
    const pagePadding = 28;
    const matrixPadding = 20;
    const tacticHeaderHeight = 74;
    const cellGap = 8;
    const parentBaseHeight = 58;
    const subBaseHeight = 46;

    const columns = tacticOrder.map((tactic, index) => {
        const short = tactic.x_mitre_shortname;
        const techniques = techniqueMap[short] || [];
        const parentTechs = (onlyAnnotated
            ? techniques.filter(technique => {
                const ann = getTechniqueAnnotation(getTechniqueId(technique));
                return !isSub(technique) && (ann?.color || ann?.queries?.length > 0);
            })
            : techniques.filter(technique => !isSub(technique))
        ).sort((a, b) => getTechniqueId(a).localeCompare(getTechniqueId(b), undefined, { numeric: true }));
        const subTechs = techniques.filter(technique => isSub(technique));
        const cells = [];

        for (const tech of parentTechs) {
            const id = getTechniqueId(tech);
            const subs = subTechs
                .filter(sub => parentId(sub) === id)
                .sort((a, b) => getTechniqueId(a).localeCompare(getTechniqueId(b), undefined, { numeric: true }));
            const stateInfo = getTechniqueExportState(tech, subs);
            const lines = wrapSvgText(tech.name, 19, 2);
            cells.push({ type: 'parent', id, lines, stateInfo, height: parentBaseHeight + (lines.length - 1) * 13, subCount: subs.length });

            if (expandSubs) {
                for (const sub of subs) {
                    const subLines = wrapSvgText(sub.name, 18, 2);
                    cells.push({ type: 'sub', id: getTechniqueId(sub), lines: subLines, stateInfo: getTechniqueExportState(sub, []), height: subBaseHeight + (subLines.length - 1) * 11, subCount: 0 });
                }
            }
        }

        const covered = cells.filter(cell => cell.type === 'parent' && ['covered', 'partial', 'mapped'].includes(cell.stateInfo.key)).length;
        const bodyHeight = cells.reduce((sum, cell) => sum + cell.height + cellGap, 0);
        return { tactic, short, index, cells, covered, total: parentTechs.length, bodyHeight };
    });

    const matrixBodyHeight = Math.max(150, ...columns.map(column => column.bodyHeight));
    const matrixHeight = tacticHeaderHeight + matrixBodyHeight + matrixPadding * 2;
    const matrixWidth = columns.length > 0
        ? columns.length * colWidth + Math.max(columns.length - 1, 0) * colGap + matrixPadding * 2
        : 720;
    const width = Math.max(1540, matrixWidth + pagePadding * 2);
    const contentTop = includeHeader ? 198 : 40;

    let legendSvg = '';
    let legendHeight = 0;
    if (includeLegend) {
        const stateLegend = [
            { label: 'Covered: active detection query', fill: '#11271f', stroke: SVG_EXPORT_COLORS.good },
            { label: 'Partial: covered sub-technique', fill: '#2a2413', stroke: SVG_EXPORT_COLORS.warn },
            { label: 'Archived/planned query', fill: '#132333', stroke: SVG_EXPORT_COLORS.query },
            { label: 'Mapped annotation', fill: '#162126', stroke: SVG_EXPORT_COLORS.accent },
            { label: 'Gap / no mapped coverage', fill: SVG_EXPORT_COLORS.cell, stroke: '#26343d' }
        ];
        const layerLegend = state.autoColorByQueries
            ? buildAutoLegendSections().flatMap(section => (section.items || []).map(item => ({ label: `${section.title}: ${item.label}`, fill: item.color, stroke: item.color })))
            : (state.currentLayer?.legend || defaultLegend || []).map(item => ({ label: item.label, fill: item.color, stroke: item.color }));
        const legendItems = [...stateLegend, ...layerLegend].filter((item, index, all) => {
            const key = `${item.label}-${normalizeHexColor(item.fill, '')}`;
            return all.findIndex(other => `${other.label}-${normalizeHexColor(other.fill, '')}` === key) === index;
        });
        const legend = renderLegendItems(legendItems, pagePadding + 88, contentTop + 16, width - pagePadding * 2 - 110);
        legendHeight = legend.height;
        legendSvg = `<text class="mono" x="${pagePadding}" y="${contentTop + 16}">LEGEND</text>${legend.svg}`;
    }

    const matrixY = contentTop + (includeLegend ? legendHeight + 14 : 0);
    const footerHeight = includeFooter ? 54 : 22;
    const height = matrixY + matrixHeight + footerHeight + pagePadding;
    const layerTechs = state.currentLayer?.techniques || [];
    const totalQueries = layerTechs.reduce((sum, item) => sum + (item.queries?.length || 0), 0);
    const activeQueries = layerTechs.reduce((sum, item) => sum + (item.queries?.filter(q => !q.archived).length || 0), 0);
    const stats = typeof getFullCoverageStats === 'function' ? getFullCoverageStats() : { pct: 0, covered: 0, total: 0 };
    const titleText = `${domainLabel} ATT&CK coverage map`;
    const descText = `ATT&CK Xplorer SVG export for ${state.currentLayer?.name || 'Untitled Layer'}, generated ${generated.toISOString()}. Includes selected tactic columns, technique cells, coverage states and legend.`;
    const heroFill = useNebula ? 'url(#hero)' : accent;

    let svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${toSvgNumber(width)}" height="${toSvgNumber(height)}" viewBox="0 0 ${toSvgNumber(width)} ${toSvgNumber(height)}" role="img" aria-labelledby="svg-title svg-desc">
<title id="svg-title">${svgEscape(titleText)}</title>
<desc id="svg-desc">${svgEscape(descText)}</desc>
<defs>
<pattern id="grid" width="32" height="32" patternUnits="userSpaceOnUse"><path d="M32 0H0V32" fill="none" stroke="#89b7ae" stroke-opacity="0.05"/></pattern>
<linearGradient id="hero" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="#89b7ae" stop-opacity="0.22"/><stop offset="0.58" stop-color="${accent}" stop-opacity="0.12"/><stop offset="1" stop-color="#050708" stop-opacity="0"/></linearGradient>
<style><![CDATA[
.bg{fill:#050708}.panel{fill:#0b1116;stroke:#2a3735;stroke-width:1}.panel2{fill:#0f171d;stroke:#273431;stroke-width:1}.title{fill:#e9efea;font:700 42px system-ui,-apple-system,Segoe UI,sans-serif;letter-spacing:-1.3px}.sub{fill:#aab6b2;font:500 17px system-ui,-apple-system,Segoe UI,sans-serif}.mono{fill:#9aa8a6;font:700 12px ui-monospace,SFMono-Regular,Consolas,monospace;letter-spacing:.7px}.kpiNum{fill:#e9efea;font:800 26px ui-monospace,SFMono-Regular,Consolas,monospace}.kpiLabel{fill:#9aa8a6;font:700 11px ui-monospace,SFMono-Regular,Consolas,monospace;letter-spacing:1px}.tactic{fill:#e9efea;font:800 15px system-ui,-apple-system,Segoe UI,sans-serif}.tacticMeta{fill:#8a9996;font:700 11px ui-monospace,SFMono-Regular,Consolas,monospace;letter-spacing:.6px}.techId{font:800 12px ui-monospace,SFMono-Regular,Consolas,monospace}.techName{font:650 11.5px system-ui,-apple-system,Segoe UI,sans-serif}.techMeta{font:700 9.5px ui-monospace,SFMono-Regular,Consolas,monospace;letter-spacing:.3px}.legend{fill:#c9d3cf;font:700 13px system-ui,-apple-system,Segoe UI,sans-serif}.empty{fill:#9aa8a6;font:700 17px system-ui,-apple-system,Segoe UI,sans-serif}.footer{fill:#697775;font:650 12px ui-monospace,SFMono-Regular,Consolas,monospace}
]]></style>
</defs>
<rect class="bg" x="0" y="0" width="${toSvgNumber(width)}" height="${toSvgNumber(height)}"/>
<rect x="0" y="0" width="${toSvgNumber(width)}" height="${toSvgNumber(height)}" fill="url(#grid)"/>
`;

    if (includeHeader) {
        svg += `<rect x="${pagePadding}" y="28" width="${width - pagePadding * 2}" height="154" rx="22" fill="${heroFill}" stroke="#89b7ae" stroke-opacity="0.18"/>`;
        svg += renderExportLogo(pagePadding + 26, 52, 68);
        svg += `<text class="title" x="${pagePadding + 114}" y="82">${svgEscape('ATT&CK Xplorer coverage map')}</text>`;
        svg += `<text class="sub" x="${pagePadding + 114}" y="116">${svgEscape(`Layer: ${state.currentLayer?.name || 'Untitled Layer'} | ${domainLabel} ATT&CK ${version}`)}</text>`;
        svg += `<text class="mono" x="${pagePadding + 114}" y="148">${svgEscape(`SVG export | generated ${generated.toISOString().slice(0, 10)} | selectable text | self-contained`)}</text>`;

        const kpis = [
            { label: 'TOTAL COVERAGE', value: `${stats.pct || 0}%`, color: (stats.pct || 0) >= 70 ? SVG_EXPORT_COLORS.good : ((stats.pct || 0) >= 35 ? SVG_EXPORT_COLORS.warn : SVG_EXPORT_COLORS.bad) },
            { label: 'TECHNIQUES', value: `${stats.covered || 0}/${stats.total || 0}`, color: SVG_EXPORT_COLORS.gold },
            { label: 'ACTIVE QUERIES', value: activeQueries, color: SVG_EXPORT_COLORS.query },
            { label: 'TACTICS', value: columns.length, color: SVG_EXPORT_COLORS.accent },
            { label: 'MAPPINGS', value: layerTechs.length, color: SVG_EXPORT_COLORS.good }
        ];
        const cardWidth = 142;
        const startX = width - pagePadding - (cardWidth * kpis.length) - (8 * (kpis.length - 1));
        kpis.forEach((kpi, index) => {
            const x = startX + index * (cardWidth + 8);
            svg += `<rect class="panel2" x="${toSvgNumber(x)}" y="52" width="${cardWidth}" height="86" rx="12"/>`;
            svg += `<rect x="${toSvgNumber(x)}" y="52" width="5" height="86" rx="3" fill="${kpi.color}"/>`;
            svg += `<text class="kpiNum" x="${toSvgNumber(x + 18)}" y="92" fill="${kpi.color}">${svgEscape(kpi.value)}</text>`;
            svg += `<text class="kpiLabel" x="${toSvgNumber(x + 18)}" y="118">${svgEscape(kpi.label)}</text>`;
        });
    }

    if (includeLegend) svg += legendSvg;

    svg += `<rect class="panel" x="${pagePadding}" y="${matrixY}" width="${width - pagePadding * 2}" height="${matrixHeight}" rx="18"/>`;
    if (columns.length === 0) {
        svg += `<text class="empty" x="${width / 2}" y="${matrixY + 88}" text-anchor="middle">No tactics selected for export.</text>`;
    }

    columns.forEach((column, columnIndex) => {
        const x = pagePadding + matrixPadding + columnIndex * (colWidth + colGap);
        const y = matrixY + matrixPadding;
        const spectrumColor = normalizeHexColor(window.getSpectrumColor ? window.getSpectrumColor(column.index) : accent, accent);
        const tacticLines = wrapSvgText(column.tactic.name, 16, 2);

        svg += `<g transform="translate(${toSvgNumber(x)} ${toSvgNumber(y)})">`;
        svg += `<rect x="0" y="0" width="${colWidth}" height="${tacticHeaderHeight}" rx="10" fill="#101820" stroke="#2f3b38"/>`;
        svg += `<rect x="0" y="0" width="${colWidth}" height="4" rx="3" fill="${spectrumColor}"/>`;
        svg += renderSvgTextLines(tacticLines, 12, 24, 'tactic', 18);
        svg += `<text class="tacticMeta" x="12" y="62">${svgEscape(`${column.covered}/${column.total} covered`)}</text>`;

        let cellY = tacticHeaderHeight + 10;
        for (const cell of column.cells) {
            const inset = cell.type === 'sub' ? 10 : 0;
            const cellWidth = colWidth - inset;
            const stateInfo = cell.stateInfo;
            const label = cell.subCount > 0 && cell.type === 'parent' ? `${stateInfo.label} | ${cell.subCount} sub` : stateInfo.label;
            svg += `<rect x="${inset}" y="${toSvgNumber(cellY)}" width="${cellWidth}" height="${toSvgNumber(cell.height)}" rx="9" fill="${stateInfo.fill}" fill-opacity="${stateInfo.opacity}" stroke="${stateInfo.stroke}" stroke-opacity="0.72"/>`;
            svg += `<rect x="${inset}" y="${toSvgNumber(cellY)}" width="5" height="${toSvgNumber(cell.height)}" rx="3" fill="${stateInfo.marker}" opacity="0.92"/>`;
            svg += `<text class="techId" x="${inset + 13}" y="${toSvgNumber(cellY + 20)}" fill="${stateInfo.text}">${svgEscape(cell.id)}</text>`;
            svg += renderSvgTextLines(cell.lines, inset + 13, cellY + 39, 'techName', cell.type === 'sub' ? 11 : 13, ` fill="${stateInfo.text}"`);
            svg += `<text class="techMeta" x="${inset + 13}" y="${toSvgNumber(cellY + cell.height - 10)}" fill="${stateInfo.text}" opacity="0.72">${svgEscape(label)}</text>`;
            cellY += cell.height + cellGap;
        }
        svg += '</g>';
    });

    if (includeFooter) {
        const footerY = height - pagePadding;
        const company = state.companyName ? `${state.companyName} | ` : '';
        const options = `${expandSubs ? 'Sub-techniques expanded' : 'Parent techniques only'} | ${onlyAnnotated ? 'Annotated only' : 'All visible techniques'} | ${totalQueries} total queries`;
        svg += `<line x1="${pagePadding}" y1="${footerY - 26}" x2="${width - pagePadding}" y2="${footerY - 26}" stroke="#2a3735"/>`;
        svg += `<text class="footer" x="${width / 2}" y="${footerY - 8}" text-anchor="middle">${svgEscape(`${company}MITRE ATT&CK ${domainLabel} ${version} | Generated ${generated.toLocaleString()} | ${options}`)}</text>`;
    }

    svg += '</svg>';

    const cleanSvg = svg.replace(/>\s+</g, '><').trim();
    const blob = new Blob([cleanSvg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const timestamp = new Date().toISOString().slice(0, 10);
    link.download = `mitre-${domain}-matrix-${timestamp}.svg`;
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
}

// Legacy Window Bindings
window.updateExportPreview = updateExportPreview;
window.exportMatrixSVG = exportMatrixSVG;
