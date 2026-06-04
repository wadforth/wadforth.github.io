const fs = require('fs');
const file = 'js/reports/view.js';
let content = fs.readFileSync(file, 'utf8');

const startStr = 'export function generateUnifiedChangelog(report, isEmail = false, theme = null, isDarkParam = null) {';
const endStr = 'export function buildMonthlyChangelog(report) {';

const startIndex = content.indexOf(startStr);
const endIndex = content.indexOf(endStr);

if (startIndex !== -1 && endIndex !== -1) {
    const newFunc = `export function generateUnifiedChangelog(report, isEmail = false, theme = null, isDarkParam = null) {
    if (typeof window.buildUnifiedActivityFeed === 'function') {
        const isDark = isDarkParam !== null ? isDarkParam : (document.documentElement.getAttribute('data-theme') === 'dark');
        return window.buildUnifiedActivityFeed(report, isDark, isEmail);
    }
    return '<p>Loading activity feed...</p>';
}

`;
    content = content.substring(0, startIndex) + newFunc + content.substring(endIndex);
    fs.writeFileSync(file, content);
    console.log('Fixed generateUnifiedChangelog in view.js');
} else {
    console.log('Could not find boundaries.');
}
