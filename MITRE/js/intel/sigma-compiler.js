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
    
    // Determine target KQL Table
    const table = getKqlTable(category, product, platform);
    
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
        
        const frag = compileSelectionNode(value, category, platform);
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
    kql += `// NOTE: This KQL was auto-translated via AST parser and best-effort schema mapping.`;
    
    return kql;
}

/**
 * Recursively compiles a selection node (Dictionary, Array, or String) into KQL
 */
function compileSelectionNode(node, category, platform) {
    if (!node) return '';

    // If node is an array (e.g. list of dictionaries)
    if (Array.isArray(node)) {
        const clauses = node.map(item => compileSelectionNode(item, category, platform)).filter(Boolean);
        if (clauses.length === 0) return '';
        if (clauses.length === 1) return clauses[0];
        // List items are implicitly OR'd together
        return `(${clauses.join(' or ')})`;
    }

    // If node is an object (dictionary of fields)
    if (typeof node === 'object') {
        const fieldClauses = [];
        for (const [key, val] of Object.entries(node)) {
            // key could be "Image|endswith" or "CommandLine"
            const parts = key.split('|');
            const sigmaField = parts[0];
            const modifiers = parts.slice(1);
            
            // We only handle the first modifier for simplicity in this V1 AST parser
            const modifier = modifiers.length > 0 ? modifiers[0].toLowerCase() : '';
            const kqlField = getKqlField(sigmaField, category, platform);

            // Value could be a list (e.g. `CommandLine: ['a', 'b']`), which implies OR
            let valArray = Array.isArray(val) ? val : [val];
            
            const valClauses = valArray.map(v => {
                if (v === null || v === undefined) return '';
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
                else fieldClauses.push(`(${valClauses.join(' or ')})`);
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
 * Tokenizes and evaluates the Sigma condition string into a fully resolved KQL condition.
 */
function evaluateCondition(conditionStr, fragmentsMap) {
    if (Array.isArray(conditionStr)) {
        conditionStr = conditionStr.join(' or ');
    }
    
    let expr = String(conditionStr);
    
    // 1. Resolve Aggregation Wildcards (e.g. `1 of selection*`, `all of filter*`)
    expr = expr.replace(/1 of ([a-zA-Z0-9_*]+)/gi, (match, pattern) => {
        const regexPattern = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
        const matchingKeys = Object.keys(fragmentsMap).filter(k => regexPattern.test(k));
        if (matchingKeys.length === 0) return 'false /* No matching selections for 1 of */';
        return '(' + matchingKeys.map(k => `(${fragmentsMap[k]})`).join(' or ') + ')';
    });
    
    expr = expr.replace(/all of ([a-zA-Z0-9_*]+)/gi, (match, pattern) => {
        const regexPattern = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
        const matchingKeys = Object.keys(fragmentsMap).filter(k => regexPattern.test(k));
        if (matchingKeys.length === 0) return 'true /* No matching selections for all of */';
        return '(' + matchingKeys.map(k => `(${fragmentsMap[k]})`).join(' and ') + ')';
    });
    
    // 2. Resolve specific selection keys with their fragments
    // Sort keys by length descending so 'selection10' replaces before 'selection1'
    const sortedKeys = Object.keys(fragmentsMap).sort((a, b) => b.length - a.length);
    for (const key of sortedKeys) {
        // Use word boundary to replace exact keys safely
        const regex = new RegExp(`\\b${key}\\b`, 'g');
        expr = expr.replace(regex, `(${fragmentsMap[key]})`);
    }
    
    // 3. Normalize Boolean Operators
    expr = expr.replace(/\band\b/gi, 'and');
    expr = expr.replace(/\bor\b/gi, 'or');
    expr = expr.replace(/\bnot\b/gi, 'not');
    
    return expr;
}
