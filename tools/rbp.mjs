import { createHash } from 'node:crypto';
import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

export const RBP_SOURCE = 'https://github.com/remotion-dev/skills';
const SKILL = 'remotion-best-practices';

export function globalRbpPaths({ userHome = homedir(), env = process.env } = {}) {
  return [...new Set([
    join(userHome, '.agents', 'skills', SKILL, 'SKILL.md'),
    join(env.CODEX_HOME || join(userHome, '.codex'), 'skills', SKILL, 'SKILL.md'),
    join(env.CLAUDE_CONFIG_DIR || join(userHome, '.claude'), 'skills', SKILL, 'SKILL.md'),
  ])];
}

export function rbpPath(workspace) {
  return join(workspace, '.remotion-director', '.agents', 'skills', SKILL, 'SKILL.md');
}

export function inspectRbpPath(path) {
  if (!existsSync(path)) throw new Error(`RBP not prepared: ${path}. Run check-env without --check.`);
  const text = readFileSync(path, 'utf8').replace(/^\uFEFF/, '');
  const frontmatter = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!frontmatter || !/^name:\s*["']?remotion-best-practices["']?\s*$/m.test(frontmatter[1])) {
    throw new Error(`Invalid upstream RBP skill: ${path}`);
  }
  return { path, version: frontmatter[1].match(/^version:\s*["']?([^\s"']+)["']?\s*$/m)?.[1] ?? null };
}

function treeHash(directory) {
  const hash = createHash('sha256');
  function visit(dir, prefix = '') {
    for (const name of readdirSync(dir).sort()) {
      const file = join(dir, name);
      const entry = lstatSync(file);
      // Reject nested links: the upstream skill must be a self-contained directory.
      if (entry.isSymbolicLink()) throw new Error(`RBP contains a nested symbolic link: ${file}`);
      hash.update(`${prefix}${name}\0${entry.isDirectory() ? 'dir' : 'file'}\0`);
      if (entry.isDirectory()) visit(file, `${prefix}${name}/`);
      else hash.update(readFileSync(file));
    }
  }
  visit(directory);
  return hash.digest('hex');
}

function replaceSkill(source, target) {
  mkdirSync(dirname(target), { recursive: true });
  const staging = mkdtempSync(join(dirname(target), '.rbp-update-'));
  const prepared = join(staging, 'prepared');
  const backup = join(staging, 'previous');
  try {
    cpSync(source, prepared, { recursive: true });
    if (treeHash(source) !== treeHash(prepared)) throw new Error('Incomplete RBP copy');
    if (existsSync(target)) renameSync(target, backup);
    try { renameSync(prepared, target); }
    catch (error) {
      if (existsSync(backup)) renameSync(backup, target);
      throw error;
    }
  } finally {
    // If rollback itself failed, leave the only old copy recoverable at the reported staging path.
    if (!existsSync(target) && existsSync(backup)) throw new Error(`RBP replacement failed; previous files retained at ${backup}`);
    rmSync(staging, { recursive: true, force: true });
  }
}

export function syncRbp({ workspace, execute, log = console.log, globalPaths = globalRbpPaths() }) {
  const globalPath = globalPaths.find(path => existsSync(dirname(path)));
  const selected = globalPath ?? rbpPath(workspace);
  // Resolve the directory, preserving any host symlink/junction pointing to it.
  const target = existsSync(dirname(selected)) ? realpathSync(dirname(selected)) : dirname(selected);
  const temporary = mkdtempSync(join(tmpdir(), 'remotion-rbp-'));
  try {
    log(`[update] Checking official RBP upstream; ${globalPath ? 'reuse global' : 'workspace install'}: ${selected}`);
    const repository = join(temporary, 'upstream');
    execute('git', ['-c', 'core.autocrlf=false', 'clone', '--depth', '1', RBP_SOURCE, repository], { timeout: 120_000 });
    const source = join(repository, 'skills', SKILL);
    inspectRbpPath(join(source, 'SKILL.md'));
    const contentHash = treeHash(source);
    const revision = execute('git', ['-C', repository, 'rev-parse', 'HEAD']).trim();
    if (!/^[a-f0-9]{40,64}$/i.test(revision)) throw new Error('Invalid upstream RBP revision');
    if (!existsSync(target) || treeHash(target) !== contentHash) {
      replaceSkill(source, target);
      log('[update] RBP updated in place');
    } else log('[update] RBP already matches upstream; reusing existing files');
    return { ...inspectRbpPath(selected), revision, contentHash, scope: globalPath ? 'global' : 'workspace' };
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}
