export const GITHUB_API = 'https://api.github.com/repos/mitre-attack/attack-stix-data';
export const RAW_BASE = 'https://raw.githubusercontent.com/mitre-attack/attack-stix-data';
export const UPDATE_CHECK_INTERVAL = 24 * 60 * 60 * 1000;
export const LAYER_VERSION = '4.5';

export const _internalState = {
    techniques: [],
    revokedTechniques: [],
    tactics: [],
    groups: [],
    software: [],
    mitigations: [],
    relationships: [],
    dataSources: [],
    dataComponents: [],
    platforms: new Set(),
    currentDomain: 'enterprise-attack',
    currentVersion: null,
    activePlatforms: new Set(),
    searchFilter: 'all',
    releases: [],
    currentLayer: null,
    contextTarget: null,
    expandedTechniques: new Set(),
    currentModalTechniqueId: null,
    autoColorByQueries: true,
    matrixSearchQuery: '',
    matrixFocusTechniques: new Set(),
    matrixFocusPending: false,
    companyName: '',
    companyLogo: null,
    author: '',
    autoColorRules: [
        { label: '≥60% sub-techniques covered', color: '#22c55e', operator: '>=', value: 60, type: 'sub-coverage' },
        { label: '<60% sub-techniques covered', color: '#eab308', operator: '<', value: 60, type: 'sub-coverage' },
        { label: '2+ queries created', color: '#22c55e', operator: '>=', value: 2, type: 'query-count' },
        { label: '1 query created', color: '#eab308', operator: '=', value: 1, type: 'query-count' },
    ],
};

window.StateManager = {
    setSTIXData: function(data) {
        _internalState.techniques = data.techniques;
        _internalState.revokedTechniques = data.revokedTechniques;
        _internalState.tactics = data.tactics;
        _internalState.groups = data.groups;
        _internalState.software = data.software;
        _internalState.mitigations = data.mitigations;
        _internalState.relationships = data.relationships;
        _internalState.dataSources = data.dataSources;
        _internalState.dataComponents = data.dataComponents;
        _internalState.platforms = data.platforms;
        _internalState.activePlatforms = new Set(data.platforms);
        document.dispatchEvent(new CustomEvent('stix-data-updated'));
    }
};

export const state = new Proxy(_internalState, {
    set(target, prop, value) {
        target[prop] = value;
        return true;
    }
});

export const defaultLegend = [
    { label: 'Critical', color: '#ef4444' },
    { label: 'High', color: '#f97316' },
    { label: 'Medium', color: '#eab308' },
    { label: 'Low', color: '#22c55e' },
    { label: 'Info', color: '#3b82f6' },
];

// Legacy Window Bindings
window.GITHUB_API = GITHUB_API;
window.RAW_BASE = RAW_BASE;
window.UPDATE_CHECK_INTERVAL = UPDATE_CHECK_INTERVAL;
window.LAYER_VERSION = LAYER_VERSION;
window._internalState = _internalState;
window.state = state;
window.defaultLegend = defaultLegend;
