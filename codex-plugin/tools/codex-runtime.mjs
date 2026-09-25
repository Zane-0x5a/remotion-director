#!/usr/bin/env node
/**
 * Dependency-free run ledger and artifact verifier used by the generated Codex
 * package.  The ledger is deliberately boring JSON: agents can inspect it in one
 * read, and a completion report is required before canonical output advances.
 */
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync, renameSync, rmSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';

export const SCHEMA_VERSION = 1;
export const STATE_FILE = '.remotion-director/codex-run.json';

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
      // Source provenance covers author inputs only. Render outputs and this
      // ledger are generated after the video and must not make an otherwise
      // identical source appear changed during strip extraction.
      if (prefix === '' && new Set(['out', '.remotion-director', 'node_modules', 'artifact-manifest.json', '.video-provenance.json', 'strip-manifest.json', 'critic-crops', 'FIXES.md', 'CRITIC-VERDICTS.md', 'DESIGN.md', 'TEMPO.md']).has(name)) continue;
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
  return value;
}
export function saveState(runDir, value) { writeJsonAtomic(statePath(runDir), value); return value; }

export function initRun({ runDir, briefHash, draws, durationAuthority, spec = {}, runId = undefined }) {
  const root = resolve(runDir);
  if (!briefHash || !/^[a-f0-9]{8,128}$/i.test(briefHash)) fail('briefHash must be a hexadecimal provenance hash.', 'INVALID_COMMISSION');
  if (!Number.isInteger(draws) || draws < 1) fail('draws must be a positive integer.', 'INVALID_COMMISSION');
  if (!(durationAuthority === 'free' || /^locked\s+\d+(?:\.\d+)?s$/.test(durationAuthority))) fail('durationAuthority must be free or locked <seconds>s.', 'INVALID_COMMISSION');
  if (existsSync(statePath(root))) fail(`Run already initialized at ${statePath(root)}; use status or a new run directory.`, 'DUPLICATE_RUN');
  const now = new Date().toISOString();
  return saveState(root, {
    schemaVersion: SCHEMA_VERSION, runId: runId ?? `${basename(root)}-${Date.now()}`,
    createdAt: now, updatedAt: now, status: 'commissioned',
    commission: { briefHash: briefHash.toLowerCase(), draws, durationAuthority, spec },
    roles: { builders: {}, selector: null, critic: null, tempo: null },
    reports: [], handoffs: [], verdicts: [], verdictHistory: [], canonical: null, consumedReportIds: [],
    canonicals: {}, selection: null, selectionPreparation: null, recoveries: [],
  });
}

function touch(state) { state.updatedAt = new Date().toISOString(); return state; }
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

export function registerRole(runDir, { role, key = role, agentId, continuationId, parentId = null, fresh = false }) {
  const state = loadState(runDir);
  if (!agentId || !continuationId) fail('agentId and continuationId are required; identity must be explicit.', 'INVALID_ROLE');
  if (!fresh) fail('Initial role registration must assert fresh:true; continuations use continue-role.', 'INVALID_ROLE');
  const existingRoles = [...Object.values(state.roles.builders), ...['selector', 'critic', 'tempo'].map((name) => state.roles[name]).filter(Boolean)];
  if (existingRoles.some((item) => item.agentId === agentId || item.continuationId === continuationId)) fail('Each initial role must use a distinct agentId and continuationId.', 'IDENTITY_CHANGED');
  const record = { role, key, agentId, continuationId, parentId, fresh, startedAt: new Date().toISOString(), status: 'running', continuations: 1 };
  if (role === 'builder') {
    if (!/^draw-\d+$/.test(key)) fail('Builder key must be draw-N.', 'INVALID_ROLE');
    if (state.roles.builders[key]) fail(`Builder ${key} is already registered; continue the same agent instead.`, 'IDENTITY_CHANGED');
    if (Object.keys(state.roles.builders).length >= state.commission.draws) fail('Builder count exceeds commissioned N.', 'INVALID_ROLE');
    state.roles.builders[key] = record;
  }
  else if (['selector', 'critic', 'tempo'].includes(role)) {
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
  current.continuations += 1; current.lastMessageHash = messageHash; current.status = 'running';
  return saveState(runDir, touch(state));
}

export function recordReport(runDir, report) {
  const state = loadState(runDir);
  if (!report?.id || !report.role || !report.status) fail('Completion report needs id, role, and status.', 'INVALID_REPORT');
  unique(state, report.id, 'report');
  if (!['settled', 'round-done', 'done', 'blocked'].includes(report.status)) fail(`Unknown completion status ${report.status}.`, 'INVALID_REPORT');
  if (!report.agentId || !report.continuationId) fail('Completion report must name the actual agent and continuation.', 'INVALID_REPORT');
  const role = roleRecord(state, report.role, report.key ?? report.role);
  if (!role || role.agentId !== report.agentId || role.continuationId !== report.continuationId) fail('Completion report identity does not match a registered role.', 'IDENTITY_CHANGED');
  if (['settled', 'round-done', 'done'].includes(report.status) && !report.outDir) fail('Successful completion report must name its actual outDir.', 'INVALID_REPORT');
  if (report.status === 'blocked' && report.outDir) fail('Blocked report cannot advance an output.', 'INVALID_REPORT');
  if (report.status === 'settled' && report.role !== 'builder') fail('Only a builder can report settled.', 'INVALID_REPORT');
  if (report.status === 'round-done' && report.role !== 'builder') fail('Only a builder can report round-done.', 'INVALID_REPORT');
  if (report.status === 'done' && report.role !== 'tempo') fail('Only the tempo pass can report done.', 'INVALID_REPORT');
  if (report.role === 'builder' && !report.key) fail('Builder completion report must name draw-N key.', 'INVALID_REPORT');
  if (report.status === 'round-done') {
    if (!Number.isInteger(report.reviewRound) || report.reviewRound < 1) fail('round-done report must name a positive reviewRound.', 'INVALID_REPORT');
    if (report.reviewRound !== latestVerdictRound(state)) fail(`round-done must follow verdict round ${latestVerdictRound(state)}; got ${report.reviewRound}.`, 'STALE_REPORT');
    if (!state.selection?.winnerKey || report.key !== state.selection.winnerKey) fail('Only the selected winning builder may complete a review round.', 'INVALID_REPORT');
    if (verdictConvergedYes(latestVerdict(state)?.text)) fail('A converged verdict cannot be followed by a builder round; run the tempo pass or amend the same verdict first.', 'INVALID_REPORT');
  }
  if (report.role === 'tempo' && report.status === 'done' && !verdictConvergedYes(latestVerdict(state)?.text)) fail('Tempo can complete only after the critic has converged.', 'INVALID_REPORT');
  if (report.status !== 'blocked' && state.reports.some((item) => item.role === report.role && (item.key ?? null) === (report.key ?? null) && item.status === report.status && (report.status !== 'round-done' || item.reviewRound === report.reviewRound))) fail('A successful stage completion was already recorded for this role.', 'DUPLICATE_REPORT');
  state.reports.push({ ...report, recordedAt: new Date().toISOString() });
  return saveState(runDir, touch(state));
}

function pngFiles(dir, prefix) { return readdirSync(dir).filter((name) => name.startsWith(prefix) && name.toLowerCase().endsWith('.png')); }
function childPath(root, name, label) {
  if (typeof name !== 'string' || !name || name !== basename(name)) fail(`${label} must be a file name inside ${root}.`, 'MISMATCHED_ARTIFACT');
  return join(resolve(root), name);
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
function sanitizeEvidenceManifest(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('Strip manifest must be an object.', 'CORRUPT_ARTIFACT');
  const result = {};
  for (const key of ['mode', 'pHigh', 'lowFrac', 'shortMax', 'spanPerMid', 'high', 'low']) if (value[key] !== undefined && (typeof value[key] === 'string' || typeof value[key] === 'number')) result[key] = value[key];
  if (value.counts && typeof value.counts === 'object') {
    const counts = {};
    for (const key of ['held', 'mid']) if (Number.isInteger(value.counts[key])) counts[key] = value.counts[key];
    if (Object.keys(counts).length) result.counts = counts;
  }
  if (Array.isArray(value.segments)) result.segments = value.segments.map((segment) => {
    const item = {};
    if (segment.kind === 'pause' || segment.kind === 'motion') item.kind = segment.kind;
    for (const key of ['start', 'end']) if (Number.isInteger(segment[key])) item[key] = segment[key];
    if (Array.isArray(segment.reps)) item.reps = segment.reps.filter(Number.isInteger);
    return item;
  }).filter((segment) => segment.kind && Number.isInteger(segment.start) && Number.isInteger(segment.end));
  if (Array.isArray(value.frames)) result.frames = value.frames.map((frame) => {
    const item = {};
    if (Number.isInteger(frame.frame)) item.frame = frame.frame;
    if (frame.role === 'held' || frame.role === 'mid') item.role = frame.role;
    for (const key of ['dIn', 'dOut']) if (typeof frame[key] === 'number' && Number.isFinite(frame[key])) item[key] = frame[key];
    // This is a local evidence filename, never an absolute/source path.
    const name = frame.file ?? frame.filename;
    if (typeof name === 'string' && name === basename(name) && name.toLowerCase().endsWith('.png')) item.file = name;
    return item;
  }).filter((frame) => Number.isInteger(frame.frame) && frame.role && frame.file);
  if (!result.frames?.length) fail('Strip manifest has no safe evidence frame list.', 'CORRUPT_ARTIFACT');
  return result;
}
function verifyPreparedEvidence(directory) {
  const root = resolve(directory);
  if (!existsSync(root) || !statSync(root).isDirectory()) fail(`Prepared evidence directory is missing: ${root}`, 'STALE_SELECTION');
  const stills = pngFiles(root, 'still-');
  if (stills.length !== 6) fail(`Prepared evidence must contain six stills in ${root}.`, 'STALE_SELECTION');
  for (const file of stills) verifyPngStructure(join(root, file));
  const manifestFile = join(root, 'strip-manifest.json');
  if (!existsSync(manifestFile)) fail(`Prepared evidence is missing strip-manifest.json: ${root}`, 'STALE_SELECTION');
  const manifest = json(manifestFile);
  if (!Array.isArray(manifest.frames) || !manifest.frames.length) fail(`Prepared evidence strip manifest is malformed: ${manifestFile}`, 'STALE_SELECTION');
  for (const frame of manifest.frames) {
    const name = frame.file ?? frame.filename;
    if (!Number.isInteger(frame.frame) || !['held', 'mid'].includes(frame.role) || !name || name !== basename(name)) fail(`Prepared evidence strip manifest is malformed: ${manifestFile}`, 'STALE_SELECTION');
    const file = join(root, name);
    if (!existsSync(file)) fail(`Prepared evidence is missing strip frame ${name}.`, 'STALE_SELECTION');
    verifyPngStructure(file);
  }
  return { root, stills: stills.sort(), stripManifest: manifestFile, manifest, hash: hashEvidenceSnapshot(root) };
}
function artifactSnapshot(outDir, sourceDir = null) {
  const root = resolve(outDir); const strip = join(root, 'strip');
  return {
    videoSha256: sha256File(join(root, 'video.mp4')),
    stripManifestSha256: sha256File(join(strip, 'strip-manifest.json')),
    stillSha256: Object.fromEntries(pngFiles(root, 'still-').sort().map((name) => [name, sha256File(join(root, name))])),
    stripSha256: Object.fromEntries(readdirSync(strip).filter((name) => name.toLowerCase().endsWith('.png')).sort().map((name) => [name, sha256File(join(strip, name))])),
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
  if (durationAuthority && /^locked\s+([0-9]+(?:\.[0-9]+)?)s$/.test(durationAuthority)) {
    const expected = Number(durationAuthority.match(/^locked\s+([0-9]+(?:\.[0-9]+)?)s$/)[1]);
    const fps = spec?.fps || videoMetadata.fps || 30;
    if (Math.abs(videoMetadata.duration - expected) > (1 / fps) + 0.01) fail(`Video duration ${videoMetadata.duration.toFixed(3)}s does not match locked ${expected}s within one frame.`, 'MISMATCHED_ARTIFACT');
  }
  const stills = pngFiles(root, 'still-');
  if (stills.length !== 6) fail(`Expected exactly six still-*.png files in ${root}; found ${stills.length}.`, 'INCOMPLETE_ARTIFACT');
  for (const file of stills) {
    const dimensions = verifyPngStructure(join(root, file));
    if (dimensions.width !== videoMetadata.width || dimensions.height !== videoMetadata.height) fail(`Still ${file} dimensions ${dimensions.width}x${dimensions.height} do not match video ${videoMetadata.width}x${videoMetadata.height}.`, 'MISMATCHED_ARTIFACT');
  }
  const strip = join(root, 'strip');
  const manifestFile = join(strip, 'strip-manifest.json');
  if (!existsSync(manifestFile)) fail(`Missing strip-manifest.json in ${strip}.`, 'INCOMPLETE_ARTIFACT');
  const manifest = json(manifestFile);
  if (manifest.mode !== 'punctuated') fail(`Unsupported strip mode ${manifest.mode ?? 'unknown'}; Codex canonical artifacts require the default punctuated strip (do not use --step or uniform fallback).`, 'UNSUPPORTED_STRIP_MODE');
  if (!Array.isArray(manifest.frames) || manifest.frames.length === 0) fail('Strip manifest has no frame list.', 'CORRUPT_ARTIFACT');
  for (const frame of manifest.frames) {
    if (!Number.isInteger(frame.frame) || !['held', 'mid'].includes(frame.role)) fail('Strip manifest has malformed frame role/index.', 'CORRUPT_ARTIFACT');
    const name = frame.file ?? frame.filename;
    const framePath = childPath(strip, name, 'Strip frame');
    if (!existsSync(framePath)) fail(`Strip manifest references a missing PNG: ${name}`, 'MISSING_ARTIFACT');
    if (!name.toLowerCase().endsWith('.png')) fail(`Invalid strip PNG: ${name}`, 'CORRUPT_ARTIFACT');
    const dimensions = verifyPngStructure(framePath);
    if (dimensions.width !== videoMetadata.width || dimensions.height !== videoMetadata.height) fail(`Strip frame ${name} dimensions ${dimensions.width}x${dimensions.height} do not match video ${videoMetadata.width}x${videoMetadata.height}.`, 'MISMATCHED_ARTIFACT');
  }
  const artifactFile = join(root, 'artifact-manifest.json');
  if (requireProvenance && !existsSync(artifactFile)) fail(`Missing artifact-manifest.json in ${root}; render through the package launcher so reviewed pixels bind to source and video.`, 'UNBOUND_ARTIFACT');
  let provenance = null;
  if (existsSync(artifactFile)) {
    provenance = json(artifactFile);
    if (provenance.videoSha256 !== sha256File(video)) fail('video.mp4 changed after provenance was captured.', 'STALE_ARTIFACT');
    if (provenance.stripManifestSha256 !== sha256File(manifestFile)) fail('strip-manifest.json changed after provenance was captured.', 'STALE_ARTIFACT');
    const stillHashes = provenance.stillSha256 ?? {};
    const stripHashes = provenance.stripSha256 ?? {};
    if (Object.keys(stillHashes).sort().join('\0') !== stills.slice().sort().join('\0')) fail('Artifact provenance does not cover exactly the current six stills.', 'STALE_ARTIFACT');
    const stripFiles = readdirSync(strip).filter((name) => name.toLowerCase().endsWith('.png')).sort();
    if (Object.keys(stripHashes).sort().join('\0') !== stripFiles.join('\0')) fail('Artifact provenance does not cover exactly the current strip frames.', 'STALE_ARTIFACT');
    for (const [name, hash] of Object.entries(stillHashes)) if (sha256File(childPath(root, name, 'Still')) !== hash) fail(`Still changed after provenance was captured: ${name}`, 'STALE_ARTIFACT');
    for (const [name, hash] of Object.entries(stripHashes)) if (sha256File(childPath(strip, name, 'Strip frame')) !== hash) fail(`Strip frame changed after provenance was captured: ${name}`, 'STALE_ARTIFACT');
    const boundSource = sourceDir ?? provenance.sourceDir;
    if (requireProvenance && (!boundSource || !provenance.sourceHash)) fail('Artifact provenance is missing source binding; a canonical output must name its source.', 'UNBOUND_ARTIFACT');
    if (boundSource) {
      const sourceHash = hashTree(resolve(boundSource));
      if (provenance.sourceHash !== sourceHash) fail('Source files changed after rendering; the artifact is stale and cannot be canonical.', 'STALE_ARTIFACT');
    }
  }
  if (manifest.video && resolve(manifest.video) !== video) fail(`Strip manifest video does not match ${video}.`, 'MISMATCHED_ARTIFACT');
  return { outDir: root, videoSha256: sha256File(video), stillCount: stills.length, stripCount: manifest.frames.length, manifest, provenance, videoMetadata };
}

export function captureProvenance(outDir, sourceDir) {
  const root = resolve(outDir); const video = join(root, 'video.mp4'); const stripManifest = join(root, 'strip', 'strip-manifest.json');
  if (!existsSync(video) || !existsSync(stripManifest)) fail(`Cannot capture provenance before video and strip exist in ${root}.`, 'INCOMPLETE_ARTIFACT');
  const videoReceipt = verifyVideoProvenance(root, sourceDir ?? null);
  const boundSource = sourceDir ? resolve(sourceDir) : videoReceipt.sourceDir;
  const sourceHash = videoReceipt.sourceHash ?? null;
  const videoSha256 = videoReceipt.videoSha256;
  const existingFile = join(root, 'artifact-manifest.json');
  if (existsSync(existingFile)) {
    const existing = json(existingFile);
    if (existing.videoSha256 !== videoSha256) fail('Cannot recapture provenance after video.mp4 changed; render-arm must create a new output directory.', 'STALE_ARTIFACT');
    if (existing.sourceHash && sourceHash && existing.sourceHash !== sourceHash) fail('Source changed between video render and strip extraction; render a fresh video before extracting frames.', 'STALE_ARTIFACT');
  }
  const rootStills = Object.fromEntries(pngFiles(root, 'still-').map((name) => [name, sha256File(join(root, name))]));
  const stripFrames = Object.fromEntries(readdirSync(join(root, 'strip')).filter((name) => name.endsWith('.png')).map((name) => [name, sha256File(join(root, 'strip', name))]));
  const value = { schemaVersion: 1, capturedAt: new Date().toISOString(), sourceDir: boundSource ?? null, sourceHash, videoSha256, stripManifestSha256: sha256File(stripManifest), stillSha256: rootStills, stripSha256: stripFrames };
  writeJsonAtomic(join(root, 'artifact-manifest.json'), value); return value;
}

export function captureVideoProvenance(outDir, sourceDir) {
  const root = resolve(outDir); const video = join(root, 'video.mp4');
  if (!existsSync(video)) fail(`Cannot capture video provenance before video.mp4 exists in ${root}.`, 'INCOMPLETE_ARTIFACT');
  const value = { schemaVersion: 1, capturedAt: new Date().toISOString(), sourceDir: sourceDir ? resolve(sourceDir) : null, sourceHash: sourceDir ? hashTree(resolve(sourceDir)) : null, videoSha256: sha256File(video) };
  writeJsonAtomic(join(root, '.video-provenance.json'), value); return value;
}

export function verifyVideoProvenance(outDir, sourceDir) {
  const root = resolve(outDir); const file = join(root, '.video-provenance.json');
  if (!existsSync(file)) fail(`Missing .video-provenance.json in ${root}; render-arm must run before render-strip.`, 'UNBOUND_ARTIFACT');
  const value = json(file);
  if (value.videoSha256 !== sha256File(join(root, 'video.mp4'))) fail('video.mp4 changed after render-arm; allocate a new output directory.', 'STALE_ARTIFACT');
  if (sourceDir && value.sourceHash !== hashTree(resolve(sourceDir))) fail('Source changed between render-arm and render-strip; re-render video first.', 'STALE_ARTIFACT');
  return value;
}

export function acceptCanonical(runDir, { reportId, role, outDir, sourceDir = null, reviewRound = null, stripDir = null }) {
  const state = loadState(runDir); const report = state.reports.find((item) => item.id === reportId);
  if (!report) fail(`Canonical output requires a recorded completion report: ${reportId}.`, 'MISSING_REPORT');
  if (report.role !== role || !['settled', 'round-done', 'done'].includes(report.status)) fail('Only an explicit successful completion report can advance canonical output.', 'INVALID_REPORT');
  if (!['builder', 'tempo'].includes(role)) fail('Only builder or tempo reports can advance canonical output.', 'INVALID_REPORT');
  if (role === 'builder' && !['settled', 'round-done'].includes(report.status)) fail('Builder canonical output requires settled or round-done.', 'INVALID_REPORT');
  if (role === 'tempo' && report.status !== 'done') fail('Tempo canonical output requires a done report.', 'INVALID_REPORT');
  const currentRole = roleRecord(state, role, report.key ?? role);
  if (!currentRole || currentRole.agentId !== report.agentId || currentRole.continuationId !== report.continuationId) fail('Canonical report identity is no longer the registered role identity.', 'IDENTITY_CHANGED');
  if (state.consumedReportIds.includes(reportId)) fail(`Completion report ${reportId} was already consumed.`, 'DUPLICATE_REPORT');
  const acceptedOutDirs = state.reports.filter((item) => state.consumedReportIds.includes(item.id) && item.outDir).map((item) => resolve(item.outDir));
  if (acceptedOutDirs.includes(resolve(outDir))) fail('Canonical output directory was already accepted; allocate a new render version.', 'DUPLICATE_CANONICAL');
  if (!report.outDir || resolve(report.outDir) !== resolve(outDir)) fail('Canonical output differs from the path named in the completion report.', 'MISMATCHED_ARTIFACT');
  if (stripDir && resolve(stripDir) !== join(resolve(outDir), 'strip')) fail('Reported strip does not belong to canonical output.', 'MISMATCHED_ARTIFACT');
  if (report.stripDir && resolve(report.stripDir) !== join(resolve(outDir), 'strip')) fail('Completion report strip does not belong to its output.', 'MISMATCHED_ARTIFACT');
  if (report.status === 'round-done' && reviewRound !== null && reviewRound !== report.reviewRound) fail(`Canonical reviewRound ${reviewRound} conflicts with completion report round ${report.reviewRound}.`, 'MISMATCHED_ARTIFACT');
  if (report.status === 'round-done' && verdictConvergedYes(latestVerdict(state)?.text)) fail('A completion recorded before a convergence amendment cannot advance after the verdict became converged.', 'STALE_REPORT');
  if (report.status === 'round-done' && report.reviewRound !== latestVerdictRound(state)) fail('The completion report no longer belongs to the current review round.', 'STALE_REPORT');
  if (role === 'tempo' && !verdictConvergedYes(latestVerdict(state)?.text)) fail('Tempo completion cannot advance after the critic retracts convergence.', 'STALE_REPORT');
  const artifacts = verifyArtifacts(outDir, { sourceDir, spec: state.commission.spec ?? null, durationAuthority: state.commission.durationAuthority });
  state.consumedReportIds.push(reportId);
  const canonicalRound = report.status === 'round-done' ? report.reviewRound : role === 'tempo' ? latestVerdictRound(state) : reviewRound;
  const canonical = { reportId, role, key: report.key ?? null, outDir: resolve(outDir), reviewRound: canonicalRound, stripDir: stripDir ? resolve(stripDir) : join(resolve(outDir), 'strip'), artifact: artifacts, artifactSnapshot: artifactSnapshot(outDir, sourceDir ?? artifacts.provenance?.sourceDir ?? null), acceptedAt: new Date().toISOString() };
  if (role === 'builder' && report.status === 'settled') {
    if (state.selection) fail('All settled draw canonicals must be accepted before blind selection; use a new run for another draw.', 'INVALID_CANONICAL');
    if (state.canonicals[report.key]) fail(`Builder ${report.key} already has an accepted settled canonical.`, 'DUPLICATE_CANONICAL');
    state.canonicals[report.key] = canonical;
    if (Object.keys(state.canonicals).length === state.commission.draws) state.status = 'draws-ready';
  } else {
    if (role === 'builder' && state.selection?.winnerKey && report.key !== state.selection.winnerKey) fail('Only the selected winner can advance canonical output after selection.', 'INVALID_CANONICAL');
    state.canonical = canonical; state.status = report.status === 'round-done' ? 'reviewing' : 'canonical-ready';
  }
  return saveState(runDir, touch(state));
}

export function recordVerdict(runDir, { id, criticId, criticContinuationId, round, stripDir, verdict, amendmentOf = null, rebuttalOf = null }) {
  const state = loadState(runDir);
  if (!Number.isInteger(round) || round < 1 || !criticId || !criticContinuationId || !stripDir || typeof verdict !== 'string' || !verdict.trim()) fail('Verdict requires criticId, critic continuationId, positive round, stripDir, and verbatim text.', 'INVALID_VERDICT');
  if (!state.roles.critic || state.roles.critic.agentId !== criticId || state.roles.critic.continuationId !== criticContinuationId) fail('Verdict critic identity does not match the persistent critic continuation.', 'IDENTITY_CHANGED');
  if (!state.selection || !state.canonical || resolve(stripDir) !== resolve(state.canonical.stripDir)) fail('Verdict requires a selected winner and must equal the currently verified canonical strip.', 'STALE_VERDICT');
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
    if (resolve(stripDir) !== resolve(prior.stripDir)) fail('A same-round rebuttal must review the same strip as the verdict it amends.', 'STALE_VERDICT');
  } else if (verdictConvergedYes(latestVerdict(state)?.text) && !(state.canonical?.role === 'tempo' && state.canonical?.reviewRound === latestRound)) {
    fail('A new review round after convergence requires a newly accepted canonical from the converged round (for example post-tempo).', 'STALE_VERDICT');
  }
  if (round > 1 && state.canonical.reviewRound !== round - 1) fail(`Review round ${round} requires an accepted canonical from round ${round - 1}.`, 'STALE_VERDICT');
  const record = { id: id ?? `verdict-r${round}${amendment ? `-amend-${prior.id}` : ''}`, criticId, criticContinuationId, round, stripDir: resolve(stripDir), text: verdict, recordedAt: new Date().toISOString() };
  if (amendment) { record.amendmentOf = prior.id; record.rebuttalOf = rebuttalOf ?? amendmentOf; record.replaces = prior.text; }
  state.verdicts.push(record);
  state.verdictHistory = [...(state.verdictHistory ?? []), { ...record, supersedes: amendment ? prior.id : null }];
  state.handoffs.push({ id: `handoff-${record.id}`, type: amendment ? 'critic-verdict-amendment' : 'critic-verdict', from: criticId, to: state.roles.builders[state.selection.winnerKey]?.agentId ?? null, round, stripDir: record.stripDir, verbatim: verdict, amendmentOf: record.amendmentOf ?? null });
  return saveState(runDir, touch(state));
}

export function prepareSelection(runDir, { candidates, evidenceDir = null }) {
  const state = loadState(runDir);
  if (state.selection) fail('Selection already recorded; a run may have one blind selection.', 'DUPLICATE_SELECTION');
  if (state.selectionPreparation && !state.selectionPreparation.consumedAt) fail('Selection evidence is already prepared; consume it with record-selection or use a new run.', 'DUPLICATE_SELECTION');
  if (!Array.isArray(candidates) || candidates.length !== state.commission.draws) fail(`Selection preparation requires exactly N=${state.commission.draws} candidates.`, 'INVALID_SELECTION');
  const labels = candidates.map((candidate) => candidate?.label); const keys = candidates.map((candidate) => candidate?.key);
  if (new Set(labels).size !== labels.length || labels.some((label) => typeof label !== 'string' || !/^[A-Z]$/.test(label))) fail('Candidates must use unique anonymous labels A-Z.', 'INVALID_SELECTION');
  if (new Set(keys).size !== keys.length || keys.some((key) => typeof key !== 'string' || !/^draw-\d+$/.test(key))) fail('Candidates must refer to unique draw-N keys.', 'INVALID_SELECTION');
  const expectedKeys = Object.keys(state.canonicals).sort();
  if (expectedKeys.length !== state.commission.draws || keys.slice().sort().join('\0') !== expectedKeys.join('\0')) fail('Selection preparation requires every accepted settled canonical exactly once.', 'INVALID_SELECTION');
  const root = resolve(evidenceDir ?? join(runDir, '.remotion-director', 'selection-evidence'));
  const rootExisted = existsSync(root);
  if (existsSync(root)) {
    if (!statSync(root).isDirectory() || readdirSync(root).length) fail(`Selection evidence directory must be new or empty: ${root}`, 'INVALID_SELECTION');
  } else mkdirSync(dirname(root), { recursive: true });
  const stagingRoot = `${root}.tmp-${process.pid}-${Date.now()}`;
  mkdirSync(stagingRoot, { recursive: true });
  const prepared = [];
  try { for (const candidate of candidates) {
    const canonical = state.canonicals[candidate.key];
    if (!canonical || canonical.role !== 'builder') fail(`Candidate ${candidate.label} is not backed by an accepted settled canonical.`, 'INVALID_SELECTION');
    verifyArtifacts(canonical.outDir, { sourceDir: canonical.artifact?.provenance?.sourceDir ?? null, spec: state.commission.spec ?? null, durationAuthority: state.commission.durationAuthority });
    assertArtifactSnapshot(canonical);
    if (resolve(canonical.stripDir) !== join(resolve(canonical.outDir), 'strip')) fail(`Canonical strip for ${candidate.key} is mismatched.`, 'MISMATCHED_ARTIFACT');
    const destination = join(stagingRoot, candidate.label); mkdirSync(destination);
    const stills = pngFiles(canonical.outDir, 'still-');
    if (stills.length !== 6) fail(`Canonical ${candidate.key} does not have exactly six stills.`, 'INCOMPLETE_ARTIFACT');
    for (const still of stills) cpSync(join(canonical.outDir, still), join(destination, still));
    const manifest = json(join(canonical.stripDir, 'strip-manifest.json')); const sanitized = sanitizeEvidenceManifest(manifest);
    for (const frame of manifest.frames ?? []) {
      const name = frame.file ?? frame.filename; if (!name || name !== basename(name)) fail(`Canonical strip manifest is unsafe for ${candidate.key}.`, 'MISMATCHED_ARTIFACT');
      cpSync(join(canonical.stripDir, name), join(destination, name));
    }
    writeJsonAtomic(join(destination, 'strip-manifest.json'), sanitized);
    const snapshot = verifyPreparedEvidence(destination);
    prepared.push({ label: candidate.label, key: candidate.key, canonicalOutDir: canonical.outDir, canonicalStripDir: canonical.stripDir, evidenceDir: destination, evidenceHash: snapshot.hash, stills: snapshot.stills, stripManifest: snapshot.stripManifest });
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
    candidate.stripManifest = join(candidate.evidenceDir, 'strip-manifest.json');
  }
  state.selectionPreparation = { evidenceDir: root, preparedAt: new Date().toISOString(), consumedAt: null, candidates: prepared };
  state.status = 'selection-ready';
  const selectorCandidates = prepared.map(({ label, evidenceDir: candidateEvidenceDir, stills, stripManifest }) => ({ label, evidenceDir: candidateEvidenceDir, stills, stripManifest }));
  return saveState(runDir, touch(state)) && { status: state.status, selectorSafe: true, evidenceDir: root, candidates: selectorCandidates };
}

export function recordSelection(runDir, { selectorId, selectorContinuationId, winner, candidates, reason, evidenceDir = null }) {
  const state = loadState(runDir);
  if (!state.roles.selector || state.roles.selector.agentId !== selectorId || state.roles.selector.continuationId !== selectorContinuationId) fail('Selection identity does not match the registered selector.', 'IDENTITY_CHANGED');
  if (state.selection) fail('Selection already recorded; a run may have one blind selection.', 'DUPLICATE_SELECTION');
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
    const canonical = state.canonicals[prepared.key];
    if (!canonical || canonical.outDir !== prepared.canonicalOutDir) fail(`Accepted canonical for ${candidate.label} changed after preparation.`, 'STALE_SELECTION');
    verifyArtifacts(canonical.outDir, { sourceDir: canonical.artifact?.provenance?.sourceDir ?? null, spec: state.commission.spec ?? null, durationAuthority: state.commission.durationAuthority });
    assertArtifactSnapshot(canonical);
    const snapshot = verifyPreparedEvidence(prepared.evidenceDir);
    if (snapshot.hash !== prepared.evidenceHash) fail(`Prepared evidence for ${candidate.label} changed after preparation.`, 'STALE_SELECTION');
  }
  if (!labels.includes(winner)) fail(`Winner ${winner} is not one of the anonymous candidates.`, 'INVALID_SELECTION');
  if (typeof reason !== 'string' || !reason.trim()) fail('Blind selection needs a verbatim pixel-grounded reason.', 'INVALID_SELECTION');
  const winnerCandidate = candidates.find((candidate) => candidate.label === winner); const preparedWinner = preparedByLabel.get(winner);
  preparation.consumedAt = new Date().toISOString();
  state.selection = { selectorId, selectorContinuationId, winner, winnerKey: winnerCandidate.key, candidates: candidates.map((candidate) => ({ label: candidate.label, key: candidate.key, evidenceDir: preparedByLabel.get(candidate.label).evidenceDir })), reason, evidenceDir: resolve(preparation.evidenceDir), recordedAt: new Date().toISOString() };
  state.canonical = state.canonicals[preparedWinner.key];
  state.status = 'selected';
  return saveState(runDir, touch(state));
}

export function recoverRole(runDir, { role, key = role, previousAgentId, replacementAgentId, replacementContinuationId, reason }) {
  const state = loadState(runDir); const current = roleRecord(state, role, key);
  if (!current || current.agentId !== previousAgentId) fail('Recovery must identify the currently registered role identity.', 'IDENTITY_CHANGED');
  if (!replacementAgentId || !replacementContinuationId || !reason?.trim()) fail('Recovery requires a replacement identity and explicit reason.', 'INVALID_RECOVERY');
  if (current.status === 'recovered') fail('Role already recovered; recovery cannot silently chain.', 'DUPLICATE_RECOVERY');
  const otherRoles = [...Object.values(state.roles.builders), ...['selector', 'critic', 'tempo'].map((name) => state.roles[name]).filter(Boolean)].filter((item) => item !== current);
  if (otherRoles.some((item) => item.agentId === replacementAgentId || item.continuationId === replacementContinuationId)) fail('Replacement identity is already registered to another role.', 'IDENTITY_CHANGED');
  current.status = 'recovered';
  const replacement = { ...current, agentId: replacementAgentId, continuationId: replacementContinuationId, parentId: previousAgentId, fresh: true, degraded: true, status: 'running', recoveredAt: new Date().toISOString(), recoveryReason: reason, continuations: 1 };
  if (role === 'builder') state.roles.builders[key] = replacement; else state.roles[role] = replacement;
  state.recoveries.push({ role, key, previousAgentId, replacementAgentId, replacementContinuationId, reason, degraded: true, recordedAt: new Date().toISOString() });
  return saveState(runDir, touch(state));
}

export function status(runDir) { return loadState(runDir); }
