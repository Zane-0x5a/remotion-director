#!/usr/bin/env node
/**
 * Generate the self-contained Codex package from the Claude source of truth.
 * Only host seams are transformed: package-root paths, shell invocation syntax,
 * and lifecycle/tool names. Design, critic, selection and protocol prose
 * remains byte-for-byte identical in the generated internal sources, apart
 * from the Codex-only builder notes listed in HOST_SEAMS; the
 * sound-effect pack is copied byte-for-byte.
 */
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'codex-plugin');
const SOURCE = { skills: join(ROOT, 'skills'), agents: join(ROOT, 'agents'), tools: join(ROOT, 'tools'), sfx: join(ROOT, 'assets', 'sfx') };
const INTERNAL = join(OUT, 'internal');
const RUNTIME_TOOLS = ['check-env.mjs', 'environment.mjs', 'rbp.mjs', 'render-arm.ts', 'gpu-preference.ts', 'time-overview.ts', 'codex-runtime.mjs', 'codex-launcher.mjs'];
// Internal (non-discoverable) skills bundled beside the one public entry skill.
const DESIGN_SKILLS = ['critic-loop'];
// Recorded sounds are binary: hashed and compared as exact bytes. Every other
// source file (index.json included) is text.
const BINARY_FILE = /\.wav$/i;

const HOST_SEAMS = [
  'CLAUDE_PLUGIN_ROOT -> <PLUGIN_ROOT> (the orchestrator resolves this from the installed skill path)',
  'AskUserQuestion -> host request-user-input operation',
  'SendMessage -> host continuation/follow-up operation; the final message is a report only when the host cannot send a continuation',
  'bash NODE_PATH=<workspace>/node_modules npx tsx <PLUGIN_ROOT>/tools/{render-arm,time-overview}.ts -> node <PLUGIN_ROOT>/tools/codex-launcher.mjs {render-arm,time-overview} --workspace <WORKSPACE>',
  'Claude agent frontmatter/tool lists -> native Codex role lifecycle guidance in internal/roles',
  'Codex-only notes in internal/roles/builder.md (call registerRoot(); never drop the sound silently) for what only Codex builders have shown',
];

// Each note follows its anchor sentence in the builder role. They answer what
// Codex builders did in end-to-end runs, so they stay out of the Claude source.
const BUILDER_NOTES = [
  ['注册成别的 id 会让渲染直接报"找不到 composition"。', '`index.tsx` 里还要调用 `registerRoot()`:不调,打包这一步就会被拒。'],
  ['要用就复制进 `<RUN_DIR>/public/` 再引用,电平自己调;合成或另找也都可以。', '声音做不出来就回报上层,不许悄悄去掉。'],
];

const SHARED_MANIFEST = {
  name: 'remotion-director',
  version: '1.0.0',
  description: 'The remotion-director 甲乙环 pipeline for Codex: one public entry skill, native role lifecycle guidance, and cross-platform rendering and review tools.',
  interface: {
    displayName: 'Remotion Director',
    shortDescription: 'Build and refine short Remotion motion pieces from a brief.',
    longDescription: 'Run the remotion-director 甲乙环 pipeline in Codex: independent builder draws, each dealt its own idea-level direction, a pick at their r1 previews (by the user, or a blind selector), self-check of the picked draw, polishing by a persistent pixel critic (the default) or by the user\'s own comments (亲自打磨), and final user visual acceptance.',
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

This package exposes one public skill. Load the internal role texts from \`<PLUGIN_ROOT>/internal/roles/\` only when dispatching that role, and the critic-loop stage with its two protocol files from \`<PLUGIN_ROOT>/internal/skills/critic-loop/\`; they are bundled references, not separately discoverable skills. The native host owns the actual child-agent lifecycle:

- On the current Codex host, the child-agent tools are the host's own \`collaboration\` tool calls. \`spawn_agent({task_name, message, fork_turns:"none", model:<user-selected-or-host-default>, reasoning_effort:<user-selected-or-host-default>})\` creates a fresh child and returns its handle (the task name as a path, such as \`/root/builder_1\`). Resume that same child with \`followup_task({target, message})\`; use \`wait_agent({timeout_ms})\` only to wait for a boundary. Use \`send_message({target, message})\` only to ferry verbatim text and never to start work: it cannot create a child. Call these tools directly, never from inside an \`exec\` script (they are not there), and wait on a child with \`wait_agent\`, not \`wait\` (that one waits on \`exec\` cells). These names describe the current host contract; use its native equivalent or report a clear capability block on another host. The child's actual final message is its result; an idle boundary is not completion.
- Start each builder with a new native child and a unique \`agentId\` plus \`continuationId\`. Keep every builder alive until the pick; afterwards continue only the picked builder with \`followup_task\` and end the others, except draws the user also kept, which wait idle for \`next-kept\`. Start the direction lister and the selector as fresh native children. When the critic loop polishes, start one persistent critic and continue its same \`agentId\`/\`continuationId\` for every review round. Keep the brief and artifact paths explicit; inject only the critic role body plus the brief, the review dir and the video, never the builder's design or code.
- Record the real agent and continuation handles returned by the host (the same handle may serve both fields); never invent IDs in the orchestrator ledger. If the host cannot provide a fresh child or a persistent continuation handle, stop with a capability block instead of claiming the lifecycle is preserved. A failed call is not a missing capability: if a collaboration call errors (an unknown tool, a target not found, a bad argument), check its name and arguments against this guide and call it again; report a capability block only when the host has no such tool.
- Never stand in for an agent. If you can't reach or continue one, stop and tell the user what is blocked. Don't skip its step, do its work, or record a report it didn't send.
- A child that \`list_agents\` doesn't show is not necessarily gone: after the host restarts, it lists a child again only once that child is continued. Continue it with \`followup_task\` to its original handle; the host reloads it with its context. When \`wait_agent\` keeps timing out, compare \`list_agents\` with the roles \`status\` shows running and continue any it doesn't list. Only when the host says a target doesn't exist is the child gone, or it was never spawned. A builder without a preview is then replaced with \`recover-role\`. A builder that has a preview holds its piece's design in its context, and a fresh replacement could only read the piece back, so stop and tell the user; recover it only if they choose that, with their words in \`recover-role --user-words-file FILE\`. The same holds for a builder that was already recovered once.
- Spawn only the roles this skill names: the direction lister, the builders, the selector and the critic. Never spawn a helper to do, check or recover their work. If a child's task or message arrives unreadable (an opaque token instead of text), the host's message channel is broken: stop and tell the user what is blocked; don't try to decode it or work around it.
- Present a video as the finished piece only when \`status\` shows it is the accepted canonical and, in the critic loop, that its last verdict converged. Tell the user what the ledger shows, never what you believe happened; a preview or an unaccepted render is never the finished piece.
- Register every initial role right after spawning it, with the handle \`spawn_agent\` returned and \`register-role --fresh\` (one direction lister per batch of draws, builder for each draw with \`--direction K\`, one selector when the pick goes to AI, and one critic when the critic loop polishes). A role is registered only once it exists: never register a handle you expect the host to return, and never register first and spawn later. Handles must be unique across roles and draws, including draws ended by a redraw; only the picked builder and the persistent critic may later use \`continue-role\` with their original handles.
- Before any builder of a batch, spawn the direction lister fresh with \`fork_turns:"none"\`, passing only the role body from \`internal/roles/direction-lister.md\`, the brief, the resolved spec and N (no workspace paths, no earlier directions, no wording of your own about how they should differ), and register it. Record its returned list verbatim with \`record-directions --run-dir "<RUN_DIR>" --lister-id ID --continuation-id ID --directions-file FILE\` (FILE holds only the list as returned); it requires exactly N numbered directions, and no builder can register before it. Write the same list to \`DIRECTIONS.md\` under its batch heading as in Step 1.5. Spawn the batch's i-th builder with only that direction's text in its spawn message, then register it with \`--direction i\`; a recovered builder keeps the same direction. Never pass the list, another draw's direction or \`DIRECTIONS.md\` to a builder, the selector, the critic or the user.
- Every render goes through the launcher's \`render-arm\`, which writes \`video.mp4\` and its \`review/\` (the time-overview pages, the full-resolution settle frames and \`overview.json\`) and binds both to the source. Builder children deliver explicit final messages through \`record-report\`: \`preview\` when their r1 preview is ready (record it with \`accept-preview\`; a preview never becomes canonical output), \`settled\` only after they were picked and finished their self-check, \`round-done\` with \`--review-round R\` after a critic repair, and \`revision-done\` with \`--revision K\` after a 亲自打磨 revision. Advance canonical output only with \`accept-canonical\`, which verifies \`video.mp4\`, its \`review/\` (\`overview.json\` schema 1 and every page and settle frame it lists), the source hash and the artifact provenance; \`accept-preview\` applies the same verification to a preview. If acceptance refuses a render (say its source changed after it), continue the same builder to render the current source into an unused output dir and record its new report under a new report id; that report replaces the refused one. Never edit \`codex-run.json\` yourself: if a launcher command refuses something you believe is right, stop and tell the user what is blocked.
- A builder whose locked total cannot hold the content reports \`duration-blocked\` through \`record-report\` with its report verbatim (\`--text-file FILE\`) and no output; it never advances canonical, and that builder cannot report again until the user has decided. Surface the report to the user verbatim, record their answer with \`record-duration-decision --run-dir "<RUN_DIR>" --report-id ID --decision free|locked\` (\`free\` relaxes the commission's lock for the rest of the current piece; \`locked\` keeps it), and tell the builder. Never decide it yourself.
- The persistent critic delivers verdict text through \`record-verdict --review-dir DIR\`, never \`record-report\`. Review round 1 requires the picked builder's accepted settled canonical; new review rounds are sequential and require the accepted canonical from the preceding round, and the review dir must be that canonical's \`review/\`. A same-round correction or pixel-grounded rebuttal amends the existing verdict with \`--amend-of ID\` or \`--rebuttal-of ID\` and the same review dir; it is an auditable replacement, not a duplicate-round failure. A converged verdict ends the review rounds.
- Initialize the run with \`init-run --polish critic|user\` from the commission's "who polishes the picked piece" (\`critic\`, the default, is the critic loop; \`user\` is 亲自打磨). In user polish no critic is registered and no verdict is recorded: show the user the settled canonical video before anything goes to the builder, then record each comment the user volunteers on the current canonical video verbatim with \`record-user-note --run-dir "<RUN_DIR>" --revision K --note-file FILE\` (K = 1, 2, …; FILE holds only the user's words), append it to \`USER-NOTES.md\`, and ferry the same words with K and an unused output dir to the picked builder. Accept its \`revision-done\` with \`accept-canonical\` and show the user the new video; the next note needs that revision accepted. If the user comments at the final gate after the critic converged, run \`switch-polish --run-dir "<RUN_DIR>" --mode user\` first; it ends the critic and continues from the converged canonical as revision 1.
- Once all N previews are accepted, the pick follows the commission. By default the user picks: spawn and register no selector; show the user only each accepted preview's \`video.mp4\` (no overviews, frames, directions, design docs or notes) under neutral labels in a random order, copied to neutral file names so the path does not reveal the draw, with the one-line first-version note from Step 3. Map their answer to its draw key outside the conversation and record it with \`record-user-selection --run-dir "<RUN_DIR>" --winner-key draw-N [--reason TEXT]\`. It re-verifies every accepted preview before the pick is recorded. Anything the user says about the picked draw beyond the choice goes into \`--reason\` verbatim and to the picked builder with the pick follow-up, under the fixed line from Step 3; it is not a user-polish note. If the user keeps more than one draw, record the extras with \`--also-keep draw-M\` (repeatable); carry the picked one through self-check and polish first, then run \`next-kept --run-dir "<RUN_DIR>" --key draw-M\` for each kept draw in turn (it self-checks, settles and is polished the same way, by a fresh critic in the critic loop, and what the user said about that draw at the pick goes with its follow-up); never ask the user to choose only one.
- If the user rejects every preview ("都不要，再抽"), invite an optional comment as in Step 3 (anything, even a feeling; never ask what is missing). If they comment, fold it into the brief and show them the updated brief. End all current builders without self-check and run \`record-redraw --run-dir "<RUN_DIR>" [--reason TEXT] [--brief-hash HEX]\` with their words as given and, when the brief changed, the updated brief's provenance hash; it archives those draws with their previews and that batch's lister and directions. Then spawn and register a fresh direction lister on the current brief for a fresh, independent list (do not pass it the earlier directions), record it with \`record-directions\`, spawn and register N fresh builders under new draw keys (continue the numbering), one new direction each, in new draw directories, and repeat until the pick.
- When the pick goes to AI (chosen at commission, or the user says "你替我挑"), run \`node "<PLUGIN_ROOT>/tools/codex-launcher.mjs" prepare-selection --run-dir "<RUN_DIR>" --candidates-file "<CANDIDATES_JSON>"\` before dispatching the fresh selector. Pass only its returned anonymous evidence paths (labels A/B/C, each an anonymous copy of the verified preview's \`video.mp4\` and \`review/\`) to the selector, with a crops dir outside every draw directory. Record the selector's \`{ winner, reason }\` with \`record-selection\`, consuming that preparation; never pass source draw directories to the selector.
- After either pick, follow up with the picked builder (it self-checks per its definition, then reports \`settled\` with its canonical output) and end every other builder the user did not keep, without self-check. Accept the settled report with \`accept-canonical\` before the critic's first round or, in user polish, before the user's first look.
- Spawn the selector fresh with \`fork_turns:"none"\`; keep the label→draw mapping outside its message. For critic review, pass only the role body from \`internal/roles/aesthetic-critic.md\`, the brief, and the current canonical's review dir and video; the critic pulls its own frames and crops from the video into \`critic-crops/\`.
- This host adapter dispatch rule takes precedence over the source Step 3 wording: prepare an anonymous, verified copy of each preview candidate before selector dispatch. Never expose draw keys, author identity, or the label mapping in the selector message; keep that mapping only in the orchestrator ledger.
- Take the brief as the user wrote it and add nothing to it: no audience, takeaway or tone of your own. The brief reaches every role, so anything you add becomes a requirement the user never made. In \`COMMISSION.md\`, write each model ID as the host reports it; if you can't read one, write \`unknown\`, never a guess.
- Initialize a run with \`init-run\` before dispatch. The record stores commission, duration authority and the user's duration decisions, polish mode, draw count, identities, continuations, directions, previews, the pick and the draws kept with it, redraws, handoffs, verdicts, user notes, canonical output and the finished pieces in \`<RUN_DIR>/.remotion-director/codex-run.json\`.

The package's launcher is cross-platform Node. It resolves the installed package root from its own file location, uses dependencies from the explicit user workspace, and never reads this development checkout. Plugin hooks may expose \`PLUGIN_ROOT\`; ordinary skill commands must still use the \`<PLUGIN_ROOT>\` path supplied by this skill. Prompt blindness is a protocol constraint plus access evidence, not a filesystem sandbox.
`;

function files(root) {
  const out = [];
  const walk = (dir) => { for (const entry of readdirSync(dir, { withFileTypes: true })) { const path = join(dir, entry.name); if (entry.isDirectory()) walk(path); else if (entry.isFile()) out.push(path); } };
  walk(root); return out.sort();
}
function sha(root, filter = () => true) {
  const hash = createHash('sha256'); let count = 0;
  for (const path of files(root).filter(filter)) { count++; hash.update(relative(root, path).replaceAll('\\', '/')).update('\0').update(BINARY_FILE.test(path) ? readFileSync(path) : normalizeText(readFileSync(path, 'utf8'))).update('\0'); }
  return { hash: hash.digest('hex'), count };
}
function normalizeText(text) { return text.replace(/\r\n?/g, '\n'); }
function replaceAll(text, from, to) { return text.split(from).join(to); }

function transformDelivery(text) {
  return text
    .replace(/SendMessage-ing you an explicit result/g, 'returning an explicit result to the orchestrator')
    .replace(/SendMessages an explicit/g, 'returns an explicit')
    .replace(/\bSendMessages\b/g, 'returns')
    .replace(/SendMessage you an explicit/g, 'return an explicit')
    .replace(/SendMessage it back to/g, 'return it verbatim to')
    .replace(/SendMessage back to/g, 'return verbatim to')
    .replace(/\bSendMessage\b/g, 'return an explicit result');
}

// Every source render/review command is `NODE_PATH="<ws>/node_modules" npx tsx
// "<PLUGIN_ROOT>/tools/<tool>.ts" …` with <ws> spelled <WORKSPACE>, ⟨WORKSPACE⟩
// or <workspace>; each becomes the matching launcher command. The generic
// rewrites further down only touch explanatory prose; validateOutput rejects
// any command they would have mangled.
const SOURCE_TOOL_COMMAND = /NODE_PATH="(<WORKSPACE>|⟨WORKSPACE⟩|<workspace>)\/node_modules"\s+npx\s+tsx\s+"<PLUGIN_ROOT>\/tools\/([^" ]+)"/g;

function transformRenderCommands(text) {
  let out = text;
  out = out.replace(SOURCE_TOOL_COMMAND,
    (_match, workspace, tool) => `node "<PLUGIN_ROOT>/tools/codex-launcher.mjs" ${tool.replace(/\.ts$/, '')} --workspace ${workspace === '<workspace>' ? '<workspace>' : '"<WORKSPACE>"'}`);
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
  out = replaceAll(out, '<PLUGIN_ROOT>/skills/critic-loop', '<PLUGIN_ROOT>/internal/skills/critic-loop');
  out = replaceAll(out, 'AskUserQuestion', 'host request-user-input operation');
  out = transformDelivery(out);
  out = transformRenderCommands(out);
  if (name === 'builder.md') {
    for (const [anchor, note] of BUILDER_NOTES) {
      if (!out.includes(anchor)) throw new Error(`agents/builder.md no longer has the anchor for a Codex note: ${anchor}`);
      out = out.replace(anchor, anchor + note);
    }
  }
  // Claude role frontmatter (model, color and tool lists) is not a Codex role contract.
  // Keep the role body and dispatch it through the native lifecycle guide instead.
  const preamble = `<!-- Codex role adapter for ${name}; role body below is source-preserved outside host seams. -->\n\n`;
  const frontmatterEnd = out.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n/);
  return preamble + (frontmatterEnd ? out.slice(frontmatterEnd[0].length) : out);
}

function transformRuntime(text) {
  let out = text;
  out = replaceAll(out, '${CLAUDE_PLUGIN_ROOT}', '<PLUGIN_ROOT>');
  // render-arm.ts and time-overview.ts header usage lines (time-overview needs no NODE_PATH).
  out = out.replace(/Usage:\s+(?:NODE_PATH="<workspace>\/node_modules"\s+)?npx\s+tsx\s+"<PLUGIN_ROOT>\/tools\/([^" ]+)"/g,
    (_match, tool) => `Usage: node "<PLUGIN_ROOT>/tools/codex-launcher.mjs" ${tool.replace(/\.ts$/, '')} --workspace <workspace>`);
  out = out.replace(/\bNODE_PATH is required: this harness lives in the plugin dir \(no node_modules\);/g,
    'The launcher supplies workspace dependencies; this harness lives in the package and has no node_modules;');
  out = out.replace(/and tsx resolves bare imports via NODE_PATH, not via cwd\. Omit it → "Cannot find module"\./g,
    'the launcher stages the helper under the workspace so its dependency tree is used.');
  out = out.replace(/The usual NODE_PATH="<workspace>\/node_modules"\n(\s*\*\s*)prefix used by the other tools is harmless here but not needed\./g,
    (_match, indent) => `The launcher stages it under the workspace\n${indent}together with render-arm.ts, which imports it.`);
  out = out.replace(/"usage: npx tsx tools\/time-overview\.ts /g, '"usage: codex-launcher.mjs time-overview --workspace <workspace> ');
  return out;
}

function copyTree(source, target, transform) {
  for (const path of files(source)) {
    const rel = relative(source, path); const dest = join(target, rel); mkdirSync(dirname(dest), { recursive: true });
    const text = normalizeText(readFileSync(path, 'utf8')); writeFileSync(dest, transform(text, rel), 'utf8');
  }
}

// The sound pack has no host seam: every file, binary or text, ships as its source bytes.
function copyBytes(source, target) {
  for (const path of files(source)) {
    const dest = join(target, relative(source, path)); mkdirSync(dirname(dest), { recursive: true }); copyFileSync(path, dest);
  }
}

function sourceSnapshot() {
  return {
    skills: sha(SOURCE.skills),
    agents: sha(SOURCE.agents),
    tools: sha(SOURCE.tools, (path) => RUNTIME_TOOLS.includes(path.split(/[\\/]/).pop())),
    sfx: sha(SOURCE.sfx),
  };
}

// Every source agent becomes one internal role; the list follows agents/.
function internalRoles() { return readdirSync(SOURCE.agents).filter((name) => name.endsWith('.md')).map((name) => name.replace(/\.md$/, '')).sort(); }

function seamManifest() {
  return {
    allowed: HOST_SEAMS,
    forbiddenResiduals: ['${CLAUDE_PLUGIN_ROOT}', 'AskUserQuestion', 'SendMessage', 'NODE_PATH="'],
    note: 'This is a host adapter. Prompt blindness is a protocol constraint plus observed access evidence, not filesystem isolation.',
  };
}

function generatePackage(target = OUT) {
  if (!existsSync(SOURCE.skills) || !existsSync(SOURCE.agents) || !existsSync(SOURCE.sfx)) throw new Error('Source skills/agents/assets/sfx are missing; generation cannot proceed.');
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
  copyBytes(SOURCE.sfx, join(target, 'assets', 'sfx'));
  writeFileSync(join(target, 'plugin.json'), JSON.stringify(PORTABLE_MANIFEST, null, 2) + '\n', 'utf8');
  mkdirSync(join(target, '.codex-plugin'), { recursive: true });
  writeFileSync(join(target, '.codex-plugin', 'plugin.json'), JSON.stringify(COMPAT_MANIFEST, null, 2) + '\n', 'utf8');
  const rootPackage = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  const packageJson = {
    name: 'remotion-director-codex', version: '1.0.0', private: true, type: 'module', license: 'MIT',
    description: 'Runtime dependency snapshot used by the remotion-director Codex launcher; dependencies install into each user workspace.',
    files: ['plugin.json', '.codex-plugin', 'skills', 'internal', 'tools', 'assets', 'SOURCE-PROVENANCE.json', 'CODEX-HOST-SEAMS.json'],
    dependencies: rootPackage.dependencies, devDependencies: rootPackage.devDependencies,
  };
  writeFileSync(join(target, 'package.json'), JSON.stringify(packageJson, null, 2) + '\n', 'utf8');
  const source = sourceSnapshot();
  writeFileSync(join(target, 'SOURCE-PROVENANCE.json'), JSON.stringify({
    generatedAt: new Date().toISOString(), sourceRoot: 'skills/, agents/, tools/, assets/sfx/', source,
    output: { publicSkills: ['remotion-director'], internalSkills: DESIGN_SKILLS, internalRoles: internalRoles(), runtimeTools: RUNTIME_TOOLS, sfx: 'assets/sfx/' },
  }, null, 2) + '\n', 'utf8');
  writeFileSync(join(target, 'CODEX-HOST-SEAMS.json'), JSON.stringify(seamManifest(), null, 2) + '\n', 'utf8');
  return { package: target, publicSkill, source };
}

function comparableContent(path) {
  // A UTF-8 decode would fold distinct invalid bytes into U+FFFD, so binary
  // files compare as an exact byte encoding.
  if (BINARY_FILE.test(path)) return readFileSync(path).toString('base64');
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
  // A source command the command transform missed would otherwise survive as
  // "the package launcher "<PLUGIN_ROOT>/tools/x.ts"" after the prose rewrites.
  const mangledCommand = /the (?:package launcher|workspace dependency path)\s+"?<PLUGIN_ROOT>\/tools\//;
  if (residual.test(publicText) || mangledCommand.test(publicText)) throw new Error('Public skill contains an untransformed host seam.');
  for (const file of files(join(outputRoot, 'internal'))) {
    if (!/\.(md|mjs|ts)$/.test(file)) continue;
    const text = readFileSync(file, 'utf8');
    if (residual.test(text) || mangledCommand.test(text)) throw new Error(`Untransformed host seam in ${relative(outputRoot, file)}`);
  }
  // The TypeScript harnesses run only through the launcher; their usage notes must say so.
  for (const file of files(join(outputRoot, 'tools')).filter((path) => path.endsWith('.ts'))) {
    if (residual.test(readFileSync(file, 'utf8'))) throw new Error(`Untransformed host seam in ${relative(outputRoot, file)}`);
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
