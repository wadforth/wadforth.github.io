function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function parseDescription(text) {
    if (!text) return '';
    
    const links = [];
    const citations = [];
    
    let protected = text
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (m, label, url) => {
            links.push({ label, url });
            return `__L${links.length - 1}__`;
        })
        .replace(/\(Citation: ([^)]+)\)/g, (m, content) => {
            citations.push(content);
            return `__C${citations.length - 1}__`;
        });
    
    const paragraphs = [];
    const blocks = protected.split(/\n\n+/);
    
    for (const block of blocks) {
        const trimmed = block.trim();
        if (!trimmed) continue;
        
        if (trimmed.length > 300) {
            const sentences = trimmed.split(/(?<=[.!?])\s+(?=[A-Z])/);
            if (sentences.length > 1) {
                let current = '';
                for (const s of sentences) {
                    const clean = s.trim();
                    if (!clean) continue;
                    if (current && (current + ' ' + clean).length > 280) {
                        paragraphs.push(current);
                        current = clean;
                    } else {
                        current += (current ? ' ' : '') + clean;
                    }
                }
                if (current) paragraphs.push(current);
            } else {
                paragraphs.push(trimmed);
            }
        } else {
            paragraphs.push(trimmed);
        }
    }
    
    return paragraphs.map(p => {
        let html = p
            .replace(/__C(\d+)__/g, (_, i) => `<span class="citation">(Citation: ${citations[i]})</span>`)
            .replace(/__L(\d+)__/g, (_, i) => `<a href="${links[i].url}" target="_blank" rel="noopener">${links[i].label}</a>`)
            .replace(/^\* /gm, '&bull; ');
        return `<p class="desc-paragraph">${html}</p>`;
    }).join('');
}

function highlightQuerySyntax(query, language) {
    let escaped = escapeHtml(query);
    
    const rules = {
        splunk: [
            { regex: /\b(index|search|stats|count|by|where|eval|table|sort|head|tail|dedup|rename|fields|join|append|union|inputlookup|outputlookup|makeresults|streamstats|eventstats|timechart|chart|top|rare|transaction|rex|replace|convert|fillnull|filldown|appendpipe|like|match|searchmatch)\b/gi, cls: 'hl-keyword' },
            { regex: /\b(\d+\.?\d*)\b/g, cls: 'hl-number' },
            { regex: /(["'][^"']*["'])/g, cls: 'hl-string' },
            { regex: /(\/\/.*$|#.*$)/gm, cls: 'hl-comment' },
            { regex: /(\|=|\|<|\|>|\|==|\|!=|AND|OR|NOT)\b/gi, cls: 'hl-operator' },
        ],
        kql: [
            { regex: /\b(where|summarize|extend|project|order|take|join|union|let|print|range|datatable|make-series|render|partition|scan|fork|search|find|arg_max|arg_min|top-nested|top-hitters|mv-expand|mv-apply|parse|parse-where|parse-kv|bag-expand|bag-unpack|evaluate|ingestion-time|now|ago|datetime|timespan|dynamic|guid|ipaddress|long|real|string|timespan|uuid)\b/gi, cls: 'hl-keyword' },
            { regex: /\b(\d+\.?\d*)\b/g, cls: 'hl-number' },
            { regex: /(["'][^"']*["'])/g, cls: 'hl-string' },
            { regex: /(\/\/.*$)/gm, cls: 'hl-comment' },
            { regex: /(\|=|\|<|\|>|\|==|\|!=|and|or|not|has|!has|contains|!contains|startswith|endswith|matches regex)\b/gi, cls: 'hl-operator' },
        ],
        sigma: [
            { regex: /^(title|id|status|description|references|author|date|modified|logsource|detection|falsepositives|level|tags|fields):/gm, cls: 'hl-field' },
            { regex: /\b(true|false|null)\b/gi, cls: 'hl-keyword' },
            { regex: /(["'][^"']*["'])/g, cls: 'hl-string' },
            { regex: /(\/\/.*$|#.*$)/gm, cls: 'hl-comment' },
            { regex: /(\*|\?|all|of|them|selection)/g, cls: 'hl-operator' },
        ],
        elastic: [
            { regex: /\b(AND|OR|NOT|TO)\b/g, cls: 'hl-keyword' },
            { regex: /\b(\d+\.?\d*)\b/g, cls: 'hl-number' },
            { regex: /(["'][^"']*["'])/g, cls: 'hl-string' },
            { regex: /(\/\/.*$|#.*$)/gm, cls: 'hl-comment' },
            { regex: /([<>]=?|==|!=)/g, cls: 'hl-operator' },
        ],
    };
    
    const langRules = rules[language] || [];
    
    for (const rule of langRules) {
        escaped = escaped.replace(rule.regex, `<span class="${rule.cls}">$1</span>`);
    }
    
    return escaped;
}
