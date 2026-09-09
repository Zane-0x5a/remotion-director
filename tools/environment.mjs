import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, delimiter, dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { globalRbpPaths, inspectRbpPath, RBP_SOURCE, rbpPath, syncRbp } from './rbp.mjs';

export { inspectRbpPath, rbpPath } from './rbp.mjs';

const SECTIONS = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'];
const isRemotion = (name) => name === 'remotion' || name.startsWith('@remotion/');
const stableVersion = (version) => typeof version === 'string' && /^\d+\.\d+\.\d+$/.test(version);
const queryOptions = ['--json', '--prefer-online', '--fetch-timeout=30000', '--fetch-retries=1'];

export function run(command, args, options = {}) {
  let executable = command;
  let argv = args;
  if (command === 'npm' && process.platform === 'win32') {
    // Run npm through Node rather than passing arguments through cmd.exe.
    const candidates = [process.env.npm_execpath,
      ...[dirname(process.execPath), ...(process.env.PATH ?? '').split(delimiter)]
        .map(directory => join(directory.replace(/^"|"$/g, ''), 'node_modules', 'npm', 'bin', 'npm-cli.js'))];
    const npmCli = candidates.find(path => path?.endsWith('npm-cli.js') && existsSync(path));
    if (!npmCli) throw new Error('npm-cli.js not found; install Node.js with npm and put it on PATH.');
    executable = process.execPath;
    argv = [npmCli, ...args];
  }
  const result = spawnSync(executable, argv, {
    encoding: 'utf8', timeout: 300_000, maxBuffer: 8 * 1024 * 1024,
    ...options,
  });
  if (result.error || result.status !== 0) {
    throw new Error(`${command} ${args.slice(0, 3).join(' ')} failed: ${result.error?.message ?? (result.stderr?.trim() || `exit ${result.status}`)}`);
  }
  return result.stdout ?? '';
}

function readJson(path) {
  const value = JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, ''));
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Expected a JSON object: ${path}`);
  return value;
}

function manifestAt(workspace) {
  const path = join(workspace, 'package.json');
  if (existsSync(path)) return readJson(path); // Never replace a corrupt manifest with scaffolding.
  return { name: basename(workspace).toLowerCase().replace(/[^a-z0-9-]+/g, '-') || 'motion-piece', private: true };
}

export function planDependencies(current, defaults, version, studioDependencies) {
  if (!stableVersion(version)) throw new Error(`npm latest did not resolve to a stable Remotion version: ${version}`);
  const planned = structuredClone(current);
  for (const section of SECTIONS) {
    if (planned[section] != null && (typeof planned[section] !== 'object' || Array.isArray(planned[section]))) {
      throw new Error(`Invalid ${section} in package.json`);
    }
  }
  // Existing packages stay in their original sections; add only absent toolchain dependencies.
  for (const section of ['dependencies', 'devDependencies']) {
    for (const [name, spec] of Object.entries(defaults[section] ?? {})) {
      if (!SECTIONS.some((key) => Object.hasOwn(planned[key] ?? {}, name))) {
        (planned[section] ??= {})[name] = spec;
      }
    }
  }
  for (const section of SECTIONS) {
    for (const name of Object.keys(planned[section] ?? {})) {
      if (isRemotion(name)) {
        planned[section][name] = version;
      } else if (['zod', 'mediabunny', '@huggingface/transformers'].includes(name) || name.startsWith('@mediabunny/')) {
        const spec = studioDependencies[name] ?? (name.startsWith('@mediabunny/') ? studioDependencies.mediabunny : undefined);
        if (spec) planned[section][name] = spec;
      }
    }
  }
  return planned;
}

function installedVersion(workspace, name) {
  try { return readJson(join(workspace, 'node_modules', ...name.split('/'), 'package.json')).version; }
  catch { return null; }
}

function engineErrors(workspace, manifest, expected) {
  const errors = [];
  for (const section of SECTIONS) {
    for (const [name, spec] of Object.entries(manifest[section] ?? {})) {
      if (!isRemotion(name)) continue;
      const actual = installedVersion(workspace, name);
      if (actual !== expected || spec !== expected) errors.push(`${name}: declared ${spec}, installed ${actual ?? 'missing'}, expected ${expected}`);
    }
  }
  for (const name of ['remotion', '@remotion/bundler', '@remotion/renderer', '@remotion/cli', 'tsx', 'typescript', 'react', 'react-dom', 'three', '@react-three/fiber']) {
    if (!installedVersion(workspace, name)) errors.push(`Required dependency missing or unreadable: ${name}`);
  }
  return errors;
}

export function inspectRbp(workspace) {
  const receiptPath = join(workspace, '.remotion-director', 'environment.json');
  const path = existsSync(receiptPath) ? readJson(receiptPath).rbpSkillPath : rbpPath(workspace);
  if (typeof path !== 'string') throw new Error('Invalid recorded RBP skill path; rerun check-env without --check.');
  return inspectRbpPath(path);
}

export async function syncEnvironment({ workspace, pluginRoot, execute = run, log = console.log, globalPaths = globalRbpPaths() }) {
  const current = manifestAt(workspace);
  const defaults = readJson(join(pluginRoot, 'package.json'));
  const version = JSON.parse(execute('npm', ['view', 'remotion', 'dist-tags.latest', ...queryOptions], { cwd: pluginRoot }));
  if (!stableVersion(version)) throw new Error(`Invalid stable Remotion release: ${version}`);
  const studioDependencies = JSON.parse(execute('npm', ['view', `@remotion/studio@${version}`, 'dependencies', ...queryOptions], { cwd: pluginRoot }));
  if (!studioDependencies || typeof studioDependencies !== 'object' || Array.isArray(studioDependencies)) throw new Error('Invalid dependency metadata from @remotion/studio');
  const planned = planDependencies(current, defaults, version, studioDependencies);
  mkdirSync(workspace, { recursive: true });
  const skillWorkspace = join(workspace, '.remotion-director');
  const receiptPath = join(skillWorkspace, 'environment.json');
  // Once installation starts, the previous successful preparation no longer describes this workspace.
  rmSync(receiptPath, { force: true });
  const manifestPath = join(workspace, 'package.json');
  if (JSON.stringify(current) !== JSON.stringify(planned) || !existsSync(manifestPath)) {
    writeFileSync(manifestPath, JSON.stringify(planned, null, 2) + '\n', 'utf8');
  }
  log(`[update] Remotion latest = ${version}; installing one consistent package set`);
  execute('npm', ['install', '--no-audit', '--no-fund'], { cwd: workspace, stdio: 'inherit' });
  const errors = engineErrors(workspace, readJson(manifestPath), version);
  if (errors.length) throw new Error(`Engine update incomplete:\n${errors.join('\n')}`);

  mkdirSync(skillWorkspace, { recursive: true });
  const rbp = syncRbp({ workspace, execute, log, globalPaths });
  const environment = { updatedAt: new Date().toISOString(), remotion: version, rbpSource: RBP_SOURCE,
    rbpVersion: rbp.version, rbpSkillPath: rbp.path, rbpRevision: rbp.revision, rbpContentHash: rbp.contentHash, rbpScope: rbp.scope };
  writeFileSync(receiptPath, JSON.stringify(environment, null, 2) + '\n', 'utf8');
  return environment;
}

export function checkEnvironment(workspace, execute = run) {
  const messages = [];
  const errors = [];
  const manifest = manifestAt(workspace);
  const version = installedVersion(workspace, 'remotion');
  if (!stableVersion(version)) errors.push('Remotion is missing or is not a stable release. Run check-env without --check.');
  errors.push(...engineErrors(workspace, manifest, version));
  if (!errors.length) messages.push(`Engine dependencies aligned at Remotion ${version}`);
  try {
    const receipt = readJson(join(workspace, '.remotion-director', 'environment.json'));
    if (receipt.remotion !== version) throw new Error('Recorded engine differs from installed engine');
  } catch {
    errors.push('No completed preparation for this engine. An update may have been interrupted; rerun check-env without --check.');
  }
  try {
    const rbp = inspectRbp(workspace);
    messages.push(`RBP_SKILL_PATH=${rbp.path}`);
    messages.push(`RBP upstream version: ${rbp.version ?? 'not declared by upstream'}`);
    if (rbp.version && rbp.version !== version) messages.push(`Note: installed RBP (${rbp.version}) and engine (${version}) differ; use actual installed APIs. Their release schedules are independent.`);
  } catch (error) { errors.push(error.message); }
  try {
    // Exercise the operations needed by strip analysis and native crops, not just ffmpeg -version.
    execute('ffmpeg', ['-v', 'error', '-f', 'rawvideo', '-pixel_format', 'gray', '-video_size', '2x2', '-i', 'pipe:0',
      '-frames:v', '1', '-vf', 'scale=2:2,crop=1:1', '-f', 'rawvideo', '-pix_fmt', 'gray', 'pipe:1'],
    { input: Buffer.from([0, 64, 128, 255]), timeout: 15_000 });
    messages.push('ffmpeg rawvideo, scale and crop work');
  } catch (error) { errors.push(`A full ffmpeg build is required on PATH (rawvideo, scale, crop): ${error.message}`); }
  return { messages, errors };
}
