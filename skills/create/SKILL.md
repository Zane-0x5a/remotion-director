---
name: create
description: Design and build a finished vertical (1080×1920) motion piece from a brief through the 甲乙环 (critic-loop) pipeline — a unified design+build agent (乙) drafts a design and writes the Remotion code in one continuous context; N independent draws are blind-selected for the most promising base; a design-blind aesthetic critic (甲) judges only the rendered frames across ≤2 rounds; the user's own eyes are the final gate. Use when the user wants to generate, design, or build a short motion piece, text animation, or vertical social video from a brief.
version: 0.1.0
user-invocable: true
---

# create

Turn a brief into a finished 1080×1920 vertical motion piece through the **甲乙环 (critic-loop) pipeline**. Quality is produced by a unified design-and-build agent working in one continuous context with real design knowledge — judged on its **actual rendered frames**, blind-selected and critic-refined, with the **user's eyes as the final gate**.

You (the agent reading this skill) are the **orchestrator**. You spawn the sub-agents, run the render tooling, and **ferry critic verdicts verbatim** — you do NOT design, and you do NOT judge aesthetics. Every piece of design knowledge and every protocol reaches the sub-agents by them **Reading the verbatim equipment/protocol files** — never by you paraphrasing them.

> **The one rule that protects everything**: do not summarize the equipment, the §4 self-check persona, the conceit rules, or the critic protocol in your own words. The tuned wording only binds an agent when that agent has the literal text in its context. Always delegate by Read (`${CLAUDE_PLUGIN_ROOT}/…`), never by retelling.

## Inputs

- **brief**: the piece's job (audience, takeaway, tone). If not given, ask for it (one short ask).
- **N (draws)**: how many independent draws to make before blind-select. Default **3**. (More draws = higher ceiling; N is the user's knob.)
- **workspace**: a user-side project dir (NOT under the plugin). Default `./<piece-slug>/` in the user's CWD.
- **MAX_ROUNDS**: critic-loop rounds. Default **2**.

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

## Step 1 — Scaffold the workspace (user-side, self-contained)

In the user's chosen dir, create a self-contained Remotion project so the bundler resolves both the builder's `index.tsx` imports and the harness imports from one `node_modules`:

- Write a `package.json` mirroring the plugin's engine deps **verbatim** (the @remotion/* 4.0.477 set incl. `@remotion/bundler` + `@remotion/renderer`, `three`, `@react-three/fiber`, `react`, `react-dom`, `remotion`, `zod`; devDep `tsx`, `typescript`). Copy `${CLAUDE_PLUGIN_ROOT}/package.json`'s dependency block.
- Run `npm install` once in the workspace.
- Each draw is a subdir: `<workspace>/<piece-slug>/draw-1/`, `draw-2/`, … each will hold `index.tsx`, `DESIGN.md`, `FIXES.md`, `out/rN/`.

`⟨RUN_DIR⟩` for a draw = the absolute path to that draw dir. `⟨WORKDIR⟩` (the cwd in protocol prompts) = the workspace root.

## Step 2 — N draws (乙), in parallel

Spawn **N `builder` agents** (one per draw), each with: the brief, its absolute `<RUN_DIR>` (`…/draw-i`), and the product spec (1080×1920 / 30fps / duration from the brief; register `<Composition id="piece">`). Each builder's first act is to **Read the design-equipment in full** and obey it (you do not restate it). Each runs the full 3-step process → §4 self-check → renders R1 (render-arm then render-strip) to its `out/r1`.

- Keep each builder instance **alive** after R1 — the winner continues into the critic loop in the SAME context (do not start a fresh agent there).
- Verify each draw rendered non-white (read 2-3 stills).

## Step 3 — Blind select

Invoke the **critic-loop** skill's selection step: spawn the `blind-selector` agent with the brief + the N candidate dirs (each `…/draw-i/out/r1/` with `strip/`). It returns `{ winner, reason }` selecting for **potential** (highest ceiling after the loop), not fewest current flaws. You do not pick.

## Step 4 — Critic loop (甲乙环), ≤ MAX_ROUNDS

Run the **critic-loop** skill's loop, ferrying verbatim:

1. Spawn ONE `aesthetic-critic` (甲) instance, design-blind, with the brief + the winner's `out/r1/strip/` paths only (no DESIGN.md, no code). Fill the protocol slots: `⟨BRIEF⟩`, `⟨RUN_DIR⟩` (the winner draw dir, absolute), `⟨WORKDIR⟩` (workspace root), `⟨MAX_ROUNDS⟩`.
2. Take 甲's verdict **verbatim** → send to the winning **builder** instance's conversation (the same continuous-context 乙), and archive it to `⟨RUN_DIR⟩/CRITIC-VERDICTS.md`. The builder adjudicates per §5 环纪律 (fix / fulfill / pixel-grounded rebuttal), re-renders to `out/r⟨N⟩` (render-arm then render-strip), appends to `FIXES.md`.
3. If the builder rebuts an item, ferry the rebuttal **verbatim** → back to 甲 (甲 can't read files; it only re-judges from pixels + your relayed rebuttal). 甲 re-judges that round's frames (`out/r⟨N⟩/strip/`).
4. Stop at 甲's `CONVERGED: YES` or after MAX_ROUNDS. The converged result is the latest `out/rN`.

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
