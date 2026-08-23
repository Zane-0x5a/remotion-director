#!/usr/bin/env node
/**
 * check-env.mjs — environment self-check for the remotion-director pipeline.
 *
 * Verifies the three things a real run needs, and tells you exactly how to fix
 * any that are missing. Pure Node (no deps) so it runs BEFORE `npm install`.
 *
 *   1. Engine deps      — node_modules + the load-bearing @remotion/* set, three,
 *                         tsx, bundler/renderer — resolvable from the WORKSPACE,
 *                         at the version PINNED by the plugin's package.json.
 *   2. remotion-best-practices skill — the builder (乙) reads it for the LIVE engine
 *                         capability surface (§2 第三步). Separately-owned, hot-updated;
 *                         NOT vendored here. Since upstream's 2026-07 router restructure
 *                         the skill carries a `version:` frontmatter = the Remotion
 *                         version it describes; it must exist (router form) and its
 *                         version is checked against the installed engine.
 *   3. ffmpeg on PATH   — render-strip uses it to measure motion for the PUNCTUATED
 *                         frame sampling the critic depends on. Without it, render-strip
 *                         SILENTLY falls back to uniform sampling (no held/mid roles) —
 *                         a degraded, non-validated regime. Treated as a hard prerequisite.
 *
 * Usage:
 *   node tools/check-env.mjs [--workspace <dir>] [--fix]
 *     --workspace <dir>  where the user's piece + its npm install live (default: cwd)
 *     --fix              repair engine-dep drift IN THE WORKSPACE before checking:
 *                        merges the plugin's pinned dependency blocks into the
 *                        workspace package.json (the user's own entries are
 *                        preserved — only pinned keys are set) and runs npm install.
 *                        Deterministic self-repair: never hand this mechanical
 *                        step to the user.
 *
 * Exit code 0 if everything required is present; 1 if anything is missing.
 */
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { homedir } from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = dirname(__dirname); // tools/ -> plugin root

const args = process.argv.slice(2);
const getArg = (k) => {
  const i = args.indexOf(k);
  return i >= 0 ? args[i + 1] : undefined;
};
const workspace = getArg("--workspace") ?? process.cwd();

const C = { red: "\x1b[31m", green: "\x1b[32m", yellow: "\x1b[33m", dim: "\x1b[2m", reset: "\x1b[0m", bold: "\x1b[1m" };
const ok = (m) => console.log(`${C.green}✓${C.reset} ${m}`);
const warn = (m) => console.log(`${C.yellow}!${C.reset} ${m}`);
const bad = (m) => console.log(`${C.red}✗${C.reset} ${m}`);
const hint = (m) => console.log(`  ${C.dim}${m}${C.reset}`);

console.log(`${C.bold}remotion-director — environment check${C.reset}`);
console.log(`${C.dim}plugin: ${PLUGIN_ROOT}${C.dim}\nworkspace: ${workspace}${C.reset}\n`);

let problems = 0;

// ── 1. Engine deps in the workspace ─────────────────────────────────────────
// The engine version is PINNED (exact, no ^) by the plugin's package.json so the
// pipeline and the remotion-best-practices skill describe the same engine.
const pluginPkg = JSON.parse(readFileSync(join(PLUGIN_ROOT, "package.json"), "utf8"));
const PINNED_ENGINE = (pluginPkg.dependencies?.remotion ?? "").replace(/^[^\d]*/, "");
// Every remotion/@remotion/* dependency is pinned to PINNED_ENGINE; all of them must
// be installed at exactly that version (a remotion@new + @remotion/renderer@old mix
// is precisely the failure this gate exists to catch).
const PINNED_PKGS = Object.keys(pluginPkg.dependencies ?? {}).filter(
  (d) => d === "remotion" || d.startsWith("@remotion/"),
);
const REQUIRED_DEPS = [
  "remotion", "@remotion/bundler", "@remotion/renderer", "@remotion/cli",
  "@remotion/google-fonts", "@remotion/light-leaks", "@remotion/motion-blur",
  "@remotion/media", "@remotion/effects",
  "@remotion/three", "@react-three/fiber", "three", "react", "react-dom", "tsx",
];
const wsModules = join(workspace, "node_modules");
let engineVersion = null;

// ── 0. --fix: deterministic repair of engine-dep drift, before checking ─────
// Merges the plugin's pinned dependency blocks INTO the workspace package.json
// (the user's own entries are preserved — only pinned keys are set), then runs
// npm install. The checks below then verify the result like any other run.
if (args.includes("--fix")) {
  const wsPkgPath = join(workspace, "package.json");
  let wsPkg = null;
  try {
    wsPkg = JSON.parse(readFileSync(wsPkgPath, "utf8"));
  } catch { /* missing or corrupt */ }
  if (!wsPkg || typeof wsPkg !== "object") {
    wsPkg = { name: basename(workspace), private: true };
    warn(`--fix: no readable package.json in workspace — scaffolding a minimal one`);
  }
  wsPkg.dependencies = { ...(wsPkg.dependencies ?? {}), ...pluginPkg.dependencies };
  wsPkg.devDependencies = { ...(wsPkg.devDependencies ?? {}), ...pluginPkg.devDependencies };
  writeFileSync(wsPkgPath, JSON.stringify(wsPkg, null, 2) + "\n");
  warn(`--fix: workspace package.json merged to the pinned set (remotion ${PINNED_ENGINE}); running npm install ...`);
  const inst = spawnSync("npm", ["install"], {
    cwd: workspace,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (inst.status !== 0) {
    bad(`--fix: npm install failed (see output above)`);
    process.exit(1);
  }
  console.log("");
}

if (!existsSync(wsModules)) {
  bad(`engine deps: no node_modules in workspace`);
  hint(`scaffold a package.json (copy ${join(PLUGIN_ROOT, "package.json")}'s deps) and run:  npm install`);
  hint(`(the create skill's Step 1 does this for you) — or let this checker repair it:`);
  hint(`    node "${join(PLUGIN_ROOT, "tools", "check-env.mjs")}" --workspace <dir> --fix`);
  problems++;
} else {
  const missing = REQUIRED_DEPS.filter((d) => !existsSync(join(wsModules, ...d.split("/"))));
  if (missing.length === 0) {
    ok(`engine deps present (${REQUIRED_DEPS.length} load-bearing modules incl. @remotion/bundler, @remotion/renderer, tsx)`);
  } else {
    bad(`engine deps: missing ${missing.length} — ${missing.join(", ")}`);
    hint(`run \`npm install\` in the workspace; ensure package.json declares the full @remotion/* ${PINNED_ENGINE} set + bundler/renderer + tsx`);
    problems++;
  }
  const drift = [];
  for (const dep of PINNED_PKGS) {
    const depDir = join(wsModules, ...dep.split("/"));
    if (!existsSync(depDir)) continue; // already counted in `missing` above
    let v = null;
    try {
      v = JSON.parse(readFileSync(join(depDir, "package.json"), "utf8")).version;
    } catch { /* unreadable/corrupt */ }
    if (dep === "remotion") engineVersion = v;
    if (v !== PINNED_ENGINE) drift.push(`${dep}@${v ?? "unreadable package.json"}`);
  }
  if (PINNED_ENGINE && drift.length === 0 && engineVersion) {
    ok(`engine version matches pin (${PINNED_ENGINE}, all ${PINNED_PKGS.length} remotion packages)`);
  } else {
    bad(`engine version drift vs pin ${PINNED_ENGINE} — ${drift.join(", ")}`);
    hint(`the pipeline validates ONE engine version at a time (pinned exactly in the plugin's package.json).`);
    hint(`repair it deterministically (merges pinned deps, keeps the user's own, runs npm install):`);
    hint(`    node "${join(PLUGIN_ROOT, "tools", "check-env.mjs")}" --workspace <dir> --fix`);
    problems++;
  }
}

// ── 2. remotion-best-practices skill (host-resolved, separately owned) ───────
function findRbpSkill() {
  // The host resolves skills by name; we probe the common skill homes to report
  // presence — global first, then workspace-local (a `skills add` without -g inside
  // a project installs there, and is equally reachable by the host).
  const candidates = [
    join(homedir(), ".claude", "skills", "remotion-best-practices"),
    join(homedir(), ".agents", "skills", "remotion-best-practices"),
    join(workspace, ".claude", "skills", "remotion-best-practices"),
    join(workspace, ".agents", "skills", "remotion-best-practices"),
  ];
  for (const c of candidates) {
    try {
      if (existsSync(join(c, "SKILL.md"))) return c;
    } catch { /* ignore */ }
  }
  return null;
}
const rbp = findRbpSkill();
if (!rbp) {
  bad(`remotion-best-practices skill not found`);
  hint(`install it from its official source (keeps it on the hot-update track):`);
  hint(`    npx skills add remotion-dev/skills -g`);
  hint(`  (-g = global; a project-local install under <workspace>/.agents|claude/skills is also`);
  hint(`   detected. Or use the host's skill-install flow.) The builder reads it for the live surface.`);
  hint(`  orchestrator: offer to RUN this install yourself — it writes outside the workspace,`);
  hint(`  so get the user's one confirmation first. Consent, not labor.`);
  problems++;
} else {
  // Since the 2026-07 upstream restructure the skill is a ROUTER whose frontmatter
  // `version:` = the Remotion version it describes. Router-form = `version:` in the
  // YAML frontmatter (first --- block) AND the remotion-markup node present on disk.
  const skillText = readFileSync(join(rbp, "SKILL.md"), "utf8");
  const fm = skillText.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  const m = fm ? fm[1].match(/^version:\s*["']?(\S+?)["']?\s*$/m) : null;
  const hasMarkupNode = existsSync(join(rbp, "remotion-markup", "REFERENCE.md"));
  if (!m || !hasMarkupNode) {
    bad(`remotion-best-practices is not the router form (${rbp})`);
    hint(!m
      ? `no \`version:\` in its SKILL.md frontmatter — likely the pre-restructure monolith.`
      : `frontmatter version present but remotion-markup/REFERENCE.md is missing — partial install.`);
    hint(`upstream restructured it into a router + sub-skills (2026-07); the pipeline's`);
    hint(`instructions navigate the router. Update:  npx skills update remotion-best-practices -g`);
    hint(`(if that claims the skill "was deleted upstream", remove ${rbp}`);
    hint(`and re-run:  npx skills add remotion-dev/skills -g)`);
    hint(`orchestrator: you can run either command yourself — confirm with the user first.`);
    problems++;
  } else {
    const skillVersion = m[1];
    ok(`remotion-best-practices skill reachable (${rbp}, describes Remotion ${skillVersion})`);
    if (engineVersion && skillVersion !== engineVersion) {
      const numeric = /^\d+\.\d+\.\d+$/;
      const newer = (a, b) => {
        const pa = a.split(".").map(Number), pb = b.split(".").map(Number);
        for (let i = 0; i < 3; i++) {
          const d = (pa[i] ?? 0) - (pb[i] ?? 0);
          if (d) return d > 0;
        }
        return false;
      };
      if (!numeric.test(skillVersion) || !numeric.test(engineVersion)) {
        warn(`cannot compare skill (${skillVersion}) with engine (${engineVersion}) — non-numeric version`);
        hint(`expected plain x.y.z on both sides; check what got installed.`);
      } else if (newer(skillVersion, engineVersion)) {
        warn(`skill (${skillVersion}) is NEWER than the installed engine (${engineVersion})`);
        hint(`the skill may describe APIs the engine doesn't have — the builder is instructed`);
        hint(`that the installed engine wins. To absorb the new capabilities, bump the plugin's`);
        hint(`pinned engine set to ${skillVersion} (package.json) and re-validate the harnesses.`);
      } else {
        warn(`skill (${skillVersion}) is OLDER than the installed engine (${engineVersion})`);
        hint(`update it so the capability surface matches:  npx skills update remotion-best-practices -g`);
      }
    }
  }
}

// ── 3. ffmpeg on PATH (hard prerequisite for punctuated sampling) ───────────
function ffmpegPresent() {
  const probe = spawnSync(process.platform === "win32" ? "where" : "which", ["ffmpeg"], { encoding: "utf8" });
  if (probe.status === 0 && probe.stdout.trim()) return probe.stdout.trim().split(/\r?\n/)[0];
  const v = spawnSync("ffmpeg", ["-version"], { encoding: "utf8" });
  return v.status === 0 ? "ffmpeg" : null;
}
const ff = ffmpegPresent();
if (ff) {
  ok(`ffmpeg on PATH (${ff})`);
} else {
  bad(`ffmpeg NOT on PATH — REQUIRED`);
  hint(`render-strip needs ffmpeg to measure motion for PUNCTUATED frame sampling.`);
  hint(`without it, render-strip silently degrades to UNIFORM sampling (no held/mid roles) —`);
  hint(`the critic loop then loses the validated frame-selection. Do NOT run the pipeline until ffmpeg is installed.`);
  hint(`  Windows: winget install Gyan.FFmpeg   |   macOS: brew install ffmpeg   |   Linux: apt install ffmpeg`);
  hint(`  orchestrator: offer to RUN the install yourself — it writes to the system PATH,`);
  hint(`  so get the user's one confirmation first. Consent, not labor.`);
  problems++;
}

console.log("");
if (problems === 0) {
  console.log(`${C.green}${C.bold}environment OK${C.reset} — ready to run the create pipeline.`);
  process.exit(0);
} else {
  console.log(`${C.red}${C.bold}${problems} item(s) need attention${C.reset} — fix the ✗ items above, then re-run this check.`);
  process.exit(1);
}
