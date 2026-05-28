/* ============================================
   Landing Page Enhancements - Phase 3
   Animated background only
   ============================================ */

let landingEnhanced = false;

function enhanceLandingPage() {
    if (landingEnhanced) return;
    
    const landingView = document.getElementById('landing-view');
    if (!landingView) return;
    
    const container = landingView.querySelector('.landing-container');
    if (!container) return;
    
    // Add animated background (only once)
    if (!landingView.querySelector('.landing-animated-bg')) {
        const animatedBg = document.createElement('div');
        animatedBg.className = 'landing-animated-bg';
        animatedBg.innerHTML = `
            <div class="landing-gradient-orb"></div>
            <div class="landing-gradient-orb"></div>
            <div class="landing-gradient-orb"></div>
            <div class="landing-particles"></div>
        `;
        landingView.insertBefore(animatedBg, container);
    }
    
    // Enhance header structure (only once)
    const header = landingView.querySelector('.landing-header');
    if (header && !header.querySelector('.landing-brand-row')) {
        const brandIcon = header.querySelector('.brand-icon-lg');
        const title = header.querySelector('.landing-title');
        const subtitle = header.querySelector('.landing-subtitle');
        
        if (brandIcon && title && subtitle) {
            header.innerHTML = `
                <div class="landing-brand-row">
                    ${brandIcon.outerHTML}
                    <div>
                        ${title.outerHTML}
                        ${subtitle.outerHTML}
                    </div>
                </div>
            `;
        }
    }
    
    landingEnhanced = true;
}
