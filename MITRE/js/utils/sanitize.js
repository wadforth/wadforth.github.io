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
        
        const removeScripts = (node) => {
            // Remove dangerous tags
            if (node.tagName) {
                const tag = node.tagName.toLowerCase();
                if (['script', 'iframe', 'object', 'embed', 'style'].includes(tag)) {
                    node.remove();
                    return;
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
