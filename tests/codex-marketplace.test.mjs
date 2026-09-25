import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function readJson(...parts) {
  return JSON.parse(readFileSync(join(ROOT, ...parts), 'utf8'));
}

function publicSkillDirs(root) {
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(root, entry.name, 'SKILL.md')))
    .map((entry) => entry.name)
    .sort();
}

test('Codex and Claude marketplaces route their isolated packages', () => {
  const codexMarketplace = readJson('.agents', 'plugins', 'marketplace.json');
  assert.equal(codexMarketplace.name, 'remotion-director-codex');
  assert.ok(Array.isArray(codexMarketplace.plugins));

  const codexEntry = codexMarketplace.plugins.find((plugin) => plugin.name === 'remotion-director');
  assert.ok(codexEntry, 'Codex marketplace must expose remotion-director');
  assert.deepEqual(codexEntry.source, { source: 'local', path: './codex-plugin' });
  assert.equal(codexEntry.category, 'Creativity');
  assert.deepEqual(codexEntry.policy, {
    installation: 'AVAILABLE',
    authentication: 'ON_INSTALL',
  });

  const codexRoot = resolve(ROOT, codexEntry.source.path);
  assert.equal(codexRoot, join(ROOT, 'codex-plugin'));
  assert.equal(readJson('codex-plugin', 'plugin.json').name, 'remotion-director');
  assert.deepEqual(publicSkillDirs(join(codexRoot, 'skills')), ['remotion-director']);

  const claudeMarketplace = readJson('.claude-plugin', 'marketplace.json');
  assert.equal(claudeMarketplace.name, 'remotion-director');
  assert.ok(Array.isArray(claudeMarketplace.plugins));
  const claudeEntry = claudeMarketplace.plugins.find((plugin) => plugin.name === 'remotion-director');
  assert.ok(claudeEntry, 'Claude marketplace must keep remotion-director');
  assert.equal(claudeEntry.source, './claude-plugin');
  const claudeRoot = resolve(ROOT, claudeEntry.source);
  assert.equal(claudeRoot, join(ROOT, 'claude-plugin'));
  const claudeManifest = readJson('claude-plugin', '.claude-plugin', 'plugin.json');
  assert.equal(claudeEntry.name, claudeManifest.name);
  assert.equal(claudeEntry.version, claudeManifest.version);

  assert.deepEqual(publicSkillDirs(join(claudeRoot, 'skills')), ['create', 'critic-loop', 'design-brain']);
  for (const role of ['aesthetic-critic', 'blind-selector', 'builder', 'tempo-pass']) {
    assert.ok(existsSync(join(claudeRoot, 'agents', `${role}.md`)), `missing Claude role ${role}`);
  }
});
