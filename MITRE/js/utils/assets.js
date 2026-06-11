const loadedScripts = new Map();

export function loadExternalScript(src, globalCheck) {
    if (typeof globalCheck === 'function' && globalCheck()) return Promise.resolve();
    if (loadedScripts.has(src)) return loadedScripts.get(src);

    const promise = new Promise((resolve, reject) => {
        const existing = Array.from(document.scripts).find(script => script.src === src);
        if (existing) {
            existing.addEventListener('load', () => resolve(), { once: true });
            existing.addEventListener('error', () => reject(new Error(`Failed to load ${src}`)), { once: true });
            return;
        }

        const script = document.createElement('script');
        script.src = src;
        script.async = true;
        script.crossOrigin = 'anonymous';
        script.onload = () => resolve();
        script.onerror = () => reject(new Error(`Failed to load ${src}`));
        document.head.appendChild(script);
    });

    loadedScripts.set(src, promise);
    return promise;
}

export function ensureHtmlToImage() {
    return loadExternalScript(
        'https://cdn.jsdelivr.net/npm/html-to-image@1.11.11/dist/html-to-image.js',
        () => Boolean(window.htmlToImage?.toSvg || window.htmlToImage?.toPng)
    );
}

window.loadExternalScript = loadExternalScript;
window.ensureHtmlToImage = ensureHtmlToImage;
