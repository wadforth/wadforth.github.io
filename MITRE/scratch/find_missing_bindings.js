const fs = require('fs');
const path = require('path');

function walk(dir, files = []) {
    const list = fs.readdirSync(dir);
    for (let f of list) {
        const fullPath = path.join(dir, f);
        if (fs.statSync(fullPath).isDirectory()) walk(fullPath, files);
        else if (fullPath.endsWith('.js')) files.push(fullPath);
    }
    return files;
}

const jsFiles = walk('./js');
const allFilesToCheck = [...jsFiles, './index.html', './app.js'];

// Find all function calls in on*=""
const eventRegex = /on[a-z]+\s*=\s*["']([^"']+)["']/gi;
const calls = new Set();

allFilesToCheck.forEach(f => {
    const content = fs.readFileSync(f, 'utf8');
    let match;
    while ((match = eventRegex.exec(content)) !== null) {
        const code = match[1].trim();
        const parts = code.split(';');
        parts.forEach(part => {
            part = part.trim();
            if (part && !part.startsWith('event.') && !part.startsWith('return')) {
                const cleanName = part.split('(')[0].split('.').pop().trim();
                if (cleanName && /^[a-zA-Z_$][0-9a-zA-Z_$]*$/.test(cleanName)) {
                    calls.add(cleanName);
                }
            }
        });
    }
});

console.log(`Found ${calls.size} unique event handler functions.`);

const allContent = allFilesToCheck.map(f => fs.readFileSync(f, 'utf8')).join('\n');
const missing = [];

for (const func of calls) {
    if (func.startsWith('console')) continue;
    if (func === 'alert' || func === 'confirm' || func === 'history' || func === 'document' || func === 'window') continue;
    
    // Check if it's assigned to window
    const regex1 = new RegExp(`window\\.${func}\\s*=`, 'i');
    const regex2 = new RegExp(`window\\[['"]${func}['"]\\]\\s*=`, 'i');
    // Check if it's defined directly in index.html (like <script> function foo() </script>)
    const regex3 = new RegExp(`function\\s+${func}\\s*\\(`, 'i');
    
    if (!regex1.test(allContent) && !regex2.test(allContent) && !regex3.test(fs.readFileSync('./index.html', 'utf8'))) {
        missing.push(func);
    }
}

console.log('Missing Window Bindings:');
missing.forEach(m => console.log('- ' + m));
