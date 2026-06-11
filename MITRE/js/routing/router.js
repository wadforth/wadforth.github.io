// Router Module: Handles View Switching and DOM Navigation Events

export class Router {
    static init() {
        this.bindNavigationEvents();
        this.bindActionButtons();
    }

    static bindNavigationEvents() {
        document.querySelectorAll('[data-view]').forEach(link => {
            link.addEventListener('click', async (e) => {
                e.preventDefault();
                const view = link.dataset.view;
                this.navigate(view);
            });
        });

        document.getElementById('nav-home')?.addEventListener('click', (e) => {
            e.preventDefault();
            if (typeof window.saveCurrentLayerNow === 'function') {
                window.saveCurrentLayerNow();
            }
            if (typeof window.showLanding === 'function') {
                window.showLanding();
            }
        });
    }

    static async navigate(view) {
        try {
            localStorage.setItem('attack-explorer-current-view', view);
        } catch (err) {
            console.warn('Unable to persist current view:', err);
        }
        
        // Update navigation active states
        document.querySelectorAll('[data-view]').forEach(l => l.classList.remove('active'));
        const activeLink = document.querySelector(`[data-view="${view}"]`);
        if (activeLink) activeLink.classList.add('active');
        
        // Toggle view sections
        document.querySelectorAll('.view-section').forEach(s => s.classList.add('hidden'));
        const targetView = document.getElementById(`${view}-view`);
        if (targetView && view !== 'sigma') targetView.classList.remove('hidden');
        
        // Trigger specific logic for views (using global functions due to legacy migration)
        if (view === 'queries' && window.renderQueriesView) {
            window.renderQueriesView();
        } else if (view === 'groups' && window.renderGroupsView) {
            window.renderGroupsView();
        } else if (view === 'software' && window.renderSoftwareView) {
            window.renderSoftwareView();
        } else if (view === 'mitigations' && window.renderMitigationsView) {
            window.renderMitigationsView();
        } else if (view === 'reports' && window.loadReportsList) {
            window.loadReportsList();

        } else if (view === 'sigma') {
            if (window.loadSigmaModule) {
                const sigma = await window.loadSigmaModule();
                if (targetView) targetView.classList.remove('hidden');
                if (sigma && sigma.renderSigmaView) {
                    sigma.renderSigmaView();
                }
            }
        }
    }

    static bindActionButtons() {
        document.getElementById('btn-create-new')?.addEventListener('click', () => {
            const state = window.state;
            if (!state) return;
            state.currentDomain = document.getElementById('domain-select')?.value || 'enterprise-attack';
            state.currentVersion = document.getElementById('version-select')?.value || 'master';
            state.expandedTechniques.clear();
            state.companyName = '';
            state.companyLogo = null;
            if (typeof window.showWorkspace === 'function') window.showWorkspace();
            if (typeof window.loadSTIX === 'function') window.loadSTIX(state.currentDomain, state.currentVersion);
        });

        document.getElementById('btn-view-matrix')?.addEventListener('click', () => {
            const state = window.state;
            if (!state) return;
            state.currentDomain = document.getElementById('domain-select')?.value || 'enterprise-attack';
            state.currentVersion = document.getElementById('version-select')?.value || 'master';
            state.expandedTechniques.clear();
            state.companyName = '';
            state.companyLogo = null;
            if (typeof window.showWorkspace === 'function') window.showWorkspace();
            if (typeof window.loadSTIX === 'function') window.loadSTIX(state.currentDomain, state.currentVersion);
        });
    }
}

// Legacy window binding
window.Router = Router;
