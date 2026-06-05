const fs = require('fs');
const content = fs.readFileSync('js/layer/storage.js', 'utf8');

const target = `            if (layer) {
                state.currentDomain = layer.domain;
                state.currentVersion = layer.versions?.attack || layer.attackVersion;
                document.getElementById('domain-select').value = state.currentDomain;
                document.getElementById('version-select').value = state.currentVersion;
                showWorkspace();
                loadSTIX(state.currentDomain, state.currentVersion, layer.data);
            }`;

const replacement = `            if (layer) {
                state.currentDomain = layer.domain;
                
                const rawVer = layer.versions?.attack || layer.attackVersion || 'master';
                const normVer = window.normalizeVersion ? window.normalizeVersion(rawVer) : rawVer;
                const match = state.releases?.find(r => (window.normalizeVersion ? window.normalizeVersion(r.tag) : r.tag) === normVer);
                state.currentVersion = match ? match.tag : (normVer === 'master' || normVer === '' ? 'master' : \`v\${normVer}\`);
                
                document.getElementById('domain-select').value = state.currentDomain;
                document.getElementById('version-select').value = state.currentVersion;
                showWorkspace();
                loadSTIX(state.currentDomain, state.currentVersion, layer.data);
            }`;

const newContent = content.replace(target, replacement);

fs.writeFileSync('js/layer/storage.js', newContent);
console.log('Done!');
