const GITHUB_API = 'https://api.github.com/repos/mitre-attack/attack-stix-data';
const RAW_BASE = 'https://raw.githubusercontent.com/mitre-attack/attack-stix-data';
const UPDATE_CHECK_INTERVAL = 24 * 60 * 60 * 1000;
const LAYER_VERSION = '4.5';

const state = {
    techniques: [],
    tactics: [],
    groups: [],
    software: [],
    mitigations: [],
    relationships: [],
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

const defaultLegend = [
    { label: 'Critical', color: '#ef4444' },
    { label: 'High', color: '#f97316' },
    { label: 'Medium', color: '#eab308' },
    { label: 'Low', color: '#22c55e' },
    { label: 'Info', color: '#3b82f6' },
];
