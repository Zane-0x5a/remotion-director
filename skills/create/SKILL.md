---
name: create
description: Design and build a finished motion piece (default vertical 1080×1920; landscape/square also supported) from a brief through the 甲乙环 (critic-loop) pipeline — a unified design+build agent (乙) drafts a design and writes the Remotion code in one continuous context; N independent draws are blind-selected for the most promising base; a design-blind aesthetic critic (甲) judges only the rendered frames across ≤2 rounds; the user's own eyes are the final gate. Use when the user wants to generate, design, or build a short motion piece, text animation, or social video from a brief.
version: 0.1.0
user-invocable: true
---

# create

Turn a brief into a finished motion piece (default **1080×1920 vertical**; landscape/square also available) through the **甲乙环 (critic-loop) pipeline**. Quality is produced by a unified design-and-build agent working in one continuous context with real design knowledge — judged on its **actual rendered frames**, blind-selected and critic-refined, with the **user's eyes as the final gate**.

You (the agent reading this skill) are the **orchestrator**. You spawn the sub-agents, run the render tooling, and **ferry critic verdicts verbatim** — you do NOT design, and you do NOT judge aesthetics. Every piece of design knowledge and every protocol reaches the sub-agents by them **Reading the verbatim equipment/protocol files** — never by you paraphrasing them.

> **The one rule that protects everything**: do not summarize the equipment, the §4 self-check persona, the conceit rules, or the critic protocol in your own words. The tuned wording only binds an agent when that agent has the literal text in its context. Always delegate by Read (`${CLAUDE_PLUGIN_ROOT}/…`), never by retelling.

## Inputs

The pipeline needs a **brief** and a **spec** before any draw. Collect both in Step 0.5 (below); for any you can't get, propose a sensible default and let the user accept it in one line.

- **brief**: the piece's job — audience, takeaway, tone. **Required.** If not given, ask for it.
- **spec** — the finished-video parameters:
  - **aspect / resolution**: vertical **1080×1920** (default — social/portrait), landscape **1920×1080**, or square **1080×1080**. Propose vertical as the default; the user may pick another.
  - **duration** (seconds) and **fps** (default 30).
  - **on-screen copy**: is there required text/wording, or is it the designer's call?
  - **audio intent**: does the user want sound (music / SFX / VO)? **Note honestly if asked**: audio is **experimental** here — the engine can mount `<Audio>`, but the design equipment and the critic loop are **visual-only** (no audio dimension in the 3-step process, nothing in §4 / the 甲乙环 judges sound). So an audio request is best-effort and **unverified by the pipeline**; surface that before committing to it. If the user still insists on sound, the minimal tool-chain pointer is: consult the `remotion-best-practices` skill's audio/SFX surface (e.g. `<Audio>`, `remotion.media` remote SFX) for what the engine supports, and source CC0 assets yourself — the pipeline neither provides nor validates audio.
- **target-project port (only if asked)**: if the user intends to *port the finished piece back into an existing Remotion project* rather than ship the standalone workspace render, **ask for that project's Remotion version and whether it has `three` / `@remotion/media` installed** up front. The workspace builds on Remotion **4.0.477** + three; an older/leaner target can drift on API, so knowing the target version before drawing avoids a port-time surprise. (Porting is a user-side activity the pipeline doesn't itself verify.)
- **N (draws)**: independent draws before blind-select. Default **3**. (More draws = higher ceiling; N is the user's knob.)
- **workspace**: a user-side project dir (NOT under the plugin). Default `./<piece-slug>/` in the user's CWD.

The critic loop has **no round knob** — it runs until 甲 reports `CONVERGED: YES`, then the user's eyes are the final gate.

## Step 0 — Environment check (gate; do this first)

The pipeline renders real frames and reads the live engine capability surface. Confirm the environment, and install what's missing:

```bash
node "${CLAUDE_PLUGIN_ROOT}/tools/check-env.mjs"
```

It checks three things and tells you exactly what to do for any that are missing:
1. **Engine deps** (`node_modules` + the @remotion/* set, three, tsx, bundler/renderer) in the workspace — install with `npm install` in the workspace (Step 1 scaffolds the `package.json`).
2. **`remotion-best-practices` skill** — the builder's §2 第三步 reads it for the live engine capability surface. It is a **separately-owned, hot-updated** skill (not vendored here). If absent, install it from its official source: `npx skills add remotion-dev/skills` (or the host's skill-install flow).
3. **ffmpeg** on PATH — render-strip uses it to measure motion for the **punctuated** frame sampling the critic depends on. **If ffmpeg is missing, do NOT proceed**: render-strip would silently fall back to uniform sampling, which drops the held/mid roles the critic protocol relies on — a degraded, non-validated regime. Install ffmpeg first.

**Gate**: engine deps resolve, RBP is reachable, ffmpeg is present.

## Step 0.5 — Commission (gate; collect before any draw)

A real run starts from the user, not from a guess. **Before scaffolding or drawing, confirm the commission** — the brief, the spec, and the production knobs from `Inputs`. Do not start drawing until this is settled.

1. **Brief** — if you don't have audience / takeaway / tone, ask. The brief is required; everything downstream is shaped by it.
2. **Spec** — settle each parameter. For anything the user didn't state, **propose a default and let them accept or change it in one line** (don't silently assume):
   - aspect/resolution (default **vertical 1080×1920**; offer landscape 1920×1080 / square 1080×1080),
   - duration (seconds) and fps (default 30),
   - on-screen copy (required wording vs. designer's call),
   - audio intent — and if the user wants sound, **tell them plainly it's experimental and unverified by this pipeline** (visual-only equipment + critic loop; see `Inputs`). Only proceed with audio if they still want it, eyes open.
3. **Knobs** — surface the production knobs too; don't bury them as silent defaults:
   - **N (draws before blind-select)** — default **3**. This is the user's knob (more draws = higher ceiling, more cost/time). State the default and let them raise/lower it. **Never silently pick N** — the gate exists precisely to surface the user's decisions.
   - **workspace** — where the piece is built; default a `<piece-slug>/` folder in the user's CWD. Offer to change it.
4. **Confirm back** the resolved commission in one short summary (brief + final spec + N + workspace) and proceed once the user is content. If the user said "just go / your call", fill every blank with the defaults above, state what you chose (including N), and proceed.

Carry the resolved spec forward: it sets the composition's `width`/`height`/`durationInFrames`/`fps` that the builder hard-wires into `<Composition id="piece">`, and it's part of the brief context every sub-agent receives.

> The pipeline is **validated at 1080×1920**. Landscape/square are supported by the same harnesses but are **not yet smoke-tested**; if the user picks one, say so (it's a first-class option, just less-trodden) and watch the first render closely.

## Step 1 — Scaffold the workspace (user-side, self-contained)

In the user's chosen dir, create a self-contained Remotion project so the bundler resolves both the builder's `index.tsx` imports and the harness imports from one `node_modules`:

- Write a `package.json` mirroring the plugin's engine deps **verbatim** (the @remotion/* 4.0.477 set incl. `@remotion/bundler` + `@remotion/renderer`, `three`, `@react-three/fiber`, `react`, `react-dom`, `remotion`, `zod`; devDep `tsx`, `typescript`). Copy `${CLAUDE_PLUGIN_ROOT}/package.json`'s dependency block.
- Run `npm install` once in the workspace.
- Each draw is a subdir: `<workspace>/<piece-slug>/draw-1/`, `draw-2/`, … each will hold `index.tsx`, `DESIGN.md`, `FIXES.md`, `out/rN/`.

`⟨RUN_DIR⟩` for a draw = the absolute path to that draw dir. `⟨WORKDIR⟩` (the cwd in protocol prompts) = the workspace root.

## Step 2 — N draws (乙), in parallel

Spawn **N `builder` agents** (one per draw), each with: the brief, the resolved **spec** from Step 0.5 (aspect/resolution, duration, fps, copy + audio intent), its absolute `<RUN_DIR>` (`…/draw-i`), the absolute **`<WORKSPACE>` root** (the dir holding `node_modules` + `package.json` — `<RUN_DIR>`'s parent; the builder needs it for the `NODE_PATH` prefix on every render command, without which the first render crashes `Cannot find module '@remotion/bundler'`), and the product contract (register `<Composition id="piece">` with the spec's `width`/`height`/`durationInFrames`/`fps`). Each builder's first act is to **Read the design-equipment in full** and obey it (you do not restate it). Each runs the full 3-step process → §4 self-check → renders R1 (render-arm then render-strip) to its `out/r1`.

- Keep each builder instance **alive** after R1 — the winner continues into the critic loop in the SAME context (do not start a fresh agent there).
- Verify each draw rendered non-white (read 2-3 stills).
- **A builder is done only when it says so — not when it goes idle.** See *Delivery protocol* (Hard rules). Wait for each builder to **SendMessage you an explicit `draw-i settled` report** naming its **canonical out dir** (which `out/rN` is final — it is NOT always `r1`; self-check may have re-rendered to `r2`/`r3`/…). Do not read disk to guess whether a draw finished or which render is canonical. Hold Step 3 until **all N** have reported settled.

## Step 3 — Blind select

**Precondition: all N builders have reported `settled`** (Step 2). Only then select. Invoke the **critic-loop** skill's selection step: spawn the `blind-selector` agent with the brief + the N candidate dirs — each draw's **canonical out dir as the builder reported it** (`…/draw-i/out/r⟨canonical⟩/` with `strip/`), **not a hardcoded `out/r1/`**. A builder whose self-check re-rendered to `r3` has its real work in `r3`; feeding the selector `r1` would judge an abandoned version. It returns `{ winner, reason }` selecting for **potential** (highest ceiling after the loop), not fewest current flaws. You do not pick.

## Step 4 — Critic loop (甲乙环), run to convergence

Run the **critic-loop** skill's loop, ferrying verbatim:

1. Spawn ONE `aesthetic-critic` (甲) instance, design-blind, with the brief + **the winner's canonical strip** (`out/r⟨canonical⟩/strip/` as the builder reported it — *not* a hardcoded `out/r1/strip/`; the winner may have self-checked past r1) paths only (no DESIGN.md, no code). Fill the protocol slots: `⟨BRIEF⟩`, `⟨RUN_DIR⟩` (the winner draw dir, absolute), `⟨WORKDIR⟩` (workspace root).
2. Take 甲's verdict **verbatim** → send to the winning **builder** instance's conversation (the same continuous-context 乙), and archive it to `⟨RUN_DIR⟩/CRITIC-VERDICTS.md`. The builder adjudicates per §5 环纪律 (fix / fulfill / pixel-grounded rebuttal), re-renders to `out/r⟨N⟩` (render-arm then render-strip), and **SendMessages you back an explicit `round N done` naming the new strip dir** when its re-render is verified non-white (again: not idle — wait for the message). Ferry the **freshly-reported `out/r⟨N⟩/strip/`** to 甲 — never a stale earlier strip. (A persistent 甲 fed a stale strip will file already-fixed defects as live ones and carry that poison into every later round; if you realize 甲 was fed a stale or wrong strip, the only clean fix is to shut that 甲 down and respawn a fresh one on the correct strip.)
3. If the builder rebuts an item, ferry the rebuttal **verbatim** → back to 甲 (甲 can't read files; it only re-judges from pixels + your relayed rebuttal). 甲 re-judges that round's frames (the `out/r⟨N⟩/strip/` you just ferried).
4. **Loop until 甲 reports `CONVERGED: YES`** — there is no round cap. 甲 is a *persistent* instance with cross-round memory, which is exactly what makes it converge fast (typically a few rounds); do not impose an artificial ceiling that stops it while it still has high-/med-severity items. The converged result is the latest `out/rN`.

Throughout: you **only** orchestrate + ferry verbatim + verify pixels landed. You report neutral pixel phenomena if asked, **never aesthetic conclusions** — all visual judgment lives in the design-blind 甲乙环.

## Step 5 — User eyeball (final gate)

Present the converged piece for the user's own eyes — the **final gate, outranking every VLM judge**:
- key stills: `⟨RUN_DIR⟩/out/rN/still-*.png`
- the video: `⟨RUN_DIR⟩/out/rN/video.mp4`

Do not declare the piece shipped on 甲's `CONVERGED: YES` alone. The user's verdict is final.

## Hard rules (do not violate)

- **Delegate by Read, never paraphrase.** The builder Reads the equipment; 甲/blind-selector ARE the verbatim protocols. You never restate tuned wording.
- **乙 is continuous context.** One builder instance per draw, alive through design→build→render→self-check→critic-loop. Never a fresh read-back agent mid-loop (that's the degraded rescue form only).
- **甲 is design-blind.** It receives only the brief + frame paths. Never hand it DESIGN.md, code, or notes — that is the exact context-pollution the 甲乙环 exists to prevent.
- **The orchestrator never judges aesthetics.** Ferry 甲's verdicts verbatim; report only neutral pixel phenomena; all visual defects go to the 甲乙环.
- **User eyeball is the final gate.** VLM `CONVERGED: YES` is necessary, not sufficient.
- **Commission before draw.** Don't scaffold or draw until brief + spec + knobs are settled (Step 0.5). Fill blanks with stated defaults and say what you chose — never silently assume the aspect/duration/audio, and **never silently pick N**: surface the draw count and let the user own it.
- **Delivery protocol — idle is not done.** Every sub-agent (乙 builders, 甲, blind-selector) **finishes by SendMessage-ing you an explicit result**, and only that message means it's done. An agent going **idle is a yielded turn, not a delivered task** — a builder is idle between self-check re-renders; 甲 is idle between rounds. Never read disk artifacts to *infer* that an agent finished, which render is canonical, or what a verdict was.
  - **Builders** report `settled` + their **canonical out dir** (which `out/rN` is final — self-check may have moved it past `r1`). Hold blind-select until **all N** report settled; never select on half-baked snapshots (a draw mid-self-check, or one that abandoned its `r1`).
  - **甲 and the blind-selector** must hand their verdict/`{winner,reason}` back to you by message before idling — if a one-shot judge ends its turn without sending the result, ask it for the result; don't go fishing on disk.
  - **Always carry the *canonical* artifact.** Whatever you ferry to 甲 (the winner's strip) or to the builder must be the latest reported render, never a stale earlier one — a stale strip makes a persistent 甲 condemn already-fixed defects round after round.
