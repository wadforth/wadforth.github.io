/* ============================================
   Landing Page Enhancements - Phase 3
   Animated background only
   ============================================ */

export let landingEnhanced = false;

export function enhanceLandingPage() {
    if (landingEnhanced) return;
    landingEnhanced = true;
}

// Legacy Window Bindings
window.landingEnhanced = landingEnhanced;
window.enhanceLandingPage = enhanceLandingPage;
