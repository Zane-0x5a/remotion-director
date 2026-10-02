#!/usr/bin/env node
/**
 * Dependency-free run ledger and artifact verifier used by the generated Codex
 * package.  The ledger is deliberately boring JSON: agents can inspect it in one
 * read, and a completion report is required before canonical output advances.
 *
 * Flow: a fresh direction lister records N idea-level directions for the batch
 * (record-directions) before any builder registers, and each builder holds
 * exactly one of them.  Every builder reports its r1 `preview` (accept-preview);
 * once all N previews are accepted, one pick is recorded (the user by default,
 * or the blind selector), or the user redraws N fresh draws from a fresh list.
 * Only the picked builder then self-checks and reports `settled`, which is the
 * first canonical output.  A preview is never canonical by itself, and
 * directions are never pick material.
 *
 * The user's pick may also keep other draws of the batch (alsoKeep).  Kept
 * draws wait idle; once the current piece has its settled canonical, next-kept
 * archives that piece into `finished` and makes a kept draw the current piece,
 * which self-checks, settles and is polished like a fresh pick.
 *
 * Polishing follows the commission: the critic loop (default) records verdicts
 * on the canonical's review/ and the builder's `round-done`; user polish
 * (亲自打磨) records the user's own notes verbatim and the builder's
 * `revision-done`, with no critic at all.  After the critic converges, a user
 * comment at the final gate switches the piece to user polish.  A builder that
 * cannot fit a locked total reports `duration-blocked`, which never advances
 * an output; the user's decision (keep the lock, or relax it to free) is
 * recorded before that builder reports again.
 *
 * Every render output is `video.mp4` plus `review/` (time-overview pages,
 * full-resolution settle frames and overview.json, schemaVersion 1).
 */
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync, renameSync, rmSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';

// Schema 4: outputs are reviewed through review/ (reviewDir replaces stripDir),
// there is no tempo role, and the run records its polish mode, user notes and
// duration decisions.  Kept draws (selection.kept) and finished pieces
// (finished) came later within schema 4: a ledger written before them reads as
// no draw kept and no piece finished.  Schema 3 dealt directions first; schema
// 2 picked at the r1 previews without directions; schema-1 ledgers recorded
// settled draws before selection.
export const SCHEMA_VERSION = 4;
export const STATE_FILE = '.remotion-director/codex-run.json';
// artifact-manifest.json schema 2 binds video.mp4 and every file in review/.
export const PROVENANCE_VERSION = 2;
export const POLISH_MODES = ['critic', 'user'];
const REVIEW_DIR = 'review';
const OVERVIEW_FILE = 'overview.json';

const json = (file) => JSON.parse(readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
const fail = (message, code = 'INVALID_STATE') => { const error = new Error(message); error.code = code; throw error; };

export function sha256File(file) {
  if (!existsSync(file) || !statSync(file).isFile()) fail(`File does not exist: ${file}`, 'MISSING_FILE');
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

export function hashTree(root) {
  if (!existsSync(root) || !statSync(root).isDirectory()) fail(`Directory does not exist: ${root}`, 'MISSING_DIRECTORY');
  const hash = createHash('sha256');
  const walk = (dir, prefix = '') => {
    for (const name of readdirSync(dir).sort()) {
      // Source provenance covers author inputs only. Render outputs, judges'
      // crops, notes and this ledger are written after the video and must not
      // make an otherwise identical source appear changed.
      if (prefix === '' && new Set(['out', '.remotion-director', 'node_modules', 'artifact-manifest.json', '.video-provenance.json', 'critic-crops', '_pick-crops', 'FIXES.md', 'CRITIC-VERDICTS.md', 'REBUTTAL.md', 'USER-NOTES.md', 'DESIGN.md']).has(name)) continue;
      const path = join(dir, name);
      const entry = statSync(path);
      if (entry.isDirectory()) { hash.update(`${prefix}${name}/\0dir\0`); walk(path, `${prefix}${name}/`); }
      else if (entry.isFile()) hash.update(`${prefix}${name}\0file\0`).update(readFileSync(path));
    }
  };
  walk(root);
  return hash.digest('hex');
}

function writeJsonAtomic(file, value) {
  mkdirSync(dirname(file), { recursive: true });
  const temp = `${file}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(temp, JSON.stringify(value, null, 2) + '\n', 'utf8');
  renameSync(temp, file);
}

export function statePath(runDir) { return join(resolve(runDir), STATE_FILE); }
export function loadState(runDir) {
  const file = statePath(runDir);
  if (!existsSync(file)) fail(`No Codex run record at ${file}. Initialize the run before dispatching roles.`, 'MISSING_RUN');
  const value = json(file);
  if (value.schemaVersion !== SCHEMA_VERSION) fail(`Unsupported run record schema ${value.schemaVersion}; expected ${SCHEMA_VERSION}.`, 'SCHEMA_MISMATCH');
  value.finished ??= [];
  if (value.selection) value.selection.kept ??= [];
  return value;
}
export function saveState(runDir, value) { writeJsonAtomic(statePath(runDir), value); return value; }

export function initRun({ runDir, briefHash, draws, durationAuthority, spec = {}, polish = 'critic', runId = undefined }) {
  const root = resolve(runDir);
  if (!briefHash || !/^[a-f0-9]{8,128}$/i.test(briefHash)) fail('briefHash must be a hexadecimal provenance hash.', 'INVALID_COMMISSION');
  if (!Number.isInteger(draws) || draws < 1) fail('draws must be a positive integer.', 'INVALID_COMMISSION');
  if (!(durationAuthority === 'free' || isLocked(durationAuthority))) fail('durationAuthority must be free or locked <seconds>s.', 'INVALID_COMMISSION');
  if (!POLISH_MODES.includes(polish)) fail('polish must be critic (the critic loop, the default) or user (亲自打磨, the user polishes).', 'INVALID_COMMISSION');
  if (existsSync(statePath(root))) fail(`Run already initialized at ${statePath(root)}; use status or a new run directory.`, 'DUPLICATE_RUN');
  const now = new Date().toISOString();
  return saveState(root, {
    schemaVersion: SCHEMA_VERSION, runId: runId ?? `${basename(root)}-${Date.now()}`,
    createdAt: now, updatedAt: now, status: 'commissioned',
    commission: { briefHash: briefHash.toLowerCase(), draws, durationAuthority, spec, polish },
    roles: { builders: {}, lister: null, selector: null, critic: null },
    reports: [], handoffs: [], verdicts: [], verdictHistory: [], canonical: null, consumedReportIds: [],
    directions: null, previews: {}, selection: null, selectionPreparation: null, redraws: [], recoveries: [],
    polishMode: polish, polishSwitches: [], userNotes: [], durationDecisions: [], finished: [],
  });
}

function touch(state) { state.updatedAt = new Date().toISOString(); return state; }
function isLocked(authority) { return typeof authority === 'string' && /^locked\s+\d+(?:\.\d+)?s$/.test(authority); }
// Verdict amendments are kept in the ledger as separate records so the
// original critic text remains auditable.  Only the latest record for a review
// round is authoritative for handoffs and convergence checks.
function verdictRounds(state) {
  const latest = new Map();
  for (const item of state.verdicts ?? []) latest.set(item.round, item);
  return [...latest.values()].sort((a, b) => a.round - b.round);
}
function latestVerdict(state) { return verdictRounds(state).at(-1) ?? null; }
function latestVerdictRound(state) { return latestVerdict(state)?.round ?? 0; }
function verdictConvergedYes(text) { return typeof text === 'string' && /(?:^|\r?\n)CONVERGED:\s*YES\s*\r?\n?$/.test(text); }
function unique(state, id, kind = 'report') { if (state[`${kind}s`]?.some((item) => item.id === id)) fail(`Duplicate ${kind} id: ${id}.`, 'DUPLICATE_REPORT'); }
function roleRecord(state, role, key = role) { return role === 'builder' ? state.roles.builders[key] : state.roles[role]; }
const SINGLE_ROLES = ['lister', 'selector', 'critic'];
function liveRoles(state) { return [...Object.values(state.roles.builders), ...SINGLE_ROLES.map((name) => state.roles[name]).filter(Boolean)]; }
// Draws ended by a redraw keep their identities reserved: a new batch must use
// new handles, new draw keys and new draw directories (and a fresh lister).
// So does a finished piece's critic: the next piece gets a fresh one.
function endedRoles(state) {
  return [
    ...(state.redraws ?? []).flatMap((item) => [...Object.values(item.builders ?? {}), ...['lister', 'selector'].map((name) => item[name]).filter(Boolean)]),
    ...(state.finished ?? []).map((item) => item.critic).filter(Boolean),
  ];
}
function latestNoteRevision(state) { return state.userNotes.at(-1)?.revision ?? 0; }
// Draws the user kept with the pick wait idle until next-kept takes them up.
function keptKeys(state) { return state.selection?.kept ?? []; }
function finishedPiece(state, key) { return (state.finished ?? []).find((item) => item.key === key) ?? null; }
// A duration-blocked report stays pending until the user's decision is recorded.
function pendingDurationBlock(state, key) {
  return state.reports.find((item) => item.status === 'duration-blocked' && item.key === key && !state.durationDecisions.some((decision) => decision.reportId === item.id)) ?? null;
}

// A builder registers only after its batch's directions are recorded and holds
// exactly one of them; no two builders of a batch share a direction.
function builderDirection(state, direction) {
  if (!state.directions) fail('Builders register only after this batch\'s directions are recorded with record-directions; the directions step precedes every builder.', 'MISSING_DIRECTIONS');
  const count = state.directions.items.length;
  if (!Number.isInteger(direction) || direction < 1 || direction > count) fail(`A builder must hold exactly one direction 1..${count} of this batch.`, 'INVALID_ROLE');
  if (Object.values(state.roles.builders).some((item) => item.direction?.index === direction)) fail(`Direction ${direction} is already held by another builder of this batch; each builder holds a different one.`, 'INVALID_ROLE');
  return { batch: state.directions.batch, index: direction, sha256: state.directions.items[direction - 1].sha256 };
}

export function registerRole(runDir, { role, key = role, agentId, continuationId, parentId = null, fresh = false, direction = null }) {
  const state = loadState(runDir);
  if (!agentId || !continuationId) fail('agentId and continuationId are required; identity must be explicit.', 'INVALID_ROLE');
  if (!fresh) fail('Initial role registration must assert fresh:true; continuations use continue-role.', 'INVALID_ROLE');
  const existingRoles = [...liveRoles(state), ...endedRoles(state)];
  if (existingRoles.some((item) => item.agentId === agentId || item.continuationId === continuationId)) fail('Each initial role must use a distinct agentId and continuationId.', 'IDENTITY_CHANGED');
  const record = { role, key, agentId, continuationId, parentId, fresh, startedAt: new Date().toISOString(), status: 'running', continuations: 1 };
  if (role === 'builder') {
    if (!/^draw-\d+$/.test(key)) fail('Builder key must be draw-N.', 'INVALID_ROLE');
    if (state.roles.builders[key]) fail(`Builder ${key} is already registered; continue the same agent instead.`, 'IDENTITY_CHANGED');
    if (endedRoles(state).some((item) => item.role === 'builder' && item.key === key)) fail(`Builder ${key} belongs to a draw ended by a redraw; a redraw uses new draw keys and directories.`, 'IDENTITY_CHANGED');
    if (Object.keys(state.roles.builders).length >= state.commission.draws) fail('Builder count exceeds commissioned N.', 'INVALID_ROLE');
    record.direction = builderDirection(state, direction);
    state.roles.builders[key] = record;
  }
  else if (SINGLE_ROLES.includes(role)) {
    if (direction !== null) fail('Only a builder holds a direction.', 'INVALID_ROLE');
    if (role === 'critic' && state.polishMode !== 'critic') fail('The piece is in user polish (亲自打磨): no critic is spawned and no verdict is recorded.', 'INVALID_ROLE');
    if (state.roles[role]) fail(`${role} is already registered; use the existing continuation for follow-up.`, 'IDENTITY_CHANGED');
    state.roles[role] = record;
  } else fail(`Unknown role ${role}.`, 'INVALID_ROLE');
  return saveState(runDir, touch(state));
}

export function continueRole(runDir, { role, key = role, agentId, continuationId, messageHash = null }) {
  const state = loadState(runDir);
  const current = role === 'builder' ? state.roles.builders[key] : state.roles[role];
  if (!current) fail(`No registered ${role} role ${key}.`, 'MISSING_ROLE');
  if (current.agentId !== agentId || current.continuationId !== continuationId) fail(`Continuation identity mismatch for ${role} ${key}; preserve the original agent and continuation ids.`, 'IDENTITY_CHANGED');
  if (current.status === 'ended') fail(role !== 'builder' ? `${role} has ended (the piece moved to user polish); it is not continued.` : finishedPiece(state, key) ? `${role} ${key} has ended: its piece is finished (next-kept moved on to a kept draw); it is not continued.` : `${role} ${key} has ended (not picked); only the picked builder continues after the pick.`, 'INVALID_ROLE');
  if (role === 'builder' && keptKeys(state).includes(key)) fail(`${role} ${key} is kept for a later piece and waits idle; it is continued once next-kept --key ${key} makes it the current piece.`, 'INVALID_ROLE');
  current.continuations += 1; current.lastMessageHash = messageHash; current.status = 'running';
  return saveState(runDir, touch(state));
}

// The lister's list, verbatim: "=== 方向 k ===" blocks numbered 1..N in rank order.
export function parseDirections(text) {
  if (typeof text !== 'string' || !text.trim()) fail('Directions need the lister\'s verbatim list text.', 'INVALID_DIRECTIONS');
  const normalized = text.replace(/\r\n?/g, '\n');
  const headings = [...normalized.matchAll(/^===\s*方向\s*(\d+)\s*===[ \t]*$/gm)];
  if (!headings.length) fail('The directions list has no "=== 方向 k ===" blocks.', 'INVALID_DIRECTIONS');
  if (normalized.slice(0, headings[0].index).trim()) fail('The directions list has text before 方向 1; record the list exactly as the lister returned it, in its format.', 'INVALID_DIRECTIONS');
  return headings.map((match, i) => {
    const index = Number(match[1]);
    if (index !== i + 1) fail(`Directions must be numbered 1..N in rank order; found 方向 ${index} at position ${i + 1}.`, 'INVALID_DIRECTIONS');
    const body = normalized.slice(match.index + match[0].length, headings[i + 1]?.index ?? normalized.length).trim();
    if (!body) fail(`方向 ${index} is empty.`, 'INVALID_DIRECTIONS');
    return { index, text: body, sha256: createHash('sha256').update(body).digest('hex') };
  });
}

// 分方向: one fresh lister per batch of draws (the first, and each redraw) lists
// N directions that differ at the idea level.  The list is recorded verbatim
// before any builder of the batch registers; the lister's own 方向 1 is always
// dealt because every one of the N directions goes to a builder.
export function recordDirections(runDir, { listerId, listerContinuationId, text }) {
  const state = loadState(runDir);
  const lister = state.roles.lister;
  if (!lister || lister.agentId !== listerId || lister.continuationId !== listerContinuationId) fail('Directions identity does not match the registered direction lister of this batch.', 'IDENTITY_CHANGED');
  if (state.directions) fail('This batch already has its directions; a redraw re-lists with a fresh lister.', 'DUPLICATE_DIRECTIONS');
  const items = parseDirections(text);
  if (items.length !== state.commission.draws) fail(`The directions list must hold exactly N=${state.commission.draws} directions; got ${items.length}.`, 'INVALID_DIRECTIONS');
  state.directions = { batch: (state.redraws ?? []).length + 1, listerId, listerContinuationId, text, items, recordedAt: new Date().toISOString() };
  lister.status = 'done';
  state.status = 'directions-ready';
  return saveState(runDir, touch(state));
}

// preview / settled / round-done / revision-done name a rendered output;
// duration-blocked and blocked never do, so they can never advance one.
const REPORT_STATUSES = ['preview', 'settled', 'round-done', 'revision-done', 'duration-blocked', 'blocked'];
const OUTPUT_STATUSES = ['preview', 'settled', 'round-done', 'revision-done'];
const CANONICAL_STAGES = ['settled', 'round-done', 'revision-done'];

export function recordReport(runDir, report) {
  const state = loadState(runDir);
  if (!report?.id || !report.role || !report.status) fail('Completion report needs id, role, and status.', 'INVALID_REPORT');
  unique(state, report.id, 'report');
  if (!REPORT_STATUSES.includes(report.status)) fail(`Unknown completion status ${report.status}.`, 'INVALID_REPORT');
  if (!report.agentId || !report.continuationId) fail('Completion report must name the actual agent and continuation.', 'INVALID_REPORT');
  const role = roleRecord(state, report.role, report.key ?? report.role);
  if (!role || role.agentId !== report.agentId || role.continuationId !== report.continuationId) fail('Completion report identity does not match a registered role.', 'IDENTITY_CHANGED');
  if (report.role === 'builder' && keptKeys(state).includes(report.key)) fail(`Builder ${report.key} is kept for a later piece and waits idle; it reports only after next-kept --key ${report.key} makes it the current piece.`, 'INVALID_REPORT');
  if (OUTPUT_STATUSES.includes(report.status) && !report.outDir) fail('Successful completion report must name its actual outDir.', 'INVALID_REPORT');
  if (!OUTPUT_STATUSES.includes(report.status) && report.outDir) fail('A blocked or duration-blocked report cannot advance an output.', 'INVALID_REPORT');
  if (report.status !== 'blocked' && report.role !== 'builder') fail(`Only a builder can report ${report.status}.`, 'INVALID_REPORT');
  if (report.role === 'builder' && !report.key) fail('Builder completion report must name draw-N key.', 'INVALID_REPORT');
  if (report.status === 'preview' && state.selection) fail('Previews are reported only before the pick; the picked builder reports settled after its self-check.', 'INVALID_REPORT');
  if (report.status === 'settled' && (!state.selection?.winnerKey || report.key !== state.selection.winnerKey)) fail('Only the picked builder reports settled, after the pick and its self-check; every draw first reports its preview.', 'INVALID_REPORT');
  if (report.status === 'round-done') {
    if (state.polishMode !== 'critic') fail('The piece is in user polish (亲自打磨); the builder reports revision-done for a user note, not round-done.', 'INVALID_REPORT');
    if (!Number.isInteger(report.reviewRound) || report.reviewRound < 1) fail('round-done report must name a positive reviewRound.', 'INVALID_REPORT');
    if (report.reviewRound !== latestVerdictRound(state)) fail(`round-done must follow verdict round ${latestVerdictRound(state)}; got ${report.reviewRound}.`, 'STALE_REPORT');
    if (!state.selection?.winnerKey || report.key !== state.selection.winnerKey) fail('Only the selected winning builder may complete a review round.', 'INVALID_REPORT');
    if (verdictConvergedYes(latestVerdict(state)?.text)) fail('A converged verdict cannot be followed by a builder round; amend the same verdict first, or switch to user polish at the final gate.', 'INVALID_REPORT');
  }
  if (report.status === 'revision-done') {
    if (state.polishMode !== 'user') fail('revision-done answers a user note in user polish (亲自打磨); in the critic loop the builder reports round-done.', 'INVALID_REPORT');
    if (!Number.isInteger(report.revision) || report.revision < 1) fail('revision-done report must name a positive revision.', 'INVALID_REPORT');
    if (!state.selection?.winnerKey || report.key !== state.selection.winnerKey) fail('Only the selected winning builder may complete a revision.', 'INVALID_REPORT');
    if (report.revision !== latestNoteRevision(state)) fail(`revision-done must answer user note revision ${latestNoteRevision(state)}; got ${report.revision}.`, 'STALE_REPORT');
  }
  if (report.status === 'duration-blocked') {
    if (!isLocked(state.commission.durationAuthority)) fail(`Only a locked total can be blocked; the duration authority is ${state.commission.durationAuthority}, so the length is the builder's own.`, 'INVALID_REPORT');
    if (typeof report.text !== 'string' || !report.text.trim()) fail("A duration-blocked report needs the builder's report text verbatim (which beats do not fit, at what reading speed, how many seconds would solve it, what would have to go).", 'INVALID_REPORT');
  }
  if (report.role === 'builder' && role.status === 'ended') fail(finishedPiece(state, report.key) ? `Builder ${report.key} has ended: its piece is finished (next-kept moved on to a kept draw), so it no longer reports.` : `Builder ${report.key} has ended (not picked); only the selected winning builder reports after the pick.`, 'INVALID_REPORT');
  if (report.role === 'builder' && report.status !== 'blocked' && pendingDurationBlock(state, report.key)) fail(`Builder ${report.key} has a duration-blocked report awaiting the user's decision; record it with record-duration-decision first.`, 'DURATION_BLOCKED');
  if (OUTPUT_STATUSES.includes(report.status)) {
    const sameStage = (item) => item.role === report.role && (item.key ?? null) === (report.key ?? null) && item.status === report.status && (report.status !== 'round-done' || item.reviewRound === report.reviewRound) && (report.status !== 'revision-done' || item.revision === report.revision);
    if (state.reports.some((item) => sameStage(item) && state.consumedReportIds.includes(item.id))) fail('A successful stage completion was already accepted for this role.', 'DUPLICATE_REPORT');
    // A report of this stage that was never accepted (say its render went stale)
    // is replaced by the re-render's report; only the newest can be accepted.
    for (const item of state.reports) if (sameStage(item) && !item.replacedBy) item.replacedBy = report.id;
  }
  state.reports.push({ ...report, recordedAt: new Date().toISOString() });
  return saveState(runDir, touch(state));
}

// ---- render outputs: video.mp4 + review/ -----------------------------------
// review/ is derived from the rendered video by time-overview (through
// render-arm): overview-1..K.png, settle-NN_tSS.SSs.png and overview.json.
function reviewDirOf(outDir) { return join(resolve(outDir), REVIEW_DIR); }
function isPngName(name) { return typeof name === 'string' && name !== '' && name === basename(name) && !/[\\/]/.test(name) && /\.png$/i.test(name); }
function reviewFiles(reviewDir) {
  const found = [];
  const walk = (dir, prefix = '') => {
    for (const name of readdirSync(dir).sort()) {
      const path = join(dir, name); const entry = statSync(path);
      if (entry.isDirectory()) walk(path, `${prefix}${name}/`);
      else if (entry.isFile()) found.push(`${prefix}${name}`);
    }
  };
  walk(reviewDir); return found;
}
// Provenance hashes every file in review/, not only the listed ones.
function hashReview(reviewDir) { return Object.fromEntries(reviewFiles(reviewDir).map((name) => [name, sha256File(join(reviewDir, ...name.split('/')))])); }
function listedReviewFiles(overview) { return [...overview.pages, ...overview.settle_frames.map((frame) => frame.file)]; }

// overview.json is time-overview's machine-readable contract (schemaVersion 1).
// This checks its shape and the file names it lists; verifyArtifacts checks the
// listed files and binds the measurements to the video.
export function readOverview(reviewDir) {
  const file = join(resolve(reviewDir), OVERVIEW_FILE);
  if (!existsSync(file)) fail(`Missing ${OVERVIEW_FILE} in ${reviewDir}; render through the launcher's render-arm so review/ is generated from video.mp4.`, 'INCOMPLETE_ARTIFACT');
  let overview;
  try { overview = json(file); } catch (error) { fail(`${OVERVIEW_FILE} is not valid JSON (${error.message}): ${file}`, 'CORRUPT_ARTIFACT'); }
  if (!overview || typeof overview !== 'object' || Array.isArray(overview)) fail(`${OVERVIEW_FILE} must be an object: ${file}`, 'CORRUPT_ARTIFACT');
  if (overview.schemaVersion !== 1) fail(`Unsupported ${OVERVIEW_FILE} schemaVersion ${overview.schemaVersion ?? 'missing'}; Codex review artifacts require schemaVersion 1.`, 'UNSUPPORTED_REVIEW_SCHEMA');
  if (!Array.isArray(overview.pages) || overview.pages.length === 0) fail(`${OVERVIEW_FILE} lists no time-overview pages.`, 'CORRUPT_ARTIFACT');
  if (!Array.isArray(overview.settle_frames)) fail(`${OVERVIEW_FILE} has no settle_frames list.`, 'CORRUPT_ARTIFACT');
  for (const page of overview.pages) if (!isPngName(page)) fail(`${OVERVIEW_FILE} page ${JSON.stringify(page)} must be a .png file name inside review/.`, 'MISMATCHED_ARTIFACT');
  for (const frame of overview.settle_frames) {
    if (!frame || typeof frame !== 'object' || !isPngName(frame.file)) fail(`${OVERVIEW_FILE} settle frame ${JSON.stringify(frame?.file)} must be a .png file name inside review/.`, 'MISMATCHED_ARTIFACT');
    if (!Number.isInteger(frame.frame) || frame.frame < 0 || typeof frame.t_s !== 'number' || !Number.isFinite(frame.t_s) || frame.t_s < 0) fail(`${OVERVIEW_FILE} settle frame ${frame.file} needs an integer frame and a time in seconds.`, 'CORRUPT_ARTIFACT');
  }
  const names = listedReviewFiles(overview);
  if (new Set(names).size !== names.length) fail(`${OVERVIEW_FILE} lists the same file twice.`, 'CORRUPT_ARTIFACT');
  return { file, overview };
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();
function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function verifyPngStructure(file) {
  const bytes = readFileSync(file);
  if (bytes.length < 33 || bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') fail(`Invalid PNG signature or truncated file: ${file}`, 'CORRUPT_ARTIFACT');
  let offset = 8; let sawHeader = false; let sawData = false; let sawEnd = false; let width = null; let height = null;
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset); const type = bytes.subarray(offset + 4, offset + 8).toString('ascii');
    const end = offset + 12 + length;
    if (end > bytes.length) fail(`PNG chunk exceeds file bounds: ${file}`, 'CORRUPT_ARTIFACT');
    const payload = bytes.subarray(offset + 8, offset + 8 + length); const expected = bytes.readUInt32BE(offset + 8 + length);
    if (crc32(Buffer.concat([Buffer.from(type, 'ascii'), payload])) !== expected) fail(`PNG CRC mismatch in ${file}`, 'CORRUPT_ARTIFACT');
    if (type === 'IHDR') {
      if (sawHeader || length !== 13 || payload.readUInt32BE(0) < 1 || payload.readUInt32BE(4) < 1) fail(`Malformed PNG IHDR: ${file}`, 'CORRUPT_ARTIFACT');
      sawHeader = true; width = payload.readUInt32BE(0); height = payload.readUInt32BE(4);
    } else if (type === 'IDAT') sawData = true;
    else if (type === 'IEND') { if (length !== 0) fail(`Malformed PNG IEND: ${file}`, 'CORRUPT_ARTIFACT'); sawEnd = true; offset = end; break; }
    offset = end;
  }
  if (!sawHeader || !sawData || !sawEnd || offset !== bytes.length) fail(`PNG is incomplete or has trailing data: ${file}`, 'CORRUPT_ARTIFACT');
  return { width, height };
}
function hashEvidenceSnapshot(root) {
  const hash = createHash('sha256');
  const walk = (dir, prefix = '') => {
    for (const name of readdirSync(dir).sort()) {
      const path = join(dir, name); const entry = statSync(path);
      if (entry.isDirectory()) { hash.update(`${prefix}${name}/\0dir\0`); walk(path, `${prefix}${name}/`); }
      else if (entry.isFile()) hash.update(`${prefix}${name}\0file\0`).update(readFileSync(path));
    }
  };
  walk(resolve(root)); return hash.digest('hex');
}
// Selector evidence keeps the measured numbers and the local review file names
// only: no paths, no video name, nothing that could identify the draw.
function sanitizeOverview(value) {
  const clean = (item) => {
    if (typeof item === 'number') return Number.isFinite(item) ? item : undefined;
    if (typeof item === 'boolean' || item === null) return item;
    if (typeof item === 'string') return /[\\/:]|draw-\d|\.(?:mp4|tsx?|jsx?|md|json)$/i.test(item) ? undefined : item;
    if (Array.isArray(item)) return item.map(clean).filter((entry) => entry !== undefined);
    if (item && typeof item === 'object') return Object.fromEntries(Object.entries(item).map(([key, entry]) => [key, clean(entry)]).filter(([, entry]) => entry !== undefined));
    return undefined;
  };
  const result = clean(value);
  delete result.video;
  return result;
}
function verifyPreparedEvidence(directory) {
  const root = resolve(directory);
  if (!existsSync(root) || !statSync(root).isDirectory()) fail(`Prepared evidence directory is missing: ${root}`, 'STALE_SELECTION');
  const video = join(root, 'video.mp4');
  if (!existsSync(video) || statSync(video).size < 32) fail(`Prepared evidence is missing video.mp4: ${root}`, 'STALE_SELECTION');
  const reviewDir = join(root, REVIEW_DIR);
  if (!existsSync(reviewDir) || !statSync(reviewDir).isDirectory()) fail(`Prepared evidence is missing review/: ${root}`, 'STALE_SELECTION');
  let overview;
  try { ({ overview } = readOverview(reviewDir)); } catch (error) { fail(`Prepared evidence review/ is malformed: ${error.message}`, 'STALE_SELECTION'); }
  for (const name of listedReviewFiles(overview)) {
    const file = join(reviewDir, name);
    if (!existsSync(file)) fail(`Prepared evidence is missing review file ${name}.`, 'STALE_SELECTION');
    verifyPngStructure(file);
  }
  return { root, video, reviewDir, overview, hash: hashEvidenceSnapshot(root) };
}
function artifactSnapshot(outDir, sourceDir = null) {
  const root = resolve(outDir);
  return {
    videoSha256: sha256File(join(root, 'video.mp4')),
    reviewSha256: hashReview(reviewDirOf(root)),
    sourceHash: sourceDir ? hashTree(resolve(sourceDir)) : null,
  };
}
function assertArtifactSnapshot(canonical) {
  if (!canonical?.artifactSnapshot) fail('Canonical is missing its immutable artifact snapshot.', 'STALE_ARTIFACT');
  const current = artifactSnapshot(canonical.outDir, canonical.artifact?.provenance?.sourceDir ?? null);
  if (JSON.stringify(current) !== JSON.stringify(canonical.artifactSnapshot)) fail('Canonical pixels or provenance changed after acceptance.', 'STALE_ARTIFACT');
  return current;
}
function readVideoMetadata(video) {
  const result = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=codec_type,width,height,r_frame_rate,duration:format=duration', '-of', 'json', video], { encoding: 'utf8', windowsHide: true });
  if (result.error) fail(`ffprobe is required to validate video.mp4 (${result.error.message}). Install the full FFmpeg build so ffprobe is on PATH.`, 'VIDEO_UNDECODABLE');
  if (result.status !== 0) fail(`ffprobe could not decode video.mp4: ${(result.stderr || '').trim() || `exit ${result.status}`}`, 'VIDEO_UNDECODABLE');
  let value; try { value = JSON.parse(result.stdout); } catch { fail('ffprobe returned malformed metadata for video.mp4.', 'VIDEO_UNDECODABLE'); }
  const stream = value.streams?.[0]; const duration = Number(stream?.duration ?? value.format?.duration);
  if (!stream || stream.codec_type !== 'video' || !Number.isFinite(duration) || duration <= 0 || !Number.isInteger(stream.width) || !Number.isInteger(stream.height) || stream.width < 1 || stream.height < 1) fail('ffprobe did not find a decodable video stream with dimensions and duration.', 'VIDEO_UNDECODABLE');
  const [num, den] = String(stream.r_frame_rate ?? '').split('/').map(Number); const fps = den > 0 && num > 0 ? num / den : null;
  return { width: stream.width, height: stream.height, duration, fps, codecType: stream.codec_type };
}

export function verifyArtifacts(outDir, { sourceDir = null, requireProvenance = true, spec = null, durationAuthority = null } = {}) {
  const root = resolve(outDir);
  if (!existsSync(root) || !statSync(root).isDirectory()) fail(`Artifact directory does not exist: ${root}`, 'MISSING_ARTIFACT');
  const video = join(root, 'video.mp4');
  if (!existsSync(video) || statSync(video).size < 32) fail(`Missing or empty video.mp4 in ${root}.`, 'INCOMPLETE_ARTIFACT');
  const videoMetadata = readVideoMetadata(video);
  if ((spec?.width && videoMetadata.width !== spec.width) || (spec?.height && videoMetadata.height !== spec.height)) fail(`Video dimensions ${videoMetadata.width}x${videoMetadata.height} do not match commissioned ${spec.width}x${spec.height}.`, 'MISMATCHED_ARTIFACT');
  if (spec?.fps && videoMetadata.fps && Math.abs(videoMetadata.fps - spec.fps) > 0.01) fail(`Video fps ${videoMetadata.fps} does not match commissioned ${spec.fps}.`, 'MISMATCHED_ARTIFACT');
  if (isLocked(durationAuthority)) {
    const expected = Number(durationAuthority.match(/^locked\s+([0-9]+(?:\.[0-9]+)?)s$/)[1]);
    const fps = spec?.fps || videoMetadata.fps || 30;
    if (Math.abs(videoMetadata.duration - expected) > (1 / fps) + 0.01) fail(`Video duration ${videoMetadata.duration.toFixed(3)}s does not match locked ${expected}s within one frame.`, 'MISMATCHED_ARTIFACT');
  }
  const reviewDir = reviewDirOf(root);
  if (!existsSync(reviewDir) || !statSync(reviewDir).isDirectory()) fail(`Missing review/ in ${root}; render through the launcher's render-arm, which writes video.mp4 and its review/.`, 'INCOMPLETE_ARTIFACT');
  const { file: overviewFile, overview } = readOverview(reviewDir);
  // The measurements must describe this output's own video, all of it.
  if (typeof overview.video !== 'string' || basename(overview.video) !== 'video.mp4') fail(`${OVERVIEW_FILE} describes ${JSON.stringify(overview.video)}, not this output's video.mp4.`, 'MISMATCHED_ARTIFACT');
  if (overview.width !== videoMetadata.width || overview.height !== videoMetadata.height) fail(`${OVERVIEW_FILE} measures ${overview.width}x${overview.height}, but video.mp4 is ${videoMetadata.width}x${videoMetadata.height}; the review belongs to another render.`, 'MISMATCHED_ARTIFACT');
  if (typeof overview.fps !== 'number' || (videoMetadata.fps && Math.abs(overview.fps - videoMetadata.fps) > 0.01)) fail(`${OVERVIEW_FILE} fps ${overview.fps} does not match video.mp4 fps ${videoMetadata.fps}.`, 'MISMATCHED_ARTIFACT');
  const frameSeconds = 1 / (videoMetadata.fps || overview.fps || 30);
  if (overview.from_s !== 0 || typeof overview.duration_s !== 'number' || Math.abs(overview.duration_s - videoMetadata.duration) > frameSeconds + 0.01) fail(`${OVERVIEW_FILE} covers ${overview.duration_s}s from ${overview.from_s}s, but a render's review must cover all ${videoMetadata.duration.toFixed(3)}s of video.mp4 from 0s.`, 'MISMATCHED_ARTIFACT');
  for (const page of overview.pages) {
    const file = join(reviewDir, page);
    if (!existsSync(file)) fail(`${OVERVIEW_FILE} lists a missing time-overview page: ${page}`, 'MISSING_ARTIFACT');
    verifyPngStructure(file);
  }
  for (const frame of overview.settle_frames) {
    const file = join(reviewDir, frame.file);
    if (!existsSync(file)) fail(`${OVERVIEW_FILE} lists a missing settle frame: ${frame.file}`, 'MISSING_ARTIFACT');
    const dimensions = verifyPngStructure(file);
    if (dimensions.width !== videoMetadata.width || dimensions.height !== videoMetadata.height) fail(`Settle frame ${frame.file} dimensions ${dimensions.width}x${dimensions.height} do not match video ${videoMetadata.width}x${videoMetadata.height}; settle frames are full resolution.`, 'MISMATCHED_ARTIFACT');
  }
  const artifactFile = join(root, 'artifact-manifest.json');
  if (requireProvenance && !existsSync(artifactFile)) fail(`Missing artifact-manifest.json in ${root}; render through the package launcher so reviewed pixels bind to source and video.`, 'UNBOUND_ARTIFACT');
  let provenance = null;
  if (existsSync(artifactFile)) {
    provenance = json(artifactFile);
    if (provenance.schemaVersion !== PROVENANCE_VERSION) fail(`artifact-manifest.json has provenance schema ${provenance.schemaVersion ?? 'missing'}; expected ${PROVENANCE_VERSION} (video.mp4 + review/). Render a new version through the launcher.`, 'STALE_ARTIFACT');
    if (provenance.videoSha256 !== sha256File(video)) fail('video.mp4 changed after provenance was captured.', 'STALE_ARTIFACT');
    const boundReview = provenance.reviewSha256 ?? {};
    if (Object.keys(boundReview).sort().join('\0') !== reviewFiles(reviewDir).join('\0')) fail('Artifact provenance does not cover exactly the current review/ files.', 'STALE_ARTIFACT');
    for (const [name, hash] of Object.entries(boundReview)) if (sha256File(join(reviewDir, ...name.split('/'))) !== hash) fail(`Review file changed after provenance was captured: ${name}`, 'STALE_ARTIFACT');
    const boundSource = sourceDir ?? provenance.sourceDir;
    if (requireProvenance && (!boundSource || !provenance.sourceHash)) fail('Artifact provenance is missing source binding; a canonical output must name its source.', 'UNBOUND_ARTIFACT');
    if (boundSource) {
      const sourceHash = hashTree(resolve(boundSource));
      if (provenance.sourceHash !== sourceHash) fail('Source files changed after rendering; the artifact is stale and cannot be canonical. The builder renders the current source into an unused output dir and reports that one under a new report id.', 'STALE_ARTIFACT');
    }
  }
  return { outDir: root, videoSha256: sha256File(video), reviewDir, overviewFile, pageCount: overview.pages.length, settleCount: overview.settle_frames.length, overview, provenance, videoMetadata };
}

export function captureProvenance(outDir, sourceDir) {
  const root = resolve(outDir); const video = join(root, 'video.mp4'); const reviewDir = reviewDirOf(root);
  if (!existsSync(video) || !existsSync(join(reviewDir, OVERVIEW_FILE))) fail(`Cannot capture provenance before video.mp4 and review/${OVERVIEW_FILE} exist in ${root}.`, 'INCOMPLETE_ARTIFACT');
  const videoReceipt = verifyVideoProvenance(root, sourceDir ?? null);
  const boundSource = sourceDir ? resolve(sourceDir) : videoReceipt.sourceDir;
  const sourceHash = videoReceipt.sourceHash ?? null;
  const videoSha256 = videoReceipt.videoSha256;
  const existingFile = join(root, 'artifact-manifest.json');
  if (existsSync(existingFile)) {
    const existing = json(existingFile);
    if (existing.videoSha256 !== videoSha256) fail('Cannot recapture provenance after video.mp4 changed; render-arm must create a new output directory.', 'STALE_ARTIFACT');
    if (existing.sourceHash && sourceHash && existing.sourceHash !== sourceHash) fail('Source changed between video render and review generation; render a fresh video into a new output directory.', 'STALE_ARTIFACT');
  }
  const value = { schemaVersion: PROVENANCE_VERSION, capturedAt: new Date().toISOString(), sourceDir: boundSource ?? null, sourceHash, videoSha256, reviewSha256: hashReview(reviewDir) };
  writeJsonAtomic(existingFile, value); return value;
}

export function captureVideoProvenance(outDir, sourceDir) {
  const root = resolve(outDir); const video = join(root, 'video.mp4');
  if (!existsSync(video)) fail(`Cannot capture video provenance before video.mp4 exists in ${root}.`, 'INCOMPLETE_ARTIFACT');
  const value = { schemaVersion: 1, capturedAt: new Date().toISOString(), sourceDir: sourceDir ? resolve(sourceDir) : null, sourceHash: sourceDir ? hashTree(resolve(sourceDir)) : null, videoSha256: sha256File(video) };
  writeJsonAtomic(join(root, '.video-provenance.json'), value); return value;
}

export function verifyVideoProvenance(outDir, sourceDir) {
  const root = resolve(outDir); const file = join(root, '.video-provenance.json');
  if (!existsSync(file)) fail(`Missing .video-provenance.json in ${root}; render video.mp4 through the launcher's render-arm first.`, 'UNBOUND_ARTIFACT');
  const value = json(file);
  if (value.videoSha256 !== sha256File(join(root, 'video.mp4'))) fail('video.mp4 changed after render-arm; allocate a new output directory.', 'STALE_ARTIFACT');
  if (sourceDir && value.sourceHash !== hashTree(resolve(sourceDir))) fail('Source changed after render-arm rendered video.mp4; re-render into a new output directory.', 'STALE_ARTIFACT');
  return value;
}

// Shared acceptance for builder previews and canonical outputs: both require an
// explicit completion report from the current identity and verified artifacts.
function acceptReport(runDir, { reportId, role = 'builder', outDir, sourceDir = null, reviewRound = null, revision = null, reviewDir = null }, stage) {
  const state = loadState(runDir); const report = state.reports.find((item) => item.id === reportId);
  if (!report) fail(`${stage === 'preview' ? 'A preview' : 'Canonical output'} requires a recorded completion report: ${reportId}.`, 'MISSING_REPORT');
  if (report.replacedBy) fail(`Completion report ${reportId} was replaced by the builder's later report ${report.replacedBy}; accept that one.`, 'STALE_REPORT');
  if (stage === 'preview') {
    if (role !== 'builder' || report.role !== 'builder' || report.status !== 'preview') fail('accept-preview takes only a builder preview report.', 'INVALID_REPORT');
    if (state.selection) fail('Previews are accepted only before the pick.', 'INVALID_CANONICAL');
    if (state.previews[report.key]) fail(`Builder ${report.key} already has an accepted preview.`, 'DUPLICATE_CANONICAL');
  } else {
    if (report.status === 'preview') fail('A preview is not canonical output; record it with accept-preview. Canonical output starts with the picked builder\'s settled report after its self-check.', 'INVALID_REPORT');
    if (role !== 'builder' || report.role !== 'builder') fail('Only builder completion reports advance canonical output.', 'INVALID_REPORT');
    if (!CANONICAL_STAGES.includes(report.status)) fail('Only an explicit settled, round-done or revision-done report can advance canonical output; a duration-blocked or blocked report never does.', 'INVALID_REPORT');
    if (!state.selection?.winnerKey || report.key !== state.selection.winnerKey) fail('Only the picked builder can advance canonical output, after the pick.', 'INVALID_CANONICAL');
    if (report.status === 'settled' && state.canonical) fail('The picked builder already has an accepted settled canonical.', 'DUPLICATE_CANONICAL');
  }
  const currentRole = roleRecord(state, role, report.key ?? role);
  if (!currentRole || currentRole.agentId !== report.agentId || currentRole.continuationId !== report.continuationId) fail('Canonical report identity is no longer the registered role identity.', 'IDENTITY_CHANGED');
  if (state.consumedReportIds.includes(reportId)) fail(`Completion report ${reportId} was already consumed.`, 'DUPLICATE_REPORT');
  if (pendingDurationBlock(state, report.key)) fail(`Builder ${report.key} has a duration-blocked report awaiting the user's decision; record it with record-duration-decision first.`, 'DURATION_BLOCKED');
  const acceptedOutDirs = state.reports.filter((item) => state.consumedReportIds.includes(item.id) && item.outDir).map((item) => resolve(item.outDir));
  // A self-check that needed no re-render settles on the picked draw's own preview.
  const ownPreview = report.status === 'settled' ? state.previews[report.key]?.outDir ?? null : null;
  if (acceptedOutDirs.includes(resolve(outDir)) && resolve(outDir) !== ownPreview) fail('Canonical output directory was already accepted; allocate a new render version.', 'DUPLICATE_CANONICAL');
  if (!report.outDir || resolve(report.outDir) !== resolve(outDir)) fail('Canonical output differs from the path named in the completion report.', 'MISMATCHED_ARTIFACT');
  if (reviewDir && resolve(reviewDir) !== reviewDirOf(outDir)) fail('Reported review dir does not belong to canonical output.', 'MISMATCHED_ARTIFACT');
  if (report.reviewDir && resolve(report.reviewDir) !== reviewDirOf(outDir)) fail('Completion report review dir does not belong to its output.', 'MISMATCHED_ARTIFACT');
  if (report.status === 'round-done') {
    if (state.polishMode !== 'critic') fail('The piece moved to user polish; a review-round completion can no longer advance canonical output.', 'STALE_REPORT');
    if (reviewRound !== null && reviewRound !== report.reviewRound) fail(`Canonical reviewRound ${reviewRound} conflicts with completion report round ${report.reviewRound}.`, 'MISMATCHED_ARTIFACT');
    if (verdictConvergedYes(latestVerdict(state)?.text)) fail('A completion recorded before a convergence amendment cannot advance after the verdict became converged.', 'STALE_REPORT');
    if (report.reviewRound !== latestVerdictRound(state)) fail('The completion report no longer belongs to the current review round.', 'STALE_REPORT');
  }
  if (report.status === 'revision-done') {
    if (state.polishMode !== 'user') fail('A revision advances canonical output only in user polish (亲自打磨).', 'INVALID_REPORT');
    if (revision !== null && revision !== report.revision) fail(`Canonical revision ${revision} conflicts with completion report revision ${report.revision}.`, 'MISMATCHED_ARTIFACT');
    if (report.revision !== latestNoteRevision(state)) fail('The completion report no longer belongs to the current user note.', 'STALE_REPORT');
  }
  const artifacts = verifyArtifacts(outDir, { sourceDir, spec: state.commission.spec ?? null, durationAuthority: state.commission.durationAuthority });
  state.consumedReportIds.push(reportId);
  const canonicalRound = report.status === 'round-done' ? report.reviewRound : report.status === 'revision-done' ? null : reviewRound;
  const record = { reportId, role, stage: report.status, key: report.key ?? null, outDir: resolve(outDir), reviewRound: canonicalRound, revision: report.status === 'revision-done' ? report.revision : null, reviewDir: reviewDirOf(outDir), video: join(resolve(outDir), 'video.mp4'), artifact: artifacts, artifactSnapshot: artifactSnapshot(outDir, sourceDir ?? artifacts.provenance?.sourceDir ?? null), acceptedAt: new Date().toISOString() };
  if (stage === 'preview') {
    state.previews[report.key] = record;
    if (Object.keys(state.previews).length === state.commission.draws) state.status = 'previews-ready';
  } else {
    state.canonical = record; state.status = report.status === 'round-done' ? 'reviewing' : report.status === 'revision-done' ? 'revised' : 'canonical-ready';
  }
  return saveState(runDir, touch(state));
}

export function acceptPreview(runDir, { reportId, outDir, sourceDir = null, reviewDir = null }) {
  return acceptReport(runDir, { reportId, role: 'builder', outDir, sourceDir, reviewDir }, 'preview');
}

export function acceptCanonical(runDir, options) {
  return acceptReport(runDir, options, 'canonical');
}

export function recordVerdict(runDir, { id, criticId, criticContinuationId, round, reviewDir, verdict, amendmentOf = null, rebuttalOf = null }) {
  const state = loadState(runDir);
  if (!Number.isInteger(round) || round < 1 || !criticId || !criticContinuationId || !reviewDir || typeof verdict !== 'string' || !verdict.trim()) fail('Verdict requires criticId, critic continuationId, positive round, reviewDir, and verbatim text.', 'INVALID_VERDICT');
  if (state.polishMode !== 'critic') fail('The piece is in user polish (亲自打磨): no critic verdict is recorded.', 'INVALID_VERDICT');
  if (!state.roles.critic || state.roles.critic.agentId !== criticId || state.roles.critic.continuationId !== criticContinuationId) fail('Verdict critic identity does not match the persistent critic continuation.', 'IDENTITY_CHANGED');
  if (!state.selection || !state.canonical || resolve(reviewDir) !== resolve(state.canonical.reviewDir)) fail('Verdict requires the picked builder\'s accepted settled canonical (after its self-check) and must name the currently verified canonical review dir; a preview is never reviewed.', 'STALE_VERDICT');
  verifyArtifacts(state.canonical.outDir, { sourceDir: state.canonical.artifact?.provenance?.sourceDir ?? null, spec: state.commission.spec ?? null, durationAuthority: state.commission.durationAuthority });
  assertArtifactSnapshot(state.canonical);
  if (!/(?:^|\r?\n)CONVERGED:\s*(YES|NO)\s*\r?\n?$/.test(verdict)) fail('Verdict must end with exactly CONVERGED: YES or CONVERGED: NO.', 'INVALID_VERDICT');
  if (!/OVERALL/i.test(verdict)) fail('Verdict is missing OVERALL judgment.', 'INVALID_VERDICT');
  const latestRound = latestVerdictRound(state);
  const prior = (state.verdicts ?? []).filter((item) => item.round === round).at(-1) ?? null;
  const amendment = round === latestRound && prior;
  if (round < latestRound || (round === latestRound && !amendment) || round > latestRound + 1) {
    fail(`Review rounds must be sequential; expected ${latestRound + 1}, got ${round}.`, 'STALE_VERDICT');
  }
  if (state.verdicts.some((item) => item.id === id)) fail(`Duplicate verdict id: ${id}.`, 'DUPLICATE_VERDICT');
  if (amendment) {
    const supersedes = amendmentOf ?? rebuttalOf;
    if (!supersedes || supersedes !== prior.id) fail(`A same-round verdict revision must explicitly supersede the current verdict ${prior.id}.`, 'INVALID_VERDICT');
    if (resolve(reviewDir) !== resolve(prior.reviewDir)) fail('A same-round rebuttal must review the same review dir as the verdict it amends.', 'STALE_VERDICT');
  } else if (verdictConvergedYes(latestVerdict(state)?.text)) {
    fail('After convergence no new review round follows: amend the converged verdict in its own round, or switch to user polish at the final gate.', 'STALE_VERDICT');
  }
  if (round > 1 && state.canonical.reviewRound !== round - 1) fail(`Review round ${round} requires an accepted canonical from round ${round - 1}.`, 'STALE_VERDICT');
  const record = { id: id ?? `verdict-r${round}${amendment ? `-amend-${prior.id}` : ''}`, criticId, criticContinuationId, round, reviewDir: resolve(reviewDir), video: state.canonical.video ?? join(state.canonical.outDir, 'video.mp4'), text: verdict, recordedAt: new Date().toISOString() };
  if (amendment) { record.amendmentOf = prior.id; record.rebuttalOf = rebuttalOf ?? amendmentOf; record.replaces = prior.text; }
  state.verdicts.push(record);
  state.verdictHistory = [...(state.verdictHistory ?? []), { ...record, supersedes: amendment ? prior.id : null }];
  state.handoffs.push({ id: `handoff-${record.id}`, type: amendment ? 'critic-verdict-amendment' : 'critic-verdict', from: criticId, to: state.roles.builders[state.selection.winnerKey]?.agentId ?? null, round, reviewDir: record.reviewDir, verbatim: verdict, amendmentOf: record.amendmentOf ?? null });
  return saveState(runDir, touch(state));
}

export function prepareSelection(runDir, { candidates, evidenceDir = null }) {
  const state = loadState(runDir);
  if (state.selection) fail('Selection already recorded; a run may have one pick.', 'DUPLICATE_SELECTION');
  if (state.selectionPreparation && !state.selectionPreparation.consumedAt) fail('Selection evidence is already prepared; consume it with record-selection or use a new run.', 'DUPLICATE_SELECTION');
  if (!Array.isArray(candidates) || candidates.length !== state.commission.draws) fail(`Selection preparation requires exactly N=${state.commission.draws} candidates.`, 'INVALID_SELECTION');
  const labels = candidates.map((candidate) => candidate?.label); const keys = candidates.map((candidate) => candidate?.key);
  if (new Set(labels).size !== labels.length || labels.some((label) => typeof label !== 'string' || !/^[A-Z]$/.test(label))) fail('Candidates must use unique anonymous labels A-Z.', 'INVALID_SELECTION');
  if (new Set(keys).size !== keys.length || keys.some((key) => typeof key !== 'string' || !/^draw-\d+$/.test(key))) fail('Candidates must refer to unique draw-N keys.', 'INVALID_SELECTION');
  const expectedKeys = Object.keys(state.previews).sort();
  if (expectedKeys.length !== state.commission.draws || keys.slice().sort().join('\0') !== expectedKeys.join('\0')) fail('Selection preparation requires every accepted preview of the current draws exactly once.', 'INVALID_SELECTION');
  // Each batch of draws (the first, then one per redraw) gets its own evidence root.
  const batch = (state.redraws ?? []).length;
  const root = resolve(evidenceDir ?? join(runDir, '.remotion-director', batch ? `selection-evidence-${batch + 1}` : 'selection-evidence'));
  const rootExisted = existsSync(root);
  if (existsSync(root)) {
    if (!statSync(root).isDirectory() || readdirSync(root).length) fail(`Selection evidence directory must be new or empty: ${root}`, 'INVALID_SELECTION');
  } else mkdirSync(dirname(root), { recursive: true });
  const stagingRoot = `${root}.tmp-${process.pid}-${Date.now()}`;
  mkdirSync(stagingRoot, { recursive: true });
  const prepared = [];
  try { for (const candidate of candidates) {
    const preview = state.previews[candidate.key];
    if (!preview || preview.role !== 'builder') fail(`Candidate ${candidate.label} is not backed by an accepted preview.`, 'INVALID_SELECTION');
    const artifacts = verifyArtifacts(preview.outDir, { sourceDir: preview.artifact?.provenance?.sourceDir ?? null, spec: state.commission.spec ?? null, durationAuthority: state.commission.durationAuthority });
    assertArtifactSnapshot(preview);
    if (resolve(preview.reviewDir) !== reviewDirOf(preview.outDir)) fail(`Preview review dir for ${candidate.key} is mismatched.`, 'MISMATCHED_ARTIFACT');
    // The anonymous copy holds exactly what the selector reads: the video and
    // the listed review pages and settle frames, plus a sanitized overview.json.
    const destination = join(stagingRoot, candidate.label); const reviewCopy = join(destination, REVIEW_DIR);
    mkdirSync(reviewCopy, { recursive: true });
    cpSync(join(preview.outDir, 'video.mp4'), join(destination, 'video.mp4'));
    for (const name of listedReviewFiles(artifacts.overview)) cpSync(join(preview.reviewDir, name), join(reviewCopy, name));
    writeJsonAtomic(join(reviewCopy, OVERVIEW_FILE), sanitizeOverview(artifacts.overview));
    const snapshot = verifyPreparedEvidence(destination);
    prepared.push({ label: candidate.label, key: candidate.key, previewOutDir: preview.outDir, previewReviewDir: preview.reviewDir, evidenceDir: destination, evidenceHash: snapshot.hash });
  } } catch (error) {
    rmSync(stagingRoot, { recursive: true, force: true });
    throw error;
  }
  if (rootExisted) {
    for (const label of readdirSync(stagingRoot)) renameSync(join(stagingRoot, label), join(root, label));
    rmSync(stagingRoot, { recursive: true, force: true });
  } else renameSync(stagingRoot, root);
  for (const candidate of prepared) {
    candidate.evidenceDir = join(root, basename(candidate.evidenceDir));
    candidate.video = join(candidate.evidenceDir, 'video.mp4');
    candidate.reviewDir = join(candidate.evidenceDir, REVIEW_DIR);
  }
  state.selectionPreparation = { evidenceDir: root, preparedAt: new Date().toISOString(), consumedAt: null, candidates: prepared };
  state.status = 'selection-ready';
  const selectorCandidates = prepared.map(({ label, evidenceDir: candidateEvidenceDir, video, reviewDir }) => ({ label, evidenceDir: candidateEvidenceDir, video, reviewDir }));
  return saveState(runDir, touch(state)) && { status: state.status, selectorSafe: true, evidenceDir: root, candidates: selectorCandidates };
}

export function recordSelection(runDir, { selectorId, selectorContinuationId, winner, candidates, reason, evidenceDir = null }) {
  const state = loadState(runDir);
  if (!state.roles.selector || state.roles.selector.agentId !== selectorId || state.roles.selector.continuationId !== selectorContinuationId) fail('Selection identity does not match the registered selector.', 'IDENTITY_CHANGED');
  if (state.selection) fail('Selection already recorded; a run may have one pick.', 'DUPLICATE_SELECTION');
  const preparation = state.selectionPreparation;
  if (!preparation || preparation.consumedAt) fail('Selection requires a fresh prepare-selection evidence snapshot.', 'MISSING_PREPARATION');
  if (!Array.isArray(candidates) || candidates.length !== state.commission.draws) fail(`Selection requires exactly N=${state.commission.draws} anonymous candidates.`, 'INVALID_SELECTION');
  const labels = candidates.map((candidate) => candidate?.label);
  if (new Set(labels).size !== labels.length || labels.some((label) => typeof label !== 'string' || !/^[A-Z]$/.test(label))) fail('Candidates must use unique anonymous labels A-Z.', 'INVALID_SELECTION');
  if (resolve(evidenceDir ?? preparation.evidenceDir) !== resolve(preparation.evidenceDir)) fail('Selection evidence directory differs from the prepared snapshot.', 'STALE_SELECTION');
  const preparedByLabel = new Map(preparation.candidates.map((candidate) => [candidate.label, candidate]));
  if (preparedByLabel.size !== candidates.length) fail('Selection labels do not match prepared evidence.', 'STALE_SELECTION');
  for (const candidate of candidates) {
    const prepared = preparedByLabel.get(candidate.label);
    if (!prepared || prepared.key !== candidate.key) fail(`Selection candidate ${candidate.label} does not match prepared draw mapping.`, 'STALE_SELECTION');
    const preview = state.previews[prepared.key];
    if (!preview || preview.outDir !== prepared.previewOutDir) fail(`Accepted preview for ${candidate.label} changed after preparation.`, 'STALE_SELECTION');
    verifyArtifacts(preview.outDir, { sourceDir: preview.artifact?.provenance?.sourceDir ?? null, spec: state.commission.spec ?? null, durationAuthority: state.commission.durationAuthority });
    assertArtifactSnapshot(preview);
    const snapshot = verifyPreparedEvidence(prepared.evidenceDir);
    if (snapshot.hash !== prepared.evidenceHash) fail(`Prepared evidence for ${candidate.label} changed after preparation.`, 'STALE_SELECTION');
  }
  if (!labels.includes(winner)) fail(`Winner ${winner} is not one of the anonymous candidates.`, 'INVALID_SELECTION');
  if (typeof reason !== 'string' || !reason.trim()) fail('Blind selection needs a verbatim pixel-grounded reason.', 'INVALID_SELECTION');
  const winnerCandidate = candidates.find((candidate) => candidate.label === winner);
  preparation.consumedAt = new Date().toISOString();
  state.selection = { by: 'selector', selectorId, selectorContinuationId, winner, winnerKey: winnerCandidate.key, kept: [], candidates: candidates.map((candidate) => ({ label: candidate.label, key: candidate.key, evidenceDir: preparedByLabel.get(candidate.label).evidenceDir })), reason, evidenceDir: resolve(preparation.evidenceDir), recordedAt: new Date().toISOString() };
  // The pick does not create canonical output: the picked builder self-checks
  // first and its settled report is the first canonical that is polished.
  endLosingBuilders(state, [winnerCandidate.key]);
  state.status = 'selected';
  return saveState(runDir, touch(state));
}

// Losing draws end at their preview: no self-check, no further renders.  Draws
// the user kept with the pick stay alive, idle, until next-kept takes them up.
function endLosingBuilders(state, liveKeys) {
  for (const [key, builder] of Object.entries(state.roles.builders)) if (!liveKeys.includes(key)) builder.status = 'ended';
}

// By default the user picks the base by watching the draws' preview videos.
// No selector identity or anonymous evidence is involved. The pick still needs
// every preview of the current draws accepted and re-verified, so it cannot land
// on a draw that is still rendering or whose pixels changed.  When the user
// wants more than one draw ("AC我都想要"), the others are kept in the order
// given; each later becomes the current piece through next-kept.
export function recordUserSelection(runDir, { winnerKey, reason = '', alsoKeep = [] }) {
  const state = loadState(runDir);
  if (state.selection) fail('Selection already recorded; a run has one pick, which keeps any further draws the user wants with alsoKeep (--also-keep); next-kept takes them up in turn.', 'DUPLICATE_SELECTION');
  const keys = Object.keys(state.previews).sort();
  if (keys.length !== state.commission.draws) fail(`User selection requires all N=${state.commission.draws} previews accepted first.`, 'INVALID_SELECTION');
  if (typeof winnerKey !== 'string' || !keys.includes(winnerKey)) fail(`Winner ${winnerKey} is not an accepted draw (${keys.join(', ')}).`, 'INVALID_SELECTION');
  if (!Array.isArray(alsoKeep)) fail('alsoKeep must be a list of draw keys.', 'INVALID_SELECTION');
  const kept = [];
  for (const key of alsoKeep) {
    if (typeof key !== 'string' || !keys.includes(key)) fail(`Kept draw ${key} is not an accepted preview of the current draws (${keys.join(', ')}).`, 'INVALID_SELECTION');
    if (key === winnerKey) fail(`Kept draw ${key} is the pick itself; --also-keep names the other draws the user keeps.`, 'INVALID_SELECTION');
    if (kept.includes(key)) fail(`Kept draw ${key} is named twice.`, 'INVALID_SELECTION');
    if (pendingDurationBlock(state, key)) fail(`Kept draw ${key} has a duration-blocked report awaiting the user's decision; record it with record-duration-decision first.`, 'DURATION_BLOCKED');
    kept.push(key);
  }
  for (const key of keys) {
    const preview = state.previews[key];
    if (!preview || preview.role !== 'builder') fail(`Draw ${key} is not backed by an accepted preview.`, 'INVALID_SELECTION');
    verifyArtifacts(preview.outDir, { sourceDir: preview.artifact?.provenance?.sourceDir ?? null, spec: state.commission.spec ?? null, durationAuthority: state.commission.durationAuthority });
    assertArtifactSnapshot(preview);
  }
  if (typeof reason !== 'string') fail('User selection reason must be text when given.', 'INVALID_SELECTION');
  if (state.selectionPreparation && !state.selectionPreparation.consumedAt) state.selectionPreparation.consumedAt = new Date().toISOString();
  // Each kept piece starts from the duration authority the pick was made under.
  state.selection = { by: 'user', winnerKey, kept, candidates: keys.map((key) => ({ key, outDir: state.previews[key].outDir })), reason: reason.trim(), durationAuthority: state.commission.durationAuthority, recordedAt: new Date().toISOString() };
  endLosingBuilders(state, [winnerKey, ...kept]);
  state.status = 'selected';
  return saveState(runDir, touch(state));
}

// The next kept draw becomes the current piece.  The current piece needs its
// accepted settled canonical (whether the user has finished polishing it is
// the host's call).  It is archived into `finished` with everything that
// belongs to it, stays readable and verifiable there, and never advances
// again: its builder and its critic end.  The kept draw then starts like a
// fresh pick (self-check → settled → polish) with nothing of the archived
// piece in view: no canonical, verdicts, user notes, handoffs or critic, the
// commission's own polish mode (undoing a switch-polish of the archived piece)
// and the duration authority the pick was made under (undoing a free decision
// that answered the archived piece's builder; a locked total stays a promise
// for every piece).  Review rounds and note revisions count from 1 again.
export function nextKept(runDir, { key }) {
  const state = loadState(runDir);
  if (!state.selection) fail('next-kept follows a pick that kept more than one draw; no pick is recorded yet.', 'INVALID_KEPT');
  const kept = keptKeys(state);
  if (typeof key !== 'string' || !kept.includes(key)) fail(`${key} is not a kept draw; next-kept takes up a draw kept at the pick (${kept.length ? kept.join(', ') : 'none kept'}).`, 'INVALID_KEPT');
  const current = state.selection.winnerKey;
  if (!state.canonical) fail(`The current piece ${current} has no accepted settled canonical yet; carry it through its self-check to settled first.`, 'INVALID_KEPT');
  if (pendingDurationBlock(state, current)) fail(`Builder ${current} has a duration-blocked report awaiting the user's decision; record it with record-duration-decision first.`, 'DURATION_BLOCKED');
  const builder = state.roles.builders[key];
  if (!builder || builder.status === 'ended') fail(`Kept draw ${key} has no live builder.`, 'INVALID_KEPT');
  verifyArtifacts(state.canonical.outDir, { sourceDir: state.canonical.artifact?.provenance?.sourceDir ?? null, spec: state.commission.spec ?? null, durationAuthority: state.commission.durationAuthority });
  assertArtifactSnapshot(state.canonical);
  const critic = state.roles.critic;
  if (critic) critic.status = 'ended';
  if (state.roles.builders[current]) state.roles.builders[current].status = 'ended';
  const next = { key, polishMode: state.commission.polish, durationAuthority: state.selection.durationAuthority ?? state.commission.durationAuthority };
  state.finished.push({
    piece: state.finished.length + 1, key: current, canonical: state.canonical,
    verdicts: state.verdicts, verdictHistory: state.verdictHistory ?? [], userNotes: state.userNotes, handoffs: state.handoffs, critic,
    polishMode: state.polishMode, polishSwitches: state.polishSwitches,
    // Duration decisions stay in the run's log too: they answer reports there.
    durationAuthority: state.commission.durationAuthority, durationDecisions: state.durationDecisions.filter((item) => item.key === current),
    next, finishedAt: new Date().toISOString(),
  });
  state.selection.winnerKey = key;
  state.selection.kept = kept.filter((item) => item !== key);
  state.roles.critic = null;
  state.canonical = null; state.verdicts = []; state.verdictHistory = []; state.userNotes = []; state.handoffs = []; state.polishSwitches = [];
  state.polishMode = next.polishMode; state.commission.durationAuthority = next.durationAuthority;
  state.status = 'selected';
  return saveState(runDir, touch(state));
}

// "都不要，再抽": after seeing every preview the user rejects them all. The
// current draws end (no self-check) and are archived with their previews and
// their batch's directions; a fresh lister then records a fresh, independent
// list, and N fresh builders register under new draw keys, one direction each.
// The user's optional comment is kept as given; when the orchestrator folded it
// into the brief, the updated brief's hash replaces the commission's.
export function recordRedraw(runDir, { reason = '', briefHash = null } = {}) {
  const state = loadState(runDir);
  if (state.selection) fail('A pick is already recorded; a redraw replaces the draws only before the pick.', 'INVALID_REDRAW');
  const keys = Object.keys(state.previews).sort();
  if (keys.length !== state.commission.draws) fail(`A redraw follows the user seeing all N=${state.commission.draws} previews; accept every preview first.`, 'INVALID_REDRAW');
  if (typeof reason !== 'string') fail('Redraw reason must be text when given.', 'INVALID_REDRAW');
  if (briefHash !== null) {
    if (typeof briefHash !== 'string' || !/^[a-f0-9]{8,128}$/i.test(briefHash)) fail('briefHash must be a hexadecimal provenance hash.', 'INVALID_REDRAW');
    if (!reason.trim()) fail('An updated brief comes from the user\'s comment; record their words with it.', 'INVALID_REDRAW');
    if (briefHash.toLowerCase() === state.commission.briefHash) fail('The updated brief hash equals the current brief; omit it when the brief did not change.', 'INVALID_REDRAW');
  }
  const briefHashBefore = state.commission.briefHash;
  const briefHashAfter = briefHash === null ? briefHashBefore : briefHash.toLowerCase();
  const builders = state.roles.builders; const selector = state.roles.selector; const lister = state.roles.lister;
  for (const builder of Object.values(builders)) builder.status = 'ended';
  if (selector) selector.status = 'ended';
  if (lister) lister.status = 'ended';
  state.redraws.push({ batch: state.redraws.length + 1, lister, directions: state.directions, builders, selector, previews: state.previews, selectionPreparation: state.selectionPreparation, reason: reason.trim(), briefHashBefore, briefHash: briefHashAfter, recordedAt: new Date().toISOString() });
  state.commission.briefHash = briefHashAfter;
  state.roles.builders = {}; state.roles.selector = null; state.roles.lister = null; state.directions = null; state.previews = {}; state.selectionPreparation = null;
  state.status = 'redrawing';
  return saveState(runDir, touch(state));
}

// 亲自打磨: the user watches the current canonical video, and whatever they
// volunteer is recorded verbatim as revision K before it is ferried to the
// picked builder.  The builder answers with revision-done K; the next note
// needs that revision accepted, so every note comments on a video the user saw.
export function recordUserNote(runDir, { id = null, revision, note }) {
  const state = loadState(runDir);
  if (state.polishMode !== 'user') fail('User notes belong to user polish (亲自打磨). In the critic loop the critic reviews; after it converges, switch-polish --mode user moves the piece to user polish.', 'INVALID_POLISH');
  if (!state.selection?.winnerKey || !state.canonical) fail('A user note comments on the picked builder\'s accepted canonical; accept its settled report first.', 'INVALID_NOTE');
  if (typeof note !== 'string' || !note.trim()) fail('A user note is the user\'s own words, verbatim; it cannot be empty.', 'INVALID_NOTE');
  const expected = latestNoteRevision(state) + 1;
  if (!Number.isInteger(revision) || revision !== expected) fail(`User notes are numbered in order; expected revision ${expected}, got ${revision}.`, 'INVALID_NOTE');
  if (revision > 1 && !(state.canonical.stage === 'revision-done' && state.canonical.revision === revision - 1)) fail(`Revision ${revision} needs revision ${revision - 1} accepted first; the user comments on the video they just watched.`, 'STALE_NOTE');
  const noteId = id ?? `note-${revision}`;
  if (state.userNotes.some((item) => item.id === noteId)) fail(`Duplicate user note id: ${noteId}.`, 'DUPLICATE_NOTE');
  verifyArtifacts(state.canonical.outDir, { sourceDir: state.canonical.artifact?.provenance?.sourceDir ?? null, spec: state.commission.spec ?? null, durationAuthority: state.commission.durationAuthority });
  assertArtifactSnapshot(state.canonical);
  const record = { id: noteId, revision, text: note, sha256: createHash('sha256').update(note).digest('hex'), outDir: state.canonical.outDir, video: state.canonical.video, videoSha256: state.canonical.artifactSnapshot.videoSha256, recordedAt: new Date().toISOString() };
  state.userNotes.push(record);
  state.handoffs.push({ id: `handoff-${noteId}`, type: 'user-note', from: 'user', to: state.roles.builders[state.selection.winnerKey]?.agentId ?? null, revision, outDir: record.outDir, verbatim: note });
  state.status = 'revising';
  return saveState(runDir, touch(state));
}

// At the final gate after the critic loop, a user comment moves the piece to
// user polish from the converged canonical; the critic ends there.
export function switchPolish(runDir, { mode, reason = '' }) {
  const state = loadState(runDir);
  if (mode !== 'user') fail('Polishing switches only from the critic loop to user polish (亲自打磨): use --mode user.', 'INVALID_POLISH');
  if (state.polishMode === 'user') fail('The piece is already in user polish.', 'INVALID_POLISH');
  if (typeof reason !== 'string') fail('Switch reason must be text when given.', 'INVALID_POLISH');
  const latest = latestVerdict(state);
  if (!latest || !verdictConvergedYes(latest.text)) fail('Switch to user polish at the final gate, after the critic converged; until then the critic loop runs.', 'INVALID_POLISH');
  if (!state.canonical || resolve(latest.reviewDir) !== resolve(state.canonical.reviewDir)) fail('The converged verdict does not review the current canonical.', 'STALE_VERDICT');
  verifyArtifacts(state.canonical.outDir, { sourceDir: state.canonical.artifact?.provenance?.sourceDir ?? null, spec: state.commission.spec ?? null, durationAuthority: state.commission.durationAuthority });
  assertArtifactSnapshot(state.canonical);
  if (state.roles.critic) state.roles.critic.status = 'ended';
  state.polishSwitches.push({ from: 'critic', to: 'user', afterRound: latest.round, outDir: state.canonical.outDir, reason: reason.trim(), recordedAt: new Date().toISOString() });
  state.polishMode = 'user'; state.status = 'user-polish';
  return saveState(runDir, touch(state));
}

// The user's answer to a duration-blocked report: keep the locked total
// (`locked`; the builder makes the piece fit as it stands) or relax it to
// `free` (the length becomes the builder's own for the rest of the run).
export function recordDurationDecision(runDir, { reportId, decision }) {
  const state = loadState(runDir);
  const report = state.reports.find((item) => item.id === reportId);
  if (!report || report.status !== 'duration-blocked') fail(`No duration-blocked report ${reportId}.`, 'MISSING_REPORT');
  if (state.durationDecisions.some((item) => item.reportId === reportId)) fail(`The user's decision on ${reportId} is already recorded.`, 'DUPLICATE_DECISION');
  if (!['locked', 'free'].includes(decision)) fail('The duration decision is locked (keep the commissioned total) or free (relax it to the designer).', 'INVALID_DECISION');
  const previous = state.commission.durationAuthority;
  if (decision === 'locked' && !isLocked(previous)) fail(`The lock was already relaxed to ${previous}; there is no locked total to keep.`, 'INVALID_DECISION');
  if (decision === 'free') state.commission.durationAuthority = 'free';
  state.durationDecisions.push({ reportId, key: report.key, decision, previousAuthority: previous, authority: state.commission.durationAuthority, recordedAt: new Date().toISOString() });
  return saveState(runDir, touch(state));
}

export function recoverRole(runDir, { role, key = role, previousAgentId, replacementAgentId, replacementContinuationId, reason, userWords = null }) {
  const state = loadState(runDir); const current = roleRecord(state, role, key);
  if (!current || current.agentId !== previousAgentId) fail('Recovery must identify the currently registered role identity.', 'IDENTITY_CHANGED');
  if (!replacementAgentId || !replacementContinuationId || !reason?.trim()) fail('Recovery requires a replacement identity and explicit reason.', 'INVALID_RECOVERY');
  if (current.status === 'recovered') fail('Role already recovered; recovery cannot silently chain.', 'DUPLICATE_RECOVERY');
  if (current.status === 'ended') fail('An ended role (a draw not picked or replaced by a redraw, the builder of a finished piece, or the critic after the switch to user polish) is not recovered.', 'INVALID_RECOVERY');
  // A builder with a preview holds its piece's design in its context; a fresh
  // replacement could only read the piece back. Only the user may choose that,
  // and only the user may let a builder's recovery chain.
  if (role === 'builder' && !userWords?.trim()) {
    if (state.previews[key]) fail(`Builder ${key} has a preview, so its context holds the piece's design. Continue it with followup_task to its handle; the host reloads a saved child. If the host says it no longer exists, stop and tell the user. Recover it only if they choose that, with their words in --user-words-file.`, 'USER_DECISION_REQUIRED');
    if (current.parentId) fail(`Builder ${key} was already recovered once; recovery cannot silently chain. Stop and tell the user. Recover it again only if they choose that, with their words in --user-words-file.`, 'DUPLICATE_RECOVERY');
  }
  const otherRoles = [...liveRoles(state), ...endedRoles(state)].filter((item) => item !== current);
  if (otherRoles.some((item) => item.agentId === replacementAgentId || item.continuationId === replacementContinuationId)) fail('Replacement identity is already registered to another role.', 'IDENTITY_CHANGED');
  current.status = 'recovered';
  const userDecision = userWords?.trim() ? userWords : null;
  const replacement = { ...current, agentId: replacementAgentId, continuationId: replacementContinuationId, parentId: previousAgentId, fresh: true, degraded: true, status: 'running', recoveredAt: new Date().toISOString(), recoveryReason: reason, userDecision, continuations: 1 };
  if (role === 'builder') state.roles.builders[key] = replacement; else state.roles[role] = replacement;
  state.recoveries.push({ role, key, previousAgentId, replacementAgentId, replacementContinuationId, reason, userDecision, degraded: true, recordedAt: new Date().toISOString() });
  return saveState(runDir, touch(state));
}

export function status(runDir) { return loadState(runDir); }
