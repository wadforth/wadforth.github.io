// js/intel/sigma-compiler.js
import { getKqlTable, getKqlField } from './schema-kql.js';

/**
 * Compiles a Sigma YAML rule string into a Microsoft Sentinel / MDE KQL query.
 * Implements a best-effort tokenizer to resolve complex Boolean condition strings and wildcards.
 */
export function compileSigmaToKQL(yamlText, platform = 'mde') {
    if (!yamlText) return '// No YAML provided for compilation.';
    
    // Extract logsource
    const productMatch = yamlText.match(/product:\s*([^\r\n]+)/i);
    const categoryMatch = yamlText.match(/category:\s*([^\r\n]+)/i);
    const product = productMatch ? productMatch[1].trim() : '';
    const category = categoryMatch ? categoryMatch[1].trim() : '';
    
    // Determine target KQL Table
    const table = getKqlTable(category, product, platform);
    
    // Extract detection block
    // We match from 'detection:' until 'falsepositives:', 'level:', 'tags:', 'status:', 'author:', 'date:', or EOF
    const detectionBlockMatch = yamlText.match(/detection:\s*([\s\S]*?)(?:\n\s*(?:falsepositives|level|tags|status|author|date|logsource|id|title|description|fields|rule):|$)/);
    if (!detectionBlockMatch) {
        return `${table}\n// Could not parse detection logic block from YAML.`;
    }
    
    let detectionText = detectionBlockMatch[1];
    
    // Extract the raw condition string
    const conditionMatch = detectionText.match(/condition:\s*([^\r\n]+)/i);
    const rawCondition = conditionMatch ? conditionMatch[1].trim() : '';
    
    // Remove the condition line from our selections text so we only parse fields
    const selectionsText = detectionText.replace(/condition:\s*([^\r\n]+)/i, '');
    
    // Parse Selections into a dictionary map: { selection1: [ {field, modifier, value}, ... ] }
    const selections = parseSelections(selectionsText, category, platform);
    
    // Generate KQL fragments for each parsed selection block
    const selectionKqlFragments = {};
    for (const [selName, items] of Object.entries(selections)) {
        if (items.length === 0) continue;
        selectionKqlFragments[selName] = buildSelectionFragment(items);
    }
    
    // Parse and evaluate the Boolean condition string
    let conditionKql = '';
    if (rawCondition) {
        conditionKql = evaluateCondition(rawCondition, selectionKqlFragments);
    } else {
        // Fallback: if no condition string, AND all selections together
        conditionKql = Object.values(selectionKqlFragments).map(frag => `(${frag})`).join(' and \n');
    }
    
    // Build the final KQL Query
    let kql = `${table}\n`;
    if (conditionKql) {
        kql += `| where ${conditionKql}\n`;
    }
    kql += `// NOTE: This KQL was auto-translated via best-effort schema mapping and may require manual tuning.`;
    
    return kql;
}

/**
 * Parses the YAML text block to extract selection groups and their respective field-value pairs.
 */
function parseSelections(selectionsText, category, platform) {
    const selections = {};
    let currentSelection = '';
    
    const lines = selectionsText.split('\n');
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        // Match selection headers e.g., `selection1:` or `filter_main:`
        const selMatch = line.match(/^ {4}([a-zA-Z0-9_-]+):$/);
        if (selMatch) {
            currentSelection = selMatch[1];
            selections[currentSelection] = [];
            continue;
        }
        
        if (currentSelection && line.trim() && !line.trim().startsWith('#')) {
            // Match field definitions e.g., `  Image|endswith: '\cmd.exe'` or `  CommandLine|contains:`
            const fieldMatch = line.match(/^ {8}([a-zA-Z0-9_.-]+)(\|([a-zA-Z0-9_]+))?:\s*(.*)$/);
            if (fieldMatch) {
                const sigmaField = fieldMatch[1];
                const modifier = fieldMatch[3] || '';
                const rawValue = fieldMatch[4];
                
                // Check if value is empty/multiline list starting on next line
                if (rawValue === '') {
                    // Peek ahead for list items
                    let j = i + 1;
                    while (j < lines.length && lines[j].match(/^\s+-\s+(.+)$/)) {
                        const valMatch = lines[j].match(/^\s+-\s+(.+)$/);
                        selections[currentSelection].push(createItem(sigmaField, modifier, valMatch[1], category, platform));
                        j++;
                    }
                    i = j - 1; // Skip the lines we just processed
                } else if (rawValue.startsWith('[')) {
                    // Inline array e.g., `['a', 'b']`
                    const arrayStr = rawValue.replace(/^\[|\]$/g, '');
                    const vals = arrayStr.split(',').map(v => v.trim());
                    vals.forEach(v => selections[currentSelection].push(createItem(sigmaField, modifier, v, category, platform)));
                } else {
                    selections[currentSelection].push(createItem(sigmaField, modifier, rawValue, category, platform));
                }
            } else if (line.match(/^\s+-\s+(.+)$/)) {
                // List of dictionaries fallback (not fully supported, but we try to capture the value)
                const valMatch = line.match(/^\s+-\s+(.+)$/);
                // We assume it applies to the last used field if no field is specified.
                if (selections[currentSelection].length > 0) {
                    const lastItem = selections[currentSelection][selections[currentSelection].length - 1];
                    selections[currentSelection].push(createItem(lastItem.sigmaField, lastItem.modifier, valMatch[1], category, platform));
                }
            }
        }
    }
    return selections;
}

function createItem(sigmaField, modifier, rawValue, category, platform) {
    let value = rawValue.replace(/^['"]|['"]$/g, '');
    return {
        sigmaField,
        kqlField: getKqlField(sigmaField, category, platform),
        modifier: modifier.toLowerCase(),
        value
    };
}

/**
 * Converts a single parsed selection block into a valid KQL boolean string.
 */
function buildSelectionFragment(items) {
    const groupedFields = {};
    
    // Group values by the translated KQL field (this naturally forms OR groups for the same field)
    items.forEach(item => {
        if (!groupedFields[item.kqlField]) groupedFields[item.kqlField] = [];
        groupedFields[item.kqlField].push(item);
    });
    
    const fieldClauses = [];
    for (const [field, ops] of Object.entries(groupedFields)) {
        const fieldOrs = ops.map(op => {
            let val = op.value;
            // Escape KQL string slashes
            val = val.replace(/\\/g, '\\\\');
            
            // Check implicit wildcards
            const hasStartWildcard = val.startsWith('*');
            const hasEndWildcard = val.endsWith('*');
            val = val.replace(/^\*/, '').replace(/\*$/, '');
            
            if (op.modifier === 'contains' || (hasStartWildcard && hasEndWildcard)) {
                return `${field} contains "${val}"`;
            } else if (op.modifier === 'endswith' || hasStartWildcard) {
                return `${field} endswith "${val}"`;
            } else if (op.modifier === 'startswith' || hasEndWildcard) {
                return `${field} startswith "${val}"`;
            } else if (op.modifier === 're') {
                return `${field} matches regex @"${val}"`;
            } else {
                return `${field} =~ "${val}"`; // Case-insensitive exact match
            }
        });
        
        if (fieldOrs.length > 1) {
            fieldClauses.push(`(${fieldOrs.join(' or ')})`);
        } else {
            fieldClauses.push(fieldOrs[0]);
        }
    }
    
    // Different fields within the same selection block are ANDed together
    return fieldClauses.join(' and ');
}

/**
 * Tokenizes and evaluates the Sigma condition string into a fully resolved KQL condition.
 */
function evaluateCondition(conditionStr, fragmentsMap) {
    let expr = conditionStr;
    
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
