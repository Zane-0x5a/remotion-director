import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  COMPAT_MANIFEST,
  PORTABLE_MANIFEST,
  compareTrees,
  generatePackage,
  validateOutput,
} from '../tools/generate-codex-plugin.mjs';

function temporaryRoot() {
  return mkdtempSync(join(tmpdir(), 'remotion-director-generator-test-'));
}

test('generator emits portable and compatibility manifests with shared metadata', () => {
  const root = temporaryRoot();
  try {
    const output = join(root, 'package');
    generatePackage(output);
    validateOutput(output);
    const portable = JSON.parse(readFileSync(join(output, 'plugin.json'), 'utf8'));
    const compat = JSON.parse(readFileSync(join(output, '.codex-plugin', 'plugin.json'), 'utf8'));
    assert.deepEqual(portable, PORTABLE_MANIFEST);
    assert.deepEqual(compat, COMPAT_MANIFEST);
    assert.equal(portable.$schema, 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json');
    assert.deepEqual(portable.extensions['com.openai'].interface, compat.interface);
    assert.notDeepEqual(portable, compat);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('generator emits one public skill and strips Claude role frontmatter', () => {
  const root = temporaryRoot();
  try {
    const output = join(root, 'package');
    generatePackage(output);
    const skillRoot = join(output, 'skills');
    const skill = readFileSync(join(skillRoot, 'remotion-director', 'SKILL.md'), 'utf8');
    assert.match(skill, /^---\r?\nname: remotion-director\r?\ndescription:/);
    assert.doesNotMatch(skill, /^version:/m);
    assert.doesNotMatch(skill, /CLAUDE_PLUGIN_ROOT|AskUserQuestion|SendMessage|npx\s+tsx|NODE_PATH="/);
    const publicSkills = readdirSync(skillRoot).filter((name) => existsSync(join(skillRoot, name, 'SKILL.md')));
    assert.deepEqual(publicSkills, ['remotion-director']);
    for (const role of ['builder', 'aesthetic-critic', 'blind-selector', 'tempo-pass']) {
      const text = readFileSync(join(output, 'internal', 'roles', `${role}.md`), 'utf8');
      assert.doesNotMatch(text, /^---\r?\n(?:name|description|model|color|tools):/m, role);
      assert.doesNotMatch(text, /^(model|color|tools):/m, role);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('generator transforms delivery seams without malformed wording', () => {
  const root = temporaryRoot();
  try {
    const output = join(root, 'package');
    generatePackage(output);
    const skill = readFileSync(join(output, 'skills', 'remotion-director', 'SKILL.md'), 'utf8');
    assert.doesNotMatch(skill, /SendMessages?\s+an explicit|return an explicit results/);
    assert.match(skill, /returns an explicit `round/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('host guide maps each role to its ledger command and prepares blind evidence first', () => {
  const root = temporaryRoot();
  try {
    const output = join(root, 'package');
    generatePackage(output);
    const skill = readFileSync(join(output, 'skills', 'remotion-director', 'SKILL.md'), 'utf8');
    assert.match(skill, /builders use `settled`.*`round-done`/s);
    assert.match(skill, /tempo pass uses `done`/);
    assert.match(skill, /critic delivers verdict text through `record-verdict`/);
    assert.match(skill, /same-round correction.*`--amend-of ID`.*`--rebuttal-of ID`/s);
    assert.match(skill, /prepare-selection --run-dir/);
    assert.match(skill, /record-selection.*consuming that preparation/);
    assert.match(skill, /post-tempo canonical.*same critic identity/s);
    assert.match(skill, /register every initial role.*`register-role --fresh`/is);
    assert.match(skill, /Handles must be unique across roles and draws/s);
    assert.doesNotMatch(skill, /Treat a final child message as evidence only after recording a completion report/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('generated launcher usage strips TypeScript tool extensions', () => {
  const root = temporaryRoot();
  try {
    const output = join(root, 'package');
    generatePackage(output);
    for (const tool of ['render-arm.ts', 'render-strip.ts']) {
      const text = readFileSync(join(output, 'tools', tool), 'utf8');
      const command = tool.replace(/\.ts$/, '');
      assert.doesNotMatch(text, /codex-launcher\.mjs\s+render-(?:arm|strip)\.ts\b/);
      assert.match(text, new RegExp(`codex-launcher\\.mjs"\\s+${command}\\b`));
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('generator check detects changed, missing, and extra output files', () => {
  const root = temporaryRoot();
  try {
    const expected = join(root, 'expected');
    const actual = join(root, 'actual');
    generatePackage(expected);
    generatePackage(actual);
    compareTrees(actual, expected);

    const changed = join(actual, 'skills', 'remotion-director', 'SKILL.md');
    writeFileSync(changed, `${readFileSync(changed, 'utf8')}\nchanged\n`, 'utf8');
    assert.throws(() => compareTrees(actual, expected), /changed/);
    generatePackage(actual);

    rmSync(join(actual, 'tools', 'codex-launcher.mjs'));
    assert.throws(() => compareTrees(actual, expected), /missing.*codex-launcher\.mjs/);
    generatePackage(actual);

    writeFileSync(join(actual, 'unexpected.txt'), 'drift', 'utf8');
    assert.throws(() => compareTrees(actual, expected), /extra.*unexpected\.txt/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
