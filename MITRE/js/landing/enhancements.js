/* ============================================
   Landing Page Enhancements
   ============================================ */

export let landingEnhanced = false;

function escapeLandingHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function getLayerTechniqueRows() {
    return window.state?.currentLayer?.techniques || [];
}

function countUniqueQueries(techniques) {
    const seen = new Set();
    techniques.forEach(technique => {
        (technique.queries || []).forEach(query => {
            if (query?.id) seen.add(query.id);
            else if (query?.name || query?.query) seen.add(`${query.name || ''}:${query.query || ''}`);
        });
    });
    return seen.size;
}

export function renderLandingWorkspaceSummary() {
    const container = document.getElementById('landing-workspace-summary');
    if (!container) return;

    const state = window.state;
    const layer = state?.currentLayer;
    const techniques = layer ? getLayerTechniqueRows() : [];
    const annotated = techniques.length;
    const queries = countUniqueQueries(techniques);
    const totalTechniques = state?.techniques?.length || annotated;
    const gaps = Math.max(totalTechniques - annotated, 0);
    const coverage = totalTechniques ? `${((annotated / totalTechniques) * 100).toFixed(1)}%` : '0%';

    container.className = 'landing-summary-grid landing-summary-compact';
    container.innerHTML = `
        <div class="landing-summary-card"><span>Coverage</span><strong class="summary-risk">${escapeLandingHtml(coverage)}</strong></div>
        <div class="landing-summary-card"><span>Queries</span><strong class="summary-good">${queries}</strong></div>
        <div class="landing-summary-card"><span>Gaps</span><strong class="summary-warn">${gaps}</strong></div>
    `;
}

function openLandingView(view) {
    const hasLayer = Boolean(window.state?.currentLayer);
    if (!hasLayer) {
        const createNewBtn = document.getElementById('btn-create-new');
        if (createNewBtn) createNewBtn.click();
    } else if (window.showWorkspace) {
        window.showWorkspace();
    }

    const navigateWhenReady = () => {
        const target = document.querySelector(`[data-view="${view}"]`);
        if (target) target.click();
    };

    let attempts = 0;
    const timer = setInterval(() => {
        attempts += 1;
        if (window.state?.currentLayer || attempts > 30) {
            clearInterval(timer);
            navigateWhenReady();
        }
    }, 100);
}

function runLandingMatrixSearch(query) {
    openLandingView('matrix');

    let attempts = 0;
    const timer = setInterval(() => {
        attempts += 1;
        const matrixSearch = document.getElementById('matrix-search-input');
        if (matrixSearch || attempts > 30) {
            clearInterval(timer);
            if (matrixSearch) {
                matrixSearch.value = query;
                matrixSearch.dispatchEvent(new Event('input'));
            }
        }
    }, 100);
}

export function enhanceLandingPage() {
    if (landingEnhanced) {
        renderLandingWorkspaceSummary();
        return;
    }
    landingEnhanced = true;

    renderLandingWorkspaceSummary();

    const searchInput = document.getElementById('landing-universal-search');
    if (searchInput) {
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && searchInput.value.trim()) {
                const query = searchInput.value.trim();
                runLandingMatrixSearch(query);
            }
        });
    }

    document.querySelectorAll('[data-landing-open-view]').forEach(button => {
        button.addEventListener('click', () => openLandingView(button.dataset.landingOpenView || 'matrix'));
    });
}

// Legacy Window Bindings
window.landingEnhanced = landingEnhanced;
window.enhanceLandingPage = enhanceLandingPage;
window.renderLandingWorkspaceSummary = renderLandingWorkspaceSummary;
