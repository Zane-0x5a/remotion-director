#!/usr/bin/env node
/** Cross-platform entry point shipped inside the plugin. It never imports the
 * developer checkout and resolves all helpers relative to its own package root. */
import { existsSync, statSync, readFileSync, mkdirSync, cpSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  acceptCanonical, captureProvenance, continueRole, initRun, loadState, prepareSelection, recordReport,
  recordVerdict, recordSelection, recoverRole, registerRole, status, verifyArtifacts, captureVideoProvenance, verifyVideoProvenance,
} from './codex-runtime.mjs';

const PACKAGE_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const TOOL_ROOT = join(PACKAGE_ROOT, 'tools');
const asArgs = process.argv.slice(2);
const value = (name, fallback = undefined) => { const i = asArgs.indexOf(name); return i >= 0 ? asArgs[i + 1] : fallback; };
const has = (name) => asArgs.includes(name);
const help = `remotion-director Codex launcher\n\n` +
  `Usage: node <package>/tools/codex-launcher.mjs <command> [options]\n\n` +
  `Commands:\n` +
  `  prepare-environment --workspace DIR [--check] update stable Remotion and RBP (global RBP first)\n` +
  `  render-arm --workspace DIR --dir RUN --out OUT\n` +
  `  render-strip --workspace DIR --dir RUN --out OUT --video MP4\n` +
  `  init-run --run-dir DIR --brief-hash HEX --draws N --duration locked:5s|free\n` +
  `  register-role --run-dir DIR --role ROLE --agent-id ID --continuation-id ID --fresh [--key draw-N]\n` +
  `  continue-role --run-dir DIR --role ROLE --agent-id ID --continuation-id ID [--key draw-N]\n` +
  `  record-report --run-dir DIR --report-id ID --role ROLE --agent-id ID --continuation-id ID --status settled|round-done|done|blocked [--review-round R]\n` +
  `  accept-canonical --run-dir DIR --report-id ID --role builder|tempo --out-dir DIR [--source DIR]\n` +
  `  record-verdict --run-dir DIR --verdict-id ID --critic-id ID --continuation-id ID --round R --strip-dir DIR (--verdict TEXT|--verdict-file FILE) [--amend-of ID]\n` +
  `  prepare-selection --run-dir DIR --candidates-file JSON [--evidence-dir DIR]\n` +
  `  record-selection --run-dir DIR --selector-id ID --continuation-id ID --candidates-file JSON --winner LABEL --reason TEXT\n` +
  `  recover-role --run-dir DIR --role ROLE --previous-agent-id ID --replacement-agent-id ID --replacement-continuation-id ID --reason TEXT\n` +
  `  verify-artifacts --out DIR [--source DIR] [--allow-unbound]\n` +
  `  status --run-dir DIR\n\n` +
  `All state mutations fail loudly on duplicate reports, identity changes, stale artifacts,\n` +
  `or completion without a verified output. Use --json for machine-readable output.`;

function print(valueToPrint) { console.log(has('--json') ? JSON.stringify(valueToPrint, null, 2) : typeof valueToPrint === 'string' ? valueToPrint : JSON.stringify(valueToPrint, null, 2)); }
function die(error) { console.error(`[codex] FAILED ${error.code ?? 'ERROR'}: ${error.message}`); process.exitCode = 1; }

function findTsx(workspace) {
  const candidates = [join(workspace, 'node_modules', 'tsx', 'dist', 'cli.mjs'), join(workspace, 'node_modules', 'tsx', 'dist', 'cli.cjs')];
  const hit = candidates.find((file) => existsSync(file));
  if (!hit) throw new Error(`tsx is missing from ${workspace}; run prepare-environment in the workspace first.`);
  return hit;
}

function runNodeTool(tool, args) {
  const workspace = resolve(value('--workspace', process.cwd()));
  if (!existsSync(join(workspace, 'package.json'))) throw new Error(`Workspace package.json is missing: ${workspace}`);
  const tsx = findTsx(workspace);
  const env = { ...process.env, NODE_PATH: join(workspace, 'node_modules') };
  // Node's ESM resolver does not honor NODE_PATH for bare imports when the
  // source file lives outside the workspace. Stage this package-owned helper
  // under the prepared workspace so its nearest node_modules is the user's
  // dependency tree. The package itself stays read-only and dependency-free.
  const cache = join(workspace, '.remotion-director', 'codex-tools');
  mkdirSync(cache, { recursive: true });
  const target = join(TOOL_ROOT, `${tool}.ts`);
  const staged = join(cache, `${tool}.ts`);
  cpSync(target, staged, { force: true });
  const result = spawnSync(process.execPath, [tsx, staged, ...args], { cwd: workspace, env, stdio: 'inherit', windowsHide: true });
  if (result.error || result.status !== 0) throw new Error(`${tool} failed${result.error ? `: ${result.error.message}` : ` with exit ${result.status}`}`);
}

function runPrepare() {
  const workspace = resolve(value('--workspace', process.cwd()));
  mkdirSync(workspace, { recursive: true });
  const result = spawnSync(process.execPath, [join(TOOL_ROOT, 'check-env.mjs'), '--workspace', workspace, ...(has('--check') ? ['--check'] : [])], { cwd: workspace, stdio: 'inherit', windowsHide: true });
  if (result.error || result.status !== 0) throw new Error(`Environment preparation failed${result.error ? `: ${result.error.message}` : ` with exit ${result.status}`}`);
}

function command() {
  const name = asArgs[0];
  if (!name || name === '--help' || name === '-h' || name === 'help') { console.log(help); return; }
  switch (name) {
    case 'prepare-environment': return runPrepare();
    case 'render-arm': { const args = asArgs.slice(1).filter((a) => a !== '--json'); runNodeTool('render-arm', args); captureVideoProvenance(value('--out', join(value('--dir'), 'out')), value('--dir')); return; }
    case 'render-strip': { const args = asArgs.slice(1).filter((a) => a !== '--json'); const stripOut = resolve(value('--out')); const out = resolve(stripOut, '..'); verifyVideoProvenance(out, value('--dir')); runNodeTool('render-strip', args); captureProvenance(out, value('--dir')); return; }
    case 'init-run': {
      const duration = value('--duration'); const durationAuthority = duration === 'free' ? 'free' : duration?.startsWith('locked:') ? `locked ${duration.slice(7)}${duration.slice(-1) === 's' ? '' : 's'}` : duration;
      return print(initRun({ runDir: value('--run-dir'), briefHash: value('--brief-hash'), draws: Number(value('--draws')), durationAuthority, spec: value('--spec') ? JSON.parse(value('--spec')) : {} }));
    }
    case 'register-role': return print(registerRole(value('--run-dir'), { role: value('--role'), key: value('--key', value('--role')), agentId: value('--agent-id'), continuationId: value('--continuation-id'), parentId: value('--parent-id', null), fresh: has('--fresh') }));
    case 'continue-role': return print(continueRole(value('--run-dir'), { role: value('--role'), key: value('--key', value('--role')), agentId: value('--agent-id'), continuationId: value('--continuation-id'), messageHash: value('--message-hash', null) }));
    case 'record-report': return print(recordReport(value('--run-dir'), { id: value('--report-id'), role: value('--role'), key: value('--key', null), status: value('--status'), reviewRound: value('--review-round') ? Number(value('--review-round')) : null, agentId: value('--agent-id'), continuationId: value('--continuation-id'), outDir: value('--out-dir', null), stripDir: value('--strip-dir', null), text: value('--text', '') }));
    case 'accept-canonical': return print(acceptCanonical(value('--run-dir'), { reportId: value('--report-id'), role: value('--role'), outDir: value('--out-dir'), sourceDir: value('--source', null), reviewRound: value('--review-round') ? Number(value('--review-round')) : null, stripDir: value('--strip-dir', null) }));
    case 'prepare-selection': {
      const candidates = JSON.parse(readFileSync(value('--candidates-file'), 'utf8'));
      return print(prepareSelection(value('--run-dir'), { candidates, evidenceDir: value('--evidence-dir', null) }));
    }
    case 'record-verdict': {
      const verdictFile = value('--verdict-file'); const verdict = verdictFile ? readFileSync(verdictFile, 'utf8') : value('--verdict');
      return print(recordVerdict(value('--run-dir'), { id: value('--verdict-id'), criticId: value('--critic-id'), criticContinuationId: value('--continuation-id'), round: Number(value('--round')), stripDir: value('--strip-dir'), verdict, amendmentOf: value('--amend-of', null), rebuttalOf: value('--rebuttal-of', null) }));
    }
    case 'record-selection': {
      const candidates = JSON.parse(readFileSync(value('--candidates-file'), 'utf8'));
      return print(recordSelection(value('--run-dir'), { selectorId: value('--selector-id'), selectorContinuationId: value('--continuation-id'), winner: value('--winner'), candidates, reason: value('--reason'), evidenceDir: value('--evidence-dir', null) }));
    }
    case 'recover-role': return print(recoverRole(value('--run-dir'), { role: value('--role'), key: value('--key', value('--role')), previousAgentId: value('--previous-agent-id'), replacementAgentId: value('--replacement-agent-id'), replacementContinuationId: value('--replacement-continuation-id'), reason: value('--reason') }));
    case 'verify-artifacts': return print(verifyArtifacts(value('--out'), { sourceDir: value('--source', null), requireProvenance: !has('--allow-unbound') }));
    case 'capture-provenance': return print(captureProvenance(value('--out'), value('--source', null)));
    case 'status': return print(status(value('--run-dir')));
    default: throw new Error(`Unknown command ${name}. Use --help.`);
  }
}

try { command(); } catch (error) { die(error); }
