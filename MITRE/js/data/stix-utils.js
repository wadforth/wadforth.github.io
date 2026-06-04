/* =========================================================================
   STIX Data Utility Module
   Extracts and centralizes STIX object parsing and MITRE ATT&CK lookups
   ========================================================================= */

export function isSubTechnique(techId) {
    if (!techId) return false;
    return techId.includes('.');
}

export function getTechniqueName(techId) {
    if (!state.techniques) return '';
    const tech = state.techniques.find(t => {
        const ref = t.external_references?.[0]?.external_id;
        return ref === techId;
    });
    return tech?.name || '';
}

export function getTechniqueStixId(techId) {
    if (!state.techniques) return null;
    const tech = state.techniques.find(t => {
        const ref = t.external_references?.[0]?.external_id;
        return ref === techId;
    });
    return tech?.id || null;
}

export function getTechniqueIdFromStix(stixId) {
    if (!state.techniques) return null;
    const tech = state.techniques.find(t => t.id === stixId);
    return tech?.external_references?.[0]?.external_id || null;
}

export function getTechniqueDescription(techId) {
    if (!state.techniques) return '';
    const tech = state.techniques.find(t => {
        const ref = t.external_references?.[0]?.external_id;
        return ref === techId;
    });
    if (!tech?.description) return '';
    
    // Get first sentence only (ends with period followed by space or end of string)
    const firstSentence = tech.description.match(/^[^.]*\./);
    return firstSentence ? firstSentence[0] : tech.description.substring(0, 100);
}

export function getTechniqueTactics(techId) {
    if (!state.techniques) return [];
    const tech = state.techniques.find(t => {
        const ref = t.external_references?.[0]?.external_id;
        return ref === techId;
    });
    if (!tech || !tech.kill_chain_phases) return [];
    return tech.kill_chain_phases.map(kp => kp.phase_name.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()));
}

// Legacy Window Bindings
window.isSubTechnique = isSubTechnique;
window.getTechniqueName = getTechniqueName;
window.getTechniqueStixId = getTechniqueStixId;
window.getTechniqueIdFromStix = getTechniqueIdFromStix;
window.getTechniqueDescription = getTechniqueDescription;
window.getTechniqueTactics = getTechniqueTactics;
