# How remotion-director works

The [README](../README.md) covers what the plugin is for and how to use it. This page holds the details: how the critic is kept honest, what it looks at, the release acceptance, what changed in this version, the engineering environment, and how the pieces are wired.

## Why the critic can't see the design

We kept watching a model praise its own render point-for-point with its own design doc, paraphrasing the document instead of looking at the image. The *same* model, shown the *same* frame alone, named the flaws fine. A model's visual judgment gets pulled toward whatever design narrative sits in its context. So the critic gets only the brief and the pixels, never the design doc, the code or the notes. It never talks to the builder directly either: the orchestrator carries messages word-for-word in both directions, so no summary can leak the design back in. The critic also persists across rounds. A forgetful critic finds fresh nitpicks every round and never converges; one that remembers holds a stable bar.

## The critic sees time, not just frames

Each render ships with review material drawn straight from the pixels:

- **A time overview.** Thumbnails at a fixed interval, aligned with motion curves, with blank stretches, flashes, jittering holds and short-lived text marked on the same time axis.
- **Settle frames.** A full-resolution frame at every moment the picture comes to rest, for judging layout, type and texture.
- **The video itself**, to pull any frame or crop from.

The old tooling showed the critic one frame per pause, so a half-second pause and a three-second one looked identical, and a separate "tempo pass" had to patch timing afterwards. Now time is drawn directly, and the patch is gone.

## The release acceptance

Before release we ran the plugin against a **blank control**: the same model, the same brief, no plugin. The plugin run here used *polish it yourself*. The user scored each film on fixed anchors (quality: 5 = stunning, 3 = solid; maturity: 5 = ship it as is). The design and pass rule were [preregistered](research/2026-10-01-release-acceptance-prereg.md) before anything was scored.

| Film | Quality | Maturity |
|---|---|---|
| Blank control, one shot, no plugin | 3 | 5 |
| Plugin, the other direction: picked and self-checked, **no human feedback** | 4 | 5 |
| Plugin, the hero: self-checked | 4 | 4 |
| Plugin, the hero: after one round of the user's comments | **4** | **5** |

**It passed.** The user's verdict on the control: *"basically a high-end slide deck — the motion is well made, that's Opus's baseline, but the design is nowhere near striking."* The plugin run cost **$12.09** (about 22 minutes from commission to three previews); the control cost $2.36. Limits: one brief of the self-promo kind used during development, and one rater. Fresh briefs are tested in real use. Full write-up: [`research/2026-10-02-release-acceptance-results.md`](research/2026-10-02-release-acceptance-results.md).

On Codex, a complete creative run passed on 2026-10-02; see [CODEX-VALIDATION.md](CODEX-VALIDATION.md).

## What changed in this version, and why

The architecture is the same **甲乙环 (critic loop)**: one builder that designs and builds in a single continuous context, and a design-blind, persistent critic. The kit around it was rebuilt from experiments on the current model:

- **The design equipment is gone.** A preregistered ablation found the full equipment never ranked above lighter alternatives. An execution diagnosis then found no common defect left for any equipment to fix. The builder now gets the goal (a top motion designer's standard) and the contract, nothing more. The old texts are archived in [`archive/`](archive/).
- **The tempo pass and the frame strips are gone**, replaced by the time overview and settle frames.
- **New:** dealt directions before the draws; the pick on the first full cut (by you by default); the two polish modes; a redraw that can carry your comment into the brief.
- **Sound is on by default.** The builder makes or finds simple effects. Defaults aren't limits: ask for a voice-over through a TTS, your own music or assets, and the builder works out how.

> **On this repo's age:** the git history here is young because this is a *clean release repo*, split off in mid-2026 from a much longer-running development repo. The actual work spans **about seven months**: three architectures in the first three and a half, then production use, then this experiment-driven rebuild on Claude Opus 5.5, all driven by preregistered experiments and a pixel-verified ground-truth registry. The arc is in [`DEVELOPMENT-JOURNEY.md`](DEVELOPMENT-JOURNEY.md); the reasoning in [`WHY.md`](WHY.md).

## Where your piece lives

Your output lives in **your** project dir, not inside the plugin, so plugin updates never touch your work:

```
<your-project>/
  package.json   node_modules/        # one npm install resolves both your code and the harness
  <piece-slug>/
    COMMISSION.md  DIRECTIONS.md
    pick/  A.mp4  B.mp4  …            # the previews, under neutral labels
    draw-1/  index.tsx  DESIGN.md  FIXES.md  out/r1/{video.mp4, review/}
    draw-2/  …
```

Each render's `review/` holds the time overview pages (`overview-*.png`), the settle frames (`settle-*.png`) and `overview.json`. Each draw registers a `<Composition id="piece">`, the render harness's contract.

## Automatic engineering updates

After the commission, `create` prepares the engineering environment before any draw:

- **Remotion engine.** On each new run it queries npm's latest stable release and updates every declared `remotion` / `@remotion/*` package together, including extra project packages. Installed auxiliary media dependencies are aligned with the target release's recommendations.
- **RBP skill.** It compares the full skill directory with the official [`remotion-dev/skills`](https://github.com/remotion-dev/skills) upstream. An existing global installation (`~/.agents/skills`, `$CODEX_HOME/skills`, or the Claude skill home) is reused and updated in place only when its contents differ. If none exists, it installs under the workspace's `.remotion-director/`. Builders read the returned `RBP_SKILL_PATH`.
- **Host tools.** Node.js, npm, Git and a full ffmpeg build (5.1 or newer). Preflight exercises rawvideo, scale and crop, which the reduced ffmpeg bundled with Remotion may not provide. The agent installs missing host tools under the host's permission policy.

Engineering versions belong to upstream, not to this plugin's design. All draws share the environment prepared for the run; the next piece refreshes it again. To run the same preparation manually (it also scaffolds a missing workspace):

```bash
node "${CLAUDE_PLUGIN_ROOT}/tools/check-env.mjs" --workspace <your-project-dir>
```

Use `--check` to inspect the recorded installation without network or updates. A failed update exits with an error. Repair the network or install issue and rerun, rather than treating an old environment as the latest. Global RBP updates apply to every project using that skill, so coordinate them before starting builders.

## How it's wired

- **Skills.** `create` (the orchestrator and product entry point) and `critic-loop` (the blind select and the 甲乙环 protocols).
- **Agents.**
  - `direction-lister`: one fresh-context call per batch of draws.
  - `builder` (乙): design and build, in one continuous context.
  - `blind-selector`: picks on potential, blind to provenance.
  - `aesthetic-critic` (甲): design-blind and persistent; reports phenomena, never prescriptions.
- **Tools.**
  - `render-arm.ts`: renders the mp4, then writes `review/`.
  - `time-overview.ts`: the time overview and settle frames, from pixels only.
  - `check-env.mjs`: the automatic environment preparation.

The orchestrator only orchestrates, ferries messages **verbatim** between critic and builder (or between you and the builder), and verifies that pixels landed. It never judges aesthetics, and it never paraphrases a role's definition: every agent reads its own verbatim prompt.

### Two packages from one source

The repo is its own marketplace. `.claude-plugin/marketplace.json` lists the generated `./claude-plugin` distribution; the Codex marketplace entry points at `./codex-plugin`. Root `skills/` and `agents/` remain the shared authoring sources, and generators build both packages from them. The installed Claude package contains only Claude skills, agents, runtime tools, the sound-effect pack and dependency defaults; it leaves out the Codex package, tests, research documents and promotional media. Sparse marketplace checkouts, caches and updates: [PLUGIN-DISTRIBUTION.md](PLUGIN-DISTRIBUTION.md). The Codex package: [CODEX-INSTALL.md](CODEX-INSTALL.md).

## Platform note

The pipeline is validated on **64-bit Windows 11**. Node.js reports this platform as `"win32"`, its historical identifier for *all* Windows, 32- and 64-bit alike. The render harness uses the ANGLE GL backend (`gl: "angle"`) and ffmpeg; on macOS or Linux the GL backend may need adjusting (`swangle` / `egl`). Cross-platform use is currently unverified.

Validated aspects: 1080×1920 and 1920×1080. Square uses the same harnesses but isn't yet smoke-tested.
