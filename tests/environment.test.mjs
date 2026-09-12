import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkEnvironment, inspectRbp, planDependencies, rbpPath, syncEnvironment } from '../tools/environment.mjs';

const pluginRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const defaults = JSON.parse(readFileSync(join(pluginRoot, 'package.json'), 'utf8'));
const writeJson = (path, value) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, JSON.stringify(value), 'utf8'); };

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'remotion-env-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const workspace = join(root, '中文 piece');
  const calls = [];
  let latest = '4.0.900';
  const execute = (command, args, options = {}) => {
    calls.push({ command, args, options });
    if (command === 'ffmpeg') return 'x';
    if (command === 'git') {
      if (args.includes('rev-parse')) return 'a'.repeat(40);
      const path = join(args.at(-1), 'skills', 'remotion-best-practices', 'SKILL.md');
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, `---\nname: remotion-best-practices\nversion: ${latest}\n---\nCurrent upstream skill.\n`);
      return '';
    }
    assert.equal(command, 'npm');
    if (args[0] === 'view') return JSON.stringify(args[1] === 'remotion' ? latest : { zod: '^4.5.0', mediabunny: '1.99.0' });
    if (args[0] === 'install') {
      const pkg = JSON.parse(readFileSync(join(workspace, 'package.json'), 'utf8'));
      for (const section of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
        for (const [name, spec] of Object.entries(pkg[section] ?? {})) {
          writeJson(join(workspace, 'node_modules', ...name.split('/'), 'package.json'), { name, version: spec.replace(/^[^\d]*/, '') });
        }
      }
      for (const [name, spec] of Object.entries(pkg.overrides ?? {})) {
        if (typeof spec !== 'string') continue;
        writeJson(join(workspace, 'node_modules', ...name.split('/'), 'package.json'), { name, version: spec.replace(/^[^\d]*/, '') });
      }
      writeJson(join(workspace, 'package-lock.json'), { lockfileVersion: 3 });
    } else assert.fail(`Unexpected command: ${args}`);
    return '';
  };
  const sync = (override = execute) => syncEnvironment({ workspace, pluginRoot, execute: override, log: () => {}, globalPaths: [] });
  return { workspace, calls, execute, sync, setLatest: (version) => { latest = version; } };
}

test('updates all Remotion dependency sections and preserves unrelated project settings', () => {
  const current = { scripts: { build: 'custom' }, dependencies: { react: '^19.1.0', custom: 'file:../custom' },
    devDependencies: { remotion: '4.0.1', '@remotion/player': '^4.0.2' },
    optionalDependencies: { '@remotion/sfx': '4.0.3', '@mediabunny/aac-encoder': '1.0.0' },
    peerDependencies: { '@remotion/media': '^4.0.4' }, overrides: { custom: '1.0.0' } };
  const snapshot = structuredClone(current);
  const result = planDependencies(current, defaults, '4.0.900', { mediabunny: '1.99.0', zod: '^4.5.0' });
  assert.deepEqual(current, snapshot);
  assert.deepEqual(result.scripts, current.scripts);
  assert.deepEqual(result.overrides, { ...current.overrides, ...defaults.overrides });
  assert.equal(result.dependencies.react, '^19.1.0');
  assert.equal(result.dependencies.custom, 'file:../custom');
  assert.equal(result.dependencies.remotion, undefined);
  assert.equal(result.devDependencies.remotion, '4.0.900');
  assert.equal(result.devDependencies['@remotion/player'], '4.0.900');
  assert.equal(result.optionalDependencies['@remotion/sfx'], '4.0.900');
  assert.equal(result.peerDependencies['@remotion/media'], '4.0.900');
  assert.equal(result.optionalDependencies['@mediabunny/aac-encoder'], '1.99.0');
});

test('planDependencies enforces the plugin security override while preserving unrelated ones', () => {
  const current = { overrides: { 'existing-package': '1.2.3', browserslist: '4.28.2' } };
  const result = planDependencies(current, defaults, '4.0.900', {});
  assert.deepEqual(result.overrides, { 'existing-package': '1.2.3', browserslist: '4.28.7' });
});

for (const value of ['4.1.0-alpha1', 'latest', '4.0.900 & echo bad', null]) {
  test(`rejects invalid latest release ${JSON.stringify(value)}`, async (t) => {
    const f = fixture(t); f.setLatest(value);
    await assert.rejects(f.sync(), /Invalid stable/);
    assert.equal(existsSync(f.workspace), false);
    assert.equal(f.calls.length, 1);
  });
}

test('corrupt user manifest is preserved and no command runs', async (t) => {
  const f = fixture(t);
  mkdirSync(f.workspace);
  writeFileSync(join(f.workspace, 'package.json'), '{not json');
  await assert.rejects(f.sync());
  assert.equal(readFileSync(join(f.workspace, 'package.json'), 'utf8'), '{not json');
  assert.equal(f.calls.length, 0);
});

test('invalid dependency section is rejected without changing it', async (t) => {
  const f = fixture(t);
  writeJson(join(f.workspace, 'package.json'), { dependencies: [] });
  await assert.rejects(f.sync(), /Invalid dependencies/);
  assert.deepEqual(JSON.parse(readFileSync(join(f.workspace, 'package.json'))), { dependencies: [] });
  assert.ok(f.calls.every(call => call.args[0] === 'view'));
});

test('offline latest lookup fails before workspace mutation', async (t) => {
  const f = fixture(t);
  await assert.rejects(f.sync(() => { throw new Error('registry unreachable'); }), /registry unreachable/);
  assert.equal(existsSync(f.workspace), false);
});

test('broken target-release metadata fails before workspace mutation', async (t) => {
  const f = fixture(t);
  await assert.rejects(f.sync((cmd, args, opts) => args[1]?.startsWith('@remotion/studio') ? 'null' : f.execute(cmd, args, opts)), /Invalid dependency metadata/);
  assert.equal(existsSync(f.workspace), false);
});

test('failed npm install does not continue to skills or report an updated environment', async (t) => {
  const f = fixture(t);
  await assert.rejects(f.sync((cmd, args, opts) => {
    if (args[0] === 'install') throw new Error('install failed');
    return f.execute(cmd, args, opts);
  }), /install failed/);
  assert.ok(!f.calls.some(call => call.command === 'git'));
  assert.equal(existsSync(join(f.workspace, '.remotion-director', 'environment.json')), false);
});

test('successful process exit with missing dependencies is still an incomplete update', async (t) => {
  const f = fixture(t);
  await assert.rejects(f.sync((cmd, args, opts) => args[0] === 'install' ? '' : f.execute(cmd, args, opts)), /Engine update incomplete/);
  assert.ok(!f.calls.some(call => call.command === 'git'));
});

test('upstream skill failure does not publish a completion record', async (t) => {
  const f = fixture(t);
  await assert.rejects(f.sync((cmd, args, opts) => {
    if (cmd === 'git') throw new Error('GitHub unavailable');
    return f.execute(cmd, args, opts);
  }), /GitHub unavailable/);
  assert.equal(existsSync(join(f.workspace, '.remotion-director', 'environment.json')), false);
});

for (const stage of ['install', 'git']) {
  test(`failed subsequent ${stage} invalidates the old completion record and local readiness`, async (t) => {
    const f = fixture(t); await f.sync();
    await assert.rejects(f.sync((cmd, args, opts) => {
      if (args[0] === stage || cmd === stage) throw new Error('update interrupted');
      return f.execute(cmd, args, opts);
    }), /update interrupted/);
    assert.equal(existsSync(join(f.workspace, '.remotion-director', 'environment.json')), false);
    assert.ok(checkEnvironment(f.workspace, f.execute).errors.some(error => error.includes('No completed preparation')));
    await f.sync();
    assert.deepEqual(checkEnvironment(f.workspace, f.execute).errors, []);
  });
}

test('a no-op upstream fetch cannot validate an old installed entry point', async (t) => {
  const f = fixture(t); await f.sync();
  await assert.rejects(f.sync((cmd, args, opts) => cmd === 'git' ? '' : f.execute(cmd, args, opts)), /RBP not prepared/);
  assert.equal(existsSync(join(f.workspace, '.remotion-director', 'environment.json')), false);
});

test('missing or malformed skill is not accepted after fetch success', async (t) => {
  const f = fixture(t);
  await assert.rejects(f.sync((cmd, args, opts) => cmd === 'git' ? '' : f.execute(cmd, args, opts)), /RBP not prepared/);
  mkdirSync(dirname(rbpPath(f.workspace)), { recursive: true });
  writeFileSync(rbpPath(f.workspace), 'not a skill');
  assert.throws(() => inspectRbp(f.workspace), /Invalid upstream/);
});

test('fresh and subsequent runs resolve latest again and refresh their local RBP', async (t) => {
  const f = fixture(t);
  const first = await f.sync();
  assert.equal(first.remotion, '4.0.900');
  assert.equal(first.rbpSkillPath, rbpPath(f.workspace));
  f.setLatest('4.0.901');
  const second = await f.sync();
  assert.equal(second.remotion, '4.0.901');
  assert.equal(second.rbpVersion, '4.0.901');
  assert.equal(f.calls.filter(call => call.command === 'git' && call.args.includes('clone')).length, 2);
  assert.deepEqual(checkEnvironment(f.workspace, f.execute).errors, []);
});

test('local check never contacts npm or GitHub', async (t) => {
  const f = fixture(t); await f.sync(); f.calls.length = 0;
  assert.deepEqual(checkEnvironment(f.workspace, f.execute).errors, []);
  assert.ok(f.calls.every(call => call.command === 'ffmpeg'));
});

test('skill version drift and upstream layout changes are informational, not version gates', async (t) => {
  const f = fixture(t); await f.sync();
  writeFileSync(rbpPath(f.workspace), '---\nname: remotion-best-practices\nversion: 4.0.902\n---\nNew layout.');
  const result = checkEnvironment(f.workspace, f.execute);
  assert.deepEqual(result.errors, []);
  assert.ok(result.messages.some(message => message.includes('release schedules are independent')));
  writeFileSync(rbpPath(f.workspace), '---\nname: remotion-best-practices\n---\nNew upstream without a version.');
  assert.deepEqual(checkEnvironment(f.workspace, f.execute).errors, []);
});

test('mixed engine versions are rejected by local check', async (t) => {
  const f = fixture(t); await f.sync();
  writeJson(join(f.workspace, 'node_modules', '@remotion', 'renderer', 'package.json'), { version: '4.0.1' });
  assert.ok(checkEnvironment(f.workspace, f.execute).errors.some(error => error.includes('@remotion/renderer')));
});

test('an existing workspace on the vulnerable browserslist is updated by sync', async (t) => {
  const f = fixture(t);
  writeJson(join(f.workspace, 'node_modules', 'browserslist', 'package.json'), { name: 'browserslist', version: '4.28.2' });
  await f.sync();
  assert.equal(JSON.parse(readFileSync(join(f.workspace, 'node_modules', 'browserslist', 'package.json'), 'utf8')).version, '4.28.7');
  assert.deepEqual(checkEnvironment(f.workspace, f.execute).errors, []);
});

test('an unresolved override is rejected by local check', async (t) => {
  const f = fixture(t); await f.sync();
  writeJson(join(f.workspace, 'node_modules', 'browserslist', 'package.json'), { name: 'browserslist', version: '4.28.2' });
  assert.ok(checkEnvironment(f.workspace, f.execute).errors.some(error => error.includes('browserslist')));
});

test('ffmpeg that lacks rawvideo or crop cannot pass preflight', async (t) => {
  const f = fixture(t); await f.sync();
  const result = checkEnvironment(f.workspace, () => { throw new Error('rawvideo muxer not found'); });
  assert.ok(result.errors.some(error => error.includes('rawvideo muxer not found')));
});
