import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { globalRbpPaths, rbpPath, syncRbp } from '../tools/rbp.mjs';

const skillText = (body = 'Current docs') => `---\nname: remotion-best-practices\nversion: 4.0.900\n---\n${body}`;
const write = (path, text) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, text, 'utf8'); };
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'rbp-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const workspace = join(root, 'piece');
  const globalPaths = globalRbpPaths({ userHome: join(root, '用户 home'), env: {} });
  const execute = (command, args) => {
    assert.equal(command, 'git');
    if (args.includes('rev-parse')) return 'b'.repeat(40);
    write(join(args.at(-1), 'skills', 'remotion-best-practices', 'SKILL.md'), skillText());
    write(join(args.at(-1), 'skills', 'remotion-best-practices', 'refs', 'new.md'), 'Fresh nested docs');
    return '';
  };
  return { root, workspace, globalPaths, execute, sync: (override = execute) => syncRbp({ workspace, globalPaths, execute: override, log: () => {} }) };
}

test('detects shared, Codex and Claude global locations including custom homes', () => {
  const paths = globalRbpPaths({ userHome: '/user', env: { CODEX_HOME: '/custom/codex', CLAUDE_CONFIG_DIR: '/custom/claude' } });
  assert.equal(paths.length, 3);
  assert.equal(paths[1], join('/custom/codex', 'skills', 'remotion-best-practices', 'SKILL.md'));
  assert.equal(paths[2], join('/custom/claude', 'skills', 'remotion-best-practices', 'SKILL.md'));
});

for (const index of [0, 1, 2]) {
  test(`updates existing global location ${index} and removes obsolete docs without creating a workspace skill`, (t) => {
    const f = fixture(t);
    write(f.globalPaths[index], skillText('Old docs with the same version'));
    write(join(dirname(f.globalPaths[index]), 'old.md'), 'Obsolete');
    const result = f.sync();
    assert.equal(result.scope, 'global');
    assert.equal(result.path, f.globalPaths[index]);
    assert.equal(readFileSync(result.path, 'utf8'), skillText());
    assert.equal(existsSync(join(dirname(result.path), 'old.md')), false);
    assert.equal(existsSync(rbpPath(f.workspace)), false);
    assert.equal(readdirSync(dirname(dirname(result.path))).some(name => name.startsWith('.rbp-update-')), false);
  });
}

test('current global files are reused without rewriting even when upstream HEAD is checked again', (t) => {
  const f = fixture(t); write(f.globalPaths[0], skillText());
  f.sync();
  const before = statSync(f.globalPaths[0]);
  f.sync();
  assert.equal(statSync(f.globalPaths[0]).mtimeMs, before.mtimeMs);
});

test('global wins over an existing workspace copy', (t) => {
  const f = fixture(t); write(f.globalPaths[0], skillText('Old global'));
  write(rbpPath(f.workspace), skillText('Old local'));
  assert.equal(f.sync().path, f.globalPaths[0]);
  assert.equal(readFileSync(rbpPath(f.workspace), 'utf8'), skillText('Old local'));
});

test('absent global installs only into the workspace', (t) => {
  const f = fixture(t);
  assert.equal(f.sync().path, rbpPath(f.workspace));
  assert.ok(f.globalPaths.every(path => !existsSync(path)));
});

test('a malformed global entry is repaired in place', (t) => {
  const f = fixture(t); write(f.globalPaths[0], 'corrupt');
  assert.equal(f.sync().path, f.globalPaths[0]);
  assert.equal(readFileSync(f.globalPaths[0], 'utf8'), skillText());
});

test('network and malformed upstream failures preserve the old global files', (t) => {
  const f = fixture(t); write(f.globalPaths[0], skillText('Old docs'));
  assert.throws(() => f.sync(() => { throw new Error('offline'); }), /offline/);
  assert.throws(() => f.sync((cmd, args) => {
    if (args.includes('clone')) write(join(args.at(-1), 'skills', 'remotion-best-practices', 'SKILL.md'), 'corrupt upstream');
    return '';
  }), /Invalid upstream/);
  assert.equal(readFileSync(f.globalPaths[0], 'utf8'), skillText('Old docs'));
});

test('updating a global junction preserves the link and updates its real target', (t) => {
  const f = fixture(t);
  const actual = join(f.root, 'shared');
  write(join(actual, 'SKILL.md'), skillText('Old linked docs'));
  mkdirSync(dirname(dirname(f.globalPaths[0])), { recursive: true });
  symlinkSync(actual, dirname(f.globalPaths[0]), process.platform === 'win32' ? 'junction' : 'dir');
  f.sync();
  assert.equal(lstatSync(dirname(f.globalPaths[0])).isSymbolicLink(), true);
  assert.equal(readFileSync(join(actual, 'SKILL.md'), 'utf8'), skillText());
});
