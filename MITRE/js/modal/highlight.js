export function parseDescription(text) {
    if (!text) return '';
    
    const links = [];
    const citations = [];
    
    let protectedText = text
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (m, label, url) => {
            links.push({ label, url });
            return `__L${links.length - 1}__`;
        })
        .replace(/[\(\[]Citation:\s*([^\]\)]+)[\)\]]/g, (m, content) => {
            citations.push(content);
            return `__C${citations.length - 1}__`;
        });
    
    const paragraphs = [];
    const blocks = protectedText.split(/\n\n+/);
    
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

export function highlightQuerySyntax(query, language) {
    if (!query) return '';
    
    const rules = {
        kql: [
            { type: 'comment', regex: /\/\/.*/ },
            { type: 'string', regex: /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/ },
            { type: 'operator', regex: /==|!=|<=|>=|<|>|=|!|\+|-|\*|\/|\||\band\b|\bor\b|\bnot\b|\bhas\b|\b!has\b|\bcontains\b|\b!contains\b/ },
            { type: 'keyword', regex: /\b(where|summarize|extend|project|order|take|join|union|let|print|range|datatable|make-series|render|partition|scan|fork|search|find|evaluate|now|ago|datetime|timespan|dynamic|guid|ipaddress|long|real|string|uuid|by|on|asc|desc|as|kind|leftouter|rightouter|inner|fullouter|leftanti|rightanti|leftsemi|rightsemi)\b/ },
            { type: 'function', regex: /\b([a-zA-Z_]\w*)\s*(?=\()/ },
            { type: 'number', regex: /\b\d+(\.\d+)?([eE][+-]?\d+)?\b/ },
        ],
        splunk: [
            { type: 'comment', regex: /`comment\(.*?\)`|\/\/.*/ },
            { type: 'string', regex: /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/ },
            { type: 'operator', regex: /==|!=|<=|>=|<|>|=|!|\+|-|\*|\/|\||\bAND\b|\bOR\b|\bNOT\b/ },
            { type: 'keyword', regex: /\b(index|search|stats|count|by|where|eval|table|sort|head|tail|dedup|rename|fields|join|append|union|inputlookup|outputlookup|makeresults|streamstats|eventstats|timechart|chart|top|rare|transaction|rex|replace|convert|fillnull|filldown|appendpipe|like|match|searchmatch|as)\b/ },
            { type: 'function', regex: /\b([a-zA-Z_]\w*)\s*(?=\()/ },
            { type: 'number', regex: /\b\d+(\.\d+)?([eE][+-]?\d+)?\b/ },
        ],
        sigma: [
            { type: 'comment', regex: /#.*/ },
            { type: 'string', regex: /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/ },
            { type: 'field', regex: /^[ \t]*([a-zA-Z_-]+)[ \t]*:/ },
            { type: 'operator', regex: /\||\*|\?|\ball\s+of\b|\b1\s+of\b|\bthem\b|\bselection\b/ },
            { type: 'keyword', regex: /\b(true|false|null|and|or|not)\b/ },
            { type: 'number', regex: /\b\d+(\.\d+)?([eE][+-]?\d+)?\b/ },
        ],
        elastic: [
            { type: 'comment', regex: /\/\/.*/ },
            { type: 'string', regex: /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/ },
            { type: 'operator', regex: /:|\*|\?|>=|<=|>|<|==|!=/ },
            { type: 'keyword', regex: /\b(AND|OR|NOT|TO)\b/ },
            { type: 'number', regex: /\b\d+(\.\d+)?([eE][+-]?\d+)?\b/ },
        ]
    };
    
    const langRules = rules[language] || rules.kql;
    
    const escapeHtml = (str) => {
        return str.replace(/[&<>"']/g, m => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
        })[m]);
    };
    
    const masterRegex = new RegExp(
        langRules.map(r => `(${r.regex.source})`).join('|'),
        'gmi'
    );
    
    let lastIndex = 0;
    let result = '';
    let match;
    
    while ((match = masterRegex.exec(query)) !== null) {
        if (match.index === masterRegex.lastIndex) {
            masterRegex.lastIndex++;
        }
        
        result += escapeHtml(query.substring(lastIndex, match.index));
        
        let matchedIndex = -1;
        for (let i = 1; i < match.length; i++) {
            if (match[i] !== undefined) {
                matchedIndex = i - 1;
                break;
            }
        }
        
        if (matchedIndex !== -1) {
            const rule = langRules[matchedIndex];
            result += `<span class="hl-${rule.type}">${escapeHtml(match[0])}</span>`;
        } else {
            result += escapeHtml(match[0]);
        }
        
        lastIndex = masterRegex.lastIndex;
    }
    
    result += escapeHtml(query.substring(lastIndex));
    
    return result;
}

// Legacy Window Bindings
window.parseDescription = parseDescription;
window.highlightQuerySyntax = highlightQuerySyntax;
