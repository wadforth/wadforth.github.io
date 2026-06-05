// js/intel/sigma-compiler.js
import { getKqlTable, getKqlField } from './schema-kql.js';

export function compileSigmaToKQL(yamlText, platform = 'mde') {
    if (!yamlText) return '// No YAML provided for compilation.';
    
    // Extract logsource
    const productMatch = yamlText.match(/product:\s*(\w+)/i);
    const categoryMatch = yamlText.match(/category:\s*(\w+)/i);
    const product = productMatch ? productMatch[1] : '';
    const category = categoryMatch ? categoryMatch[1] : '';
    
    // Determine Table
    const table = getKqlTable(category, product, platform);
    
    // Extract detection block
    const detectionBlockMatch = yamlText.match(/detection:([\s\S]*?)(?:falsepositives:|level:|tags:|status:|author:|date:|$)/);
    if (!detectionBlockMatch) {
        return `${table}\n// Could not parse detection logic.`;
    }
    
    let detectionText = detectionBlockMatch[1];
    
    // Extract Condition
    const conditionMatch = detectionText.match(/condition:\s*(.+)/i);
    const condition = conditionMatch ? conditionMatch[1].trim() : '';
    
    // Parse Selections (very basic line-by-line parsing)
    // Matches patterns like `   CommandLine|contains: 'powershell'`
    // Or `   Image: '*\cmd.exe'`
    const selections = {};
    let currentSelection = '';
    
    const lines = detectionText.split('\n');
    for (const line of lines) {
        // Find selection blocks like `selection:` or `selection1:`
        const selMatch = line.match(/^\s+([a-zA-Z0-9_]+):$/);
        if (selMatch && selMatch[1] !== 'condition') {
            currentSelection = selMatch[1];
            selections[currentSelection] = [];
            continue;
        }
        
        if (currentSelection && line.trim() && !line.trim().startsWith('#') && !line.includes('condition:')) {
            // Find fields like `  Field|modifier: value` or `- value`
            const fieldMatch = line.match(/^\s+([a-zA-Z0-9_]+)(\|([a-zA-Z0-9_]+))?:\s*(.+)$/);
            if (fieldMatch) {
                const sigmaField = fieldMatch[1];
                const modifier = fieldMatch[3] || '';
                const rawValue = fieldMatch[4];
                
                // Cleanup value
                let value = rawValue.replace(/^['"]|['"]$/g, '');
                
                selections[currentSelection].push({
                    sigmaField,
                    kqlField: getKqlField(sigmaField, platform),
                    modifier: modifier.toLowerCase(),
                    value
                });
            } else if (line.match(/^\s+-\s+(.+)$/)) {
                // List items (assumes previous field)
                const valMatch = line.match(/^\s+-\s+(.+)$/);
                if (valMatch && selections[currentSelection].length > 0) {
                    const lastItem = selections[currentSelection][selections[currentSelection].length - 1];
                    // We shouldn't duplicate the object, just mark it as a list if we were doing a full parser.
                    // For this best-effort, we'll append an OR condition for the same field.
                    selections[currentSelection].push({
                        sigmaField: lastItem.sigmaField,
                        kqlField: lastItem.kqlField,
                        modifier: lastItem.modifier,
                        value: valMatch[1].replace(/^['"]|['"]$/g, '')
                    });
                }
            }
        }
    }
    
    // Build KQL Strings
    let kql = `${table}\n`;
    
    // Add where clauses based on condition
    // BEST EFFORT: If condition is "selection", just AND all selection items.
    // If condition has OR, etc. we do rudimentary string replace.
    let conditionKql = condition;
    
    for (const [selName, items] of Object.entries(selections)) {
        if (items.length === 0) continue;
        
        let selKql = `(\n`;
        const groupedFields = {};
        
        // Group by field to create IN clauses or OR clauses
        items.forEach(item => {
            if (!groupedFields[item.kqlField]) groupedFields[item.kqlField] = [];
            groupedFields[item.kqlField].push(item);
        });
        
        const fieldClauses = [];
        for (const [field, ops] of Object.entries(groupedFields)) {
            const fieldOrs = ops.map(op => {
                let val = op.value;
                val = val.replace(/\\/g, '\\\\'); // Escape slashes
                
                // Handle wildcards
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
                    return `${field} =~ "${val}"`; // Case insensitive equals
                }
            });
            fieldClauses.push(`  (${fieldOrs.join(' or ')})`);
        }
        
        selKql += fieldClauses.join(' and \n');
        selKql += `\n)`;
        
        // Replace selection name in condition with actual KQL logic
        const regex = new RegExp(`\\b${selName}\\b`, 'g');
        conditionKql = conditionKql.replace(regex, selKql);
    }
    
    // Replace Sigma operators with KQL operators
    conditionKql = conditionKql.replace(/\band\b/gi, 'and');
    conditionKql = conditionKql.replace(/\bor\b/gi, 'or');
    conditionKql = conditionKql.replace(/\bnot\b/gi, 'not');
    conditionKql = conditionKql.replace(/1 of (\w+)\*/gi, '// $& (unsupported aggregate)');
    conditionKql = conditionKql.replace(/all of (\w+)\*/gi, '// $& (unsupported aggregate)');
    
    if (conditionKql) {
        kql += `| where ${conditionKql}\n`;
    }
    
    kql += `// NOTE: This KQL was auto-translated and may require manual tuning.`;
    return kql;
}
