# remotion-director

<div align="center">



https://github.com/user-attachments/assets/f34c4aef-fd88-44be-9300-b2a5418fdfe1



<sub>*The pipeline's own promo, designed and built by the model in **near one-shot**.* The only human input was the goal "make a promo for this" and one nudge on text pacing — no design doc, no reference, no art direction. What you're watching is the model naming its own defaults (*centered reflex, warm-gradient default*) and striking them out.</sub>

<sub>[**中文说明 →**](README.zh-CN.md)</sub>

</div>

There's a settled assumption about AI and design, and it comes in two flavors. One: **AI only gets to write the code** — good design still has to be squeezed out of it by a human, round after round of prompting, the human's taste doing all the real work. Two, the more generous-sounding version: AI *can* design — so long as you feed it the taste, a `design.md`, a template, a reference, treating "hand the model your design system" as the mature practice.

Both quietly agree that the design doesn't come from the AI. This project doesn't.

For a model that has read essentially the entire internet, **the good design is already in there.** Every principle, every reference, every act of taste a human art director ever published — it has seen them. It defaults to slop not because it lacks the design, but because nothing in the request *excites that part of the weights* into code. So if good design isn't in the AI's default range — where is it?

**It's in the long tail.** And the whole project is machinery for reaching it: the right **equipment** to make a model design *from the principle out* (choose a real idea, commit past the point of safety), then draw enough times, and judge honestly enough, to surface the right-tail piece that actually makes someone look twice — **autonomously, at scale, with no human retouching the pixels.**

remotion-director is the working pipeline built around that bet. You give it a one-line brief; it returns a finished **motion piece**, judged the only way that's honest — on its **actual rendered frames**, never on the model's flattering description of them.

A unified design-and-build agent drafts the design and writes the Remotion code in one continuous context; several independent draws are blind-selected for the most promising base; a **design-blind aesthetic critic** refines it against the rendered frames; and **your own eyes are the final gate**.

> This is the **甲乙环 (critic-loop)** architecture — the production form validated across the project's experiments and selected as the Alpha release baseline. Read [`docs/WHY.md`](docs/WHY.md) for the ambition, the insights it rests on, and the evidence; [`docs/DEVELOPMENT-JOURNEY.md`](docs/DEVELOPMENT-JOURNEY.md) for the two dead architectures it walked through to get here.

> **On this repo's age:** the git history here is young because this is a *clean release repo*, split off in mid-2026 from a much longer-running development repo. The actual work spans **~3.5 months across three architectures** (early 2026 onward) — driven by preregistered experiments and a pixel-verified ground-truth registry, not a quick build. The arc is in [`docs/DEVELOPMENT-JOURNEY.md`](docs/DEVELOPMENT-JOURNEY.md).

## What the equipment does

Most of the work behind this project wasn't the pipeline code. It was the **design equipment** — the text the model reads as its own standing knowledge before it draws a frame — researched, tuned, and tested until it reliably pushed a model off the safe, average answer.

It isn't a style guide and it isn't a list of bans (the project tried bans first; they converge every model to the *same* ugliness). It's the knowledge a good designer already carries, written down as seven reference axes the model loads as it works:

| Axis | What it carries |
|---|---|
| **`narrative`** | The storytelling spine — six tests for choosing what the piece is *about*, and how a single takeaway drives every beat. |
| **`aesthetic`** | Typography, motion, and copy craft — plus the absolute bans and the two-stage "is this AI slop?" test a draft has to pass. |
| **`color`** | Four levels of color commitment, the anti-cream rule, simultaneous-contrast and boundary-vibration effects, and a hard contrast floor. |
| **`composition`** | Single focus, grouping, visual weight — Gestalt ordering (motion > size > …), optical alignment, and *don't default to centered*. |
| **`tempo`** | Pacing: reading dwell time, staggering elements so they don't fight for the eye, and why uniform motion is itself a tell. |
| **`persuasion`** | How attention is actually captured (surprise over joy), ELM message-matching, and the two channels brand presence rides on. |
| **`texture`** | Light and material — where light comes from, how surfaces respond, grain and atmosphere — read *last*, so it serves the story instead of becoming it. |

Three rules hold the whole thing together. **The piece commits to a falsifiable *conceit* first** — one concrete mechanism it runs on, whose subject is a *thing or event* (an empty chair, the fate of a word), never a glow or a mood; that single rule is what kills the category reflex (ask for "a late-night library," get a centered headline on a warm gradient). **The order is fixed** — narrative, then texture, then the engine plan — and the narrative is locked to disk before the texture techniques are even readable, because a model that learns the glow-tricks too early quietly makes a piece *about* the glow. And **the self-check is done by the designer, not a QA clerk** — the single most-tuned line in the project, because the moment a model reviews its own render it stops designing and starts ticking boxes ("acceptable residue, ship it"); the rewrite puts a maker back in the chair who looks at the real pixels and asks "is this worth the piece I wanted?"

The equipment raises the **floor** — it makes a bold, competent attempt reliable. The ceiling is a different problem, and it's what the loop solves. (The full axis texts and the experiments showing equipment beats a bare brief are in [`docs/WHY.md`](docs/WHY.md).)

## How the loop stays honest

Good equipment gets you a good design on paper. The harder problem is subtler than "the model can't judge its own work" — and the loop is built, step by step, around what's really going on.

It starts as a hunch from a thing we kept watching happen. Shown a rendered frame *next to* its own high-minded design doc, the model would pour praise on it — and the praise tracked the document's self-congratulation point for point. It wasn't looking at the image; it was paraphrasing the doc. Yet that *same* model, shown the *same* frame **alone**, names the flaws without trouble. The conjecture that follows: **a model's visual judgment — its "taste" — is powerfully swayed, almost hypnotized, by what sits in its context.** A solid-*looking* design doc doesn't sharpen its read of the pixels; it overrides it. (One layer deeper, and off to the side: maybe because a model is a next-token predictor with no *felt* sense of beauty to brace against a confident narrative — a guess the solution doesn't depend on, kept because this kind of sideways imagining is where the useful hypothesis came from in the first place.)

The deduction is the whole design of the loop: if context corrupts the judgment, the trustworthy judge must carry **none** of it. Three separate times, on three different briefs, the builder signed off on its own render — "I smoothed the banding" — and a fresh pair of eyes that had never read the doc saw the cheap concentric rings instantly. The flaw was always there; the author, holding the doc, simply couldn't see it. So the critic is made **design-blind** by construction — and the experiments bore the hypothesis out.

So the critic doesn't get the doc. It sees the rendered frames and the one-line brief, nothing else — no design, no code, no notes. That single constraint is the whole reason it works, which is why the critic and the builder never talk to each other directly: the orchestrator carries messages between them word-for-word and automatically — the critic's observations one way, the builder's pixel-grounded pushback the other — and never lets a summary leak the design back into the blind judge. Keep them apart and the critic stays honest; let them chat and you've quietly handed it the doc again.

One subtlety turned out to matter more than expected: *which* frames the critic sees. It reads stills, not video, so sampling evenly in time backfires — a clean half-second text move, chopped into a stack of mid-transition stills, reads to it as a glaring overlapping-text mess, and a flawless moment gets condemned as a layout failure. Instead, the tooling measures the motion straight off the finished video and shows the critic the *pauses* — one settled frame per still moment, the real composition, fair to judge — plus a few in-between frames clearly marked as motion, never to be counted as defects. It's judging the design, not hallucinating flaws from what movement looks like when you freeze it.

And the critic remembers. A fresh, forgetful critic every round declares victory on something it flagged a round ago; the same critic, carried across rounds, is what makes the loop actually converge instead of going in circles. Then, because all of this only raises the *floor*, the builder draws several independent times and a provenance-blind selector keeps the one with the highest ceiling — a bold draft with fixable nits over a clean, safe, forgettable one, since the loop can fix nits but never fixes forgettable.

The two architectures we tried before this one — a pipeline that only *forbade* slop, and a heavyweight compiler that lost the design in translation — and why both died, are in [`docs/DEVELOPMENT-JOURNEY.md`](docs/DEVELOPMENT-JOURNEY.md).

The full mechanism — including the two dead architectures (a bans-only "Dogma" engine that converged to one ugliness, and a heavyweight MVC compile pipeline that lost intent in translation) and why the 甲乙环 replaced them — is in [`docs/DEVELOPMENT-JOURNEY.md`](docs/DEVELOPMENT-JOURNEY.md).

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
- **Tools** — `render-arm.ts` (6 stills + mp4), `render-strip.ts` (the frames the critic reads), `check-env.mjs` (the Step-0 check).

> **The frame strip is sharper than it looks.** The critic is a VLM — it sees stills, not the video — so `render-strip.ts` doesn't sample frames uniformly (which makes a clean half-second move read as a stack of "overlapping text" stills and condemns a flawless transient as a defect). It measures motion off the rendered mp4 and samples its **punctuation**: one *held* frame per pause (the real composition, fair to judge) plus motion-only *mid* frames that are explicitly never counted as defects. Frame selection is a design decision here, not plumbing — see [`docs/DEVELOPMENT-JOURNEY.md`](docs/DEVELOPMENT-JOURNEY.md).

The orchestrator only orchestrates, ferries the critic's verdicts **verbatim** between critic and builder, and verifies pixels landed — it never judges aesthetics, and it never paraphrases the tuned design knowledge (every agent reads the verbatim equipment/protocol files).

## Platform note

The pipeline is validated on **64-bit Windows 11** (Node.js reports this platform as `"win32"` — its historical identifier for *all* Windows, 32- and 64-bit alike; it does not mean 32-bit-only). The render harnesses use the ANGLE GL backend (`gl: "angle"`) and ffmpeg; on macOS/Linux the GL backend may need adjusting (`swangle` / `egl`). Cross-platform is currently unverified.
