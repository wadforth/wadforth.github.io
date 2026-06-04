export function escapeHtml(text) {
    if (!text) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

export function formatTimestamp(isoString) {
    if (!isoString) return '';
    const d = new Date(isoString);
    const now = new Date();
    const diffMs = now - d;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return d.toLocaleDateString();
}

/**
 * Cleans MITRE STIX raw descriptions by removing citation tags and markdown links
 * to produce clean plain text suitable for card previews.
 */
export function cleanDescription(text) {
    if (!text) return '';
    // Replace markdown links with their labels: [Label](URL) -> Label
    let clean = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1');
    // Remove parenthesized or bracketed citations: (Citation: ...) or [Citation: ...]
    clean = clean.replace(/[\(\[]Citation:\s*[^\]\)]+[\)\]]/gi, '');
    // Clean up excessive whitespace/newlines
    clean = clean.replace(/\s+/g, ' ').trim();
    return clean;
}

/**
 * Clean and truncate description gracefully to a maximum length
 */
export function truncateDescription(text, maxLength = 140) {
    const clean = cleanDescription(text);
    if (clean.length <= maxLength) return clean;
    // Gracefully truncate at last word space if within 80% of max length
    let truncated = clean.substring(0, maxLength);
    const lastSpace = truncated.lastIndexOf(' ');
    if (lastSpace > maxLength * 0.8) {
        truncated = truncated.substring(0, lastSpace);
    }
    return truncated + '...';
}

// Legacy Window Bindings
window.escapeHtml = escapeHtml;
window.formatTimestamp = formatTimestamp;
window.cleanDescription = cleanDescription;
window.truncateDescription = truncateDescription;
