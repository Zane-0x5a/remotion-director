#!/usr/bin/env node
/**
 * Generate the self-contained Codex package from the Claude source of truth.
 * Only host seams are transformed: package-root paths, shell invocation syntax,
 * and lifecycle/tool names. Design, equipment, critic and tempo prose remains
 * byte-for-byte identical in the generated internal sources.
 */
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'codex-plugin');
const SOURCE = { skills: join(ROOT, 'skills'), agents: join(ROOT, 'agents'), tools: join(ROOT, 'tools') };
const INTERNAL = join(OUT, 'internal');
const RUNTIME_TOOLS = ['check-env.mjs', 'environment.mjs', 'rbp.mjs', 'render-arm.ts', 'render-strip.ts', 'codex-runtime.mjs', 'codex-launcher.mjs'];
const DESIGN_SKILLS = ['design-brain', 'critic-loop'];

const HOST_SEAMS = [
  'CLAUDE_PLUGIN_ROOT -> <PLUGIN_ROOT> (the orchestrator resolves this from the installed skill path)',
  'AskUserQuestion -> host request-user-input operation',
  'SendMessage -> host continuation/follow-up operation; the final message is a report only when the host cannot send a continuation',
  'bash NODE_PATH=<workspace>/node_modules npx tsx -> node <PLUGIN_ROOT>/tools/codex-launcher.mjs render-* --workspace <WORKSPACE>',
  'Claude agent frontmatter/tool lists -> native Codex role lifecycle guidance in internal/roles',
];

const SHARED_MANIFEST = {
  name: 'remotion-director',
  version: '0.4.0',
  description: 'The remotion-director 甲乙环 pipeline for Codex: one public entry skill with bundled design equipment, native role lifecycle guidance, and cross-platform rendering tools.',
  interface: {
    displayName: 'Remotion Director',
    shortDescription: 'Build and refine short Remotion motion pieces from a brief.',
    longDescription: 'Run the remotion-director 甲乙环 pipeline in Codex: independent builder draws, blind selection, persistent pixel critique, a fresh tempo pass, and final user visual acceptance.',
    developerName: 'Zane',
    category: 'Creativity',
    capabilities: ['motion design', 'Remotion rendering', 'visual critique'],
    defaultPrompt: 'Create a finished Remotion motion piece from this brief: ',
  },
  author: { name: 'Zane' },
  keywords: ['remotion', 'motion-graphics', 'critic-loop', 'codex'],
};

// New portable packages keep identity at the root and OpenAI presentation metadata
// under the documented extension namespace. The legacy overlay remains separately
// shaped for hosts that still read .codex-plugin/plugin.json.
const PORTABLE_MANIFEST = {
  $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json',
  name: SHARED_MANIFEST.name,
  version: SHARED_MANIFEST.version,
  description: SHARED_MANIFEST.description,
  author: SHARED_MANIFEST.author,
  keywords: SHARED_MANIFEST.keywords,
  extensions: { 'com.openai': { interface: SHARED_MANIFEST.interface } },
};

const COMPAT_MANIFEST = {
  ...SHARED_MANIFEST,
  skills: './skills/',
};

const CODEX_HOST_GUIDE = `

## Codex host adapter

This package exposes one public skill. Load the internal role texts from \`<PLUGIN_ROOT>/internal/roles/\` only when dispatching that role; they are bundled references, not separately discoverable skills. The native host owns the actual child-agent lifecycle:

- On the current Codex host, use \`collaboration.spawn_agent({task_name, message, fork_turns:"none", model:<user-selected-or-host-default>, reasoning_effort:<user-selected-or-host-default>})\` to create a fresh child. Resume that same child with \`collaboration.followup_task({target, message})\`; use \`collaboration.wait_agent({timeout_ms})\` only to wait for a boundary. Use \`collaboration.send_message({target, message})\` only to ferry verbatim text and never to start work. These names describe the current host contract; use its native equivalent or report a clear capability block on another host. The child's actual final message is its result; an idle boundary is not completion.
- Start each builder with a new native child and a unique \`agentId\` plus \`continuationId\`. Keep the winning builder alive and use \`followup_task\` for later turns. Start selector and tempo as fresh native children. Start one persistent critic and continue its same \`agentId\`/\`continuationId\` for every review round. Keep the brief and artifact paths explicit; inject only the critic role body plus brief and strip paths, never the builder's design or code.
- Record the real agent and continuation handles returned by the host (the same handle may serve both fields); never invent IDs in the orchestrator ledger. If the host cannot provide a fresh child or a persistent continuation handle, stop with a capability block instead of claiming the lifecycle is preserved.
- Register every initial role with the returned handles and \`register-role --fresh\` (builder for each draw, one selector, one critic, and one tempo pass). Handles must be unique across roles and draws; only the winning builder and persistent critic may later use \`continue-role\` with their original handles.
- Builder and tempo children deliver explicit final messages through \`record-report\`: builders use \`settled\` for a draw and \`round-done\` with \`--review-round R\` after a critic repair; the tempo pass uses \`done\`. Advance canonical output only with \`accept-canonical\`, which verifies video, six stills, a role-aware strip manifest, source hash and artifact provenance.
- The persistent critic delivers verdict text through \`record-verdict\`, never \`record-report\`. New review rounds are sequential and require the accepted canonical from the preceding round. A same-round correction or pixel-grounded rebuttal amends the existing verdict with \`--amend-of ID\` or \`--rebuttal-of ID\` and the same strip; it is an auditable replacement, not a duplicate-round failure. After a post-tempo canonical is accepted, continue the same critic identity for the next review round when the optional structural recheck is used.
- Before dispatching the fresh selector, run \`node "<PLUGIN_ROOT>/tools/codex-launcher.mjs" prepare-selection --run-dir "<RUN_DIR>" --candidates-file "<CANDIDATES_JSON>"\`. Pass only its returned anonymous evidence paths (labels A/B/C, verified stills and sanitized strip manifests) to the selector. Record the selector's \`{ winner, reason }\` with \`record-selection\`, consuming that preparation; never pass source draw directories to the selector.
- Spawn the selector fresh with \`fork_turns:"none"\`; keep the label→draw mapping outside its message. For critic review, pass only the role body from \`internal/roles/aesthetic-critic.md\`, the brief, and the current strip; the protocol requires at least three native crops per round.
- This host adapter dispatch rule takes precedence over the source Step 3 wording: prepare an anonymous, verified copy of each canonical candidate before selector dispatch. Never expose draw keys, author identity, or the label mapping in the selector message; keep that mapping only in the orchestrator ledger.
- Initialize a run with \`init-run\` before dispatch. The record stores commission, duration authority, draw count, identities, continuations, handoffs, verdicts and canonical output in \`<RUN_DIR>/.remotion-director/codex-run.json\`.

The package's launcher is cross-platform Node. It resolves the installed package root from its own file location, uses dependencies from the explicit user workspace, and never reads this development checkout. Plugin hooks may expose \`PLUGIN_ROOT\`; ordinary skill commands must still use the \`<PLUGIN_ROOT>\` path supplied by this skill. Prompt blindness is a protocol constraint plus access evidence, not a filesystem sandbox.
`;

function files(root) {
  const out = [];
  const walk = (dir) => { for (const entry of readdirSync(dir, { withFileTypes: true })) { const path = join(dir, entry.name); if (entry.isDirectory()) walk(path); else if (entry.isFile()) out.push(path); } };
  walk(root); return out.sort();
}
function sha(root, filter = () => true) {
  const hash = createHash('sha256'); let count = 0;
  for (const path of files(root).filter(filter)) { count++; hash.update(relative(root, path).replaceAll('\\', '/')).update('\0').update(normalizeText(readFileSync(path, 'utf8'))).update('\0'); }
  return { hash: hash.digest('hex'), count };
}
function normalizeText(text) { return text.replace(/\r\n?/g, '\n'); }
function replaceAll(text, from, to) { return text.split(from).join(to); }

function transformDelivery(text) {
  return text
    .replace(/SendMessage-ing you an explicit result/g, 'returning an explicit result to the orchestrator')
    .replace(/SendMessages an explicit/g, 'returns an explicit')
    .replace(/SendMessage you an explicit/g, 'return an explicit')
    .replace(/SendMessage it back to/g, 'return it verbatim to')
    .replace(/SendMessage back to/g, 'return verbatim to')
    .replace(/\bSendMessage\b/g, 'return an explicit result');
}

function transformRenderCommands(text) {
  let out = text;
  out = out.replace(/NODE_PATH="(?:<WORKSPACE>|⟨WORKSPACE⟩)\/node_modules"\s+npx\s+tsx\s+"<PLUGIN_ROOT>\/tools\/([^" ]+)"/g,
    (_match, tool) => `node "<PLUGIN_ROOT>/tools/codex-launcher.mjs" ${tool.replace(/\.ts$/, '')} --workspace "<WORKSPACE>"`);
  out = out.replace(/NODE_PATH="<workspace>\/node_modules"\s+npx\s+tsx\s+"<PLUGIN_ROOT>\/tools\/([^" ]+)"/g,
    (_match, tool) => `node "<PLUGIN_ROOT>/tools/codex-launcher.mjs" ${tool.replace(/\.ts$/, '')} --workspace <workspace>`);
  out = out.replace(/NODE_PATH="⟨WORKSPACE⟩\/node_modules"\s+npx\s+tsx\s+"<PLUGIN_ROOT>\/tools\/([^" ]+)"/g,
    (_match, tool) => `node "<PLUGIN_ROOT>/tools/codex-launcher.mjs" ${tool.replace(/\.ts$/, '')} --workspace "⟨WORKSPACE⟩"`);
  out = out.replace(/node\s+"<PLUGIN_ROOT>\/tools\/check-env\.mjs"\s+--workspace/g,
    'node "<PLUGIN_ROOT>/tools/codex-launcher.mjs" prepare-environment --workspace');
  out = out.replace(/> \*\*`NODE_PATH` 不是可选项,是命令的一部分。[\s\S]*?PowerShell 下写成 `\$env:NODE_PATH="[^"]+"; npx tsx \.\.\.`。\r?\n/g,
    '> 渲染命令必须使用上面的 Codex launcher；它从 `<WORKSPACE>` 取得依赖，并在跨平台环境中调用 package-owned harness。\n');
  out = out.replace(/the absolute \*\*`<WORKSPACE>` root\*\* \([^)]*`NODE_PATH` prefix[^)]*\)/g,
    'the absolute **`<WORKSPACE>` root** (the dir holding `node_modules` + `package.json`; the Codex launcher uses it for every render command)');
  out = out.replace(/`(?:the workspace dependency path|NODE_PATH=<workspace>\/node_modules)` 是命令的一部分,不可省——harness 住 plugin 目录无 node_modules,引擎依赖在 workspace 根,漏前缀首渲即崩 `Cannot find module @remotion\/bundler`;⟨WORKSPACE⟩ 为 parent 给定的 workspace 根/g,
    'the Codex launcher command is required; it supplies the workspace dependencies and keeps the harness package-relative; ⟨WORKSPACE⟩ is the parent-provided workspace root');
  // These words occur in source-side explanatory command notes. The package launcher
  // owns dependency setup, so generated guidance must not leave a bash-only command.
  out = out.replace(/\bnpx\s+tsx\b/g, 'the package launcher');
  out = out.replace(/\$env[:.]NODE_PATH="[^"]+";\s*the package launcher/g, 'the package launcher');
  out = out.replace(/NODE_PATH=(?:<workspace>|⟨WORKSPACE⟩|"(?:<WORKSPACE>|⟨WORKSPACE⟩)")\/node_modules/g, 'the workspace dependency path');
  return out;
}

function transformSkill(text, name) {
  let out = text;
  out = replaceAll(out, '${CLAUDE_PLUGIN_ROOT}', '<PLUGIN_ROOT>');
  out = replaceAll(out, '<PLUGIN_ROOT>/skills/design-brain', '<PLUGIN_ROOT>/internal/skills/design-brain');
  out = replaceAll(out, '<PLUGIN_ROOT>/skills/critic-loop', '<PLUGIN_ROOT>/internal/skills/critic-loop');
  out = replaceAll(out, 'AskUserQuestion', 'host request-user-input operation');
  out = transformDelivery(out);
  out = transformRenderCommands(out);
  if (name === 'remotion-director') out = out.replace(/^name:\s*create\s*$/m, 'name: remotion-director');
  // Codex skill frontmatter accepts name/description plus optional metadata;
  // Claude's version and user-invocable keys are host-only and are removed.
  out = out.replace(/^version:\s*[^\r\n]+\r?\n/gm, '').replace(/^user-invocable:\s*[^\r\n]+\r?\n/gm, '');
  const preamble = `<!--\nCodex host seam (generated): resolve <PLUGIN_ROOT> from this installed skill's package root.\nThe package intentionally has no dependency tree; run the launcher after preparing the user workspace.\nOnly lifecycle/path/shell spellings above were changed. The source protocol below is authoritative.\n-->\n\n`;
  const frontmatterEnd = out.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n/);
  return frontmatterEnd ? out.slice(0, frontmatterEnd[0].length) + preamble + out.slice(frontmatterEnd[0].length) : preamble + out;
}

function transformAgent(text, name) {
  let out = text.replaceAll('${CLAUDE_PLUGIN_ROOT}', '<PLUGIN_ROOT>');
  out = replaceAll(out, '<PLUGIN_ROOT>/skills/design-brain', '<PLUGIN_ROOT>/internal/skills/design-brain');
  out = replaceAll(out, '<PLUGIN_ROOT>/skills/critic-loop', '<PLUGIN_ROOT>/internal/skills/critic-loop');
  out = replaceAll(out, 'AskUserQuestion', 'host request-user-input operation');
  out = transformDelivery(out);
  out = transformRenderCommands(out);
  // Claude role frontmatter (model, color and tool lists) is not a Codex role contract.
  // Keep the role body and dispatch it through the native lifecycle guide instead.
  const preamble = `<!-- Codex role adapter for ${name}; role body below is source-preserved outside host seams. -->\n\n`;
  const frontmatterEnd = out.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n/);
  return preamble + (frontmatterEnd ? out.slice(frontmatterEnd[0].length) : out);
}

function transformRuntime(text) {
  let out = text;
  out = replaceAll(out, '${CLAUDE_PLUGIN_ROOT}', '<PLUGIN_ROOT>');
  out = out.replace(/Usage:\s+NODE_PATH="<workspace>\/node_modules"\s+npx\s+tsx\s+"<PLUGIN_ROOT>\/tools\/([^" ]+)"/g,
    (_match, tool) => `Usage: node "<PLUGIN_ROOT>/tools/codex-launcher.mjs" ${tool.replace(/\.ts$/, '')} --workspace <workspace>`);
  out = out.replace(/NODE_PATH="<workspace>\/node_modules"\s+npx\s+tsx\s+"<PLUGIN_ROOT>\/tools\/([^" ]+)"/g,
    (_match, tool) => `node "<PLUGIN_ROOT>/tools/codex-launcher.mjs" ${tool.replace(/\.ts$/, '')} --workspace <workspace>`);
  out = out.replace(/\bNODE_PATH is required: this harness lives in the plugin dir \(no node_modules\);/g,
    'The launcher supplies workspace dependencies; this harness lives in the package and has no node_modules;');
  out = out.replace(/and tsx resolves bare imports via NODE_PATH, not via cwd\. Omit it → "Cannot find module"\./g,
    'the launcher stages the helper under the workspace so its dependency tree is used.');
  out = out.replace(/NODE_PATH is required \(same reason as render-arm\.ts\): engine deps live in the\n\s*workspace, tsx resolves bare imports via NODE_PATH, not cwd\./g,
    'The launcher supplies the workspace engine dependencies and stages this helper under that workspace.');
  return out;
}

function copyTree(source, target, transform) {
  for (const path of files(source)) {
    const rel = relative(source, path); const dest = join(target, rel); mkdirSync(dirname(dest), { recursive: true });
    const text = normalizeText(readFileSync(path, 'utf8')); writeFileSync(dest, transform(text, rel), 'utf8');
  }
}

function sourceSnapshot() {
  return {
    skills: sha(SOURCE.skills),
    agents: sha(SOURCE.agents),
    tools: sha(SOURCE.tools, (path) => RUNTIME_TOOLS.includes(path.split(/[\\/]/).pop())),
  };
}

function seamManifest() {
  return {
    allowed: HOST_SEAMS,
    forbiddenResiduals: ['${CLAUDE_PLUGIN_ROOT}', 'AskUserQuestion', 'SendMessage', 'NODE_PATH="'],
    note: 'This is a host adapter. Prompt blindness is a protocol constraint plus observed access evidence, not filesystem isolation.',
  };
}

function generatePackage(target = OUT) {
  if (!existsSync(SOURCE.skills) || !existsSync(SOURCE.agents)) throw new Error('Source skills/agents are missing; generation cannot proceed.');
  rmSync(target, { recursive: true, force: true });
  mkdirSync(target, { recursive: true });
  const internal = join(target, 'internal');
  // Exactly one public skill. Internal design/critic skills remain bundled references, not entries
  // in the root skills catalog, so accidental implicit invocation cannot expose them.
  const publicSkill = join(target, 'skills', 'remotion-director'); mkdirSync(publicSkill, { recursive: true });
  writeFileSync(join(publicSkill, 'SKILL.md'), transformSkill(normalizeText(readFileSync(join(SOURCE.skills, 'create', 'SKILL.md'), 'utf8')), 'remotion-director') + CODEX_HOST_GUIDE, 'utf8');
  for (const name of DESIGN_SKILLS) copyTree(join(SOURCE.skills, name), join(internal, 'skills', name), transformSkill);
  copyTree(SOURCE.agents, join(internal, 'roles'), transformAgent);
  writeFileSync(join(internal, 'ROLES.md'), `# Native Codex role lifecycle\n\n${CODEX_HOST_GUIDE}\n\nRole source files are copied from agents/*.md and preserve their design/critic wording. Host transforms are limited to path, shell and lifecycle spelling.`, 'utf8');
  for (const name of RUNTIME_TOOLS) {
    const from = join(SOURCE.tools, name);
    if (!existsSync(from)) throw new Error(`Missing runtime tool: ${from}`);
    mkdirSync(join(target, 'tools'), { recursive: true });
    writeFileSync(join(target, 'tools', name), transformRuntime(normalizeText(readFileSync(from, 'utf8'))), 'utf8');
  }
  writeFileSync(join(target, 'plugin.json'), JSON.stringify(PORTABLE_MANIFEST, null, 2) + '\n', 'utf8');
  mkdirSync(join(target, '.codex-plugin'), { recursive: true });
  writeFileSync(join(target, '.codex-plugin', 'plugin.json'), JSON.stringify(COMPAT_MANIFEST, null, 2) + '\n', 'utf8');
  const rootPackage = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  const packageJson = {
    name: 'remotion-director-codex', version: '0.4.0', private: true, type: 'module', license: 'MIT',
    description: 'Runtime dependency snapshot used by the remotion-director Codex launcher; dependencies install into each user workspace.',
    files: ['plugin.json', '.codex-plugin', 'skills', 'internal', 'tools', 'SOURCE-PROVENANCE.json', 'CODEX-HOST-SEAMS.json'],
    dependencies: rootPackage.dependencies, devDependencies: rootPackage.devDependencies,
  };
  writeFileSync(join(target, 'package.json'), JSON.stringify(packageJson, null, 2) + '\n', 'utf8');
  const source = sourceSnapshot();
  writeFileSync(join(target, 'SOURCE-PROVENANCE.json'), JSON.stringify({
    generatedAt: new Date().toISOString(), sourceRoot: 'skills/, agents/, tools/', source,
    output: { publicSkills: ['remotion-director'], internalSkills: DESIGN_SKILLS, internalRoles: ['builder', 'aesthetic-critic', 'blind-selector', 'tempo-pass'], runtimeTools: RUNTIME_TOOLS },
  }, null, 2) + '\n', 'utf8');
  writeFileSync(join(target, 'CODEX-HOST-SEAMS.json'), JSON.stringify(seamManifest(), null, 2) + '\n', 'utf8');
  return { package: target, publicSkill, source };
}

function comparableContent(path) {
  const data = normalizeText(readFileSync(path, 'utf8'));
  if (path.endsWith('SOURCE-PROVENANCE.json')) {
    const value = JSON.parse(data);
    delete value.generatedAt;
    return JSON.stringify(value, null, 2) + '\n';
  }
  return data;
}

function compareTrees(actualRoot, expectedRoot) {
  const actual = files(actualRoot).map((path) => relative(actualRoot, path).replaceAll('\\', '/'));
  const expected = files(expectedRoot).map((path) => relative(expectedRoot, path).replaceAll('\\', '/'));
  const actualSet = new Set(actual); const expectedSet = new Set(expected);
  const missing = expected.filter((path) => !actualSet.has(path));
  const extra = actual.filter((path) => !expectedSet.has(path));
  const changed = expected.filter((path) => actualSet.has(path) && comparableContent(join(actualRoot, path)) !== comparableContent(join(expectedRoot, path)));
  if (missing.length || extra.length || changed.length) {
    const details = [missing.length ? `missing: ${missing.join(', ')}` : '', extra.length ? `extra: ${extra.join(', ')}` : '', changed.length ? `changed: ${changed.join(', ')}` : ''].filter(Boolean).join('; ');
    throw new Error(`Generated package drift detected; run node tools/generate-codex-plugin.mjs. ${details}`);
  }
}

function validateOutput(outputRoot = OUT) {
  if (!existsSync(outputRoot)) throw new Error(`Generated package is missing: ${outputRoot}`);
  const manifest = JSON.parse(readFileSync(join(outputRoot, 'plugin.json'), 'utf8'));
  if (JSON.stringify(manifest) !== JSON.stringify(PORTABLE_MANIFEST)) throw new Error('Portable plugin.json is missing required interface fields or has drifted.');
  const compatibilityPath = join(outputRoot, '.codex-plugin', 'plugin.json');
  if (!existsSync(compatibilityPath)) throw new Error('Compatibility .codex-plugin/plugin.json is missing.');
  const compatibility = JSON.parse(readFileSync(compatibilityPath, 'utf8'));
  if (JSON.stringify(compatibility) !== JSON.stringify(COMPAT_MANIFEST)) throw new Error('Compatibility plugin.json has drifted.');
  if (manifest.name !== compatibility.name || manifest.version !== compatibility.version || manifest.description !== compatibility.description || JSON.stringify(manifest.author) !== JSON.stringify(compatibility.author) || JSON.stringify(manifest.keywords) !== JSON.stringify(compatibility.keywords) || JSON.stringify(manifest.extensions?.['com.openai']?.interface) !== JSON.stringify(compatibility.interface)) throw new Error('Portable and compatibility manifests disagree on shared metadata.');
  const skillsRoot = join(outputRoot, 'skills');
  const skills = readdirSync(skillsRoot).filter((name) => existsSync(join(skillsRoot, name, 'SKILL.md')));
  if (skills.length !== 1 || skills[0] !== 'remotion-director') throw new Error(`Expected exactly one public skill remotion-director; found ${skills.join(', ')}`);
  const publicText = readFileSync(join(skillsRoot, 'remotion-director', 'SKILL.md'), 'utf8');
  const frontmatter = publicText.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!frontmatter || !/^name:\s*remotion-director\s*$/m.test(frontmatter[1]) || !/^description:\s*\S/m.test(frontmatter[1])) throw new Error('Public skill frontmatter is not discoverable.');
  const frontmatterKeys = [...frontmatter[1].matchAll(/^([A-Za-z][\w-]*):/gm)].map((match) => match[1]);
  if (frontmatterKeys.some((key) => !['name', 'description'].includes(key))) throw new Error(`Public skill frontmatter contains unsupported fields: ${frontmatterKeys.join(', ')}`);
  const residual = /\$\{CLAUDE_PLUGIN_ROOT\}|AskUserQuestion|SendMessage|NODE_PATH="|\bnpx\s+tsx\b/;
  if (residual.test(publicText)) throw new Error('Public skill contains an untransformed host seam.');
  for (const file of files(join(outputRoot, 'internal'))) {
    if (!/\.(md|mjs|ts)$/.test(file)) continue;
    const text = readFileSync(file, 'utf8');
    if (residual.test(text)) throw new Error(`Untransformed host seam in ${relative(outputRoot, file)}`);
  }
  const provenance = JSON.parse(readFileSync(join(outputRoot, 'SOURCE-PROVENANCE.json'), 'utf8'));
  const current = sourceSnapshot();
  for (const key of Object.keys(current)) if (current[key].hash !== provenance.source?.[key]?.hash || current[key].count !== provenance.source?.[key]?.count) throw new Error(`Generated package is stale for ${key}; run node tools/generate-codex-plugin.mjs.`);
  if (JSON.stringify(JSON.parse(readFileSync(join(outputRoot, 'CODEX-HOST-SEAMS.json'), 'utf8'))) !== JSON.stringify(seamManifest())) throw new Error('CODEX-HOST-SEAMS.json has drifted; regenerate the package.');
  for (const name of RUNTIME_TOOLS) if (!existsSync(join(outputRoot, 'tools', name))) throw new Error(`Generated runtime tool missing: ${name}`);
  return { package: outputRoot, publicSkills: skills, source: current };
}

function checkGeneratedPackage() {
  const temporary = mkdtempSync(join(tmpdir(), 'remotion-director-generator-'));
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
  if (process.argv.includes('--check')) { console.log(JSON.stringify(checkGeneratedPackage(), null, 2)); return; }
  const result = generatePackage(OUT);
  console.log(`Generated ${OUT}`); console.log(`public skill: ${result.publicSkill}`); console.log(`source skills hash: ${result.source.skills.hash}`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main();

export { OUT, SOURCE, RUNTIME_TOOLS, DESIGN_SKILLS, HOST_SEAMS, SHARED_MANIFEST, PORTABLE_MANIFEST, COMPAT_MANIFEST, transformSkill, transformAgent, transformRuntime, sha, generatePackage, validateOutput, compareTrees, checkGeneratedPackage };
