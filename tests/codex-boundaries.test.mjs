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

// The lister's list in its own format; the tag makes each batch's text distinct.
const directionsText = (n, tag = 'lister') => Array.from({ length: n }, (_, i) => `=== 方向 ${i + 1} ===\n${tag} controlled test direction ${i + 1}.\n`).join('\n');

// 分方向: a fresh lister records the batch's N directions before any builder.
function deal(dir, draws, lister = 'lister') {
  runtime.registerRole(dir, { role: 'lister', agentId: lister, continuationId: `${lister}-cont`, fresh: true });
  return runtime.recordDirections(dir, { listerId: lister, listerContinuationId: `${lister}-cont`, text: directionsText(draws, lister) });
}

function dealtRun(t, draws, { polish = 'critic', durationAuthority = 'locked 3s' } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'codex-independent-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  runtime.initRun({ runDir: dir, briefHash: 'a'.repeat(64), draws, durationAuthority, spec: { width: 320, height: 568, fps: 30 }, polish });
  deal(dir, draws);
  return dir;
}

function createRun(t, draws = 1, options = {}) {
  const dir = dealtRun(t, draws, options);
  const candidates = [];
  for (let i = 1; i <= draws; i++) {
    const key = `draw-${i}`;
    const source = join(dir, key);
    mkdirSync(source);
    writeFileSync(join(source, 'index.tsx'), `// source ${i}`);
    runtime.registerRole(dir, { role: 'builder', key, agentId: key, continuationId: `${key}-continuation`, fresh: true, direction: i });
    candidates.push({ label: String.fromCharCode(64 + i), key, source });
  }
  return { dir, candidates };
}

// A launcher render: video.mp4 + review/ (the tracked fixture), bound to its source.
function output(source, version = 'r1') {
  const out = join(source, 'out', version);
  cpSync(MEDIA, out, { recursive: true });
  rmSync(join(out, 'README.md'));
  runtime.captureVideoProvenance(out, source);
  runtime.captureProvenance(out, source);
  return out;
}

const builderIdentity = (candidate) => ({ agentId: candidate.key, continuationId: `${candidate.key}-continuation` });

function report(run, candidate, out, round = null, status = round ? 'round-done' : 'settled', extra = {}) {
  const id = extra.id ?? `${candidate.key}-${round ?? status}${extra.revision ? `-${extra.revision}` : ''}`;
  runtime.recordReport(run.dir, { id, role: 'builder', key: candidate.key, status, reviewRound: round, ...builderIdentity(candidate), outDir: out, ...extra });
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
  return runtime.recordVerdict(run.dir, { id: `v${round}`, criticId: 'critic', criticContinuationId: 'critic-cont', round, reviewDir: canonical.reviewDir, verdict: `OVERALL: controlled exercise\nCONVERGED: ${converged}\n`, ...extra });
}

const cli = (...args) => spawnSync(process.execPath, [LAUNCHER, ...args], { encoding: 'utf8' });

test('verdict CLI preserves newline text, and a converged critic ends the review rounds', (t) => {
  const run = createRun(t); previewAll(run); select(run); settle(run); critic(run);
  verdict(run, 1);
  verdict(run, 1, 'NO', { id: 'v1-amend', amendmentOf: 'v1' });
  const candidate = run.candidates[0];
  runtime.continueRole(run.dir, { role: 'builder', key: candidate.key, ...builderIdentity(candidate) });
  accept(run, candidate, output(candidate.source, 'r3'), 1);
  const text = 'OVERALL: ready\nCONVERGED: YES\n';
  const verdictFile = join(run.dir, 'verdict.txt'); writeFileSync(verdictFile, text);
  const state = runtime.loadState(run.dir);
  assert.equal(state.canonical.reviewDir, join(candidate.source, 'out', 'r3', 'review'));
  const result = cli('record-verdict', '--run-dir', run.dir, '--critic-id', 'critic', '--continuation-id', 'critic-cont', '--round', '2', '--verdict-id', 'v2', '--review-dir', state.canonical.reviewDir, '--verdict-file', verdictFile);
  assert.equal(result.status, 0, result.stderr);
  const recorded = runtime.loadState(run.dir).verdicts.at(-1);
  assert.equal(recorded.text, text);
  assert.equal(recorded.video, join(candidate.source, 'out', 'r3', 'video.mp4'));
  // No tempo pass and no post-convergence round: only a same-round amendment follows.
  assert.throws(() => verdict(run, 3), /convergence/i);
  assert.throws(() => report(run, candidate, output(candidate.source, 'r4'), 2), /converged/i);
  verdict(run, 2, 'NO', { id: 'v2-retracted', amendmentOf: 'v2' });
  assert.equal(runtime.loadState(run.dir).roles.critic.continuationId, 'critic-cont');
});

test('the tempo pass is gone: no tempo role and no done status', (t) => {
  const run = createRun(t);
  assert.throws(() => runtime.registerRole(run.dir, { role: 'tempo', agentId: 'tempo', continuationId: 'tempo-cont', fresh: true }), /Unknown role tempo/);
  assert.throws(() => runtime.recordReport(run.dir, { id: 'done', role: 'builder', key: 'draw-1', status: 'done', ...builderIdentity(run.candidates[0]), outDir: output(run.candidates[0].source) }), /Unknown completion status done/);
  assert.equal('tempo' in runtime.loadState(run.dir).roles, false);
  const help = cli('--help');
  assert.match(help.stdout, /time-overview --workspace DIR --video MP4 --out DIR/);
  assert.doesNotMatch(help.stdout, /render-strip|tempo|--strip-dir/);
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

test('all accepted render directories remain unavailable for later rounds', (t) => {
  const run = createRun(t); previewAll(run); select(run); settle(run); critic(run); verdict(run, 1);
  const candidate = run.candidates[0]; const old = output(candidate.source, 'r3');
  accept(run, candidate, old, 1); verdict(run, 2);
  accept(run, candidate, output(candidate.source, 'r4'), 2); verdict(run, 3);
  assert.throws(() => accept(run, candidate, old, 3), /already|used|duplicate/i);
});

test('a rebuttal must name the same review dir as the verdict it amends', (t) => {
  const run = createRun(t); previewAll(run); select(run); settle(run); critic(run); verdict(run, 1);
  const otherReview = join(run.candidates[0].source, 'out', 'r1', 'review');
  assert.throws(() => verdict(run, 1, 'NO', { id: 'v1-rebuttal', rebuttalOf: 'v1', reviewDir: otherReview }), /review dir/i);
  verdict(run, 1, 'NO', { id: 'v1-rebuttal', rebuttalOf: 'v1' });
  assert.equal(runtime.loadState(run.dir).verdicts.at(-1).rebuttalOf, 'v1');
});

test('selection preparation requires all N and copies only anonymous video + review evidence', (t) => {
  const run = createRun(t, 2);
  assert.throws(() => runtime.prepareSelection(run.dir, { candidates: mapping(run) }), /every|preview/i);
  previewAll(run);
  const missing = join(run.candidates[1].source, 'out', 'r1', 'review', 'settle-02_t02.27s.png');
  const bytes = readFileSync(missing); rmSync(missing);
  assert.throws(() => runtime.prepareSelection(run.dir, { candidates: mapping(run) }), /missing settle frame/i);
  writeFileSync(missing, bytes);
  const safe = runtime.prepareSelection(run.dir, { candidates: mapping(run) });
  assert.equal(safe.candidates.length, 2);
  for (const candidate of safe.candidates) {
    assert.doesNotMatch(JSON.stringify(candidate), /draw-[12]|sourceDir|agentId/);
    assert.deepEqual(readdirSync(candidate.evidenceDir).sort(), ['review', 'video.mp4']);
    assert.equal(candidate.video, join(candidate.evidenceDir, 'video.mp4'));
    assert.equal(candidate.reviewDir, join(candidate.evidenceDir, 'review'));
    assert.deepEqual(readdirSync(candidate.reviewDir).sort(), ['overview-1.png', 'overview.json', 'settle-01_t00.00s.png', 'settle-02_t02.27s.png', 'settle-03_t02.97s.png']);
    const overview = readFileSync(join(candidate.reviewDir, 'overview.json'), 'utf8');
    assert.doesNotMatch(overview, /draw-[12]|sourceDir|agentId|video\.mp4|[\\/]/);
    assert.equal(JSON.parse(overview).schemaVersion, 1);
    assert.deepEqual(JSON.parse(overview).pages, ['overview-1.png']);
  }
  assert.equal(readdirSync(join(run.dir, '.remotion-director')).filter((name) => name.includes('.tmp-')).length, 0);
});

test('selection rejects modified anonymous pixels and changed source after preparation', (t) => {
  const run = createRun(t); previewAll(run);
  const safe = runtime.prepareSelection(run.dir, { candidates: mapping(run) });
  runtime.registerRole(run.dir, { role: 'selector', agentId: 'selector', continuationId: 'selector-cont', fresh: true });
  const params = { selectorId: 'selector', selectorContinuationId: 'selector-cont', winner: 'A', candidates: mapping(run), reason: 'test' };
  const image = join(safe.candidates[0].reviewDir, 'overview-1.png');
  const bytes = readFileSync(image); writeFileSync(image, Buffer.from('corrupt'));
  assert.throws(() => runtime.recordSelection(run.dir, params), /PNG|changed|stale/i);
  writeFileSync(image, bytes);
  const video = safe.candidates[0].video; const videoBytes = readFileSync(video);
  writeFileSync(video, Buffer.concat([videoBytes, Buffer.from('tail')]));
  assert.throws(() => runtime.recordSelection(run.dir, params), /changed|stale/i);
  writeFileSync(video, videoBytes);
  writeFileSync(join(run.candidates[0].source, 'index.tsx'), '// changed after evidence was prepared');
  assert.throws(() => runtime.recordSelection(run.dir, params), /source|changed|stale/i);
});

test('rewriting overview.json does not replace accepted artifact evidence', (t) => {
  const run = createRun(t); previewAll(run);
  const candidate = run.candidates[0]; const out = join(candidate.source, 'out', 'r1');
  const file = join(out, 'review', 'overview.json'); const overview = json(file);
  overview.final_hold_s += 1; writeJson(file, overview);
  runtime.captureProvenance(out, candidate.source);
  assert.doesNotThrow(() => runtime.verifyArtifacts(out, { sourceDir: candidate.source }));
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
  const verified = runtime.verifyArtifacts(out);
  assert.equal(verified.pageCount, 1);
  assert.equal(verified.settleCount, 3);
  assert.equal(verified.reviewDir, join(out, 'review'));
  assert.throws(() => runtime.verifyArtifacts(out, { spec: { width: 1920, height: 1080 } }), /dimensions/i);
  assert.throws(() => runtime.verifyArtifacts(out, { spec: { fps: 24 } }), /fps/i);
  assert.throws(() => runtime.verifyArtifacts(out, { durationAuthority: 'locked 6s' }), /duration/i);
  const video = join(out, 'video.mp4'); const bytes = readFileSync(video);
  writeFileSync(video, Buffer.from('not an MP4'.repeat(20)));
  assert.throws(() => runtime.verifyArtifacts(out), /ffprobe|video|decode/i);
  writeFileSync(video, bytes);
  writeFileSync(join(out, 'review', 'settle-01_t00.00s.png'), tinyPng());
  runtime.captureProvenance(out, source);
  assert.throws(() => runtime.verifyArtifacts(out), /dimensions.*full resolution/i);
});

// Each case breaks a fresh copy of the valid fixture in one way.
test('review dir verification accepts the valid fixture and rejects every broken contract', (t) => {
  const run = createRun(t); const source = run.candidates[0].source;
  let n = 0;
  const broken = (mutate) => {
    const out = output(source, `case-${++n}`);
    const reviewDir = join(out, 'review'); const file = join(reviewDir, 'overview.json');
    mutate({ out, reviewDir, file, overview: json(file) });
    return out;
  };
  const rewrite = (change) => broken(({ file, overview }) => { change(overview); writeJson(file, overview); });
  assert.doesNotThrow(() => runtime.verifyArtifacts(broken(() => {}), { sourceDir: source }));
  const cases = [
    [broken(({ reviewDir }) => rmSync(reviewDir, { recursive: true })), /Missing review\//],
    [broken(({ file }) => rmSync(file)), /Missing overview\.json/],
    [broken(({ file }) => writeFileSync(file, '{ not json')), /not valid JSON/],
    [rewrite((value) => { value.schemaVersion = 2; }), (error) => error.code === 'UNSUPPORTED_REVIEW_SCHEMA'],
    [rewrite((value) => { delete value.schemaVersion; }), (error) => error.code === 'UNSUPPORTED_REVIEW_SCHEMA'],
    [rewrite((value) => { value.pages = []; }), /no time-overview pages/],
    [rewrite((value) => { delete value.settle_frames; }), /no settle_frames list/],
    [rewrite((value) => { value.pages = ['../video.mp4']; }), /inside review\//],
    [rewrite((value) => { value.pages = ['sub/overview-1.png']; }), /inside review\//],
    [rewrite((value) => { value.pages = ['overview.json']; }), /\.png file name/],
    [rewrite((value) => { value.settle_frames[0].file = '../../index.tsx'; }), /inside review\//],
    [rewrite((value) => { value.settle_frames[1].frame = 'x'; }), /integer frame/],
    [rewrite((value) => { value.pages.push('overview-1.png'); }), /same file twice/],
    [broken(({ reviewDir }) => rmSync(join(reviewDir, 'overview-1.png'))), /missing time-overview page/],
    [broken(({ reviewDir }) => rmSync(join(reviewDir, 'settle-03_t02.97s.png'))), /missing settle frame/],
    [broken(({ reviewDir }) => writeFileSync(join(reviewDir, 'overview-1.png'), Buffer.from('not a png'))), /Invalid PNG/],
    [rewrite((value) => { value.video = 'other.mp4'; }), /not this output's video\.mp4/],
    [rewrite((value) => { value.width = 1080; }), /another render/],
    [rewrite((value) => { value.fps = 24; }), /fps/],
    [rewrite((value) => { value.from_s = 1; value.duration_s = 2; }), /cover all/],
    [rewrite((value) => { value.duration_s = 1.5; }), /cover all/],
  ];
  for (const [out, expected] of cases) assert.throws(() => runtime.verifyArtifacts(out, { sourceDir: source }), expected);
  // Provenance hashes every review file: an extra, a changed or an old-format binding is stale.
  const extra = broken(({ reviewDir }) => writeFileSync(join(reviewDir, 'notes.txt'), 'added after the render'));
  assert.throws(() => runtime.verifyArtifacts(extra, { sourceDir: source }), /cover exactly the current review/);
  const changed = broken(({ file, overview }) => writeFileSync(file, JSON.stringify(overview, null, 4)));
  assert.throws(() => runtime.verifyArtifacts(changed, { sourceDir: source }), /Review file changed.*overview\.json/);
  const oldFormat = broken(({ out }) => { const manifest = json(join(out, 'artifact-manifest.json')); manifest.schemaVersion = 1; writeJson(join(out, 'artifact-manifest.json'), manifest); });
  assert.throws(() => runtime.verifyArtifacts(oldFormat, { sourceDir: source }), /provenance schema 1/);
  const provenance = json(join(join(source, 'out', 'case-1'), 'artifact-manifest.json'));
  assert.deepEqual(Object.keys(provenance.reviewSha256).sort(), ['overview-1.png', 'overview.json', 'settle-01_t00.00s.png', 'settle-02_t02.27s.png', 'settle-03_t02.97s.png']);
  assert.equal(provenance.schemaVersion, 2);
});

test('critic continuation and unsupported overview schema fail explicitly', (t) => {
  const run = createRun(t); previewAll(run); select(run); settle(run); critic(run);
  assert.throws(() => verdict(run, 1, 'NO', { criticContinuationId: 'restarted' }), /identity|continuation/i);
  assert.throws(() => verdict(run, 1, 'NO', { reviewDir: join(runtime.loadState(run.dir).canonical.outDir, 'strip') }), /review dir/i);
  const out = runtime.loadState(run.dir).canonical.outDir;
  const file = join(out, 'review', 'overview.json'); const overview = json(file);
  overview.schemaVersion = 2; writeJson(file, overview);
  assert.throws(() => runtime.verifyArtifacts(out), (error) => error.code === 'UNSUPPORTED_REVIEW_SCHEMA');
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
  assert.throws(() => runtime.recordVerdict(run.dir, { id: 'too-early', criticId: 'critic', criticContinuationId: 'critic-cont', round: 1, reviewDir: join(previewDir(winner), 'review'), verdict: 'OVERALL: early\nCONVERGED: NO\n' }), /settled/i);
  // Losing draws end at their preview: no settled report, no late preview, no continuation.
  assert.equal(picked.roles.builders[loser.key].status, 'ended');
  assert.throws(() => runtime.continueRole(run.dir, { role: 'builder', key: loser.key, ...builderIdentity(loser) }), /ended/i);
  assert.throws(() => report(run, loser, output(loser.source, 'r2')), /picked/i);
  assert.throws(() => runtime.recordReport(run.dir, { id: 'late-preview', role: 'builder', key: other.key, status: 'preview', ...builderIdentity(other), outDir: previewDir(other) }), /before the pick/i);
  // The picked builder's self-check needed no re-render, so it settles on its own preview.
  accept(run, winner, previewDir(winner));
  const settled = runtime.loadState(run.dir).canonical;
  assert.equal(settled.outDir, previewDir(winner));
  assert.equal(settled.stage, 'settled');
  assert.equal(settled.reviewDir, join(previewDir(winner), 'review'));
  verdict(run, 1);
  assert.equal(runtime.loadState(run.dir).handoffs.at(-1).to, 'draw-2');
  assert.equal(runtime.loadState(run.dir).handoffs.at(-1).reviewDir, join(previewDir(winner), 'review'));
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
  // The batch's lister and directions are archived with it; the next batch re-lists.
  assert.equal(redrawn.directions, null);
  assert.equal(redrawn.roles.lister, null);
  assert.equal(redrawn.redraws[0].directions.items.length, 2);
  assert.equal(redrawn.redraws[0].lister.status, 'ended');
  // Ended draws cannot report, and their keys and handles stay reserved.
  const ended = run.candidates[0];
  assert.throws(() => runtime.recordReport(run.dir, { id: 'ended-preview', role: 'builder', key: ended.key, status: 'preview', ...builderIdentity(ended), outDir: previewDir(ended) }), /identity|registered/i);
  assert.throws(() => runtime.registerRole(run.dir, { role: 'builder', key: 'draw-1', agentId: 'new-1', continuationId: 'new-1-cont', fresh: true }), /redraw/i);
  assert.throws(() => runtime.registerRole(run.dir, { role: 'builder', key: 'draw-3', agentId: 'draw-1', continuationId: 'other', fresh: true }), /distinct/i);
  // No new builder before a fresh list, and the ended lister cannot list again.
  assert.throws(() => runtime.registerRole(run.dir, { role: 'builder', key: 'draw-3', agentId: 'draw-3', continuationId: 'draw-3-continuation', fresh: true, direction: 1 }), (error) => error.code === 'MISSING_DIRECTIONS');
  assert.throws(() => runtime.registerRole(run.dir, { role: 'lister', agentId: 'lister', continuationId: 'lister-cont', fresh: true }), /distinct/i);
  const relisted = deal(run.dir, 2, 'lister-2');
  assert.equal(relisted.directions.batch, 2);
  assert.notEqual(relisted.directions.text, redrawn.redraws[0].directions.text);
  const candidates = [3, 4].map((i, index) => {
    const key = `draw-${i}`; const source = join(run.dir, key);
    mkdirSync(source); writeFileSync(join(source, 'index.tsx'), `// source ${i}`);
    runtime.registerRole(run.dir, { role: 'builder', key, agentId: key, continuationId: `${key}-continuation`, fresh: true, direction: index + 1 });
    return { label: String.fromCharCode(65 + index), key, source };
  });
  assert.equal(runtime.loadState(run.dir).roles.builders['draw-3'].direction.sha256, relisted.directions.items[0].sha256);
  const next = { dir: run.dir, candidates };
  previewAll(next);
  assert.equal(select(next).selection.winnerKey, 'draw-3');
  assert.ok(existsSync(join(run.dir, '.remotion-director', 'selection-evidence-2')));
  assert.throws(() => runtime.recordRedraw(run.dir), /already recorded|before the pick/i);
});

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

test('the directions step precedes every builder: the registered lister records exactly N directions in rank order', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'codex-directions-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  runtime.initRun({ runDir: dir, briefHash: 'b'.repeat(64), draws: 3, durationAuthority: 'free' });
  assert.throws(() => runtime.registerRole(dir, { role: 'builder', key: 'draw-1', agentId: 'b1', continuationId: 'b1-cont', fresh: true, direction: 1 }), (error) => error.code === 'MISSING_DIRECTIONS');
  assert.throws(() => runtime.recordDirections(dir, { listerId: 'lister', listerContinuationId: 'lister-cont', text: directionsText(3) }), /identity/i);
  runtime.registerRole(dir, { role: 'lister', agentId: 'lister', continuationId: 'lister-cont', fresh: true });
  assert.throws(() => runtime.registerRole(dir, { role: 'lister', agentId: 'lister-b', continuationId: 'lister-b-cont', fresh: true }), /already registered/i);
  assert.throws(() => runtime.registerRole(dir, { role: 'selector', agentId: 's', continuationId: 's-cont', fresh: true, direction: 1 }), /Only a builder/);
  const record = (text) => runtime.recordDirections(dir, { listerId: 'lister', listerContinuationId: 'lister-cont', text });
  assert.throws(() => record(directionsText(2)), /exactly N=3/);
  assert.throws(() => record('=== 方向 1 ===\nfirst\n\n=== 方向 3 ===\nthird\n\n=== 方向 2 ===\nsecond\n'), /numbered 1\.\.N/);
  assert.throws(() => record(`Here are the directions:\n${directionsText(3)}`), /before 方向 1/);
  assert.throws(() => record('=== 方向 1 ===\nfirst\n=== 方向 2 ===\n\n=== 方向 3 ===\nthird\n'), /empty/);
  const text = directionsText(3).replace(/\n/g, '\r\n');
  const state = record(text);
  assert.equal(state.status, 'directions-ready');
  assert.equal(state.directions.batch, 1);
  assert.equal(state.directions.text, text);
  assert.deepEqual(state.directions.items.map((item) => item.index), [1, 2, 3]);
  assert.equal(state.directions.items[0].text, 'lister controlled test direction 1.');
  assert.throws(() => record(directionsText(3)), /already has its directions/);
});

test('each builder holds exactly one different direction, and no direction reaches the blind selector', (t) => {
  const dir = dealtRun(t, 2);
  const builder = (key, direction, extra = {}) => runtime.registerRole(dir, { role: 'builder', key, agentId: key, continuationId: `${key}-continuation`, fresh: true, direction, ...extra });
  assert.throws(() => builder('draw-1', null), /exactly one direction 1\.\.2/);
  assert.throws(() => builder('draw-1', 3), /exactly one direction 1\.\.2/);
  builder('draw-1', 1);
  assert.throws(() => builder('draw-2', 1), /already held/);
  const state = builder('draw-2', 2);
  assert.deepEqual(Object.values(state.roles.builders).map((item) => item.direction.index), [1, 2]);
  assert.equal(state.roles.builders['draw-1'].direction.sha256, state.directions.items[0].sha256);
  // A recovered builder keeps the direction it was dealt.
  const recovered = runtime.recoverRole(dir, { role: 'builder', key: 'draw-2', previousAgentId: 'draw-2', replacementAgentId: 'draw-2b', replacementContinuationId: 'draw-2b-cont', reason: 'unavailable child' });
  assert.equal(recovered.roles.builders['draw-2'].direction.index, 2);
  const run = createRun(t, 2); previewAll(run);
  const safe = runtime.prepareSelection(run.dir, { candidates: mapping(run) });
  for (const candidate of safe.candidates) {
    assert.doesNotMatch(JSON.stringify(candidate), /direction|方向/i);
    assert.doesNotMatch(readFileSync(join(candidate.reviewDir, 'overview.json'), 'utf8'), /direction|方向/i);
  }
});

test('the directions step and dealt builders are reachable through the launcher', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'codex-directions-cli-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  runtime.initRun({ runDir: dir, briefHash: 'c'.repeat(64), draws: 2, durationAuthority: 'free' });
  let result = cli('register-role', '--run-dir', dir, '--role', 'lister', '--agent-id', 'lister', '--continuation-id', 'lister-cont', '--fresh');
  assert.equal(result.status, 0, result.stderr);
  result = cli('register-role', '--run-dir', dir, '--role', 'builder', '--key', 'draw-1', '--agent-id', 'draw-1', '--continuation-id', 'draw-1-cont', '--fresh', '--direction', '1');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /MISSING_DIRECTIONS/);
  const file = join(dir, 'directions.txt'); writeFileSync(file, directionsText(2));
  result = cli('record-directions', '--run-dir', dir, '--lister-id', 'lister', '--continuation-id', 'lister-cont', '--directions-file', file);
  assert.equal(result.status, 0, result.stderr);
  result = cli('register-role', '--run-dir', dir, '--role', 'builder', '--key', 'draw-1', '--agent-id', 'draw-1', '--continuation-id', 'draw-1-cont', '--fresh', '--direction', '1');
  assert.equal(result.status, 0, result.stderr);
  const state = runtime.loadState(dir);
  assert.equal(state.directions.text, directionsText(2));
  assert.equal(state.roles.builders['draw-1'].direction.index, 1);
});

// ---- polishing: the critic loop (default) or the user's own eye (亲自打磨) ----

const note = (run, revision, text, extra = {}) => runtime.recordUserNote(run.dir, { revision, note: text, ...extra });

function revise(run, candidate, revision, version) {
  const out = output(candidate.source, version);
  const id = report(run, candidate, out, null, 'revision-done', { revision });
  return { id, out };
}

test('the commission records the polish mode; critic is the default and anything else is refused', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'codex-polish-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const init = (runDir, polish) => runtime.initRun({ runDir, briefHash: 'f'.repeat(64), draws: 1, durationAuthority: 'free', ...(polish === undefined ? {} : { polish }) });
  const byDefault = init(join(dir, 'default'));
  assert.equal(byDefault.commission.polish, 'critic');
  assert.equal(byDefault.polishMode, 'critic');
  assert.equal(init(join(dir, 'user'), 'user').polishMode, 'user');
  assert.throws(() => init(join(dir, 'bad'), 'tempo'), /polish must be critic/);
  const result = cli('init-run', '--run-dir', join(dir, 'cli'), '--brief-hash', 'f'.repeat(64), '--draws', '1', '--duration', 'free', '--polish', 'user');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(runtime.loadState(join(dir, 'cli')).commission.polish, 'user');
});

test('user polish: no critic, notes are verbatim and sequential, and revision-done advances canonical', (t) => {
  const run = createRun(t, 2, { polish: 'user' }); previewAll(run);
  runtime.recordUserSelection(run.dir, { winnerKey: 'draw-1' });
  const [winner, loser] = run.candidates;
  assert.throws(() => note(run, 1, 'too early'), /accepted canonical/);
  settle(run);
  assert.throws(() => critic(run), /user polish/);
  assert.throws(() => runtime.recordVerdict(run.dir, { id: 'v1', criticId: 'critic', criticContinuationId: 'critic-cont', round: 1, reviewDir: runtime.loadState(run.dir).canonical.reviewDir, verdict: 'OVERALL: no\nCONVERGED: NO\n' }), /user polish/);
  assert.throws(() => note(run, 2, 'skips one'), /expected revision 1/);
  assert.throws(() => note(run, 1, '   '), /cannot be empty/);
  const words = '开头那几个字太快了\n  the blue feels cold  ';
  const state = note(run, 1, words);
  assert.equal(state.userNotes[0].text, words);
  assert.equal(state.userNotes[0].outDir, join(winner.source, 'out', 'r2'));
  assert.equal(state.handoffs.at(-1).type, 'user-note');
  assert.equal(state.handoffs.at(-1).to, winner.key);
  assert.equal(state.handoffs.at(-1).verbatim, words);
  // The critic loop's statuses do not apply, and a revision answers the current note only.
  assert.throws(() => report(run, winner, output(winner.source, 'r3-round'), 1), /user polish/);
  assert.throws(() => report(run, winner, output(winner.source, 'r3-next'), null, 'revision-done', { revision: 2 }), /revision 1/);
  assert.throws(() => report(run, loser, output(loser.source, 'r3-loser'), null, 'revision-done', { revision: 1 }), /winning/);
  const first = revise(run, winner, 1, 'r3');
  assert.throws(() => report(run, winner, output(winner.source, 'r3-again'), null, 'revision-done', { revision: 1, id: 'second-revision-1' }), /already recorded/);
  assert.throws(() => note(run, 2, 'before revision 1 was accepted'), /accepted first/);
  assert.throws(() => runtime.acceptCanonical(run.dir, { reportId: first.id, role: 'builder', outDir: first.out, sourceDir: winner.source, revision: 2 }), /conflicts/);
  const accepted = runtime.acceptCanonical(run.dir, { reportId: first.id, role: 'builder', outDir: first.out, sourceDir: winner.source, revision: 1 });
  assert.equal(accepted.canonical.stage, 'revision-done');
  assert.equal(accepted.canonical.revision, 1);
  assert.equal(accepted.canonical.reviewDir, join(first.out, 'review'));
  assert.equal(accepted.status, 'revised');
  note(run, 2, 'better');
  assert.equal(runtime.loadState(run.dir).userNotes.at(-1).outDir, first.out);
  assert.throws(() => runtime.switchPolish(run.dir, { mode: 'user' }), /already in user polish/);
});

test('after the critic converges, a user comment at the final gate switches the piece to user polish', (t) => {
  const run = createRun(t); previewAll(run); select(run); settle(run); critic(run);
  const candidate = run.candidates[0];
  assert.throws(() => note(run, 1, 'in the critic loop'), /User notes belong to user polish/);
  assert.throws(() => report(run, candidate, output(candidate.source, 'rx'), null, 'revision-done', { revision: 1 }), /round-done/);
  verdict(run, 1);
  assert.throws(() => runtime.switchPolish(run.dir, { mode: 'user' }), /after the critic converged/);
  accept(run, candidate, output(candidate.source, 'r3'), 1);
  verdict(run, 2, 'YES');
  assert.throws(() => runtime.switchPolish(run.dir, { mode: 'critic' }), /--mode user/);
  const switched = runtime.switchPolish(run.dir, { mode: 'user', reason: 'the user commented at the final gate' });
  assert.equal(switched.polishMode, 'user');
  assert.equal(switched.commission.polish, 'critic');
  assert.equal(switched.roles.critic.status, 'ended');
  assert.deepEqual({ from: switched.polishSwitches[0].from, to: switched.polishSwitches[0].to, afterRound: switched.polishSwitches[0].afterRound }, { from: 'critic', to: 'user', afterRound: 2 });
  // The critic ends; no verdict, continuation or recovery follows.
  assert.throws(() => verdict(run, 2, 'NO', { id: 'v2-late', amendmentOf: 'v2' }), /user polish/);
  assert.throws(() => runtime.continueRole(run.dir, { role: 'critic', agentId: 'critic', continuationId: 'critic-cont' }), /ended/);
  assert.throws(() => runtime.recoverRole(run.dir, { role: 'critic', previousAgentId: 'critic', replacementAgentId: 'critic-2', replacementContinuationId: 'critic-2-cont', reason: 'gone' }), /ended/);
  // Revision 1 comments on the converged canonical.
  assert.equal(note(run, 1, 'the ending feels abrupt').userNotes[0].outDir, join(candidate.source, 'out', 'r3'));
  const first = revise(run, candidate, 1, 'r4');
  assert.equal(runtime.acceptCanonical(run.dir, { reportId: first.id, role: 'builder', outDir: first.out, sourceDir: candidate.source }).canonical.revision, 1);
});

test('user polish is reachable through the launcher', (t) => {
  const run = createRun(t, 1, { polish: 'user' }); previewAll(run);
  runtime.recordUserSelection(run.dir, { winnerKey: 'draw-1' });
  settle(run);
  const candidate = run.candidates[0];
  const words = '字太小\n看不清';
  const noteFile = join(run.dir, 'note.txt'); writeFileSync(noteFile, words);
  let result = cli('record-user-note', '--run-dir', run.dir, '--revision', '1', '--note-file', noteFile);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(runtime.loadState(run.dir).userNotes[0].text, words);
  const out = output(candidate.source, 'r3');
  result = cli('record-report', '--run-dir', run.dir, '--report-id', 'rev-1', '--role', 'builder', '--key', candidate.key, '--status', 'revision-done', '--revision', '1', '--agent-id', candidate.key, '--continuation-id', `${candidate.key}-continuation`, '--out-dir', out, '--review-dir', join(out, 'review'));
  assert.equal(result.status, 0, result.stderr);
  result = cli('accept-canonical', '--run-dir', run.dir, '--report-id', 'rev-1', '--out-dir', out, '--source', candidate.source, '--revision', '1');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(runtime.loadState(run.dir).canonical.revision, 1);
  result = cli('switch-polish', '--run-dir', run.dir, '--mode', 'user');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /INVALID_POLISH/);

  const loop = createRun(t); previewAll(loop); select(loop); settle(loop); critic(loop); verdict(loop, 1, 'YES');
  result = cli('switch-polish', '--run-dir', loop.dir, '--mode', 'user', '--reason', 'comment at the final gate');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(runtime.loadState(loop.dir).polishMode, 'user');
});

// ---- the locked duration is the builder's promise ----

test('duration-blocked never advances an output, holds the builder until the user decides, and free relaxes the lock', (t) => {
  // The fixture is 3 s, so a 6 s lock cannot be met: exactly the case a builder blocks on.
  const run = createRun(t, 2, { durationAuthority: 'locked 6s' });
  const [blocked, other] = run.candidates;
  const block = (candidate, extra = {}) => runtime.recordReport(run.dir, { id: `${candidate.key}-blocked`, role: 'builder', key: candidate.key, status: 'duration-blocked', ...builderIdentity(candidate), text: 'beats 3-5 need 9 s at 4 words/s; cutting beat 4 would fit 6 s', ...extra });
  assert.throws(() => block(blocked, { outDir: output(blocked.source, 'r0') }), /cannot advance an output/);
  assert.throws(() => block(blocked, { text: '' }), /verbatim/);
  block(blocked);
  assert.throws(() => block(blocked, { id: 'again' }), /awaiting the user's decision/);
  assert.throws(() => runtime.acceptCanonical(run.dir, { reportId: `${blocked.key}-blocked`, role: 'builder', outDir: previewDir(blocked) }), /never does|picked/);
  const out = output(blocked.source);
  assert.throws(() => report(run, blocked, out, null, 'preview'), (error) => error.code === 'DURATION_BLOCKED');
  // The other draw is not held, but the 6 s lock still rejects its 3 s preview.
  const otherId = report(run, other, output(other.source), null, 'preview');
  assert.throws(() => runtime.acceptPreview(run.dir, { reportId: otherId, outDir: previewDir(other), sourceDir: other.source }), /locked 6s/);
  assert.throws(() => runtime.recordDurationDecision(run.dir, { reportId: 'nope', decision: 'free' }), /No duration-blocked report/);
  assert.throws(() => runtime.recordDurationDecision(run.dir, { reportId: `${blocked.key}-blocked`, decision: 'longer' }), /locked .* or free/);
  const relaxed = runtime.recordDurationDecision(run.dir, { reportId: `${blocked.key}-blocked`, decision: 'free' });
  assert.equal(relaxed.commission.durationAuthority, 'free');
  assert.deepEqual({ decision: relaxed.durationDecisions[0].decision, previous: relaxed.durationDecisions[0].previousAuthority }, { decision: 'free', previous: 'locked 6s' });
  assert.throws(() => runtime.recordDurationDecision(run.dir, { reportId: `${blocked.key}-blocked`, decision: 'free' }), /already recorded/);
  // Released: the builder reports again, and the relaxed length no longer binds the previews.
  const id = report(run, blocked, out, null, 'preview');
  runtime.acceptPreview(run.dir, { reportId: id, outDir: out, sourceDir: blocked.source });
  runtime.acceptPreview(run.dir, { reportId: otherId, outDir: previewDir(other), sourceDir: other.source });
  assert.equal(runtime.loadState(run.dir).status, 'previews-ready');
  assert.throws(() => block(blocked, { id: 'after-free' }), /Only a locked total/);
});

test('keeping the lock is recorded too, and only a locked total can be blocked', (t) => {
  const run = createRun(t, 1); previewAll(run);
  runtime.recordUserSelection(run.dir, { winnerKey: 'draw-1' });
  const candidate = run.candidates[0];
  const file = join(run.dir, 'blocked.txt'); writeFileSync(file, 'the end card needs 1.5 s more at the commissioned reading speed');
  let result = cli('record-report', '--run-dir', run.dir, '--report-id', 'blocked-1', '--role', 'builder', '--key', candidate.key, '--status', 'duration-blocked', '--agent-id', candidate.key, '--continuation-id', `${candidate.key}-continuation`, '--text-file', file);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(runtime.loadState(run.dir).reports.at(-1).text, readFileSync(file, 'utf8'));
  assert.throws(() => settle(run), (error) => error.code === 'DURATION_BLOCKED');
  result = cli('record-duration-decision', '--run-dir', run.dir, '--report-id', 'blocked-1', '--decision', 'locked');
  assert.equal(result.status, 0, result.stderr);
  const kept = runtime.loadState(run.dir);
  assert.equal(kept.commission.durationAuthority, 'locked 3s');
  assert.equal(kept.durationDecisions[0].decision, 'locked');
  settle(run, candidate.key, 'r2b');
  assert.equal(runtime.loadState(run.dir).canonical.stage, 'settled');

  const free = createRun(t, 1, { durationAuthority: 'free' });
  assert.throws(() => free.candidates.forEach((item) => runtime.recordReport(free.dir, { id: 'b', role: 'builder', key: item.key, status: 'duration-blocked', ...builderIdentity(item), text: 'too long' })), /Only a locked total/);
});

// ---- launcher render commands ----

test('the launcher refuses to overwrite a finished render or its bound review', (t) => {
  const run = createRun(t); const source = run.candidates[0].source; const out = output(source);
  let result = cli('render-arm', '--workspace', run.dir, '--dir', source, '--out', out);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /OCCUPIED_OUTPUT/);
  result = cli('time-overview', '--workspace', run.dir, '--video', join(out, 'video.mp4'), '--out', join(out, 'review'));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /BOUND_REVIEW/);
  result = cli('time-overview', '--workspace', run.dir, '--video', join(out, 'video.mp4'));
  assert.match(result.stderr, /INVALID_ARGUMENTS/);
});

// Runs the real time-overview through the launcher when the repository's own
// dependencies are installed (tsx is the only module it needs). The repository
// root is the workspace; the launcher stages its harnesses under the ignored
// .remotion-director/ there, and every render path is a temporary directory.
const TSX = join(ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs');
test('time-overview through the launcher stages the harnesses and completes an unfinished render\'s review', { skip: !existsSync(TSX) && 'repository node_modules/tsx is not installed' }, (t) => {
  const scratch = mkdtempSync(join(tmpdir(), 'codex-launcher-overview-'));
  t.after(() => rmSync(scratch, { recursive: true, force: true }));
  const source = join(scratch, 'draw-1'); mkdirSync(source); writeFileSync(join(source, 'index.tsx'), '// source');
  // A render whose review step did not finish: the video and its receipt only.
  const out = join(source, 'out', 'r1'); mkdirSync(out, { recursive: true });
  cpSync(join(MEDIA, 'video.mp4'), join(out, 'video.mp4'));
  runtime.captureVideoProvenance(out, source);
  assert.throws(() => runtime.verifyArtifacts(out, { sourceDir: source }), /Missing review\//);
  let result = cli('time-overview', '--workspace', ROOT, '--video', join(out, 'video.mp4'), '--out', join(out, 'review'));
  assert.equal(result.status, 0, result.stderr);
  const verified = runtime.verifyArtifacts(out, { sourceDir: source });
  assert.equal(verified.pageCount, 1);
  assert.equal(verified.provenance.schemaVersion, 2);
  const staged = readdirSync(join(ROOT, '.remotion-director', 'codex-tools'));
  for (const name of ['render-arm.ts', 'time-overview.ts']) assert.ok(staged.includes(name), `${name} is staged beside the harness that imports it`);
  // A standalone overview of any video into another directory binds nothing.
  const partial = join(scratch, 'partial');
  result = cli('time-overview', '--workspace', ROOT, '--video', join(out, 'video.mp4'), '--out', partial, '--from', '1');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(json(join(partial, 'overview.json')).from_s, 1);
  assert.equal(existsSync(join(scratch, 'artifact-manifest.json')), false);
});
