import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TSX_API = join(ROOT, 'node_modules', 'tsx', 'dist', 'esm', 'api', 'index.mjs');
const noTsx = !existsSync(TSX_API) && 'repository node_modules/tsx is not installed';

async function gpuPreference() {
  const { tsImport } = await import(pathToFileURL(TSX_API).href);
  return tsImport(pathToFileURL(join(ROOT, 'tools', 'gpu-preference.ts')).href, import.meta.url);
}

test('the high-performance preference is added only where the user has set none', { skip: noTsx }, async () => {
  const { withHighPerformanceGpu } = await gpuPreference();
  assert.equal(withHighPerformanceGpu(null), 'GpuPreference=2;');
  assert.equal(withHighPerformanceGpu(''), 'GpuPreference=2;');
  // The entry's other graphics settings stay.
  assert.equal(withHighPerformanceGpu('AutoHDREnable=2097;'), 'AutoHDREnable=2097;GpuPreference=2;');
  assert.equal(withHighPerformanceGpu('AutoHDREnable=2097'), 'AutoHDREnable=2097;GpuPreference=2;');
  // Any preference already there is the user's: let Windows decide, power saving, high performance.
  for (const current of ['GpuPreference=0;', 'GpuPreference=1;', 'GpuPreference=2;', 'AutoHDREnable=2097;GpuPreference=1;']) {
    assert.equal(withHighPerformanceGpu(current), null, current);
  }
});

test('reg query output yields the value data', { skip: noTsx }, async () => {
  const { regQueryData } = await gpuPreference();
  const printed = (data) => '\r\nHKEY_CURRENT_USER\\Software\\Microsoft\\DirectX\\UserGpuPreferences\r\n'
    + `    D:\\My Work\\node_modules\\.remotion\\chrome-headless-shell\\win64\\chrome-headless-shell-win64\\chrome-headless-shell.exe    REG_SZ    ${data}\r\n\r\n`;
  assert.equal(regQueryData(printed('GpuPreference=2;')), 'GpuPreference=2;');
  assert.equal(regQueryData(printed('AutoHDREnable=2097;GpuPreference=1;')), 'AutoHDREnable=2097;GpuPreference=1;');
  assert.equal(regQueryData(printed('')), '');
  assert.equal(regQueryData('ERROR: The system was unable to find the specified registry key or value.\r\n'), null);
});

// Writes a per-app entry for a made-up executable (a path with spaces, like many
// workspaces) to the real UserGpuPreferences key and deletes it afterwards.
test('on Windows the entry is written once and a preference the user set is kept', { skip: process.platform !== 'win32' ? 'Windows only' : noTsx }, async (t) => {
  const { preferHighPerformanceGpu, regQueryData } = await gpuPreference();
  const KEY = 'HKCU\\Software\\Microsoft\\DirectX\\UserGpuPreferences';
  const exe = `C:\\remotion-director gpu-preference test ${process.pid}\\chrome-headless-shell.exe`;
  const reg = (...args) => spawnSync('reg', args, { encoding: 'utf8', windowsHide: true });
  const stored = () => {
    const query = reg('query', KEY, '/v', exe);
    return query.status === 0 ? regQueryData(query.stdout) : null;
  };
  const userSets = (data) => assert.equal(reg('add', KEY, '/v', exe, '/t', 'REG_SZ', '/d', data, '/f').status, 0);
  t.after(() => reg('delete', KEY, '/v', exe, '/f'));

  assert.equal(stored(), null);
  assert.match(preferHighPerformanceGpu(exe), /^GPU: set the Windows graphics preference/);
  assert.equal(stored(), 'GpuPreference=2;');
  assert.match(preferHighPerformanceGpu(exe), /^GPU: high performance/);
  assert.equal(stored(), 'GpuPreference=2;');

  userSets('AutoHDREnable=2097;GpuPreference=1;');
  assert.match(preferHighPerformanceGpu(exe), /^GPU: kept the Windows graphics preference/);
  assert.equal(stored(), 'AutoHDREnable=2097;GpuPreference=1;');

  userSets('AutoHDREnable=2097;');
  preferHighPerformanceGpu(exe);
  assert.equal(stored(), 'AutoHDREnable=2097;GpuPreference=2;');
});
