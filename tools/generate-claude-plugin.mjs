#!/usr/bin/env node
/**
 * Generate the self-contained Claude Code distribution.
 *
 * The repository root is the authoring source for the Claude plugin.  A marketplace
 * installation points at claude-plugin/, so that directory must contain every file
 * Claude needs and none of the Codex adapter or development material.  Source
 * Markdown and agent bodies are copied byte-for-byte; this generator only composes
 * the small package manifest and provenance receipt around them.
 */
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'claude-plugin');
const SOURCE = {
  manifest: join(ROOT, '.claude-plugin', 'plugin.json'),
  skills: join(ROOT, 'skills'),
  agents: join(ROOT, 'agents'),
  tools: join(ROOT, 'tools'),
  package: join(ROOT, 'package.json'),
  license: join(ROOT, 'LICENSE'),
  tsconfig: join(ROOT, 'tsconfig.json'),
};

// These are the only runtime tools Claude's source skill invokes.  The Codex
// launcher/runtime and their ledgers are deliberately outside this closure.
const RUNTIME_TOOLS = ['check-env.mjs', 'environment.mjs', 'rbp.mjs', 'render-arm.ts', 'render-strip.ts'];
const REQUIRED_ROOT_FILES = ['LICENSE', 'tsconfig.json'];
const PROVENANCE_FILE = 'SOURCE-PROVENANCE.json';

function walk(root) {
  if (!existsSync(root)) return [];
  const result = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile()) result.push(path);
      else throw new Error(`Unsupported source entry (symlink or special file): ${path}`);
    }
  };
  visit(root);
  return result.sort();
}

function normalizePath(path) { return path.replaceAll('\\', '/'); }
function normalizeText(text) { return text.replace(/\r\n?/g, '\n'); }

function hashFiles(root, paths = walk(root)) {
  const hash = createHash('sha256');
  for (const path of paths) {
    hash.update(normalizePath(relative(root, path))).update('\0');
    // Git may check the same text out with LF or CRLF.  Provenance describes
    // source content rather than checkout plumbing, so normalize newlines here.
    hash.update(normalizeText(readFileSync(path, 'utf8'))).update('\0');
  }
  return { hash: hash.digest('hex'), count: paths.length };
}

function hashFile(path) {
  const hash = createHash('sha256');
  hash.update(normalizeText(readFileSync(path, 'utf8')));
  return hash.digest('hex');
}

function sourceSnapshot() {
  const source = {
    manifest: { hash: hashFile(SOURCE.manifest), count: 1 },
    skills: hashFiles(SOURCE.skills),
    agents: hashFiles(SOURCE.agents),
    tools: hashFiles(SOURCE.tools, RUNTIME_TOOLS.map((name) => join(SOURCE.tools, name))),
    package: { hash: hashFile(SOURCE.package), count: 1 },
  };
  for (const name of REQUIRED_ROOT_FILES) {
    const path = join(ROOT, name);
    if (!existsSync(path)) throw new Error(`Required root file is missing: ${path}`);
    source[name.toLowerCase()] = { hash: hashFile(path), count: 1 };
  }
  return source;
}

function copyTree(source, target) {
  for (const path of walk(source)) {
    const destination = join(target, relative(source, path));
    mkdirSync(dirname(destination), { recursive: true });
    copyFileSync(path, destination);
  }
}

function packageDefaults() {
  if (!existsSync(SOURCE.package)) throw new Error(`Root package manifest is missing: ${SOURCE.package}`);
  const rootPackage = JSON.parse(readFileSync(SOURCE.package, 'utf8').replace(/^\uFEFF/, ''));
  // environment.mjs reads dependencies and devDependencies as defaults for a
  // user's workspace.  Keep identity and licensing useful to package tooling,
  // while omitting scripts, lockfiles and other repository-only metadata.
  const result = {
    name: rootPackage.name,
    version: rootPackage.version,
    private: rootPackage.private ?? true,
    license: rootPackage.license,
    description: rootPackage.description,
    dependencies: rootPackage.dependencies ?? {},
    devDependencies: rootPackage.devDependencies ?? {},
  };
  if (rootPackage.type !== undefined) result.type = rootPackage.type;
  return result;
}

function provenance() {
  return {
    generatedAt: new Date().toISOString(),
    sourceRoot: '.claude-plugin/plugin.json, skills/, agents/, tools/, package.json, LICENSE, tsconfig.json',
    runtimeTools: RUNTIME_TOOLS,
    source: sourceSnapshot(),
    output: {
      manifest: '.claude-plugin/plugin.json',
      skills: 'skills/',
      agents: 'agents/',
      tools: RUNTIME_TOOLS.map((name) => `tools/${name}`),
      rootFiles: REQUIRED_ROOT_FILES,
      package: 'package.json',
    },
  };
}

function assertSourceReady() {
  for (const path of [SOURCE.manifest, SOURCE.skills, SOURCE.agents, SOURCE.package, SOURCE.license, SOURCE.tsconfig]) {
    if (!existsSync(path)) throw new Error(`Claude source is missing: ${path}`);
  }
  for (const name of RUNTIME_TOOLS) {
    const path = join(SOURCE.tools, name);
    if (!existsSync(path)) throw new Error(`Claude runtime tool is missing: ${path}`);
  }
}

function comparablePath(path) {
  const value = resolve(path).replaceAll('\\', '/');
  return process.platform === 'win32' ? value.toLowerCase() : value;
}

function isWithin(path, parent) {
  const value = comparablePath(path);
  const root = comparablePath(parent);
  return value === root || value.startsWith(root + '/');
}

/**
 * Guard the destructive replacement performed by generatePackage().  Test calls
 * may use a disposable temp directory, so confinement means rejecting the source
 * tree (and its ancestors), not requiring the target to be under the repository.
 */
function assertSafeOutput(target) {
  const destination = resolve(target);
  if (destination === ROOT) {
    throw new Error(`Refusing to replace an output that contains the source tree: ${destination}`);
  }
  if (isWithin(destination, ROOT) && destination !== OUT) {
    throw new Error(`Refusing to replace an in-repository path other than ${OUT}: ${destination}`);
  }
  const protectedSources = [SOURCE.manifest, SOURCE.skills, SOURCE.agents, SOURCE.tools,
    SOURCE.package, SOURCE.license, SOURCE.tsconfig];
  // Reject both directions: an output below a source directory could delete
  // authoring files, while an output above one would delete the source tree as
  // part of its recursive replacement.
  if (protectedSources.some((path) => destination === resolve(path)
    || isWithin(destination, path) || isWithin(path, destination))) {
    throw new Error(`Refusing to replace a source path: ${destination}`);
  }
  // Check the destination and every existing ancestor.  A symlinked ancestor can
  // redirect an apparently disposable path into the source tree even when the
  // lexical path itself looks safe.  Stop at the filesystem root.
  let current = destination;
  while (true) {
    try {
      const stat = lstatSync(current);
      // Junctions on Windows can be reported differently from POSIX symlinks;
      // realpath comparison catches both kinds of redirecting ancestor.
      const canonical = comparablePath(realpathSync(current));
      if (stat.isSymbolicLink() || canonical !== comparablePath(current)) {
        throw new Error(`Refusing to replace a symlink output path: ${current}`);
      }
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  if (existsSync(destination)) {
    const stat = lstatSync(destination);
    if (!stat.isDirectory()) throw new Error(`Refusing to replace a non-directory output path: ${destination}`);
    const entries = readdirSync(destination);
    const owned = existsSync(join(destination, PROVENANCE_FILE))
      && existsSync(join(destination, '.claude-plugin', 'plugin.json'));
    if (entries.length > 0 && !owned) {
      throw new Error(`Refusing to replace a non-generated directory; use a new empty path: ${destination}`);
    }
  }
}

function generatePackage(target = OUT) {
  assertSourceReady();
  assertSafeOutput(target);
  const destination = resolve(target);
  rmSync(destination, { recursive: true, force: true });
  mkdirSync(destination, { recursive: true });

  mkdirSync(join(destination, '.claude-plugin'), { recursive: true });
  copyFileSync(SOURCE.manifest, join(destination, '.claude-plugin', 'plugin.json'));
  copyTree(SOURCE.skills, join(destination, 'skills'));
  copyTree(SOURCE.agents, join(destination, 'agents'));
  mkdirSync(join(destination, 'tools'), { recursive: true });
  for (const name of RUNTIME_TOOLS) copyFileSync(join(SOURCE.tools, name), join(destination, 'tools', name));
  for (const name of REQUIRED_ROOT_FILES) copyFileSync(join(ROOT, name), join(destination, name));
  writeFileSync(join(destination, 'package.json'), JSON.stringify(packageDefaults(), null, 2) + '\n', 'utf8');
  writeFileSync(join(destination, PROVENANCE_FILE), JSON.stringify(provenance(), null, 2) + '\n', 'utf8');
  return { package: destination, source: sourceSnapshot(), runtimeTools: RUNTIME_TOOLS };
}

function comparableContent(path) {
  const text = normalizeText(readFileSync(path, 'utf8'));
  if (path.endsWith(PROVENANCE_FILE)) {
    const value = JSON.parse(text);
    delete value.generatedAt;
    return JSON.stringify(value, null, 2) + '\n';
  }
  return text;
}

function relativeFiles(root) {
  return walk(root).map((path) => normalizePath(relative(root, path)));
}

function compareTrees(actualRoot, expectedRoot) {
  if (!existsSync(actualRoot)) throw new Error(`Generated Claude package is missing: ${actualRoot}`);
  const actual = relativeFiles(actualRoot);
  const expected = relativeFiles(expectedRoot);
  const actualSet = new Set(actual);
  const expectedSet = new Set(expected);
  const missing = expected.filter((path) => !actualSet.has(path));
  const extra = actual.filter((path) => !expectedSet.has(path));
  const changed = expected.filter((path) => actualSet.has(path)
    && comparableContent(join(actualRoot, path)) !== comparableContent(join(expectedRoot, path)));
  if (missing.length || extra.length || changed.length) {
    const details = [
      missing.length ? `missing: ${missing.join(', ')}` : '',
      extra.length ? `extra: ${extra.join(', ')}` : '',
      changed.length ? `changed: ${changed.join(', ')}` : '',
    ].filter(Boolean).join('; ');
    throw new Error(`Generated Claude package drift detected; run node tools/generate-claude-plugin.mjs. ${details}`);
  }
}

function validateOutput(outputRoot = OUT) {
  assertSourceReady();
  const root = resolve(outputRoot);
  if (!existsSync(root)) throw new Error(`Generated Claude package is missing: ${root}`);
  const manifestPath = join(root, '.claude-plugin', 'plugin.json');
  if (!existsSync(manifestPath)) throw new Error('Generated Claude plugin manifest is missing: .claude-plugin/plugin.json');
  const sourceManifest = readFileSync(SOURCE.manifest, 'utf8');
  if (normalizeText(readFileSync(manifestPath, 'utf8')) !== normalizeText(sourceManifest)) {
    throw new Error('Generated Claude plugin manifest is stale; run node tools/generate-claude-plugin.mjs.');
  }
  const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  if (JSON.stringify(packageJson) !== JSON.stringify(packageDefaults())) {
    throw new Error('Generated Claude package defaults are stale; run node tools/generate-claude-plugin.mjs.');
  }
  for (const name of RUNTIME_TOOLS) {
    if (!existsSync(join(root, 'tools', name))) throw new Error(`Generated Claude runtime tool is missing: ${name}`);
  }
  const receiptPath = join(root, PROVENANCE_FILE);
  if (!existsSync(receiptPath)) throw new Error(`Generated Claude provenance is missing: ${PROVENANCE_FILE}`);
  const receipt = JSON.parse(readFileSync(receiptPath, 'utf8'));
  const current = sourceSnapshot();
  for (const [key, value] of Object.entries(current)) {
    if (receipt.source?.[key]?.hash !== value.hash || receipt.source?.[key]?.count !== value.count) {
      throw new Error(`Generated Claude package is stale for ${key}; run node tools/generate-claude-plugin.mjs.`);
    }
  }
  return { package: root, source: current, runtimeTools: RUNTIME_TOOLS };
}

function checkGeneratedPackage() {
  const temporary = mkdtempSync(join(tmpdir(), 'remotion-director-claude-generator-'));
  try {
    generatePackage(temporary);
    const result = validateOutput(OUT);
    compareTrees(OUT, temporary);
    return result;
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

function main() {
  if (process.argv.includes('--check')) {
    console.log(JSON.stringify(checkGeneratedPackage(), null, 2));
    return;
  }
  const result = generatePackage(OUT);
  console.log(`Generated ${result.package}`);
  console.log(`runtime tools: ${result.runtimeTools.join(', ')}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main();

export {
  OUT,
  SOURCE,
  RUNTIME_TOOLS,
  REQUIRED_ROOT_FILES,
  PROVENANCE_FILE,
  packageDefaults,
  hashFiles,
  hashFile,
  sourceSnapshot,
  generatePackage,
  compareTrees,
  validateOutput,
  checkGeneratedPackage,
  assertSafeOutput,
};
