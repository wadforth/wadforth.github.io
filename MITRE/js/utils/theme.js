// Zero network hashed color generator
function getHashedColor(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const h = Math.abs(hash % 360);
    return `hsl(${h}, 60%, 35%)`;
}

// Zero network initials extractor
function getInitials(name) {
    const clean = name.replace(/[^a-zA-Z0-9\s]/g, '').trim();
    const parts = clean.split(/\s+/);
    if (parts.length >= 2) {
        return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return clean.substring(0, 2).toUpperCase();
}

// Helper to classify groups dynamically by geopolitical/financial threat profile
function getAttributionTheme(group) {
    const desc = (group.description || '').toLowerCase();
    const name = (group.name || '').toLowerCase();
    const motivation = [group.primary_motivation, ...(group.secondary_motivations || [])].filter(Boolean).map(m => m.toLowerCase()).join(' ');
    
    if (name.includes('apt') || name.includes('typhoon') || name.includes('lazarus') || name.includes('fancy') || name.includes('cozy') || desc.includes('state-sponsored') || desc.includes('espionage') || motivation.includes('espionage') || motivation.includes('state-sponsored')) {
        return {
            id: 'state-sponsored',
            name: 'State-Sponsored',
            icon: 'bi-shield-exclamation',
            glowColor: '#ff6b3b',
            badgeClass: 'badge-attribution-state',
            accentHex: '#ff6b3b',
            accentRGB: '255, 107, 59'
        };
    } else if (name.includes('fin') || name.includes('ransomware') || desc.includes('financial') || desc.includes('extortion') || desc.includes('ransomware') || motivation.includes('financial-gain')) {
        return {
            id: 'financial',
            name: 'Financial Crime',
            icon: 'bi-currency-dollar',
            badgeClass: 'badge-attribution-financial',
            accentHex: '#10b981',
            accentRGB: '16, 185, 129'
        };
    } else {
        return {
            id: 'general',
            name: 'Threat Group',
            icon: 'bi-terminal',
            badgeClass: 'badge-attribution-general',
            accentHex: '#a855f7',
            accentRGB: '168, 85, 247'
        };
    }
}

// Helper to classify software dynamically by malware vs tool behavioral threat profile
function getSoftwareTheme(sw) {
    if (sw.type === 'malware') {
        return {
            id: 'malware',
            name: 'Malware',
            icon: 'bi-bug',
            glowColor: '#ef4444',
            badgeClass: 'badge-software-malware',
            accentHex: '#ef4444',
            accentRGB: '239, 68, 68'
        };
    } else {
        return {
            id: 'tool',
            name: 'Tool',
            icon: 'bi-wrench',
            glowColor: '#00d8a6',
            badgeClass: 'badge-software-tool',
            accentHex: '#00d8a6',
            accentRGB: '0, 216, 166'
        };
    }
}

// Generate procedural glowing inline SVG avatars for groups
function getProceduralAvatarSVG(groupId, groupName) {
    let hash = 0;
    for (let i = 0; i < groupName.length; i++) {
        hash = groupName.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue1 = Math.abs(hash % 360);
    const hue2 = Math.abs((hash * 7) % 360);
    const shapeType = Math.abs((hash * 13) % 3); // 0 = Circle grid, 1 = Triangle, 2 = Crosshairs
    const initials = getInitials(groupName);
    
    return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" style="width:100%; height:100%; border-radius:inherit; display:block;">
        <defs>
            <linearGradient id="grad-${groupId}" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="hsl(${hue1}, 80%, 45%)" />
                <stop offset="100%" stop-color="hsl(${hue2}, 85%, 20%)" />
            </linearGradient>
            <radialGradient id="glow-${groupId}" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stop-color="#ffffff" stop-opacity="0.3" />
                <stop offset="100%" stop-color="#ffffff" stop-opacity="0" />
            </radialGradient>
        </defs>
        <rect width="100%" height="100%" fill="url(#grad-${groupId})" />
        
        <!-- Procedural tactical element -->
        ${shapeType === 0 ? `
            <circle cx="50" cy="50" r="28" fill="none" stroke="rgba(255,255,255,0.2)" stroke-width="2.5" stroke-dasharray="6 3" />
            <circle cx="50" cy="50" r="16" fill="none" stroke="rgba(255,255,255,0.35)" stroke-width="1.5" />
        ` : shapeType === 1 ? `
            <polygon points="50,15 85,78 15,78" fill="none" stroke="rgba(255,255,255,0.25)" stroke-width="2.5" stroke-linejoin="round" />
            <polygon points="50,28 73,72 27,72" fill="none" stroke="rgba(255,255,255,0.4)" stroke-width="1.5" stroke-linejoin="round" />
        ` : `
            <line x1="15" y1="50" x2="85" y2="50" stroke="rgba(255,255,255,0.25)" stroke-width="2" />
            <line x1="50" y1="15" x2="50" y2="85" stroke="rgba(255,255,255,0.25)" stroke-width="2" />
            <circle cx="50" cy="50" r="12" fill="none" stroke="rgba(255,255,255,0.5)" stroke-width="1.5" />
        `}
        
        <circle cx="50" cy="50" r="42" fill="url(#glow-${groupId})" />
        <text x="50" y="55" font-family="'Outfit', 'Inter', system-ui, sans-serif" font-weight="900" font-size="28" fill="#ffffff" text-anchor="middle" dominant-baseline="middle" style="text-shadow: 0 2px 4px rgba(0,0,0,0.5);">
            ${initials}
        </text>
    </svg>`;
}

// Generate procedural glowing inline SVG avatars for software
function getProceduralSoftwareAvatarSVG(swId, name, type) {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
        hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue1 = Math.abs(hash % 360);
    const hue2 = Math.abs((hash * 7) % 360);
    const shapeType = Math.abs((hash * 13) % 2); // Two primary branches
    const initials = getInitials(name);
    
    let patternSvg = '';
    
    if (type === 'malware') {
        // Insect / Hazard shape: organic-tactical spikes or hazard polygons
        if (shapeType === 0) {
            // Spider / Insect leg pattern
            patternSvg = `
                <!-- Spider/insect legs -->
                <line x1="50" y1="50" x2="15" y2="35" stroke="rgba(255,255,255,0.3)" stroke-width="2.5" />
                <line x1="50" y1="50" x2="15" y2="50" stroke="rgba(255,255,255,0.3)" stroke-width="2.5" />
                <line x1="50" y1="50" x2="15" y2="65" stroke="rgba(255,255,255,0.3)" stroke-width="2.5" />
                <line x1="50" y1="50" x2="85" y2="35" stroke="rgba(255,255,255,0.3)" stroke-width="2.5" />
                <line x1="50" y1="50" x2="85" y2="50" stroke="rgba(255,255,255,0.3)" stroke-width="2.5" />
                <line x1="50" y1="50" x2="85" y2="65" stroke="rgba(255,255,255,0.3)" stroke-width="2.5" />
                <!-- Core body outline -->
                <polygon points="50,22 68,50 50,78 32,50" fill="none" stroke="rgba(255,255,255,0.4)" stroke-width="2" stroke-linejoin="round" />
            `;
        } else {
            // Biohazard / Angular Spiky Star
            patternSvg = `
                <!-- Spiky danger radiation nodes -->
                <polygon points="50,15 58,40 85,50 58,60 50,85 42,60 15,50 42,40" fill="none" stroke="rgba(255,255,255,0.25)" stroke-width="2.5" />
                <circle cx="50" cy="50" r="16" fill="none" stroke="rgba(255,255,255,0.4)" stroke-dasharray="4 2" stroke-width="1.5" />
            `;
        }
    } else {
        // Tool: Gears, cogs, circuit connections, or circuit matrix
        if (shapeType === 0) {
            // Gear / Cog pattern
            patternSvg = `
                <!-- Outer gear teeth (8 spokes) -->
                <circle cx="50" cy="50" r="28" fill="none" stroke="rgba(255,255,255,0.25)" stroke-width="4.5" stroke-dasharray="14 8" />
                <circle cx="50" cy="50" r="20" fill="none" stroke="rgba(255,255,255,0.4)" stroke-width="2" />
                <circle cx="50" cy="50" r="12" fill="none" stroke="rgba(255,255,255,0.2)" stroke-width="1.5" />
            `;
        } else {
            // Circuit Board grid / node connections
            patternSvg = `
                <!-- Circuit nodes and tracks -->
                <line x1="50" y1="15" x2="50" y2="85" stroke="rgba(255,255,255,0.2)" stroke-width="1.5" />
                <line x1="15" y1="50" x2="85" y2="50" stroke="rgba(255,255,255,0.2)" stroke-width="1.5" />
                <rect x="30" y="30" width="40" height="40" fill="none" stroke="rgba(255,255,255,0.3)" stroke-width="1.5" stroke-dasharray="8 4" />
                <!-- Terminal connector dots -->
                <circle cx="50" cy="15" r="4" fill="rgba(255,255,255,0.5)" />
                <circle cx="50" cy="85" r="4" fill="rgba(255,255,255,0.5)" />
                <circle cx="15" cy="50" r="4" fill="rgba(255,255,255,0.5)" />
                <circle cx="85" cy="50" r="4" fill="rgba(255,255,255,0.5)" />
            `;
        }
    }
    
    return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" style="width:100%; height:100%; border-radius:inherit; display:block;">
        <defs>
            <linearGradient id="swgrad-${swId}" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="hsl(${hue1}, 80%, 45%)" />
                <stop offset="100%" stop-color="hsl(${hue2}, 85%, 20%)" />
            </linearGradient>
            <radialGradient id="swglow-${swId}" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stop-color="#ffffff" stop-opacity="0.3" />
                <stop offset="100%" stop-color="#ffffff" stop-opacity="0" />
            </radialGradient>
        </defs>
        <rect width="100%" height="100%" fill="url(#swgrad-${swId})" />
        
        ${patternSvg}
        
        <circle cx="50" cy="50" r="42" fill="url(#swglow-${swId})" />
        <text x="50" y="55" font-family="'Outfit', 'Inter', system-ui, sans-serif" font-weight="900" font-size="28" fill="#ffffff" text-anchor="middle" dominant-baseline="middle" style="text-shadow: 0 2px 4px rgba(0,0,0,0.5);">
            ${initials}
        </text>
    </svg>`;
}
