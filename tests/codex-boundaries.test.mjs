import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { deflateSync } from 'node:zlib';
import * as runtime from '../tools/codex-runtime.mjs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const MEDIA = join(ROOT, 'tests', 'fixtures', 'valid-artifacts');
const LAUNCHER = join(ROOT, 'tools', 'codex-launcher.mjs');
const json = (file) => JSON.parse(readFileSync(file, 'utf8'));
const writeJson = (file, value) => writeFileSync(file, JSON.stringify(value));

function createRun(t, draws = 1) {
  const dir = mkdtempSync(join(tmpdir(), 'codex-independent-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  runtime.initRun({ runDir: dir, briefHash: 'a'.repeat(64), draws, durationAuthority: 'locked 3s', spec: { width: 320, height: 568, fps: 30 } });
  const candidates = [];
  for (let i = 1; i <= draws; i++) {
    const key = `draw-${i}`;
    const source = join(dir, key);
    mkdirSync(source);
    writeFileSync(join(source, 'index.tsx'), `// source ${i}`);
    runtime.registerRole(dir, { role: 'builder', key, agentId: key, continuationId: `${key}-continuation`, fresh: true });
    candidates.push({ label: String.fromCharCode(64 + i), key, source });
  }
  return { dir, candidates };
}

function output(source, version = 'r1') {
  const out = join(source, 'out', version);
  cpSync(MEDIA, out, { recursive: true });
  const manifestFile = join(out, 'strip', 'strip-manifest.json');
  const manifest = json(manifestFile);
  manifest.video = join(out, 'video.mp4');
  writeJson(manifestFile, manifest);
  runtime.captureVideoProvenance(out, source);
  runtime.captureProvenance(out, source);
  return out;
}

function report(run, candidate, out, round = null, status = round ? 'round-done' : 'settled') {
  const id = `${candidate.key}-${round ?? status}`;
  runtime.recordReport(run.dir, { id, role: 'builder', key: candidate.key, status, reviewRound: round, agentId: candidate.key, continuationId: `${candidate.key}-continuation`, outDir: out });
  return id;
}

function accept(run, candidate, out, round = null) {
  const id = report(run, candidate, out, round);
  runtime.acceptCanonical(run.dir, { reportId: id, role: 'builder', outDir: out, sourceDir: candidate.source });
}

const previewDir = (candidate) => join(candidate.source, 'out', 'r1');

// Every draw stops at its r1 preview and waits for the pick.
function preview(run, candidate) {
  const out = output(candidate.source);
  const id = report(run, candidate, out, null, 'preview');
  runtime.acceptPreview(run.dir, { reportId: id, outDir: out, sourceDir: candidate.source });
  return out;
}

function previewAll(run) {
  for (const candidate of run.candidates) preview(run, candidate);
}

// After the pick, the picked builder self-checks and settles (here on a re-render).
function settle(run, key = run.candidates[0].key, version = 'r2') {
  const candidate = run.candidates.find((item) => item.key === key);
  accept(run, candidate, output(candidate.source, version));
}

const mapping = (run) => run.candidates.map(({ label, key }) => ({ label, key }));

function select(run) {
  runtime.prepareSelection(run.dir, { candidates: mapping(run) });
  runtime.registerRole(run.dir, { role: 'selector', agentId: 'selector', continuationId: 'selector-cont', fresh: true });
  return runtime.recordSelection(run.dir, { selectorId: 'selector', selectorContinuationId: 'selector-cont', winner: 'A', candidates: mapping(run), reason: 'Explicit controlled mechanism exercise; no aesthetic claim.' });
}

function critic(run) {
  runtime.registerRole(run.dir, { role: 'critic', agentId: 'critic', continuationId: 'critic-cont', fresh: true });
}

function verdict(run, round, converged = 'NO', extra = {}) {
  const canonical = runtime.loadState(run.dir).canonical;
  return runtime.recordVerdict(run.dir, { id: `v${round}`, criticId: 'critic', criticContinuationId: 'critic-cont', round, stripDir: canonical.stripDir, verdict: `OVERALL: controlled exercise\nCONVERGED: ${converged}\n`, ...extra });
}

test('actual verdict CLI preserves newline text through rebuttal, tempo and post-tempo repair', (t) => {
  const run = createRun(t); previewAll(run); select(run); settle(run); critic(run);
  verdict(run, 1);
  verdict(run, 1, 'NO', { id: 'v1-amend', amendmentOf: 'v1' });
  const candidate = run.candidates[0];
  runtime.continueRole(run.dir, { role: 'builder', key: candidate.key, agentId: candidate.key, continuationId: `${candidate.key}-continuation` });
  accept(run, candidate, output(candidate.source, 'r3'), 1);
  const text = 'OVERALL: ready\nCONVERGED: YES\n';
  const verdictFile = join(run.dir, 'verdict.txt'); writeFileSync(verdictFile, text);
  const result = spawnSync(process.execPath, [LAUNCHER, 'record-verdict', '--run-dir', run.dir, '--critic-id', 'critic', '--continuation-id', 'critic-cont', '--round', '2', '--verdict-id', 'v2', '--strip-dir', runtime.loadState(run.dir).canonical.stripDir, '--verdict-file', verdictFile], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(runtime.loadState(run.dir).verdicts.at(-1).text, text);
  runtime.registerRole(run.dir, { role: 'tempo', agentId: 'tempo', continuationId: 'tempo-cont', fresh: true });
  const tempo = output(candidate.source, 'r5');
  runtime.recordReport(run.dir, { id: 'tempo-done', role: 'tempo', status: 'done', agentId: 'tempo', continuationId: 'tempo-cont', outDir: tempo });
  runtime.acceptCanonical(run.dir, { reportId: 'tempo-done', role: 'tempo', outDir: tempo, sourceDir: candidate.source });
  verdict(run, 3);
  accept(run, candidate, output(candidate.source, 'r8'), 3);
  verdict(run, 4, 'YES');
  assert.equal(runtime.loadState(run.dir).canonical.outDir, join(candidate.source, 'out', 'r8'));
  assert.equal(runtime.loadState(run.dir).roles.critic.continuationId, 'critic-cont');
});

test('initial and replacement role handles cannot collide or omit freshness', (t) => {
  const run = createRun(t);
  assert.throws(() => runtime.registerRole(run.dir, { role: 'selector', agentId: 'selector', continuationId: 'selector-cont' }), /fresh/i);
  assert.throws(() => runtime.registerRole(run.dir, { role: 'selector', agentId: 'draw-1', continuationId: 'other', fresh: true }), /identity|unique|distinct|already/i);
  critic(run);
  assert.throws(() => runtime.recoverRole(run.dir, { role: 'critic', previousAgentId: 'critic', replacementAgentId: 'draw-1', replacementContinuationId: 'other', reason: 'lost critic' }), /identity|already/i);
});

test('recorded completion from a recovered identity cannot be accepted', (t) => {
  const run = createRun(t); const candidate = run.candidates[0]; const out = output(candidate.source);
  const id = report(run, candidate, out, null, 'preview');
  runtime.recoverRole(run.dir, { role: 'builder', key: candidate.key, previousAgentId: candidate.key, replacementAgentId: 'replacement', replacementContinuationId: 'replacement-cont', reason: 'unavailable child' });
  assert.throws(() => runtime.acceptPreview(run.dir, { reportId: id, outDir: out }), /identity/i);
});

test('a completion recorded before a convergence amendment cannot advance afterward', (t) => {
  const run = createRun(t); previewAll(run); select(run); settle(run); critic(run); verdict(run, 1);
  const candidate = run.candidates[0]; const out = output(candidate.source, 'r3');
  const id = report(run, candidate, out, 1);
  verdict(run, 1, 'YES', { id: 'v1-yes', amendmentOf: 'v1' });
  assert.throws(() => runtime.acceptCanonical(run.dir, { reportId: id, role: 'builder', outDir: out }), /stage|stale|converg|verdict/i);
});

test('a tempo completion cannot advance after the critic retracts convergence', (t) => {
  const run = createRun(t); previewAll(run); select(run); settle(run); critic(run); verdict(run, 1, 'YES');
  runtime.registerRole(run.dir, { role: 'tempo', agentId: 'tempo', continuationId: 'tempo-cont', fresh: true });
  const out = output(run.candidates[0].source, 'r3');
  runtime.recordReport(run.dir, { id: 'tempo-done', role: 'tempo', status: 'done', agentId: 'tempo', continuationId: 'tempo-cont', outDir: out });
  verdict(run, 1, 'NO', { id: 'v1-retracted', amendmentOf: 'v1' });
  assert.throws(() => runtime.acceptCanonical(run.dir, { reportId: 'tempo-done', role: 'tempo', outDir: out }), /stage|stale|converg|verdict/i);
});

test('all accepted render directories remain unavailable for later rounds', (t) => {
  const run = createRun(t); previewAll(run); select(run); settle(run); critic(run); verdict(run, 1);
  const candidate = run.candidates[0]; const old = output(candidate.source, 'r3');
  accept(run, candidate, old, 1); verdict(run, 2);
  accept(run, candidate, output(candidate.source, 'r4'), 2); verdict(run, 3);
  assert.throws(() => accept(run, candidate, old, 3), /already|used|duplicate/i);
});

test('selection preparation requires all N and failed preparation can be retried', (t) => {
  const run = createRun(t, 2);
  assert.throws(() => runtime.prepareSelection(run.dir, { candidates: mapping(run) }), /every|preview/i);
  previewAll(run);
  const missing = join(run.candidates[1].source, 'out', 'r1', 'still-000.png');
  const bytes = readFileSync(missing); rmSync(missing);
  assert.throws(() => runtime.prepareSelection(run.dir, { candidates: mapping(run) }), /six|missing/i);
  writeFileSync(missing, bytes);
  const safe = runtime.prepareSelection(run.dir, { candidates: mapping(run) });
  assert.equal(safe.candidates.length, 2);
  for (const candidate of safe.candidates) {
    assert.doesNotMatch(JSON.stringify(candidate), /draw-[12]|sourceDir|agentId/);
    assert.doesNotMatch(readFileSync(candidate.stripManifest, 'utf8'), /draw-[12]|sourceDir|agentId|video\.mp4/);
  }
  assert.equal(readdirSync(join(run.dir, '.remotion-director')).filter((name) => name.includes('.tmp-')).length, 0);
});

test('selection rejects modified anonymous pixels and changed source after preparation', (t) => {
  const run = createRun(t); previewAll(run);
  const safe = runtime.prepareSelection(run.dir, { candidates: mapping(run) });
  runtime.registerRole(run.dir, { role: 'selector', agentId: 'selector', continuationId: 'selector-cont', fresh: true });
  const params = { selectorId: 'selector', selectorContinuationId: 'selector-cont', winner: 'A', candidates: mapping(run), reason: 'test' };
  const image = join(safe.candidates[0].evidenceDir, 'still-000.png');
  const bytes = readFileSync(image); writeFileSync(image, Buffer.from('corrupt'));
  assert.throws(() => runtime.recordSelection(run.dir, params), /PNG|changed|stale/i);
  writeFileSync(image, bytes);
  writeFileSync(join(run.candidates[0].source, 'index.tsx'), '// changed after evidence was prepared');
  assert.throws(() => runtime.recordSelection(run.dir, params), /source|changed|stale/i);
});

test('rewriting a mutable manifest does not replace accepted artifact evidence', (t) => {
  const run = createRun(t); previewAll(run);
  const candidate = run.candidates[0]; const out = join(candidate.source, 'out', 'r1');
  const file = join(out, 'strip', 'strip-manifest.json'); const manifest = json(file);
  manifest.high += 1; writeJson(file, manifest);
  runtime.captureProvenance(out, candidate.source);
  assert.throws(() => runtime.prepareSelection(run.dir, { candidates: mapping(run) }), /changed|snapshot|stale/i);
});

test('source changes cannot be rebound to an older rendered video', (t) => {
  const run = createRun(t); const source = run.candidates[0].source; const out = output(source);
  writeFileSync(join(source, 'index.tsx'), '// changed');
  assert.throws(() => runtime.captureProvenance(out, source), /source|changed/i);
  assert.throws(() => runtime.verifyArtifacts(out), /source|changed/i);
});

test('missing, invalid and incorrectly sized media fail artifact verification', (t) => {
  const run = createRun(t); const source = run.candidates[0].source;
  const out = output(source);
  assert.throws(() => runtime.verifyArtifacts(out, { spec: { width: 1920, height: 1080 } }), /dimensions/i);
  assert.throws(() => runtime.verifyArtifacts(out, { spec: { fps: 24 } }), /fps/i);
  assert.throws(() => runtime.verifyArtifacts(out, { durationAuthority: 'locked 6s' }), /duration/i);
  const video = join(out, 'video.mp4'); const bytes = readFileSync(video);
  writeFileSync(video, Buffer.from('not an MP4'.repeat(20)));
  assert.throws(() => runtime.verifyArtifacts(out), /ffprobe|video|decode/i);
  writeFileSync(video, bytes);
  const still = join(out, 'still-000.png');
  writeFileSync(still, tinyPng());
  runtime.captureProvenance(out, source);
  assert.throws(() => runtime.verifyArtifacts(out), /dimensions/i);
});

test('critic continuation and unsupported strip mode fail explicitly', (t) => {
  const run = createRun(t); previewAll(run); select(run); settle(run); critic(run);
  assert.throws(() => verdict(run, 1, 'NO', { criticContinuationId: 'restarted' }), /identity|continuation/i);
  const out = runtime.loadState(run.dir).canonical.outDir;
  const file = join(out, 'strip', 'strip-manifest.json'); const manifest = json(file);
  manifest.mode = 'uniform-step'; writeJson(file, manifest);
  assert.throws(() => runtime.verifyArtifacts(out), (error) => error.code === 'UNSUPPORTED_STRIP_MODE');
});

// A real minimal PNG, including valid compressed pixels and CRCs, makes the
// dimensions regression independent of signature-only corruption checks.
function tinyPng() {
  function chunk(type, payload) {
    const body = Buffer.concat([Buffer.from(type), payload]);
    let crc = 0xffffffff;
    for (const byte of body) { crc ^= byte; for (let k = 0; k < 8; k++) crc = (crc & 1) ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1; }
    const length = Buffer.alloc(4); length.writeUInt32BE(payload.length);
    const check = Buffer.alloc(4); check.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
    return Buffer.concat([length, body, check]);
  }
  const header = Buffer.alloc(13); header.writeUInt32BE(1, 0); header.writeUInt32BE(1, 4); header[8] = 8; header[9] = 6;
  return Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', header), chunk('IDAT', deflateSync(Buffer.from([0, 0, 0, 0, 255]))), chunk('IEND', Buffer.alloc(0))]);
}

test('the user picks at the r1 previews; only the picked draw self-checks into the canonical the critic reviews', (t) => {
  const run = createRun(t, 3); previewAll(run);
  const [loser, winner, other] = run.candidates;
  assert.equal(runtime.loadState(run.dir).status, 'previews-ready');
  // No draw settles before the pick, and a preview is never canonical output.
  assert.throws(() => report(run, winner, previewDir(winner)), /picked/i);
  assert.throws(() => runtime.acceptCanonical(run.dir, { reportId: `${winner.key}-preview`, role: 'builder', outDir: previewDir(winner) }), /accept-preview|not canonical/i);
  const picked = runtime.recordUserSelection(run.dir, { winnerKey: winner.key, reason: 'the ledger idea could go furthest' });
  assert.equal(picked.selection.by, 'user');
  assert.equal(picked.selection.winnerKey, 'draw-2');
  assert.equal(picked.status, 'selected');
  assert.equal(picked.canonical, null);
  assert.equal(picked.roles.selector, null);
  critic(run);
  assert.throws(() => runtime.recordVerdict(run.dir, { id: 'too-early', criticId: 'critic', criticContinuationId: 'critic-cont', round: 1, stripDir: join(previewDir(winner), 'strip'), verdict: 'OVERALL: early\nCONVERGED: NO\n' }), /settled/i);
  // Losing draws end at their preview: no settled report, no late preview, no continuation.
  assert.equal(picked.roles.builders[loser.key].status, 'ended');
  assert.throws(() => runtime.continueRole(run.dir, { role: 'builder', key: loser.key, agentId: loser.key, continuationId: `${loser.key}-continuation` }), /ended/i);
  assert.throws(() => report(run, loser, output(loser.source, 'r2')), /picked/i);
  assert.throws(() => runtime.recordReport(run.dir, { id: 'late-preview', role: 'builder', key: other.key, status: 'preview', agentId: other.key, continuationId: `${other.key}-continuation`, outDir: previewDir(other) }), /before the pick/i);
  // The picked builder's self-check needed no re-render, so it settles on its own preview.
  accept(run, winner, previewDir(winner));
  const settled = runtime.loadState(run.dir).canonical;
  assert.equal(settled.outDir, previewDir(winner));
  assert.equal(settled.stage, 'settled');
  verdict(run, 1);
  assert.equal(runtime.loadState(run.dir).handoffs.at(-1).to, 'draw-2');
  assert.throws(() => report(run, loser, output(loser.source, 'r3'), 1), /winning|selected/i);
});

test('user selection needs every preview, a real draw, and only one pick per run', (t) => {
  const run = createRun(t, 2);
  preview(run, run.candidates[0]);
  assert.throws(() => runtime.recordUserSelection(run.dir, { winnerKey: 'draw-1' }), /all N=2|preview/i);
  preview(run, run.candidates[1]);
  assert.throws(() => runtime.recordUserSelection(run.dir, { winnerKey: 'draw-9' }), /not an accepted draw/i);
  assert.throws(() => runtime.recordUserSelection(run.dir, { winnerKey: 'draw-1', reason: 42 }), /text/i);
  runtime.recordUserSelection(run.dir, { winnerKey: 'draw-1' });
  assert.equal(runtime.loadState(run.dir).selection.reason, '');
  assert.throws(() => runtime.recordUserSelection(run.dir, { winnerKey: 'draw-2' }), /already/i);
  assert.throws(() => runtime.prepareSelection(run.dir, { candidates: mapping(run) }), /already/i);
});

test('a user pick after prepared blind evidence consumes it, and blind selection records its source', (t) => {
  const prepared = createRun(t, 2); previewAll(prepared);
  runtime.prepareSelection(prepared.dir, { candidates: mapping(prepared) });
  runtime.recordUserSelection(prepared.dir, { winnerKey: 'draw-2' });
  assert.ok(runtime.loadState(prepared.dir).selectionPreparation.consumedAt);
  runtime.registerRole(prepared.dir, { role: 'selector', agentId: 'selector', continuationId: 'selector-cont', fresh: true });
  assert.throws(() => runtime.recordSelection(prepared.dir, { selectorId: 'selector', selectorContinuationId: 'selector-cont', winner: 'A', candidates: mapping(prepared), reason: 'late' }), /already/i);
  const blind = createRun(t); previewAll(blind);
  const selected = select(blind);
  assert.equal(selected.selection.by, 'selector');
  assert.equal(selected.canonical, null);
});

test('a redraw ends every current draw and the pick happens again on N fresh previews', (t) => {
  const run = createRun(t, 2);
  preview(run, run.candidates[0]);
  assert.throws(() => runtime.recordRedraw(run.dir), /all N=2/);
  preview(run, run.candidates[1]);
  const redrawn = runtime.recordRedraw(run.dir);
  assert.equal(redrawn.status, 'redrawing');
  assert.equal(redrawn.redraws.length, 1);
  assert.deepEqual(Object.keys(redrawn.redraws[0].previews).sort(), ['draw-1', 'draw-2']);
  assert.deepEqual(redrawn.roles.builders, {});
  assert.deepEqual(redrawn.previews, {});
  // Ended draws cannot report, and their keys and handles stay reserved.
  const ended = run.candidates[0];
  assert.throws(() => runtime.recordReport(run.dir, { id: 'ended-preview', role: 'builder', key: ended.key, status: 'preview', agentId: ended.key, continuationId: `${ended.key}-continuation`, outDir: previewDir(ended) }), /identity|registered/i);
  assert.throws(() => runtime.registerRole(run.dir, { role: 'builder', key: 'draw-1', agentId: 'new-1', continuationId: 'new-1-cont', fresh: true }), /redraw/i);
  assert.throws(() => runtime.registerRole(run.dir, { role: 'builder', key: 'draw-3', agentId: 'draw-1', continuationId: 'other', fresh: true }), /distinct/i);
  const candidates = [3, 4].map((i, index) => {
    const key = `draw-${i}`; const source = join(run.dir, key);
    mkdirSync(source); writeFileSync(join(source, 'index.tsx'), `// source ${i}`);
    runtime.registerRole(run.dir, { role: 'builder', key, agentId: key, continuationId: `${key}-continuation`, fresh: true });
    return { label: String.fromCharCode(65 + index), key, source };
  });
  const next = { dir: run.dir, candidates };
  previewAll(next);
  assert.equal(select(next).selection.winnerKey, 'draw-3');
  assert.ok(existsSync(join(run.dir, '.remotion-director', 'selection-evidence-2')));
  assert.throws(() => runtime.recordRedraw(run.dir), /already recorded|before the pick/i);
});

const cli = (...args) => spawnSync(process.execPath, [LAUNCHER, ...args], { encoding: 'utf8' });

test('preview, redraw and user pick are reachable through the launcher', (t) => {
  const run = createRun(t, 2);
  for (const candidate of run.candidates) {
    const out = output(candidate.source);
    let result = cli('record-report', '--run-dir', run.dir, '--report-id', `${candidate.key}-preview`, '--role', 'builder', '--key', candidate.key, '--status', 'preview', '--agent-id', candidate.key, '--continuation-id', `${candidate.key}-continuation`, '--out-dir', out);
    assert.equal(result.status, 0, result.stderr);
    result = cli('accept-preview', '--run-dir', run.dir, '--report-id', `${candidate.key}-preview`, '--out-dir', out, '--source', candidate.source);
    assert.equal(result.status, 0, result.stderr);
  }
  assert.equal(runtime.loadState(run.dir).status, 'previews-ready');
  const redraw = cli('record-redraw', '--run-dir', run.dir, '--reason', 'none of these');
  assert.equal(redraw.status, 0, redraw.stderr);
  assert.equal(runtime.loadState(run.dir).redraws[0].reason, 'none of these');

  const picked = createRun(t, 2); previewAll(picked);
  const result = cli('record-user-selection', '--run-dir', picked.dir, '--winner-key', 'draw-2', '--reason', 'picked after watching both videos');
  assert.equal(result.status, 0, result.stderr);
  const state = runtime.loadState(picked.dir);
  assert.equal(state.selection.by, 'user');
  assert.equal(state.selection.reason, 'picked after watching both videos');
});
