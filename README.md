# remotion-director

<div align="center">

https://github.com/user-attachments/assets/da315ac3-4cff-4546-b9e9-5d3aba8c73b9

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

## What the equipment actually does

The bulk of the work behind this project wasn't writing the pipeline — it was researching, orchestrating, and *validating* the **design equipment**: the text a builder reads as its standing knowledge before it draws a single frame. The equipment is the thing that moves a model off the mean. A few of its load-bearing parts, and the mechanism each one fixes:

- **A falsifiable visual *conceit*, chosen first — before the model knows any texture technique.** Ask a model for "a piece about a late-night library" and it reaches for its category reflex: a centered headline, a warm gradient, done. The equipment forbids that move structurally. It makes the builder commit, *first*, to a one-line mechanism specific enough that you can point at a frame and say *"this beat violates the conceit"* — and the protagonist of that conceit must be **a concrete thing or event** (a wall of ivy, an empty chair, the fate of a single word), **never a glow or a mood**. That one rule does real work: in the project's own promo above, you can watch the model name its category reflexes out loud — *"centered reflex, warm-gradient default"* — and strike them out, because the conceit it committed to won't let them back in.
- **The 3-step order is a hard rule, and the reason is mechanistic.** Narrative → texture → engine-plan, and the narrative must land on disk *before the texture knowledge is even readable*. Why enforce the order so strictly? Because if the designer learns the lighting and material techniques **while** it's choosing the conceit, the conceit's protagonist quietly drifts from a *concrete subject* to a *light effect* — the piece becomes "about" a beautiful glow instead of about the empty chair. Isolating texture until the narrative is committed is what keeps the subject a subject. (The order is audited against the tool-call timeline, not taken on faith.)
- **The §4 self-check persona is the single most-tuned text in the project — and it's a behavioral fix, not a checklist.** The observed failure: a model designs the first draft with real passion, then the instant it enters self-check it *turns into a clerk filling in a KPI sheet* — writes "acceptable residue, ship it," and passes itself. So the self-check was rewritten to put **the designer back in the room**: same standards, same refusal to settle, judging the *real rendered pixels* against "is this worthy of the piece I wanted," daring to change the *design itself* if the pixels demand it, and explicitly forbidding the "acceptable residue" cop-out. It only binds the builder when the *literal text* is in context — which is exactly why the pipeline never lets the orchestrator paraphrase it.

The equipment buys the **floor** — it makes a bold, competent attempt reliable. It does not, by itself, buy a 9-out-of-10 piece; that's a right-tail event, which is what the loop below is for. (The full set — narrative, aesthetic, color, composition, tempo, persuasion, texture — and the evidence that equipment beats a bare brief is in [`docs/WHY.md`](docs/WHY.md).)

## The engineering inside the loop

The equipment makes the model design well; the **甲乙环** is the engineering that makes it design *honestly* — and several details that look like plumbing are the actual ideas:

- **The critic is design-blind, and that's the spine, not a nicety.** The founding observation: a model grading its own frame *together with* its own flowery design doc doesn't see the frame — it sees the frame *through* the doc, and reasons toward "yes, this delivers the intent." Its read of an image is directionally pulled toward defending the narrative it already holds. So the critic (甲) is handed **only the rendered frames and the one-line brief** — never the design, the code, or the notes. The same blind critic caught, on three separate briefs, a real flaw the builder had just signed off on ("I smoothed the banding" → the blind eyes saw the cheap concentric rings anyway). A better self-check persona cannot close that gap, because the gap is *structural*.
- **The critic has memory, on purpose.** A fresh, memoryless critic each round produces *false* convergence: it forgets what it flagged last round and declares victory on a piece it would have rejected. 甲 is one persistent instance across rounds — which is exactly what makes the loop converge fast instead of oscillating.
- **The frame strip handed to the critic is a design decision, not a screenshot dump.** The critic is a VLM — it reads stills, never the video — so *which* frames it sees is what it judges, and the obvious choice (sample evenly in time) is actively wrong. Sample densely and a clean half-second text move freezes into a stack of mid-transition stills that a VLM reads as a *severe overlapping-text defect* — a flawless transient condemned as a layout failure. So `render-strip.ts` measures motion straight off the rendered mp4 (with ffmpeg, zero extra renders), segments the timeline into held *pauses* and *motion* blocks via a hysteresis double-threshold, and hands the critic **one held frame per pause** (the real composition, fair to judge for layout and finish) plus duration-aware **mid** frames that are flagged *read-for-motion-only, never a defect*. That held/mid role contract is the whole point: it feeds a blind critic evidence in the right register, so it judges the design instead of hallucinating defects from how motion looks when you freeze it.
- **The orchestrator ferries verbatim and never judges.** Because the critic must never see the design, 甲 and 乙 never talk directly — a neutral relay passes *phenomena* (critic → builder) and *pixel-grounded rebuttals* (builder → critic), automatically, word for word. That isolation **is** the thing that keeps the critic unbiased; a chatty orchestrator that summarized either side would leak design context straight back into the blind judge.
- **N draws, then blind-select for *potential*.** Equipment buys the floor, but the ceiling is a right-tail event, so the builder runs N independent times and a provenance-blind selector picks the base whose *ceiling after refinement* is highest — not the one with fewest current flaws. A bold draft with fixable nits beats a clean, safe, mediocre one every time, because the loop fixes nits but cannot fix mediocrity.

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
