#!/usr/bin/env node
/** Prepare the latest engineering environment before a new piece; --check is read-only. */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkEnvironment, syncEnvironment } from './environment.mjs';

const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log('Usage: node tools/check-env.mjs [--workspace <dir>] [--check | --fix]');
  console.log('Default: update Remotion to npm latest and RBP to upstream HEAD, then check.');
  console.log('--check: inspect the installed environment without network or changes.');
  console.log('--fix: compatibility alias for the default automatic update.');
  process.exit(0);
}

try {
  let workspace = process.cwd();
  let checkOnly = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--workspace' && args[i + 1] && !args[i + 1].startsWith('--')) {
      workspace = resolve(args[++i]);
    } else if (args[i] === '--check') {
      checkOnly = true;
    } else if (args[i] !== '--fix') {
      throw new Error(`Unknown or incomplete option: ${args[i]}`);
    }
  }
  if (checkOnly && args.includes('--fix')) throw new Error('Use either --check or --fix.');
  const pluginRoot = dirname(dirname(fileURLToPath(import.meta.url)));
  console.log(`remotion-director — ${checkOnly ? 'local check (not checking upstream)' : 'update to latest'}\nworkspace: ${workspace}`);
  if (!checkOnly) await syncEnvironment({ workspace, pluginRoot });
  const result = checkEnvironment(workspace);
  for (const message of result.messages) console.log(message);
  if (result.errors.length) throw new Error(result.errors.join('\n'));
  console.log('environment OK — ready to run the create pipeline.');
} catch (error) {
  console.error(`[environment] FAILED: ${error.message}`);
  process.exitCode = 1;
}
