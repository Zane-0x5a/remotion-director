# remotion-director

> **Codex adaptation (draft):** the generated package is in `codex-plugin/`. See [installation and usage](docs/CODEX-INSTALL.md), the [migration plan](docs/CODEX-MIGRATION-PLAN.md), and [validation status](docs/CODEX-VALIDATION.md). Installed rendering has been exercised; complete creative acceptance on Codex remains a release blocker.

<div align="center">

https://github.com/user-attachments/assets/8b1b1bd1-15cb-4fdd-99d8-b791f8a8e33e

<sub>*This plugin's own hero film, made **by remotion-director on Claude Opus 5.5** from a one-line brief.* The AI listed the directions, designed, built and rendered three films, and self-checked the one picked. The human input was the brief, a slogan, a pick among the three previews, and one comment ("the blind pick in the race chose the dullest of the four drafts?"). No design doc, no reference, no art direction. *(With sound. If the player doesn't load, [open the mp4](https://cdn.jsdelivr.net/gh/Zane-0x5a/remotion-director@master/docs/assets/promos/hero-opus-5-5-c.mp4).)*</sub>

<sub>[**中文说明 →**](README.zh-CN.md)</sub>

</div>

<div align="center">

<table>
  <tr>
    <td><a href="https://cdn.jsdelivr.net/gh/Zane-0x5a/remotion-director@master/docs/assets/promos/hero-opus-5-5-a.mp4"><img src="https://raw.githubusercontent.com/Zane-0x5a/remotion-director/master/docs/assets/promos/hero-opus-5-5-a-thumb.webp" width="430" alt="Another draw from the same run — click to play"></a></td>
    <td><a href="https://cdn.jsdelivr.net/gh/Zane-0x5a/remotion-director@master/docs/assets/promos/control-opus-5-5-bare.mp4"><img src="https://raw.githubusercontent.com/Zane-0x5a/remotion-director/master/docs/assets/promos/control-opus-5-5-bare-thumb.webp" width="430" alt="The blank control: same model, same brief, no plugin — click to play"></a></td>
  </tr>
  <tr>
    <td align="center"><sub><b>Same run, another direction</b> — picked and self-checked, no human feedback at all</sub></td>
    <td align="center"><sub><b>Blank control</b> — same model, same brief, no plugin</sub></td>
  </tr>
</table>

</div>

## The model can already design motion

With Claude Opus 5.5, a model's front-end craft reached a new level. That isn't marketing; it's what our own experiments kept showing. When we handed the model a strong idea with **no design guidance at all** — no style rules, no references, no critic — **five of six resulting films were stunning**. The design knowledge we had spent months tuning for earlier models had, on this one, turned into a ceiling. It was retired by a preregistered ablation (details below).

## But the best one still lives in the long tail

A model that *can* design doesn't make the best design every time. Three things we measured:

- **Good ideas rarely come first.** Ask several times independently and most of the draws converge on the *same* idea.
- **The model can't reliably spot its own best idea.** Its ranking of its own ideas did no better than chance.
- **Even a stunning film needs a last pass.** Rough hero type, a beat that leaves too soon: things the maker, looking through its own design narrative, doesn't see.

## The workflow pushes it to its ceiling

remotion-director is the workflow that goes and gets that tail. You give it a brief; it returns a finished, rendered motion film.

1. **Commission.** A short check of the brief, aspect, duration, copy and sound, with sensible defaults.
2. **Directions.** A fresh-context concept step lists **N** directions that differ at the *idea* level. Each draw is dealt one, so the options are really different.
3. **Draws.** N designer-builders (乙) each design the whole film from their direction, write the Remotion code, and render a first full cut, in one continuous context.
4. **Pick.** You watch the N previews and pick the one that can go furthest, or hand the pick to a provenance-blind AI selector. If you dislike them all, redraw. You can add a word about why, even just a feeling.
5. **Polish**, in one of two ways, chosen at commission:
   - **The critic loop** (default, hands-off). A design-blind critic (甲) watches only the rendered film and reports what it sees, round after round, until it converges. The builder decides what to change. It's safe and effortless; it won't break the ceiling.
   - **Polish it yourself.** No critic. Whatever you say after watching goes word-for-word to the same builder, which decides how to change the film. You're never asked what's missing or how to fix it.
6. **Your eyes are the final gate.**

**The design is the AI's from end to end.** In full-auto (the AI picks, the critic loop polishes) no human eye ever touches the pixels, and the result is good design. Full-auto doesn't promise the very top. That's what the two optional routes are for: you pick, and if you want, you say what you feel. The design still comes from the model.

### Why the critic can't see the design

We kept watching a model praise its own render point-for-point with its own design doc, paraphrasing the document instead of looking at the image. The *same* model, shown the *same* frame alone, named the flaws fine. A model's visual judgment gets pulled toward whatever design narrative sits in its context. So the critic gets only the brief and the pixels, never the design doc, the code or the notes. It never talks to the builder directly either: the orchestrator carries messages word-for-word in both directions, so no summary can leak the design back in. The critic also persists across rounds. A forgetful critic finds fresh nitpicks every round and never converges; one that remembers holds a stable bar.

### The critic sees time, not just frames

Each render ships with review material drawn straight from the pixels:

- **A time overview.** Thumbnails at a fixed interval, aligned with motion curves, with blank stretches, flashes, jittering holds and short-lived text marked on the same time axis.
- **Settle frames.** A full-resolution frame at every moment the picture comes to rest, for judging layout, type and texture.
- **The video itself**, to pull any frame or crop from.

The old tooling showed the critic one frame per pause, so a half-second pause and a three-second one looked identical, and a separate "tempo pass" had to patch timing afterwards. Now time is drawn directly, and the patch is gone.

## Does it work? The release acceptance

Before release we ran the plugin against a **blank control**: the same model, the same brief, no plugin. The plugin run here used *polish it yourself*. The user scored each film on fixed anchors (quality: 5 = stunning, 3 = solid; maturity: 5 = ship it as is). The design and pass rule were [preregistered](docs/research/2026-10-01-release-acceptance-prereg.md) before anything was scored.

| Film | Quality | Maturity |
|---|---|---|
| Blank control, one shot, no plugin | 3 | 5 |
| Plugin, the other direction: picked and self-checked, **no human feedback** | 4 | 5 |
| Plugin, the hero: self-checked | 4 | 4 |
| Plugin, the hero: after one round of the user's comments | **4** | **5** |

**It passed.** The user's verdict on the control: *"basically a high-end slide deck — the motion is well made, that's Opus's baseline, but the design is nowhere near striking."* The plugin run cost **$12.09** (about 22 minutes from commission to three previews); the control cost $2.36. Limits: one brief of the self-promo kind used during development, and one rater. Fresh briefs are tested in real use. Full write-up: [`docs/research/2026-10-02-release-acceptance-results.md`](docs/research/2026-10-02-release-acceptance-results.md).

## What changed in this version, and why

The architecture is the same **甲乙环 (critic loop)**: one builder that designs and builds in a single continuous context, and a design-blind, persistent critic. The kit around it was rebuilt from experiments on the current model:

- **The design equipment is gone.** A preregistered ablation found the full equipment never ranked above lighter alternatives. An execution diagnosis then found no common defect left for any equipment to fix. The builder now gets the goal (a top motion designer's standard) and the contract, nothing more. The old texts are archived in [`docs/archive/`](docs/archive/).
- **The tempo pass and the frame strips are gone**, replaced by the time overview and settle frames.
- **New:** dealt directions before the draws; the pick on the first full cut (by you by default); the two polish modes; a redraw that can carry your comment into the brief.
- **Sound is on by default.** The builder makes or finds simple effects. Defaults aren't limits: ask for a voice-over through a TTS, your own music or assets, and the builder works out how.

> **On this repo's age:** the git history here is young because this is a *clean release repo*, split off in mid-2026 from a much longer-running development repo. The actual work spans **~3.5 months across three architectures**, driven by preregistered experiments and a pixel-verified ground-truth registry. The arc is in [`docs/DEVELOPMENT-JOURNEY.md`](docs/DEVELOPMENT-JOURNEY.md); the reasoning in [`docs/WHY.md`](docs/WHY.md).

## Install

This is a Claude Code plugin. Install it directly from this GitHub repo; no manual clone or local-marketplace setup is needed. In Claude Code:

```
/plugin marketplace add Zane-0x5a/remotion-director
/plugin install remotion-director@remotion-director
```

The repo is its own marketplace: `.claude-plugin/marketplace.json` lists the generated `./claude-plugin` distribution. Then invoke the `create` skill. The installed package contains only Claude skills, agents, runtime tools and dependency defaults. It leaves out the Codex package, tests, research documents and promotional media.

The separate package is currently on the migration branch. To preview it from a terminal while also limiting the marketplace checkout:

```sh
claude plugin marketplace add Zane-0x5a/remotion-director#codex/codex-plugin-migration --sparse .claude-plugin claude-plugin
claude plugin install remotion-director@remotion-director
```

After merge, omit `#codex/codex-plugin-migration`. `--sparse` keeps the other distribution out of the marketplace working tree. An ordinary GitHub marketplace registration may still cache the full repository separately from the installed plugin. See [distribution and update details](docs/PLUGIN-DISTRIBUTION.md).

### Codex

Codex uses the repository's separate marketplace entry. It points at `./codex-plugin` and exposes the same plugin name, `remotion-director`. The current preview is on the migration branch:

```
codex plugin marketplace add Zane-0x5a/remotion-director --ref codex/codex-plugin-migration
codex plugin add remotion-director@remotion-director-codex
```

After the pull request merges, omit `--ref` so Codex reads the default branch:

```
codex plugin marketplace add Zane-0x5a/remotion-director
codex plugin add remotion-director@remotion-director-codex
```

Start a new task or restart the host after installing or updating. Each marketplace installs its own generated directory: Claude uses `./claude-plugin`, Codex uses `./codex-plugin`. Root `skills/` and `agents/` remain the shared authoring sources. For the full Codex workspace requirements, see [`docs/CODEX-INSTALL.md`](docs/CODEX-INSTALL.md).

### Automatic engineering updates

After the commission, `create` prepares the engineering environment before any draw:

- **Remotion engine.** On each new run it queries npm's latest stable release and updates every declared `remotion` / `@remotion/*` package together, including extra project packages. Installed auxiliary media dependencies are aligned with the target release's recommendations.
- **RBP skill.** It compares the full skill directory with the official [`remotion-dev/skills`](https://github.com/remotion-dev/skills) upstream. An existing global installation (`~/.agents/skills`, `$CODEX_HOME/skills`, or the Claude skill home) is reused and updated in place only when its contents differ. If none exists, it installs under the workspace's `.remotion-director/`. Builders read the returned `RBP_SKILL_PATH`.
- **Host tools.** Node.js, npm, Git and a full ffmpeg build (5.1 or newer). Preflight exercises rawvideo, scale and crop, which the reduced ffmpeg bundled with Remotion may not provide. The agent installs missing host tools under the host's permission policy.

Engineering versions belong to upstream, not to this plugin's design. All draws share the environment prepared for the run; the next piece refreshes it again. To run the same preparation manually (it also scaffolds a missing workspace):

```bash
node "${CLAUDE_PLUGIN_ROOT}/tools/check-env.mjs" --workspace <your-project-dir>
```

Use `--check` to inspect the recorded installation without network or updates. A failed update exits with an error. Repair the network or install issue and rerun, rather than treating an old environment as the latest. Global RBP updates apply to every project using that skill, so coordinate them before starting builders.

## Usage

Invoke the `create` skill with your brief, e.g.:

> /create — a 13s vertical piece for a public library's late-night study space, "The Reading Room — open until 2am." Takeaway: "the quietest place in the city is still awake when you are." Tone: calm, unhurried, a little nocturnal.

It first runs the commission step, then draws. Anything you don't pin down gets a stated default:

- **aspect**: vertical 1080×1920 (default), landscape 1920×1080 or square 1080×1080
- **duration**: a second-count, which is then a promise nothing downstream may break, or *"don't constrain it"*, which leaves the length to the designer
- **N**, the number of draws: default 3; more draws mean a higher ceiling and more cost
- **who picks**: you (default) or the blind AI selector
- **who polishes**: the critic loop (default) or you
- **sound**: on by default
- **workspace**: where the piece is built; default is a folder in your CWD
- **anything extra** you ask for, such as a TTS voice-over or your own assets

The critic loop has no round knob. It runs until the critic converges, then your eyes decide.

> **Sound:** simple sound effects, made or found by the builder, are on by default. Full music and voice-over aren't added unless you ask; when you do, the builder works out how. The critics and the selector are **visual-only**, so nothing in the pipeline judges sound except your own ears.
> **Validated aspects:** 1080×1920 and 1920×1080. Square uses the same harnesses but isn't yet smoke-tested.

### Where your piece lives

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

## Platform note

The pipeline is validated on **64-bit Windows 11**. Node.js reports this platform as `"win32"`, its historical identifier for *all* Windows, 32- and 64-bit alike. The render harness uses the ANGLE GL backend (`gl: "angle"`) and ffmpeg; on macOS or Linux the GL backend may need adjusting (`swangle` / `egl`). Cross-platform use is currently unverified.

<details>
<summary>Earlier pipeline versions, other models</summary>

These were made with the previous version of the pipeline, which still had the design equipment and the tempo pass. The brief was the same one-line promo brief, with no human retouching.

https://github.com/user-attachments/assets/f34c4aef-fd88-44be-9300-b2a5418fdfe1

<sub>Claude Opus 4.8, near one-shot: the only extra input was one prompt on text pacing.</sub>

<table>
  <tr>
    <td><a href="https://cdn.jsdelivr.net/gh/Zane-0x5a/remotion-director@master/docs/assets/promos/promo-kimi-k3.mp4"><img src="https://raw.githubusercontent.com/Zane-0x5a/remotion-director/master/docs/assets/promos/promo-kimi-k3-thumb.webp" width="430" alt="Promo created by Kimi K3 — click to play"></a></td>
    <td><a href="https://cdn.jsdelivr.net/gh/Zane-0x5a/remotion-director@master/docs/assets/promos/promo-claude-opus-5.mp4"><img src="https://raw.githubusercontent.com/Zane-0x5a/remotion-director/master/docs/assets/promos/promo-claude-opus-5-thumb.webp" width="430" alt="Promo created by Claude Opus 5 — click to play"></a></td>
  </tr>
  <tr>
    <td align="center"><sub>Kimi K3</sub></td>
    <td align="center"><sub>Claude Opus 5</sub></td>
  </tr>
</table>

</details>
