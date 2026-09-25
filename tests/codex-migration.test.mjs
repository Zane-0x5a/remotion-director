import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import {
  acceptCanonical, captureProvenance, captureVideoProvenance, hashTree, initRun, prepareSelection,
  recordReport, recordSelection, recordVerdict, registerRole, continueRole, verifyArtifacts, verifyVideoProvenance,
} from '../tools/codex-runtime.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PACKAGE = join(ROOT, 'codex-plugin');
const GENERATOR = join(ROOT, 'tools', 'generate-codex-plugin.mjs');
const TEMP_ROOTS = new Set();
// Kept for test fixtures that are replaced with the tracked real-media fixture
// when the full validation suite runs.
const png = Buffer.from('89504e470d0a1a0a' + '00'.repeat(40), 'hex');
const VALID_FIXTURE = join(ROOT, 'tests', 'fixtures', 'valid-artifacts');

function temp(prefix = 'codex-test-') {
  const root = mkdtempSync(join(tmpdir(), `remotion-director-${prefix.replace(/[^a-z0-9-]/gi, '-')}`));
  TEMP_ROOTS.add(root);
  return root;
}
test.afterEach(() => {
  for (const root of TEMP_ROOTS) rmSync(root, { recursive: true, force: true });
  TEMP_ROOTS.clear();
});
function fixture(root, source) {
  const out = join(root, 'out', 'r1'); const strip = join(out, 'strip'); mkdirSync(strip, { recursive: true });
  writeFileSync(join(root, 'index.tsx'), 'export const source = "v1";');
  if (!existsSync(join(VALID_FIXTURE, 'video.mp4'))) throw new Error(`Missing tracked valid media fixture at ${VALID_FIXTURE}`);
  cpSync(join(VALID_FIXTURE, 'video.mp4'), join(out, 'video.mp4'));
  for (const name of readdirSync(VALID_FIXTURE).filter((name) => /^still-.*\.png$/i.test(name))) cpSync(join(VALID_FIXTURE, name), join(out, name));
  for (const name of readdirSync(join(VALID_FIXTURE, 'strip')).filter((name) => name.toLowerCase().endsWith('.png'))) cpSync(join(VALID_FIXTURE, 'strip', name), join(strip, name));
  const fixtureManifest = JSON.parse(readFileSync(join(VALID_FIXTURE, 'strip', 'strip-manifest.json'), 'utf8'));
  fixtureManifest.video = join(out, 'video.mp4');
  const stripPngs = readdirSync(strip).filter((name) => name.toLowerCase().endsWith('.png')).sort();
  fixtureManifest.frames = (fixtureManifest.frames ?? []).map((frame, index) => ({ ...frame, file: frame.file ?? stripPngs[index] }));
  writeFileSync(join(strip, 'strip-manifest.json'), JSON.stringify(fixtureManifest));
  captureVideoProvenance(out, source);
  captureProvenance(out, source);
  return out;
}

test('generated package has one public skill and portable + compatibility manifests', () => {
  const manifest = JSON.parse(readFileSync(join(PACKAGE, 'plugin.json'), 'utf8'));
  const compat = JSON.parse(readFileSync(join(PACKAGE, '.codex-plugin', 'plugin.json'), 'utf8'));
  assert.equal(manifest.name, 'remotion-director');
  assert.equal(compat.name, manifest.name);
  assert.equal(compat.version, manifest.version);
  const rootInterface = manifest.extensions?.['com.openai']?.interface ?? manifest.interface;
  const compatInterface = compat.interface ?? compat.extensions?.['com.openai']?.interface;
  assert.ok(rootInterface?.shortDescription); assert.ok(rootInterface?.longDescription);
  assert.ok(rootInterface?.developerName); assert.ok(rootInterface?.category);
  assert.ok(Array.isArray(rootInterface?.capabilities)); assert.ok(rootInterface?.defaultPrompt);
  assert.ok(compatInterface?.shortDescription); assert.ok(compatInterface?.longDescription);
  const publicSkills = requireSkillDirs(join(PACKAGE, 'skills'));
  assert.deepEqual(publicSkills, ['remotion-director']);
  assert.ok(existsSync(join(PACKAGE, 'internal', 'roles', 'builder.md')));
  assert.ok(existsSync(join(PACKAGE, 'internal', 'skills', 'design-brain', 'reference', 'design-equipment.md')));
});

test('generated host output contains no executable Claude or bash seam', () => {
  const files = walk(PACKAGE).filter((file) => /\.(md|mjs|ts|json)$/.test(file) && !file.endsWith('CODEX-HOST-SEAMS.json'));
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    assert.doesNotMatch(text, /\$\{CLAUDE_PLUGIN_ROOT\}/, file);
    assert.doesNotMatch(text, /AskUserQuestion|SendMessage/, file);
    assert.doesNotMatch(text, /(?<!\$env:)NODE_PATH="/, file);
  }
});

test('package is self-contained when copied to a path with spaces and Chinese characters', () => {
  const dest = join(temp('安装 package '), '移植 package'); mkdirSync(dest, { recursive: true });
  cpSync(PACKAGE, dest, { recursive: true });
  assert.equal(JSON.parse(readFileSync(join(dest, 'plugin.json'), 'utf8')).name, 'remotion-director');
  const launcher = join(dest, 'tools', 'codex-launcher.mjs');
  const help = spawnSync(process.execPath, [launcher, '--help'], { cwd: temp('empty workspace '), encoding: 'utf8' });
  assert.equal(help.status, 0); assert.match(help.stdout, /init-run/); assert.match(help.stdout, /artifact/);
});

test('empty workspace preparation creates the workspace before running check-env', () => {
  const workspace = join(temp('new workspace '), '空工区');
  const launcher = join(PACKAGE, 'tools', 'codex-launcher.mjs');
  const result = spawnSync(process.execPath, [launcher, 'prepare-environment', '--workspace', workspace, '--check'], { cwd: ROOT, encoding: 'utf8' });
  assert.ok(existsSync(workspace));
  // Network/install availability is host-specific; the relevant contract is that the launcher
  // reached check-env instead of failing because cwd did not exist.
  assert.doesNotMatch(result.stderr, /ENOENT.*cwd|spawn.*ENOENT/);
});

test('run ledger preserves identity and rejects duplicate or stale completion', () => {
  const root = temp('ledger '); const source = join(root, 'draw'); mkdirSync(source, { recursive: true });
  const state = initRun({ runDir: root, briefHash: 'a'.repeat(64), draws: 2, durationAuthority: 'locked 3s', spec: { width: 320, height: 568, fps: 30 } });
  registerRole(root, { role: 'builder', key: 'draw-1', agentId: 'builder-A', continuationId: 'cont-A', fresh: true });
  continueRole(root, { role: 'builder', key: 'draw-1', agentId: 'builder-A', continuationId: 'cont-A' });
  assert.throws(() => continueRole(root, { role: 'builder', key: 'draw-1', agentId: 'builder-B', continuationId: 'cont-B' }), /IDENTITY|identity/i);
  assert.throws(() => registerRole(root, { role: 'builder', key: 'draw-1', agentId: 'builder-B', continuationId: 'cont-B', fresh: true }), /already registered|IDENTITY/i);
  assert.throws(() => recordReport(root, { id: 'bad', role: 'builder', key: 'draw-1', status: 'settled', agentId: 'builder-A', continuationId: 'cont-A' }), /outDir/i);
  const out = fixture(root, source);
  const report = recordReport(root, { id: 'draw-1-settled', role: 'builder', key: 'draw-1', status: 'settled', agentId: 'builder-A', continuationId: 'cont-A', outDir: out });
  acceptCanonical(root, { reportId: 'draw-1-settled', role: 'builder', outDir: out, sourceDir: source });
  assert.throws(() => acceptCanonical(root, { reportId: 'draw-1-settled', role: 'builder', outDir: out, sourceDir: source }), /already consumed|DUPLICATE/i);
  writeFileSync(join(source, 'index.tsx'), 'export const source = "changed";');
  assert.throws(() => verifyArtifacts(out, { sourceDir: source }), /stale|changed/i);
});

test('critic verdict requires persistent identity and rejects stale or duplicate rounds', () => {
  const root = temp('critic '); const source = join(root, 'draw'); mkdirSync(source, { recursive: true });
  initRun({ runDir: root, briefHash: 'b'.repeat(64), draws: 1, durationAuthority: 'free' });
  registerRole(root, { role: 'critic', agentId: 'critic-A', continuationId: 'critic-cont', fresh: true });
  registerRole(root, { role: 'builder', key: 'draw-1', agentId: 'builder-A', continuationId: 'builder-cont', fresh: true });
  registerRole(root, { role: 'selector', agentId: 'selector-A', continuationId: 'selector-cont', fresh: true });
  const out = fixture(root, source); const strip = join(out, 'strip');
  recordReport(root, { id: 'draw-1-settled', role: 'builder', key: 'draw-1', status: 'settled', agentId: 'builder-A', continuationId: 'builder-cont', outDir: out });
  acceptCanonical(root, { reportId: 'draw-1-settled', role: 'builder', outDir: out, sourceDir: source });
  prepareSelection(root, { candidates: [{ label: 'A', key: 'draw-1' }] });
  recordSelection(root, { selectorId: 'selector-A', selectorContinuationId: 'selector-cont', winner: 'A', candidates: [{ label: 'A', key: 'draw-1' }], reason: 'A has the strongest potential.' });
  recordVerdict(root, { id: 'v1', criticId: 'critic-A', criticContinuationId: 'critic-cont', round: 1, stripDir: strip, verdict: 'phenomenon text\nOVERALL: no\nCONVERGED: NO' });
  const afterFirst = JSON.parse(readFileSync(join(root, '.remotion-director', 'codex-run.json'), 'utf8'));
  assert.equal(afterFirst.handoffs.at(-1).to, 'builder-A');
  assert.throws(() => recordVerdict(root, { id: 'v1b', criticId: 'critic-A', criticContinuationId: 'critic-cont', round: 1, stripDir: strip, verdict: 'duplicate\nOVERALL: no\nCONVERGED: NO' }), /Duplicate|stale|sequential|supersede/i);
  recordVerdict(root, { id: 'v1-amend', criticId: 'critic-A', criticContinuationId: 'critic-cont', round: 1, stripDir: strip, amendmentOf: 'v1', rebuttalOf: 'v1', verdict: 'rebuttal accepted\nOVERALL: no\nCONVERGED: NO\n' });
  const amended = JSON.parse(readFileSync(join(root, '.remotion-director', 'codex-run.json'), 'utf8'));
  assert.equal(amended.verdicts.at(-1).amendmentOf, 'v1');
  assert.equal(amended.verdicts.at(-1).replaces, 'phenomenon text\nOVERALL: no\nCONVERGED: NO');
  assert.throws(() => recordVerdict(root, { id: 'v2-before-build', criticId: 'critic-A', criticContinuationId: 'critic-cont', round: 2, stripDir: strip, verdict: 'stale\nOVERALL: no\nCONVERGED: NO' }), /canonical|round/i);
  const out2 = fixture(join(root, 'round-1-output'), source); const strip2 = join(out2, 'strip');
  recordReport(root, { id: 'round-1-done', role: 'builder', key: 'draw-1', status: 'round-done', reviewRound: 1, agentId: 'builder-A', continuationId: 'builder-cont', outDir: out2 });
  acceptCanonical(root, { reportId: 'round-1-done', role: 'builder', outDir: out2, sourceDir: source, reviewRound: 1, stripDir: strip2 });
  recordVerdict(root, { id: 'v2', criticId: 'critic-A', criticContinuationId: 'critic-cont', round: 2, stripDir: strip2, verdict: 'converged\nOVERALL: yes\nCONVERGED: YES' });
  assert.throws(() => recordVerdict(root, { id: 'v3', criticId: 'critic-A', criticContinuationId: 'critic-cont', round: 3, stripDir: strip2, verdict: 'late\nOVERALL: yes\nCONVERGED: YES' }), /canonical|convergence/i);
  assert.throws(() => recordVerdict(root, { id: 'v2', criticId: 'critic-B', criticContinuationId: 'critic-cont', round: 2, stripDir: strip, verdict: 'wrong identity' }), /identity/i);
});

test('CLI record-report forwards review round for a builder round-done handoff', () => {
  const root = temp('cli round '); const source = join(root, 'draw'); mkdirSync(source, { recursive: true });
  initRun({ runDir: root, briefHash: 'e'.repeat(64), draws: 1, durationAuthority: 'free' });
  registerRole(root, { role: 'builder', key: 'draw-1', agentId: 'builder-A', continuationId: 'builder-cont', fresh: true });
  registerRole(root, { role: 'selector', agentId: 'selector-A', continuationId: 'selector-cont', fresh: true });
  registerRole(root, { role: 'critic', agentId: 'critic-A', continuationId: 'critic-cont', fresh: true });
  const out = fixture(root, source); const strip = join(out, 'strip');
  recordReport(root, { id: 'settled', role: 'builder', key: 'draw-1', status: 'settled', agentId: 'builder-A', continuationId: 'builder-cont', outDir: out });
  acceptCanonical(root, { reportId: 'settled', role: 'builder', outDir: out, sourceDir: source });
  prepareSelection(root, { candidates: [{ label: 'A', key: 'draw-1' }] });
  recordSelection(root, { selectorId: 'selector-A', selectorContinuationId: 'selector-cont', winner: 'A', candidates: [{ label: 'A', key: 'draw-1' }], reason: 'A has the strongest potential.' });
  recordVerdict(root, { id: 'verdict-1', criticId: 'critic-A', criticContinuationId: 'critic-cont', round: 1, stripDir: strip, verdict: '1 / seq-00 / visible issue / high\nOVERALL: needs work\nCONVERGED: NO' });

  const launcher = join(ROOT, 'tools', 'codex-launcher.mjs');
  const result = spawnSync(process.execPath, [launcher, 'record-report', '--run-dir', root, '--report-id', 'round-1-done', '--role', 'builder', '--key', 'draw-1', '--status', 'round-done', '--review-round', '1', '--agent-id', 'builder-A', '--continuation-id', 'builder-cont', '--out-dir', out, '--strip-dir', strip], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const state = JSON.parse(readFileSync(join(root, '.remotion-director', 'codex-run.json'), 'utf8'));
  assert.equal(state.reports.at(-1).id, 'round-1-done');
  assert.equal(state.reports.at(-1).reviewRound, 1);
});

test('canonical advancement rejects duplicate stages, non-pipeline roles and traversal evidence', () => {
  const root = temp('canonical guards '); const source = join(root, 'draw'); mkdirSync(source, { recursive: true });
  initRun({ runDir: root, briefHash: 'd'.repeat(64), draws: 1, durationAuthority: 'locked 3s', spec: { width: 320, height: 568, fps: 30 } });
  registerRole(root, { role: 'builder', key: 'draw-1', agentId: 'builder-A', continuationId: 'builder-cont', fresh: true });
  const out = fixture(root, source);
  recordReport(root, { id: 'settled-1', role: 'builder', key: 'draw-1', status: 'settled', agentId: 'builder-A', continuationId: 'builder-cont', outDir: out });
  acceptCanonical(root, { reportId: 'settled-1', role: 'builder', outDir: out, sourceDir: source });
  assert.throws(() => recordReport(root, { id: 'settled-2', role: 'builder', key: 'draw-1', status: 'settled', agentId: 'builder-A', continuationId: 'builder-cont', outDir: out }), /DUPLICATE|already/i);
  const manifestFile = join(out, 'strip', 'strip-manifest.json');
  const manifest = JSON.parse(readFileSync(manifestFile, 'utf8')); manifest.frames[0].file = '../video.mp4';
  writeFileSync(manifestFile, JSON.stringify(manifest));
  assert.throws(() => verifyArtifacts(out, { sourceDir: source }), /inside|escapes|MISMATCHED/i);
});

test('video provenance catches same-length source replacement before strip extraction', () => {
  const root = temp('video provenance '); const source = join(root, 'draw'); mkdirSync(source, { recursive: true });
  const out = fixture(root, source);
  writeFileSync(join(source, 'index.tsx'), 'export const source = "v2";');
  assert.throws(() => verifyVideoProvenance(out, source), /Source changed/i);
});

test('artifact verifier rejects corrupt or cross-version evidence', () => {
  const root = temp('corrupt evidence '); const source = join(root, 'draw'); mkdirSync(source, { recursive: true });
  const out = fixture(root, source);
  writeFileSync(join(out, 'still-000.png'), Buffer.from('not a png'));
  assert.throws(() => verifyArtifacts(out, { sourceDir: source }), /Invalid PNG|changed/i);
  writeFileSync(join(out, 'still-000.png'), png);
  const manifestFile = join(out, 'strip', 'strip-manifest.json');
  const manifest = JSON.parse(readFileSync(manifestFile, 'utf8'));
  manifest.video = join(root, 'other', 'video.mp4');
  writeFileSync(manifestFile, JSON.stringify(manifest));
  assert.throws(() => verifyArtifacts(out, { sourceDir: source }), /changed|does not match|CRC/i);
});

test('source provenance ignores notes and crops while detecting author code changes', () => {
  const root = temp('source inputs '); const source = join(root, 'draw'); mkdirSync(source, { recursive: true });
  const out = fixture(root, source);
  const before = hashTree(source);
  writeFileSync(join(source, 'DESIGN.md'), 'design notes');
  writeFileSync(join(source, 'FIXES.md'), 'fix report');
  const crops = join(source, 'critic-crops'); mkdirSync(crops, { recursive: true }); writeFileSync(join(crops, 'crop.png'), png);
  assert.equal(hashTree(source), before);
  assert.doesNotThrow(() => verifyArtifacts(out, { sourceDir: source }));
  writeFileSync(join(source, 'index.tsx'), 'changed source');
  assert.throws(() => verifyArtifacts(out, { sourceDir: source }), /Source files changed/i);
});

test('source provenance includes nested author files with generated-looking basenames', () => {
  const root = temp('nested provenance '); const source = join(root, 'draw'); mkdirSync(join(source, 'components', 'out'), { recursive: true });
  writeFileSync(join(source, 'index.tsx'), 'root'); writeFileSync(join(source, 'components', 'out', 'Widget.tsx'), 'v1');
  const before = hashTree(source); writeFileSync(join(source, 'components', 'out', 'Widget.tsx'), 'v2');
  assert.notEqual(hashTree(source), before);
});

test('selection requires all settled anonymous candidates and preserves mapping outside the child prompt', () => {
  const root = temp('selection '); const source = join(root, 'draw'); mkdirSync(source, { recursive: true });
  initRun({ runDir: root, briefHash: 'c'.repeat(64), draws: 2, durationAuthority: 'free' });
  registerRole(root, { role: 'selector', agentId: 'selector-A', continuationId: 'selector-cont', fresh: true });
  const a = fixture(join(source, 'a'), join(source, 'a')); const b = fixture(join(source, 'b'), join(source, 'b'));
  // Register reports after fixture creation so artifact provenance is valid.
  registerRole(root, { role: 'builder', key: 'draw-1', agentId: 'builder-A', continuationId: 'builder-a', fresh: true });
  registerRole(root, { role: 'builder', key: 'draw-2', agentId: 'builder-B', continuationId: 'builder-b', fresh: true });
  recordReport(root, { id: 'r1', role: 'builder', key: 'draw-1', status: 'settled', agentId: 'builder-A', continuationId: 'builder-a', outDir: a });
  recordReport(root, { id: 'r2', role: 'builder', key: 'draw-2', status: 'settled', agentId: 'builder-B', continuationId: 'builder-b', outDir: b });
  acceptCanonical(root, { reportId: 'r1', role: 'builder', outDir: a, sourceDir: join(source, 'a') });
  acceptCanonical(root, { reportId: 'r2', role: 'builder', outDir: b, sourceDir: join(source, 'b') });
  const candidates = [{ label: 'A', key: 'draw-1', outDir: a, stripDir: join(a, 'strip'), sourceDir: join(source, 'a') }, { label: 'B', key: 'draw-2', outDir: b, stripDir: join(b, 'strip'), sourceDir: join(source, 'b') }];
  prepareSelection(root, { candidates: candidates.map(({ label, key }) => ({ label, key })) });
  const selected = recordSelection(root, { selectorId: 'selector-A', selectorContinuationId: 'selector-cont', winner: 'B', candidates: candidates.map(({ label, key }) => ({ label, key })), reason: 'B has the strongest potential.' });
  assert.equal(selected.selection.winner, 'B');
  assert.equal(selected.status, 'selected');
});

function walk(dir) { const found = []; for (const name of requireDir(dir)) { const file = join(dir, name); if (requireStat(file).isDirectory()) found.push(...walk(file)); else found.push(file); } return found; }
function requireDir(dir) { return requireFs(dir); }
function requireFs(dir) { return (awaitlessFs.readdirSync(dir)); }
function requireStat(file) { return (awaitlessFs.statSync(file)); }
// Static imports keep the tests synchronous while avoiding a second filesystem implementation.
import * as awaitlessFs from 'node:fs';
function requireSkillDirs(dir) { return awaitlessFs.readdirSync(dir, { withFileTypes: true }).filter((entry) => entry.isDirectory() && existsSync(join(dir, entry.name, 'SKILL.md'))).map((entry) => entry.name).sort(); }
