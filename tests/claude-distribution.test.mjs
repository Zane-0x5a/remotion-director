import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  OUT,
  REQUIRED_ROOT_FILES,
  RUNTIME_TOOLS,
  SOURCE,
  assertSafeOutput,
  compareTrees,
  generatePackage,
  hashFiles,
  packageDefaults,
  validateOutput,
} from '../tools/generate-claude-plugin.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_FILES = (root) => {
  const files = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile()) files.push(path);
    }
  };
  visit(root);
  return files.sort();
};
const relativeFiles = (root) => SOURCE_FILES(root).map((path) => path.slice(root.length + 1).replaceAll('\\', '/'));
const temporaryRoot = () => mkdtempSync(join(tmpdir(), 'remotion-director-claude-distribution-'));

test('generated Claude package contains the complete dependency closure and no Codex/development baggage', () => {
  const root = temporaryRoot();
  try {
    const output = join(root, 'package');
    generatePackage(output);
    validateOutput(output);

    const expected = [
      '.claude-plugin/plugin.json',
      'LICENSE',
      'SOURCE-PROVENANCE.json',
      'package.json',
      'tsconfig.json',
      ...relativeFiles(SOURCE.skills).map((path) => `skills/${path}`),
      ...relativeFiles(SOURCE.agents).map((path) => `agents/${path}`),
      ...RUNTIME_TOOLS.map((name) => `tools/${name}`),
    ].sort();
    assert.deepEqual(relativeFiles(output), expected);

    for (const forbidden of [
      'codex-plugin', 'dsh', 'docs', 'tests', 'README.md', 'README.zh-CN.md', '.git',
      'package-lock.json', 'npm-shrinkwrap.json', 'yarn.lock', 'pnpm-lock.yaml', 'bun.lock', 'bun.lockb',
    ]) {
      assert.equal(existsSync(join(output, forbidden)), false, `Claude payload unexpectedly contains ${forbidden}`);
    }
    assert.equal(existsSync(join(output, 'tools', 'codex-launcher.mjs')), false);
    assert.equal(existsSync(join(output, 'tools', 'codex-runtime.mjs')), false);

    // Import the transitive ESM closure through the real executable entry point.
    // --help exits before touching npm, ffmpeg or a user workspace, but it loads
    // check-env -> environment -> rbp and therefore catches omitted runtime files.
    const help = spawnSync(process.execPath, [join(output, 'tools', 'check-env.mjs'), '--help'], { encoding: 'utf8' });
    assert.equal(help.status, 0, help.stderr);
    assert.doesNotMatch(help.stderr, /ERR_MODULE_NOT_FOUND|Cannot find module/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('skills, agents, runtime tools and license preserve source bytes exactly', () => {
  const root = temporaryRoot();
  try {
    const output = join(root, 'package');
    generatePackage(output);
    for (const [sourceRoot, outputRoot] of [[SOURCE.skills, join(output, 'skills')], [SOURCE.agents, join(output, 'agents')]]) {
      for (const source of SOURCE_FILES(sourceRoot)) {
        const relative = source.slice(sourceRoot.length + 1);
        assert.deepEqual(readFileSync(join(outputRoot, relative)), readFileSync(source), relative);
      }
    }
    for (const name of [...RUNTIME_TOOLS, ...REQUIRED_ROOT_FILES]) {
      const source = name === 'LICENSE' || name === 'tsconfig.json' ? join(ROOT, name) : join(SOURCE.tools, name);
      assert.deepEqual(readFileSync(join(output, name === 'LICENSE' || name === 'tsconfig.json' ? name : `tools/${name}`)), readFileSync(source), name);
    }
    assert.deepEqual(JSON.parse(readFileSync(join(output, 'package.json'), 'utf8')), packageDefaults());
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('generator detects changed, missing and extra payload files without touching source', () => {
  const root = temporaryRoot();
  try {
    const expected = join(root, 'expected');
    const actual = join(root, 'actual');
    generatePackage(expected);
    generatePackage(actual);
    compareTrees(actual, expected);
    const sourceBefore = readFileSync(join(SOURCE.skills, 'create', 'SKILL.md'));

    const changed = join(actual, 'skills', 'create', 'SKILL.md');
    writeFileSync(changed, `${readFileSync(changed, 'utf8')}\nchanged\n`, 'utf8');
    assert.throws(() => compareTrees(actual, expected), /changed/);
    generatePackage(actual);

    rmSync(join(actual, 'tools', RUNTIME_TOOLS[0]));
    assert.throws(() => compareTrees(actual, expected), /missing.*tools\/check-env\.mjs/);
    generatePackage(actual);

    writeFileSync(join(actual, 'unexpected.txt'), 'drift', 'utf8');
    assert.throws(() => compareTrees(actual, expected), /extra.*unexpected\.txt/);
    assert.deepEqual(readFileSync(join(SOURCE.skills, 'create', 'SKILL.md')), sourceBefore);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('output safety rejects source tree and symlink replacement boundaries', () => {
  assert.throws(() => assertSafeOutput(ROOT), /source tree/i);
  assert.throws(() => assertSafeOutput(join(ROOT, 'skills', 'generated')), /in-repository|source path/i);
  const root = temporaryRoot();
  try {
    const output = join(root, 'package');
    generatePackage(output);
    assert.doesNotThrow(() => assertSafeOutput(output));

    // Junctions are the Windows equivalent of directory symlinks.  Some locked
    // down runners do not permit creating one; in that case the lexical guards
    // above still run and this platform-specific assertion is skipped.
    const link = join(root, 'source-link');
    try {
      symlinkSync(ROOT, link, 'junction');
      assert.throws(() => assertSafeOutput(join(link, 'would-delete-source')), /symlink/i);
    } catch (error) {
      if (!['EPERM', 'EACCES', 'UNKNOWN'].includes(error?.code)) throw error;
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('provenance hashes are stable across checkout line endings', () => {
  const root = temporaryRoot();
  try {
    const lfRoot = join(root, 'lf');
    const crlfRoot = join(root, 'crlf');
    const lf = join(lfRoot, 'content.txt');
    const crlf = join(crlfRoot, 'content.txt');
    mkdirSync(lfRoot, { recursive: true });
    mkdirSync(crlfRoot, { recursive: true });
    writeFileSync(lf, 'one\ntwo\n', 'utf8');
    writeFileSync(crlf, 'one\r\ntwo\r\n', 'utf8');
    assert.deepEqual(hashFiles(lfRoot), hashFiles(crlfRoot));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('checked repository payload matches a disposable regeneration', () => {
  // OUT is read-only here; check uses a temporary generation and compares every
  // file while ignoring only the timestamp in SOURCE-PROVENANCE.json.
  validateOutput(OUT);
  const root = temporaryRoot();
  try {
    const expected = join(root, 'expected');
    generatePackage(expected);
    compareTrees(OUT, expected);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
