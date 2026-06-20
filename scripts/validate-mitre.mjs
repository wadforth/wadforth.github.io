import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mitreDir = path.join(root, 'MITRE');
const indexPath = path.join(mitreDir, 'index.html');
const html = readFileSync(indexPath, 'utf8');

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

function localRef(ref) {
  return !/^(https?:)?\/\//.test(ref);
}

function cleanRef(ref) {
  return ref.split(/[?#]/)[0];
}

function checkModule(file) {
  const source = readFileSync(file, 'utf8');
  const result = spawnSync(process.execPath, ['--input-type=module', '--check', '-'], {
    input: source,
    encoding: 'utf8',
    cwd: root
  });
  if (result.status !== 0) {
    fail(`Module syntax failed: ${path.relative(root, file)}\n${result.stderr || result.stdout}`);
  }
}

function assertSourceIncludes(source, patterns, label) {
  const missing = patterns.filter(pattern => !pattern.test(source));
  if (missing.length) fail(`${label} missing expected surface:\n${missing.map(pattern => `- ${pattern}`).join('\n')}`);
}

const assetRefs = [...html.matchAll(/<(?:script|link)[^>]+(?:src|href)="([^"]+)"/g)]
  .map(match => match[1])
  .filter(localRef);

const professionalIndex = assetRefs.findIndex(ref => cleanRef(ref) === 'css/professional.css');
const workstationIndex = assetRefs.findIndex(ref => cleanRef(ref) === 'css/workstation.css');
if (workstationIndex === -1) fail('Missing css/workstation.css design-system layer');
if (professionalIndex !== -1 && workstationIndex !== -1 && workstationIndex < professionalIndex) {
  fail('css/workstation.css must load after css/professional.css');
}

const missingAssets = assetRefs
  .map(ref => [ref, path.join(mitreDir, cleanRef(ref))])
  .filter(([, file]) => !existsSync(file));

if (missingAssets.length) {
  fail(`Missing local assets:\n${missingAssets.map(([ref]) => `- ${ref}`).join('\n')}`);
}

const ids = [...html.matchAll(/ id="([^"]+)"/g)].map(match => match[1]);
const duplicateIds = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
if (duplicateIds.length) fail(`Duplicate IDs: ${duplicateIds.join(', ')}`);

const inlineStyleCount = (html.match(/style="/g) || []).length;
if (inlineStyleCount > 0) fail(`Inline style attributes remain in MITRE/index.html: ${inlineStyleCount}`);

const inlineScriptCount = [...html.matchAll(/<script\b(?![^>]*\bsrc=)[\s\S]*?<\/script>/gi)].length;
if (inlineScriptCount > 0) fail(`Inline script blocks remain in MITRE/index.html: ${inlineScriptCount}`);

const inlineHandlerCount = (html.match(/\son(?:click|change|input|keyup|keydown|submit)=/gi) || []).length;
if (inlineHandlerCount > 0) fail(`Inline event handlers remain in MITRE/index.html: ${inlineHandlerCount}`);

const moduleScripts = [...html.matchAll(/<script[^>]+type="module"[^>]*>/g)]
  .map(match => match[0].match(/src="([^"]+)"/)?.[1])
  .filter(Boolean)
  .filter(localRef)
  .map(ref => path.join(mitreDir, cleanRef(ref)));

for (const file of moduleScripts) checkModule(file);

const dynamicModules = new Set();
for (const file of moduleScripts) {
  const source = readFileSync(file, 'utf8');
  for (const match of source.matchAll(/import\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    const ref = match[1];
    if (localRef(ref)) dynamicModules.add(path.resolve(path.dirname(file), cleanRef(ref)));
  }
}

const missingDynamicModules = [...dynamicModules].filter(file => !existsSync(file));
if (missingDynamicModules.length) {
  fail(`Missing dynamic modules:\n${missingDynamicModules.map(file => `- ${path.relative(root, file)}`).join('\n')}`);
}
for (const file of dynamicModules) {
  if (existsSync(file)) checkModule(file);
}
checkModule(path.join(mitreDir, 'js/intel/sigma-worker.js'));

const removedFeatureFiles = [
  'index.html',
  'css/professional.css',
  'js/matrix/export.js',
  'js/modal/technique.js',
  'js/mitigations/view.js'
].map(file => path.join(mitreDir, file));

const removedPatterns = [
  /coverage-simulator/,
  /btn-coverage-simulator/,
  /What-If/,
  /simulator\.js/,
  /exportMatrixPNG/,
  /exportMatrixPDF/,
  /id="format-png"/,
  /id="format-pdf"/,
  /name="export-format"/
];

const removedHits = [];
for (const file of removedFeatureFiles) {
  const text = readFileSync(file, 'utf8');
  for (const pattern of removedPatterns) {
    if (pattern.test(text)) removedHits.push(`${path.relative(root, file)} => ${pattern}`);
  }
}
if (removedHits.length) fail(`Removed feature remnants found:\n${removedHits.join('\n')}`);

const workstationSource = readFileSync(path.join(mitreDir, 'css/workstation.css'), 'utf8');
assertSourceIncludes(workstationSource, [
  /#technique-modal #tab-queries\.show\.active[\s\S]*display:\s*flex\s*!important/,
  /\.query-month-badge/,
  /prefers-reduced-motion/,
  /:focus-visible/
], 'Workstation design layer');

const reportFiles = [
  'js/reports/storage.js',
  'js/reports/generator.js',
  'js/reports/view.js',
  'js/reports/enhancements.js',
  'js/reports/components/activity-feed.js'
].map(file => path.join(mitreDir, file));

const missingReportFiles = reportFiles.filter(file => !existsSync(file));
if (missingReportFiles.length) {
  fail(`Missing report modules:\n${missingReportFiles.map(file => `- ${path.relative(root, file)}`).join('\n')}`);
}

if (!missingReportFiles.length) {
  const reportSources = new Map(reportFiles.map(file => [file, readFileSync(file, 'utf8')]));
  const reportView = reportSources.get(path.join(mitreDir, 'js/reports/view.js'));
  const reportGenerator = reportSources.get(path.join(mitreDir, 'js/reports/generator.js'));
  const reportStorage = reportSources.get(path.join(mitreDir, 'js/reports/storage.js'));
  const reportEnhancements = reportSources.get(path.join(mitreDir, 'js/reports/enhancements.js'));

  assertSourceIncludes(reportView, [
    /export function renderReportsList\b/,
    /export function viewReport\b/,
    /export function validateReport\b/,
    /export function saveAndValidateReport\b/,
    /export async function exportReportPDF\b/,
    /export function exportReportEmail\b/,
    /export function copyReportHTML\b/,
    /export async function exportReportEML\b/,
    /export async function exportReportSVG\b/,
    /export async function exportReportMarkdown\b/,
    /export function buildReportMarkdown\b/,
    /export function buildEmailHTML\b/,
    /window\.exportReportMarkdown = exportReportMarkdown/
  ], 'Report view');

  assertSourceIncludes(reportGenerator, [
    /export function generateReport\b/,
    /export function getLayerSnapshot\b/,
    /window\.generateReport = generateReport/
  ], 'Report generator');

  assertSourceIncludes(reportStorage, [
    /export function saveReport\b/,
    /export function getReportsForLayer\b/,
    /export function deleteReport\b/,
    /export function detectChanges\b/,
    /window\.saveReport = saveReport/
  ], 'Report storage');

  assertSourceIncludes(reportEnhancements, [
    /export function renderReportPreviewCard\b/,
    /export function renderReportsTimeline\b/,
    /window\.setReportsViewMode = setReportsViewMode/
  ], 'Report enhancements');

  const reportActionSources = [...reportSources.values()].join('\n');
  const reportActions = [...new Set([...reportActionSources.matchAll(/data-report-action="([^"]+)"/g)].map(match => match[1]))].sort();
  const handledActions = new Set([...reportView.matchAll(/case '([^']+)':/g)].map(match => match[1]));
  const missingHandledActions = reportActions.filter(action => !handledActions.has(action));
  if (missingHandledActions.length) fail(`Report actions without handlers: ${missingHandledActions.join(', ')}`);

  const requiredReportActions = [
    'view-report',
    'delete-report',
    'save-validate',
    'export-pdf',
    'export-markdown',
    'export-email',
    'copy-html',
    'export-eml',
    'export-svg',
    'print'
  ];
  const missingRequiredActions = requiredReportActions.filter(action => !reportActions.includes(action) || !handledActions.has(action));
  if (missingRequiredActions.length) fail(`Critical report actions missing: ${missingRequiredActions.join(', ')}`);

  const inlineReportHandlers = [];
  for (const [file, source] of reportSources.entries()) {
    if (/\son(?:click|change|input|keyup|keydown)=/.test(source)) inlineReportHandlers.push(path.relative(root, file));
  }
  if (inlineReportHandlers.length) fail(`Inline report event handlers found:\n${inlineReportHandlers.join('\n')}`);
}

const parserSource = readFileSync(path.join(mitreDir, 'js/intel/sigma-parser.js'), 'utf8')
  .replaceAll('export function ', 'function ');
const parserSmoke = `
globalThis.window = {};
${parserSource}
const sample = \`title: Test Rule\ndescription: |\n  First line.\n  Second line.\nlevel: high\n\`;
const out = extractYamlStringField(sample, 'description');
if (out === '|' || !out.includes('First line') || !out.includes('Second line')) {
  throw new Error('Sigma YAML block description parsing failed');
}
`;
const parserResult = spawnSync(process.execPath, ['--input-type=module', '-'], {
  input: parserSmoke,
  encoding: 'utf8',
  cwd: root
});
if (parserResult.status !== 0) fail(`Sigma parser smoke test failed:\n${parserResult.stderr || parserResult.stdout}`);

if (!process.exitCode) {
  console.log(`MITRE validation passed: ${moduleScripts.length} module scripts, ${dynamicModules.size} dynamic modules, ${assetRefs.length} assets, ${ids.length} IDs.`);
}
