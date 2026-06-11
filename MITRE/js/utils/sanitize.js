/**
 * DOM Sanitizer to prevent XSS vulnerabilities in string-based HTML rendering.
 * Strips script tags and malicious objects from dirty HTML.
 */
window.DOMSanitizer = {
    sanitize: function(dirtyHtml) {
        if (!dirtyHtml) return '';
        
        // Fast path for obviously safe strings (no tags)
        if (typeof dirtyHtml === 'string' && dirtyHtml.indexOf('<') === -1) {
            return dirtyHtml;
        }

        const parser = new DOMParser();
        const doc = parser.parseFromString(dirtyHtml, 'text/html');
        
        const isSafeUrl = (value) => {
            const raw = String(value || '').trim();
            if (!raw) return true;
            if (raw.startsWith('#') || raw.startsWith('/') || raw.startsWith('./') || raw.startsWith('../')) return true;
            try {
                const url = new URL(raw, window.location.href);
                return ['http:', 'https:', 'mailto:', 'blob:'].includes(url.protocol) || raw.startsWith('data:image/');
            } catch {
                return false;
            }
        };

        const removeScripts = (node) => {
            // Remove dangerous tags
            if (node.tagName) {
                const tag = node.tagName.toLowerCase();
                if (['script', 'iframe', 'object', 'embed', 'style', 'foreignobject', 'meta', 'base', 'link'].includes(tag)) {
                    node.remove();
                    return;
                }

                for (const attr of Array.from(node.attributes || [])) {
                    const name = attr.name.toLowerCase();
                    const value = String(attr.value || '').trim().toLowerCase();
                    if (
                        name.startsWith('on') ||
                        name === 'srcdoc' ||
                        value.startsWith('javascript:') ||
                        value.startsWith('vbscript:') ||
                        value.startsWith('data:text/html') ||
                        (['href', 'src', 'xlink:href', 'formaction'].includes(name) && !isSafeUrl(attr.value))
                    ) {
                        node.removeAttribute(attr.name);
                    }
                }
            }
            
            // Recurse down the tree
            const children = Array.from(node.childNodes);
            for (let i = 0; i < children.length; i++) {
                removeScripts(children[i]);
            }
        };
        
        removeScripts(doc.body);
        return doc.body.innerHTML;
    }
};
