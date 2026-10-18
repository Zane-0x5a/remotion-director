import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TSX_API = join(ROOT, 'node_modules', 'tsx', 'dist', 'esm', 'api', 'index.mjs');
const noTsx = !existsSync(TSX_API) && 'repository node_modules/tsx is not installed';

async function renderRetry() {
  const { tsImport } = await import(pathToFileURL(TSX_API).href);
  return tsImport(pathToFileURL(join(ROOT, 'tools', 'render-retry.ts')).href, import.meta.url);
}

test('the first render uses Remotion\'s own default tab count', { skip: noTsx }, async () => {
  const { defaultTabs } = await renderRetry();
  assert.equal(defaultTabs(24), 8);
  assert.equal(defaultTabs(8), 4);
  assert.equal(defaultTabs(2), 1);
  assert.equal(defaultTabs(1), 1);
});

test('each retry halves the tabs, down to 2, then stops', { skip: noTsx }, async () => {
  const { fewerTabs } = await renderRetry();
  assert.equal(fewerTabs(8), 4);
  assert.equal(fewerTabs(4), 2);
  assert.equal(fewerTabs(3), 2);
  assert.equal(fewerTabs(2), null);
  assert.equal(fewerTabs(1), null);
});

test('only errors of a machine out of memory are retried', { skip: noTsx }, async () => {
  const { looksOutOfMemory, firstLine } = await renderRetry();
  // The error FFmpeg gave in the entropy run, three draws rendering at once beside another app's render.
  const ffmpeg = new Error('FFmpeg quit with code 3221225794  The FFmpeg output was \n');
  assert.equal(looksOutOfMemory(ffmpeg), true);
  assert.equal(firstLine(ffmpeg), 'FFmpeg quit with code 3221225794  The FFmpeg output was');
  for (const message of [
    'Page crashed!',
    'Protocol error (Runtime.callFunctionOn): Target closed.',
    'Could not take a screenshot because Google Chrome ran out of memory or disk space.',
    'spawn ENOMEM',
  ]) {
    assert.equal(looksOutOfMemory(new Error(message)), true, message);
  }
  // A bug in the piece fails at once, however many tabs there are.
  for (const message of [
    'ReferenceError: scene is not defined',
    'No composition with the ID piece found.',
    'FFmpeg quit with code 1 The FFmpeg output was Invalid argument',
  ]) {
    assert.equal(looksOutOfMemory(new Error(message)), false, message);
  }
});
