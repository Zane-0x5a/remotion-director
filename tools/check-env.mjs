#!/usr/bin/env node
/**
 * check-env.mjs — environment self-check for the remotion-director pipeline.
 *
 * Verifies the three things a real run needs, and tells you exactly how to fix
 * any that are missing. Pure Node (no deps) so it runs BEFORE `npm install`.
 *
 *   1. Engine deps      — node_modules + the load-bearing @remotion/* set, three,
 *                         tsx, bundler/renderer — resolvable from the WORKSPACE.
 *   2. remotion-best-practices skill — the builder (乙) reads it for the LIVE engine
 *                         capability surface (§2 第三步). Separately-owned, hot-updated;
 *                         NOT vendored here. Installed from its official source.
 *   3. ffmpeg on PATH   — render-strip uses it to measure motion for the PUNCTUATED
 *                         frame sampling the critic depends on. Without it, render-strip
 *                         SILENTLY falls back to uniform sampling (no held/mid roles) —
 *                         a degraded, non-validated regime. Treated as a hard prerequisite.
 *
 * Usage:
 *   node tools/check-env.mjs [--workspace <dir>]
 *     --workspace <dir>  where the user's piece + its npm install live (default: cwd)
 *
 * Exit code 0 if everything required is present; 1 if anything is missing.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
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
const REQUIRED_DEPS = [
  "remotion", "@remotion/bundler", "@remotion/renderer", "@remotion/cli",
  "@remotion/google-fonts", "@remotion/light-leaks", "@remotion/motion-blur",
  "@remotion/three", "@react-three/fiber", "three", "react", "react-dom", "tsx",
];
const wsModules = join(workspace, "node_modules");
if (!existsSync(wsModules)) {
  bad(`engine deps: no node_modules in workspace`);
  hint(`scaffold a package.json (copy ${join(PLUGIN_ROOT, "package.json")}'s deps) and run:  npm install`);
  hint(`(the create skill's Step 1 does this for you)`);
  problems++;
} else {
  const missing = REQUIRED_DEPS.filter((d) => !existsSync(join(wsModules, ...d.split("/"))));
  if (missing.length === 0) {
    ok(`engine deps present (${REQUIRED_DEPS.length} load-bearing modules incl. @remotion/bundler, @remotion/renderer, tsx)`);
  } else {
    bad(`engine deps: missing ${missing.length} — ${missing.join(", ")}`);
    hint(`run \`npm install\` in the workspace; ensure package.json declares the full @remotion/* 4.0.477 set + bundler/renderer + tsx`);
    problems++;
  }
}

// ── 2. remotion-best-practices skill (host-resolved, separately owned) ───────
function findRbpSkill() {
  // The host resolves skills by name; we probe the common skill homes to report
  // presence. The builder invokes it by NAME — these paths are only for the check.
  const candidates = [
    join(homedir(), ".claude", "skills", "remotion-best-practices"),
    join(homedir(), ".agents", "skills", "remotion-best-practices"),
  ];
  for (const c of candidates) {
    try {
      if (existsSync(join(c, "SKILL.md"))) return c;
    } catch { /* ignore */ }
  }
  return null;
}
const rbp = findRbpSkill();
if (rbp) {
  ok(`remotion-best-practices skill reachable (${rbp})`);
  hint(`it is separately owned & hot-updated from remotion-dev/skills — not vendored in this plugin`);
} else {
  bad(`remotion-best-practices skill not found`);
  hint(`install it from its official source (keeps it on the hot-update track):`);
  hint(`    npx skills add remotion-dev/skills`);
  hint(`  (or use the host's skill-install flow). The builder reads it for the live engine capability surface.`);
  problems++;
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
