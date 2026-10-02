#!/usr/bin/env node
/** Cross-platform entry point shipped inside the plugin. It never imports the
 * developer checkout and resolves all helpers relative to its own package root. */
import { existsSync, readFileSync, readdirSync, mkdirSync, cpSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  acceptCanonical, acceptPreview, captureProvenance, continueRole, initRun, nextKept, prepareSelection, recordDirections, recordDurationDecision, recordRedraw, recordReport,
  recordUserNote, recordVerdict, recordSelection, recordUserSelection, recoverRole, registerRole, status, switchPolish, verifyArtifacts, captureVideoProvenance, verifyVideoProvenance,
} from './codex-runtime.mjs';

const PACKAGE_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const TOOL_ROOT = join(PACKAGE_ROOT, 'tools');
const asArgs = process.argv.slice(2);
const value = (name, fallback = undefined) => { const i = asArgs.indexOf(name); return i >= 0 ? asArgs[i + 1] : fallback; };
// A repeatable flag: every value given, in order.
const values = (name) => asArgs.flatMap((arg, i) => (arg === name ? [asArgs[i + 1]] : []));
const has = (name) => asArgs.includes(name);
const textOption = (inline, file, fallback = undefined) => { const path = value(file); return path ? readFileSync(path, 'utf8') : value(inline, fallback); };
const help = `remotion-director Codex launcher\n\n` +
  `Usage: node <package>/tools/codex-launcher.mjs <command> [options]\n\n` +
  `Commands:\n` +
  `  prepare-environment --workspace DIR [--check] update stable Remotion and RBP (global RBP first)\n` +
  `  render-arm --workspace DIR --dir RUN --out OUT   render OUT/video.mp4 and its OUT/review/, then bind provenance\n` +
  `  time-overview --workspace DIR --video MP4 --out DIR   time overview + settle frames + overview.json for any video\n` +
  `  init-run --run-dir DIR --brief-hash HEX --draws N --duration locked:5s|free [--polish critic|user] [--spec JSON]\n` +
  `  register-role --run-dir DIR --role ROLE --agent-id ID --continuation-id ID --fresh [--key draw-N --direction K]\n` +
  `  record-directions --run-dir DIR --lister-id ID --continuation-id ID (--directions TEXT|--directions-file FILE)   the batch's N directions, before any builder\n` +
  `  continue-role --run-dir DIR --role ROLE --agent-id ID --continuation-id ID [--key draw-N]\n` +
  `  record-report --run-dir DIR --report-id ID --role ROLE --agent-id ID --continuation-id ID --status preview|settled|round-done|revision-done|duration-blocked|blocked\n` +
  `      [--key draw-N] [--out-dir DIR] [--review-round R] [--revision K] [--review-dir DIR] [--text TEXT|--text-file FILE]\n` +
  `  accept-preview --run-dir DIR --report-id ID --out-dir DIR [--source DIR]   a builder's r1 preview (never canonical)\n` +
  `  accept-canonical --run-dir DIR --report-id ID [--role builder] --out-dir DIR [--source DIR] [--review-round R] [--revision K]\n` +
  `  record-verdict --run-dir DIR --verdict-id ID --critic-id ID --continuation-id ID --round R --review-dir DIR (--verdict TEXT|--verdict-file FILE) [--amend-of ID|--rebuttal-of ID]\n` +
  `  record-user-note --run-dir DIR --revision K (--note TEXT|--note-file FILE) [--note-id ID]   亲自打磨: the user's words, verbatim\n` +
  `  switch-polish --run-dir DIR --mode user [--reason TEXT]   after the critic converged, the user polishes from there\n` +
  `  record-duration-decision --run-dir DIR --report-id ID --decision locked|free   the user's answer to duration-blocked\n` +
  `  prepare-selection --run-dir DIR --candidates-file JSON [--evidence-dir DIR]\n` +
  `  record-selection --run-dir DIR --selector-id ID --continuation-id ID --candidates-file JSON --winner LABEL --reason TEXT\n` +
  `  record-user-selection --run-dir DIR --winner-key draw-N [--reason TEXT] [--also-keep draw-M]...   the user picked the base (default); --also-keep each other draw they keep\n` +
  `  next-kept --run-dir DIR --key draw-M   after the current piece's settled canonical: archive that piece, make a kept draw the current piece\n` +
  `  record-redraw --run-dir DIR [--reason TEXT] [--brief-hash HEX]   the user rejected every preview; their comment as given, the updated brief's hash\n` +
  `  recover-role --run-dir DIR --role ROLE [--key draw-N] --previous-agent-id ID --replacement-agent-id ID --replacement-continuation-id ID --reason TEXT [--user-words TEXT|--user-words-file FILE]\n` +
  `      a builder with a preview, or one already recovered, needs the user's words choosing the fresh replacement\n` +
  `  verify-artifacts --out DIR [--source DIR] [--allow-unbound]\n` +
  `  status --run-dir DIR [--full]\n\n` +
  `All state mutations fail loudly on duplicate reports, identity changes, stale artifacts,\n` +
  `or completion without a verified output. Ledger commands print a summary of the run;\n` +
  `status --full prints the whole ledger. Use --json for machine-readable output.`;

// Every ledger command returns the whole run state. Printed in full it cost the
// orchestrator thousands of tokens per call in a real run, so it gets a summary.
function summary(state) {
  const role = (entry) => (entry ? { agentId: entry.agentId, status: entry.status } : null);
  const verdict = state.verdicts?.at(-1);
  return {
    runId: state.runId, status: state.status, polish: state.polishMode,
    builders: Object.fromEntries(Object.entries(state.roles?.builders ?? {}).map(([key, entry]) => [key, role(entry)])),
    lister: role(state.roles?.lister), selector: role(state.roles?.selector), critic: role(state.roles?.critic),
    previews: Object.fromEntries(Object.entries(state.previews ?? {}).map(([key, preview]) => [key, preview.outDir])),
    selection: state.selection ? { by: state.selection.by, winnerKey: state.selection.winnerKey, kept: state.selection.kept ?? [] } : null,
    canonical: state.canonical ? { key: state.canonical.key, stage: state.canonical.stage, outDir: state.canonical.outDir } : null,
    lastVerdict: verdict ? { id: verdict.id, round: verdict.round, converged: /^CONVERGED:\s*YES\b/m.test(verdict.text ?? '') } : null,
    finished: (state.finished ?? []).map((piece) => piece.key),
    updatedAt: state.updatedAt,
  };
}
const isState = (shown) => shown !== null && typeof shown === 'object' && 'schemaVersion' in shown && 'runId' in shown;
function print(valueToPrint) {
  const shown = isState(valueToPrint) && !has('--full') ? summary(valueToPrint) : valueToPrint;
  console.log(typeof shown === 'string' && !has('--json') ? shown : JSON.stringify(shown, null, 2));
}
function die(error) { console.error(`[codex] FAILED ${error.code ?? 'ERROR'}: ${error.message}`); process.exitCode = 1; }
function coded(message, code) { const error = new Error(message); error.code = code; return error; }
function workspaceRoot() { return resolve(value('--workspace', process.cwd())); }

function findTsx(workspace) {
  const candidates = [join(workspace, 'node_modules', 'tsx', 'dist', 'cli.mjs'), join(workspace, 'node_modules', 'tsx', 'dist', 'cli.cjs')];
  const hit = candidates.find((file) => existsSync(file));
  if (!hit) throw new Error(`tsx is missing from ${workspace}; run prepare-environment in the workspace first.`);
  return hit;
}

function runNodeTool(tool, args) {
  const workspace = workspaceRoot();
  if (!existsSync(join(workspace, 'package.json'))) throw new Error(`Workspace package.json is missing: ${workspace}`);
  const tsx = findTsx(workspace);
  const env = { ...process.env, NODE_PATH: join(workspace, 'node_modules') };
  // Node's ESM resolver does not honor NODE_PATH for bare imports when the
  // source file lives outside the workspace. Stage the package-owned harnesses
  // under the prepared workspace so their nearest node_modules is the user's
  // dependency tree. All of them are staged together because render-arm.ts
  // imports time-overview.ts relatively. The package stays read-only and
  // dependency-free.
  const cache = join(workspace, '.remotion-director', 'codex-tools');
  mkdirSync(cache, { recursive: true });
  for (const name of readdirSync(TOOL_ROOT).filter((file) => file.endsWith('.ts'))) cpSync(join(TOOL_ROOT, name), join(cache, name), { force: true });
  const staged = join(cache, `${tool}.ts`);
  const result = spawnSync(process.execPath, [tsx, staged, ...args], { cwd: workspace, env, stdio: 'inherit', windowsHide: true });
  if (result.error || result.status !== 0) throw new Error(`${tool} failed${result.error ? `: ${result.error.message}` : ` with exit ${result.status}`}`);
}

function runPrepare() {
  const workspace = workspaceRoot();
  mkdirSync(workspace, { recursive: true });
  const result = spawnSync(process.execPath, [join(TOOL_ROOT, 'check-env.mjs'), '--workspace', workspace, ...(has('--check') ? ['--check'] : [])], { cwd: workspace, stdio: 'inherit', windowsHide: true });
  if (result.error || result.status !== 0) throw new Error(`Environment preparation failed${result.error ? `: ${result.error.message}` : ` with exit ${result.status}`}`);
}

// render-arm writes OUT/video.mp4 and OUT/review/ in one run. The harness runs
// with cwd = workspace, so relative paths resolve there; provenance then binds
// the video to the source and every review file to that video.
function runRenderArm() {
  const workspace = workspaceRoot(); const dirArg = value('--dir');
  if (!dirArg) throw coded('render-arm needs --dir RUN (the draw directory holding index.tsx).', 'INVALID_ARGUMENTS');
  const dir = resolve(workspace, dirArg); const out = resolve(workspace, value('--out') ?? join(dirArg, 'out'));
  if (existsSync(join(out, 'artifact-manifest.json'))) throw coded(`${out} already holds a finished render; render to a new, unused output directory.`, 'OCCUPIED_OUTPUT');
  runNodeTool('render-arm', asArgs.slice(1).filter((a) => a !== '--json'));
  captureVideoProvenance(out, dir);
  captureProvenance(out, dir);
}

// The standalone overview works on any video. Pointed at the review/ of a
// render whose review step did not finish, it completes that render's
// provenance; the bound review/ of a finished render is never rewritten.
function runTimeOverview() {
  const workspace = workspaceRoot();
  if (!value('--video') || !value('--out')) throw coded('time-overview needs --video MP4 and --out DIR.', 'INVALID_ARGUMENTS');
  const video = resolve(workspace, value('--video')); const out = resolve(workspace, value('--out'));
  const renderOut = dirname(video);
  const renderReview = basename(video) === 'video.mp4' && out === join(renderOut, 'review');
  if (renderReview && existsSync(join(renderOut, 'artifact-manifest.json'))) throw coded(`${out} is the bound review/ of a finished render; write a standalone overview to another directory, or render a new version.`, 'BOUND_REVIEW');
  const bind = renderReview && existsSync(join(renderOut, '.video-provenance.json'));
  if (bind) verifyVideoProvenance(renderOut, null);
  runNodeTool('time-overview', asArgs.slice(1).filter((a) => a !== '--json'));
  if (bind) captureProvenance(renderOut, null);
}

function command() {
  const name = asArgs[0];
  if (!name || name === '--help' || name === '-h' || name === 'help') { console.log(help); return; }
  switch (name) {
    case 'prepare-environment': return runPrepare();
    case 'render-arm': return runRenderArm();
    case 'time-overview': return runTimeOverview();
    case 'init-run': {
      const duration = value('--duration'); const durationAuthority = duration === 'free' ? 'free' : duration?.startsWith('locked:') ? `locked ${duration.slice(7)}${duration.slice(-1) === 's' ? '' : 's'}` : duration;
      return print(initRun({ runDir: value('--run-dir'), briefHash: value('--brief-hash'), draws: Number(value('--draws')), durationAuthority, spec: value('--spec') ? JSON.parse(value('--spec')) : {}, polish: value('--polish', 'critic') }));
    }
    case 'register-role': return print(registerRole(value('--run-dir'), { role: value('--role'), key: value('--key', value('--role')), agentId: value('--agent-id'), continuationId: value('--continuation-id'), parentId: value('--parent-id', null), fresh: has('--fresh'), direction: value('--direction') ? Number(value('--direction')) : null }));
    case 'record-directions': return print(recordDirections(value('--run-dir'), { listerId: value('--lister-id'), listerContinuationId: value('--continuation-id'), text: textOption('--directions', '--directions-file') }));
    case 'continue-role': return print(continueRole(value('--run-dir'), { role: value('--role'), key: value('--key', value('--role')), agentId: value('--agent-id'), continuationId: value('--continuation-id'), messageHash: value('--message-hash', null) }));
    case 'record-report': return print(recordReport(value('--run-dir'), { id: value('--report-id'), role: value('--role'), key: value('--key', null), status: value('--status'), reviewRound: value('--review-round') ? Number(value('--review-round')) : null, revision: value('--revision') ? Number(value('--revision')) : null, agentId: value('--agent-id'), continuationId: value('--continuation-id'), outDir: value('--out-dir', null), reviewDir: value('--review-dir', null), text: textOption('--text', '--text-file', '') }));
    case 'accept-canonical': return print(acceptCanonical(value('--run-dir'), { reportId: value('--report-id'), role: value('--role', 'builder'), outDir: value('--out-dir'), sourceDir: value('--source', null), reviewRound: value('--review-round') ? Number(value('--review-round')) : null, revision: value('--revision') ? Number(value('--revision')) : null, reviewDir: value('--review-dir', null) }));
    case 'accept-preview': return print(acceptPreview(value('--run-dir'), { reportId: value('--report-id'), outDir: value('--out-dir'), sourceDir: value('--source', null), reviewDir: value('--review-dir', null) }));
    case 'prepare-selection': {
      const candidates = JSON.parse(readFileSync(value('--candidates-file'), 'utf8'));
      return print(prepareSelection(value('--run-dir'), { candidates, evidenceDir: value('--evidence-dir', null) }));
    }
    case 'record-verdict': return print(recordVerdict(value('--run-dir'), { id: value('--verdict-id'), criticId: value('--critic-id'), criticContinuationId: value('--continuation-id'), round: Number(value('--round')), reviewDir: value('--review-dir'), verdict: textOption('--verdict', '--verdict-file'), amendmentOf: value('--amend-of', null), rebuttalOf: value('--rebuttal-of', null) }));
    case 'record-user-note': return print(recordUserNote(value('--run-dir'), { id: value('--note-id', null), revision: value('--revision') ? Number(value('--revision')) : null, note: textOption('--note', '--note-file') }));
    case 'switch-polish': return print(switchPolish(value('--run-dir'), { mode: value('--mode'), reason: value('--reason', '') }));
    case 'record-duration-decision': return print(recordDurationDecision(value('--run-dir'), { reportId: value('--report-id'), decision: value('--decision') }));
    case 'record-selection': {
      const candidates = JSON.parse(readFileSync(value('--candidates-file'), 'utf8'));
      return print(recordSelection(value('--run-dir'), { selectorId: value('--selector-id'), selectorContinuationId: value('--continuation-id'), winner: value('--winner'), candidates, reason: value('--reason'), evidenceDir: value('--evidence-dir', null) }));
    }
    case 'record-user-selection': return print(recordUserSelection(value('--run-dir'), { winnerKey: value('--winner-key'), reason: value('--reason', ''), alsoKeep: values('--also-keep') }));
    case 'next-kept': return print(nextKept(value('--run-dir'), { key: value('--key') }));
    case 'record-redraw': return print(recordRedraw(value('--run-dir'), { reason: value('--reason', ''), briefHash: value('--brief-hash', null) }));
    case 'recover-role': return print(recoverRole(value('--run-dir'), { role: value('--role'), key: value('--key', value('--role')), previousAgentId: value('--previous-agent-id'), replacementAgentId: value('--replacement-agent-id'), replacementContinuationId: value('--replacement-continuation-id'), reason: value('--reason'), userWords: textOption('--user-words', '--user-words-file', null) }));
    case 'verify-artifacts': return print(verifyArtifacts(value('--out'), { sourceDir: value('--source', null), requireProvenance: !has('--allow-unbound') }));
    case 'capture-provenance': return print(captureProvenance(value('--out'), value('--source', null)));
    case 'status': return print(status(value('--run-dir')));
    default: throw new Error(`Unknown command ${name}. Use --help.`);
  }
}

try { command(); } catch (error) { die(error); }
