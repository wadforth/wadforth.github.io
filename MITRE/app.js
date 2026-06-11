export function showLoading(show, text = 'Fetching STIX bundle...') {
    const overlay = document.getElementById('loading-overlay');
    const loadingText = document.getElementById('loading-text');
    loadingText.textContent = text;
    overlay.classList.toggle('hidden', !show);
}

export function showLanding() {
    document.body.classList.add('landing-active');
    document.getElementById('landing-view').classList.remove('hidden');
    document.getElementById('workspace-view').classList.add('hidden');
    document.querySelector('.top-nav').classList.add('hidden');
    
    // Sync landing dropdowns
    const landVer = document.getElementById('landing-version-select');
    const realVer = document.getElementById('version-select');
    
    if (landVer && realVer) {
        landVer.innerHTML = realVer.innerHTML;
        landVer.value = realVer.value;
        landVer.onchange = (e) => {
            realVer.value = e.target.value;
            if (window.state) window.state.currentVersion = e.target.value;
        };
    }
    
    if (window.renderRecentLayers) window.renderRecentLayers();
    setTimeout(() => { if (window.enhanceLandingPage) window.enhanceLandingPage() }, 100);
}

export function showWorkspace() {
    document.body.classList.remove('landing-active');
    document.getElementById('landing-view').classList.add('hidden');
    document.getElementById('workspace-view').classList.remove('hidden');
    document.querySelector('.top-nav').classList.remove('hidden');
}

export function initTheme() {
    const saved = localStorage.getItem('attack-explorer-theme');
    const theme = saved === 'dark' ? 'dark' : 'light';
    const icon = theme === 'dark' ? '<i class="bi bi-sun-fill"></i>' : '<i class="bi bi-moon-fill"></i>';

    document.documentElement.setAttribute('data-theme', theme);

    const themeBtn = document.getElementById('theme-toggle');
    const landingThemeBtn = document.getElementById('landing-theme-toggle');
    if (themeBtn) themeBtn.innerHTML = icon;
    if (landingThemeBtn) landingThemeBtn.innerHTML = icon;
}

const toggleTheme = () => {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    document.documentElement.setAttribute('data-theme', isDark ? 'light' : 'dark');
    const newIcon = isDark ? '<i class="bi bi-moon-fill"></i>' : '<i class="bi bi-sun-fill"></i>';
    
    const themeBtn = document.getElementById('theme-toggle');
    const landingThemeBtn = document.getElementById('landing-theme-toggle');
    if (themeBtn) themeBtn.innerHTML = newIcon;
    if (landingThemeBtn) landingThemeBtn.innerHTML = newIcon;
    
    localStorage.setItem('attack-explorer-theme', isDark ? 'light' : 'dark');
};

document.getElementById('theme-toggle')?.addEventListener('click', toggleTheme);
document.getElementById('landing-theme-toggle')?.addEventListener('click', toggleTheme);

window.triggerVersionUpgrade = function(targetVersion) {
    const select = document.getElementById('version-select');
    if (!select) return;
    const option = Array.from(select.options).find(opt => 
        opt.value.replace(/v/i, '') === targetVersion.replace(/v/i, '')
    );
    if (option) {
        select.value = option.value;
        select.dispatchEvent(new Event('change'));
    } else {
        const latestRelease = window.state?.releases?.[0]?.tag;
        if (latestRelease) {
            select.value = latestRelease;
            select.dispatchEvent(new Event('change'));
        }
    }
};

export async function checkForUpdates() {
    try {
        const cachedVer = localStorage.getItem('attack-explorer-latest-version');
        const cachedTs = localStorage.getItem('attack-explorer-latest-version-timestamp');
        const currentVer = (window.state?.currentVersion || '').replace(/v/i, '');
        
        if (cachedVer && cachedTs && (Date.now() - parseInt(cachedTs, 10)) < 12 * 60 * 60 * 1000) {
            if (cachedVer && currentVer && cachedVer !== currentVer) {
                if (window.showToastWithOptions) {
                    window.showToastWithOptions(`ATT&CK ${cachedVer} is available!`, {
                        type: 'info',
                        duration: 10000,
                        actionLabel: 'Upgrade Layer',
                        action: () => { window.triggerVersionUpgrade(localStorage.getItem('attack-explorer-latest-version')) }
                    });
                }
            }
            return;
        }

        const res = await fetch('https://api.github.com/repos/mitre/cti/releases/latest');
        if (!res.ok) return;
        const data = await res.json();
        const rawTag = data.tag_name || '';
        const latestVer = rawTag.replace(/ATT&CK-?v?/i, '');
        
        if (latestVer) {
            localStorage.setItem('attack-explorer-latest-version', latestVer);
            localStorage.setItem('attack-explorer-latest-version-timestamp', Date.now().toString());
            
            if (currentVer && latestVer !== currentVer) {
                if (window.showToastWithOptions) {
                    window.showToastWithOptions(`ATT&CK ${latestVer} is available!`, {
                        type: 'info',
                        duration: 10000,
                        actionLabel: 'Upgrade Layer',
                        action: () => { window.triggerVersionUpgrade(localStorage.getItem('attack-explorer-latest-version')) }
                    });
                }
            }
        }
    } catch {
        // Silently fail - offline or rate limited
    }
}

export async function init() {
    initTheme();
    if (window.initUI) window.initUI();
    
    // Initialize extracted modules
    if (window.Router) window.Router.init();
    if (window.LayerImportEngine) window.LayerImportEngine.init();
    
    // Sigma module is lazy-loaded on first access (code splitting)
    let sigmaModuleLoaded = false;
    let sigmaModule = null;
    let sigmaModulePromise = null;
    
    window.loadSigmaModule = async function() {
        if (sigmaModulePromise) return sigmaModulePromise;
        if (!sigmaModuleLoaded) {
            sigmaModulePromise = (async () => {
                sigmaModule = await import('./js/intel/sigma.js');
                sigmaModuleLoaded = true;
                window.sigmaModule = sigmaModule;
                await sigmaModule.initSigmaModule();
                
                // Expose candidates functions globally for onclick handlers
                window.toggleCandidatesView = sigmaModule.toggleCandidatesView;
                window.renderCandidatesList = sigmaModule.renderCandidatesList;
                window.updateCandidatesBadge = sigmaModule.updateCandidatesBadge;
                window.isRuleCandidate = sigmaModule.isRuleCandidate;
                window.toggleRuleCandidate = sigmaModule.toggleRuleCandidate;
                window.removeCandidate = sigmaModule.removeCandidate;
                window.clearAllCandidates = sigmaModule.clearAllCandidates;
                window.exportCandidatesList = sigmaModule.exportCandidatesList;
                window.deployCandidate = sigmaModule.deployCandidate;
                window.viewCandidateDetails = sigmaModule.viewCandidateDetails;
                return sigmaModule;
            })().finally(() => {
                sigmaModulePromise = null;
            });
            return sigmaModulePromise;
        }
        return sigmaModule;
    };

    if (window.fetchReleases) await window.fetchReleases();

    const state = window.state || {};
    const lastVersion = localStorage.getItem('attack-explorer-last-version');
    const releases = state.releases || [];
    
    if (lastVersion && releases.some(r => r.tag === lastVersion)) {
        state.currentVersion = lastVersion;
        if (document.getElementById('version-select')) {
            document.getElementById('version-select').value = lastVersion;
        }
    } else {
        state.currentVersion = releases[0]?.tag || 'master';
        if (document.getElementById('version-select')) {
            document.getElementById('version-select').value = state.currentVersion;
        }
    }

    // Restore current layer if exists
    const savedLayer = window.loadCurrentLayer ? await window.loadCurrentLayer() : null;
    if (savedLayer) {
        state.currentDomain = savedLayer.domain || localStorage.getItem('attack-explorer-current-domain') || 'enterprise-attack';
        state.currentVersion = localStorage.getItem('attack-explorer-current-version') || state.currentVersion;
        const savedExpanded = JSON.parse(localStorage.getItem('attack-explorer-expanded') || '[]');
        if (state.expandedTechniques) state.expandedTechniques = new Set(savedExpanded);
        if (document.getElementById('version-select')) document.getElementById('version-select').value = state.currentVersion;
        showWorkspace();
        if (window.loadSTIX) await window.loadSTIX(state.currentDomain, state.currentVersion, savedLayer);
        
        // Restore last active view selection
        const savedView = localStorage.getItem('attack-explorer-current-view') || 'matrix';
        const targetLink = document.querySelector(`[data-view="${savedView}"]`);
        if (targetLink) {
            targetLink.click();
        }
    } else {
        showLanding();
    }

    await checkForUpdates();
}

// Ensure init executes
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

// Legacy Window Bindings
window.showLoading = showLoading;
window.showLanding = showLanding;
window.showWorkspace = showWorkspace;
window.initTheme = initTheme;
window.checkForUpdates = checkForUpdates;
window.init = init;
