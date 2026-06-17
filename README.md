# remotion-director

**Most AI-generated motion design is slop** — a centered headline, a warm gradient, a polite ease-in. Not because the model can't write the code, but because, asked to *design*, it reaches for the template. It produces the average of everything it has seen.

This project is a bet that it doesn't have to. That with the right **equipment** — design knowledge collected and arranged from first principles, the way a real art director carries taste, not a checklist — a model can design *from the principle out*: choose a genuine idea, commit to it, and push a piece into the **long tail of beauty** where work actually makes someone look twice. The ambition is to pull AI motion design off the template floor and toward *eye-catching, made-on-purpose* — at scale, on autopilot, with no human touching the pixels.

remotion-director is the working pipeline built around that bet. You give it a one-line brief; it returns a finished **motion piece** (default **1080×1920 vertical**; landscape and square also supported), judged the only way that's honest — on its **actual rendered frames**, never on the model's flattering description of them.

A unified design-and-build agent drafts the design and writes the Remotion code in one continuous context; several independent draws are blind-selected for the most promising base; a **design-blind aesthetic critic** refines it against the rendered frames; and **your own eyes are the final gate**.

> This is the **甲乙环 (critic-loop)** architecture — the production form validated across the project's experiments and selected as the Alpha release baseline. Read [`docs/WHY.md`](docs/WHY.md) for the ambition, the insights it rests on, and the evidence; [`docs/DEVELOPMENT-JOURNEY.md`](docs/DEVELOPMENT-JOURNEY.md) for the two dead architectures it walked through to get here.

## What it does

You give it a brief — audience, takeaway, tone. After a short **commission step** (it confirms the brief, the spec — aspect/resolution, duration, fps, on-screen copy, and whether you want sound — and the draw count **N**, proposing sensible defaults for anything you leave open), it returns a rendered motion piece (`video.mp4` + stills), having:

1. **designed + built** the piece in one continuous context, with real design knowledge (a top-tier-designer framing, a falsifiable visual *conceit*, a strict 3-step process, and a render self-check where the designer judges the real pixels and refuses to settle);
2. made **N independent draws** and **blind-selected** the most promising base (selecting for *potential*, not fewest current flaws);
3. refined the winner through a **design-blind critic loop** — round after round until it converges — a critic that sees only the frames, reports phenomena, never prescribes fixes;
4. handed it to **you** — your eyes are the final gate, outranking every machine judge.

## Install

This is a Claude Code plugin. Install it directly from this GitHub repo — no manual clone or local-marketplace setup needed. In Claude Code:

```
/plugin marketplace add Zane-0x5a/remotion-director
/plugin install remotion-director@remotion-director
```

(The repo is its own marketplace: `.claude-plugin/marketplace.json` at the root lists this plugin with `source: "."`.) Then invoke the `create` skill.

### Prerequisites (the `create` skill checks these for you in Step 0)

- **Node.js** (for the render tooling) and **npm**.
- **ffmpeg** on your PATH — **required**. The frame-strip sampler uses it to find the *punctuation* of motion (the held vs. in-motion frames the critic reads). Without ffmpeg the sampler silently degrades to uniform sampling, which breaks the validated critic frame-selection — so the pipeline will refuse to run until it's present.
  - Windows: `winget install Gyan.FFmpeg` · macOS: `brew install ffmpeg` · Linux: `apt install ffmpeg`
- **The `remotion-best-practices` skill** — the builder reads it for the *live* engine capability surface. It is **separately owned and hot-updated** (from [`remotion-dev/skills`](https://github.com/remotion-dev/skills)), **not bundled** in this plugin, so it always tracks upstream Remotion. If it's missing, install it from its official source:
  ```bash
  npx skills add remotion-dev/skills
  ```
- **Engine dependencies** (Remotion 4.0.477 + three + tooling) — installed per-piece into your workspace by the `create` skill's scaffold step (a single `npm install`).

You can run the environment check yourself anytime:
```bash
node "${CLAUDE_PLUGIN_ROOT}/tools/check-env.mjs" --workspace <your-project-dir>
```

## Usage

Invoke the `create` skill with your brief, e.g.:

> /create — a 13s vertical piece for a public library's late-night study space, "The Reading Room — open until 2am." Takeaway: "the quietest place in the city is still awake when you are." Tone: calm, unhurried, a little nocturnal.

It first runs a quick **commission step** — confirming the brief, the spec (aspect/resolution, duration, fps, on-screen copy, audio intent), and the draw count **N** — and proposing defaults for anything you didn't pin down — then draws. You can state any of these up front in the brief, or let it ask.

Knobs: **N** (draws before blind-select; default 3 — more draws = higher ceiling), **aspect** (vertical 1080×1920 default / landscape 1920×1080 / square 1080×1080), **workspace** (where your piece is built; default a folder in your CWD). The critic loop has no round knob — it runs until the critic converges, then your eyes decide.

> **Audio is experimental.** The engine can mount an audio track, but the design knowledge and the critic loop are **visual-only** — nothing in the pipeline *judges* sound. If you ask for music/SFX/VO it's best-effort and unverified; the pieces the pipeline is validated on are silent. (Tracked as a known limitation for future work.)
> **Validated aspect:** the pipeline is validated at **1080×1920**. Landscape/square use the same harnesses but aren't yet smoke-tested.

### Where your piece lives

Your output lives in **your** project dir, not inside the plugin (so plugin updates never touch your work):

```
<your-project>/
  package.json   node_modules/        # one npm install resolves both your code and the harness
  <piece-slug>/
    draw-1/  index.tsx  DESIGN.md  FIXES.md  out/r1/{still-*.png, video.mp4, strip/}
    draw-2/  …
    draw-N/  …
```

Each draw registers a `<Composition id="piece">` (the render harness's contract).

## How it's wired (for the curious)

- **Skills** — `create` (the orchestrator + product entry point), `design-brain` (loads the design equipment + 7 axis refs), `critic-loop` (blind-select + the 甲乙环).
- **Agents** — `builder` (乙: design+build, continuous context), `aesthetic-critic` (甲: design-blind, persistent, reports phenomena only), `blind-selector` (picks the most promising base).
- **Tools** — `render-arm.ts` (6 stills + mp4), `render-strip.ts` (punctuated frame sampling for the critic), `check-env.mjs` (the Step-0 check).

The orchestrator only orchestrates, ferries the critic's verdicts **verbatim** between critic and builder, and verifies pixels landed — it never judges aesthetics, and it never paraphrases the tuned design knowledge (every agent reads the verbatim equipment/protocol files).

## Platform note

The pipeline is validated on **64-bit Windows 11** (Node.js reports this platform as `"win32"` — its historical identifier for *all* Windows, 32- and 64-bit alike; it does not mean 32-bit-only). The render harnesses use the ANGLE GL backend (`gl: "angle"`) and ffmpeg; on macOS/Linux the GL backend may need adjusting (`swangle` / `egl`). Cross-platform is currently unverified.
