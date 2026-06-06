// js/intel/sigma-compiler.js
import { getKqlTable, getKqlField } from './schema-kql.js';

/**
 * Compiles a Sigma YAML rule string into a Microsoft Sentinel / MDE KQL query.
 * Uses js-yaml to parse the AST for perfect structural accuracy.
 */
export function compileSigmaToKQL(yamlText, platform = 'mde') {
    if (!yamlText) return '// No YAML provided for compilation.';
    if (!window.jsyaml) return '// Error: js-yaml library not loaded. Ensure it is injected in index.html.';
    
    let rule;
    try {
        rule = window.jsyaml.load(yamlText);
    } catch (e) {
        return `// Error parsing Sigma YAML: ${e.message}\n// Please ensure the YAML is well-formed.`;
    }

    if (!rule || !rule.detection) {
        return `// Error: Rule does not contain a valid detection block.`;
    }

    const logsource = rule.logsource || {};
    const category = logsource.category || '';
    const product = logsource.product || '';
    const service = logsource.service || '';
    
    // Determine target KQL Table
    const table = getKqlTable(category, product, service, platform);
    
    // Extract condition
    const condition = rule.detection.condition;
    if (!condition) {
        return `${table}\n// Warning: No condition field found in detection block.`;
    }

    // Build fragments for each selection block
    const selectionKqlFragments = {};
    for (const [key, value] of Object.entries(rule.detection)) {
        // Skip metadata keys
        if (['condition', 'timeframe', 'fields', 'falsepositives'].includes(key)) continue;
        
        const frag = compileSelectionNode(value, category, service, platform);
        if (frag) {
            selectionKqlFragments[key] = frag;
        }
    }

    // Evaluate the condition
    const conditionKql = evaluateCondition(condition, selectionKqlFragments);

    // Build the final KQL Query
    let kql = `${table}\n`;
    if (conditionKql) {
        kql += `| where ${conditionKql}\n`;
    }

    // Project specified fields if the Sigma rule requests it
    if (rule.fields && Array.isArray(rule.fields)) {
        const kqlFieldsToProject = rule.fields.map(f => getKqlField(f, category, service, platform));
        // Ensure uniqueness
        const uniqueProjectFields = [...new Set(kqlFieldsToProject)];
        if (uniqueProjectFields.length > 0) {
            kql += `| project ${uniqueProjectFields.join(', ')}\n`;
        }
    }

    kql += `// NOTE: This KQL was auto-translated via AST parser and best-effort schema mapping.`;
    
    return kql;
}

/**
 * Recursively compiles a selection node (Dictionary, Array, or String) into KQL
 */
function compileSelectionNode(node, category, service, platform) {
    if (!node) return '';

    // Handle primitive values (e.g., keyword lists in Sigma)
    if (typeof node !== 'object') {
        let strVal = String(node).replace(/\\/g, '\\\\');
        strVal = strVal.replace(/^\*/, '').replace(/\*$/, '');
        return `search "${strVal}"`;
    }

    // If node is an array (e.g. list of dictionaries or list of keywords)
    if (Array.isArray(node)) {
        const clauses = node.map(item => compileSelectionNode(item, category, service, platform)).filter(Boolean);
        if (clauses.length === 0) return '';
        if (clauses.length === 1) return clauses[0];
        // List items are implicitly OR'd together
        return `(${clauses.join(' or ')})`;
    }

    // If node is an object (dictionary of fields)
    if (typeof node === 'object') {
        const fieldClauses = [];
        for (const [key, val] of Object.entries(node)) {
            // key could be "Image|endswith|all" or "CommandLine"
            const parts = key.split('|');
            const sigmaField = parts[0];
            const modifiers = parts.slice(1).map(m => m.toLowerCase());
            
            // Extract the matching modifier and check for 'all'
            const modifier = modifiers.find(m => ['contains', 'endswith', 'startswith', 're'].includes(m)) || '';
            const isAll = modifiers.includes('all');
            
            const kqlField = getKqlField(sigmaField, category, service, platform);

            // Value could be a list (e.g. `CommandLine: ['a', 'b']`)
            let valArray = Array.isArray(val) ? val : [val];
            
            // Optimization for exactly matching arrays or 'contains' arrays
            if (valArray.length > 1 && !isAll) {
                // If it's a list of exact matches, use `in~`
                if (!modifier && !valArray.some(v => typeof v === 'string' && (v.startsWith('*') || v.endsWith('*')))) {
                    const mappedVals = valArray.map(v => `"${String(v).replace(/\\/g, '\\\\')}"`);
                    fieldClauses.push(`${kqlField} in~ (${mappedVals.join(', ')})`);
                    continue;
                }
                
                // If it's a list of contains matches, use `has_any`
                const allAreWildcardBounded = valArray.every(v => typeof v === 'string' && v.startsWith('*') && v.endsWith('*'));
                if (modifier === 'contains' || allAreWildcardBounded) {
                    const mappedVals = valArray.map(v => `"${String(v).replace(/\\/g, '\\\\').replace(/^\*/, '').replace(/\*$/, '')}"`);
                    fieldClauses.push(`${kqlField} has_any (${mappedVals.join(', ')})`);
                    continue;
                }
            }

            const valClauses = valArray.map(v => {
                if (v === null || v === undefined) {
                    return `isempty(${kqlField})`; // Sigma syntax for null/empty checks
                }

                let strVal = String(v);
                
                // Escape backslashes for KQL string literals
                strVal = strVal.replace(/\\/g, '\\\\');

                // Check implicit wildcards
                const hasStartWildcard = strVal.startsWith('*');
                const hasEndWildcard = strVal.endsWith('*');
                strVal = strVal.replace(/^\*/, '').replace(/\*$/, '');

                if (modifier === 'contains' || (hasStartWildcard && hasEndWildcard)) {
                    return `${kqlField} contains "${strVal}"`;
                } else if (modifier === 'endswith' || hasStartWildcard) {
                    return `${kqlField} endswith "${strVal}"`;
                } else if (modifier === 'startswith' || hasEndWildcard) {
                    return `${kqlField} startswith "${strVal}"`;
                } else if (modifier === 're') {
                    return `${kqlField} matches regex @"${strVal}"`;
                } else {
                    return `${kqlField} =~ "${strVal}"`; // Case-insensitive exact match
                }
            }).filter(Boolean);

            if (valClauses.length > 0) {
                if (valClauses.length === 1) fieldClauses.push(valClauses[0]);
                else {
                    const joiner = isAll ? ' and ' : ' or ';
                    fieldClauses.push(`(${valClauses.join(joiner)})`);
                }
            }
        }
        
        if (fieldClauses.length === 0) return '';
        if (fieldClauses.length === 1) return fieldClauses[0];
        // Different fields in the same dictionary are implicitly AND'd together
        return `(${fieldClauses.join(' and ')})`;
    }

    return '';
}

/**
 * Tokenizes and evaluates the Sigma condition string into a fully resolved KQL condition safely.
 */
function evaluateCondition(conditionStr, fragmentsMap) {
    if (Array.isArray(conditionStr)) {
        conditionStr = conditionStr.join(' or ');
    }
    
    let expr = String(conditionStr);
    
    // 1. Resolve Aggregation Wildcards natively (e.g. `1 of selection*`)
    expr = expr.replace(/1 of ([a-zA-Z0-9_*]+)/gi, (match, pattern) => {
        const regexPattern = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
        const matchingKeys = Object.keys(fragmentsMap).filter(k => regexPattern.test(k));
        if (matchingKeys.length === 0) return 'false /* No matching selections for 1 of */';
        return '(' + matchingKeys.join(' or ') + ')';
    });
    
    expr = expr.replace(/all of ([a-zA-Z0-9_*]+)/gi, (match, pattern) => {
        const regexPattern = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
        const matchingKeys = Object.keys(fragmentsMap).filter(k => regexPattern.test(k));
        if (matchingKeys.length === 0) return 'true /* No matching selections for all of */';
        return '(' + matchingKeys.join(' and ') + ')';
    });
    
    // 2. Tokenize logic to prevent recursive string replacement issues
    const tokens = [];
    const regex = /([a-zA-Z0-9_]+)|(\()|(\))|(\s+)|([^a-zA-Z0-9_\(\)\s]+)/gi;
    let match;

    while ((match = regex.exec(expr)) !== null) {
        let token = match[0];
        if (match[4]) {
            tokens.push(token); // whitespace
            continue;
        }

        if (match[1]) { // Identifier
            const lower = token.toLowerCase();
            if (lower === 'and' || lower === 'or' || lower === 'not') {
                tokens.push(lower);
            } else if (fragmentsMap[token]) {
                tokens.push(`(${fragmentsMap[token]})`);
            } else {
                tokens.push(token); // e.g. unknown or unresolved
            }
        } else {
            tokens.push(token); // parenthesis or other symbols
        }
    }
    
    return tokens.join('');
}
