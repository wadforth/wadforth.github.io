const PERFORMANCE_KEY = 'attack-explorer-performance-mode';

export function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

function prefersReducedMotion() {
    return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || false;
}

export function getPerformanceMode() {
    try {
        const stored = localStorage.getItem(PERFORMANCE_KEY);
        if (stored === 'low' || stored === 'normal') return stored;
    } catch {}
    return prefersReducedMotion() ? 'low' : 'normal';
}

export function setPerformanceMode(mode) {
    const next = mode === 'low' ? 'low' : 'normal';
    document.documentElement.dataset.performanceMode = next;
    try {
        localStorage.setItem(PERFORMANCE_KEY, next);
    } catch {}
    updatePerformanceToggle(next);
    return next;
}

export function togglePerformanceMode() {
    return setPerformanceMode(getPerformanceMode() === 'low' ? 'normal' : 'low');
}

function updatePerformanceToggle(mode = getPerformanceMode()) {
    const btn = document.getElementById('btn-performance-mode');
    if (!btn) return;
    const isLow = mode === 'low';
    btn.setAttribute('aria-pressed', String(isLow));
    btn.title = isLow ? 'Disable performance mode' : 'Enable performance mode';
    btn.classList.toggle('active', isLow);
}

document.addEventListener('DOMContentLoaded', () => {
    setPerformanceMode(getPerformanceMode());
    document.getElementById('btn-performance-mode')?.addEventListener('click', () => {
        const mode = togglePerformanceMode();
        window.showToast?.(`Performance mode ${mode === 'low' ? 'enabled' : 'disabled'}`, 'info');
    });
});

window.getPerformanceMode = getPerformanceMode;
window.setPerformanceMode = setPerformanceMode;
window.togglePerformanceMode = togglePerformanceMode;
