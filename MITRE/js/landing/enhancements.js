/* ============================================
   Landing Page Enhancements
   ============================================ */

export let landingEnhanced = false;

export function enhanceLandingPage() {
    if (landingEnhanced) return;
    landingEnhanced = true;

    // 1. Mouse Tracking for Orbs and Tilt
    const landingView = document.getElementById('landing-view');
    const commandBox = document.querySelector('.command-box');

    if (landingView) {
        landingView.addEventListener('mousemove', (e) => {
            const x = (e.clientX - window.innerWidth / 2);
            const y = (e.clientY - window.innerHeight / 2);

            // Update CSS variables for orb animations
            landingView.style.setProperty('--mouse-x', `${x}px`);
            landingView.style.setProperty('--mouse-y', `${y}px`);

            // Command Box 3D Tilt
            if (commandBox) {
                const tiltX = (y / window.innerHeight) * -10; // max tilt 10deg
                const tiltY = (x / window.innerWidth) * 10;
                commandBox.style.transform = `rotateX(${tiltX}deg) rotateY(${tiltY}deg)`;
            }
        });

        // Reset tilt on mouse leave
        landingView.addEventListener('mouseleave', () => {
            if (commandBox) {
                commandBox.style.transform = 'rotateX(0deg) rotateY(0deg)';
            }
        });
    }

    // 2. Universal Search Bar Logic
    const searchInput = document.getElementById('landing-universal-search');
    if (searchInput) {
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && searchInput.value.trim()) {
                const query = searchInput.value.trim();
                
                // If it's a Sigma Rule lookup (starts with SIGMA or has "rule" in it), we could route to Sigma view.
                // For now, route everything to the Matrix view where the primary search lives.
                
                // Open new layer first if in landing
                const createNewBtn = document.getElementById('btn-create-new');
                if (createNewBtn) createNewBtn.click();
                
                // Wait for the workspace to load, then trigger search
                setTimeout(() => {
                    const matrixNav = document.querySelector('[data-view="matrix"]');
                    if (matrixNav) matrixNav.click();

                    setTimeout(() => {
                        const matrixSearch = document.getElementById('matrix-search-input');
                        if (matrixSearch) {
                            matrixSearch.value = query;
                            matrixSearch.dispatchEvent(new Event('input'));
                        }
                    }, 50);
                }, 150);
            }
        });
    }
}

// Legacy Window Bindings
window.landingEnhanced = landingEnhanced;
window.enhanceLandingPage = enhanceLandingPage;
