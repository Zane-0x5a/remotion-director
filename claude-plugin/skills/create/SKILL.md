---
name: create
description: Design and build a finished motion piece (default vertical 1080×1920; landscape/square also supported) from a brief through the 甲乙环 (critic-loop) pipeline — a unified design+build agent (乙) drafts a design and writes the Remotion code in one continuous context; N independent draws are blind-selected for the most promising base; a design-blind aesthetic critic (甲) judges only the rendered frames, round after round until it converges; a fresh-context tempo pass then re-times the converged piece (the frame-judged loop is blind to the time axis); the user's own eyes are the final gate. Use when the user wants to generate, design, or build a short motion piece, text animation, or social video from a brief.
version: 0.1.0
user-invocable: true
---

# create

Turn a brief into a finished motion piece (default **1080×1920 vertical**; landscape/square also available) through the **甲乙环 (critic-loop) pipeline**. Quality is produced by a unified design-and-build agent working in one continuous context with real design knowledge — judged on its **actual rendered frames**, blind-selected and critic-refined, with the **user's eyes as the final gate**.

You (the agent reading this skill) are the **orchestrator**. You spawn the sub-agents, run the render tooling, and **ferry critic verdicts verbatim** — you do NOT design, and you do NOT judge aesthetics. Every piece of design knowledge and every protocol reaches the sub-agents by them **Reading the verbatim equipment/protocol files** — never by you paraphrasing them.

> **The one rule that protects everything**: do not summarize the equipment, the §4 self-check persona, the conceit rules, or the critic protocol in your own words. The tuned wording only binds an agent when that agent has the literal text in its context. Always delegate by Read (`${CLAUDE_PLUGIN_ROOT}/…`), never by retelling.

## Inputs

The pipeline needs a **brief** and a **spec** before any draw. Collect both in Step 0 (below); for any you can't get, propose a sensible default and let the user accept it in one line.

- **brief**: the piece's job — audience, takeaway, tone. **Required.** If not given, ask for it.
- **spec** — the finished-video parameters:
  - **aspect / resolution**: vertical **1080×1920** (default — social/portrait), landscape **1920×1080**, or square **1080×1080**. Propose vertical as the default; the user may pick another.
  - **duration** — offer it as a *choice*, not a blank (see Step 0): a couple of sensible second-counts for this brief, "I'll name one", or **"don't constrain it — the designer decides"**. Whichever second-count the user picks or states, it is **locked**; only the explicit "don't constrain it" option makes it **free**. This authority is carried all the way to Step 4.5.
  - **fps** (default 30).
  - **on-screen copy**: is there required text/wording, or is it the designer's call?
  - **audio intent**: does the user want sound (music / SFX / VO)? **Note honestly if asked**: audio is **experimental** here — the engine can mount `<Audio>`, but the design equipment and the critic loop are **visual-only** (no audio dimension in the 3-step process, nothing in §4 / the 甲乙环 judges sound). So an audio request is best-effort and **unverified by the pipeline**; surface that before committing to it. If the user still insists on sound, the minimal tool-chain pointer is: consult the `remotion-best-practices` skill's `remotion-markup` node (`audio.md` / `sfx.md` — `<Audio>`, `remotion.media` remote SFX) for what the engine supports, and source CC0 assets yourself — the pipeline neither provides nor validates audio. (Note: `sfx.md` uses `@remotion/sfx`, which is deliberately NOT in the base dep set — audio being experimental, the builder installs it on demand with `npx remotion add @remotion/sfx`, which resolves the version matching the prepared engine.)
- **target-project port (only if asked)**: if the user intends to *port the finished piece back into an existing Remotion project* rather than ship the standalone workspace render, **ask for that project's Remotion version and whether it has `three` / `@remotion/media` installed** up front. The workspace automatically prepares the latest stable Remotion + three before drawing; an older/leaner target can drift on API, so knowing the target version before drawing avoids a port-time surprise. (Porting is a user-side activity the pipeline doesn't itself verify.)
- **N (draws)**: independent draws before blind-select. Default **3**. (More draws = higher ceiling; N is the user's knob.)
- **workspace**: a user-side project dir (NOT under the plugin). Default `./<piece-slug>/` in the user's CWD.

The critic loop has **no round knob** — it runs until 甲 reports `CONVERGED: YES`, then the user's eyes are the final gate.

## Step 0 — Commission (gate; collect before any draw)

A real run starts from the user, not from a guess. **Before scaffolding or drawing, confirm the commission** — the brief, the spec, and the production knobs from `Inputs`. Do not start drawing until this is settled.

1. **Brief** — if you don't have audience / takeaway / tone, ask. The brief is required; everything downstream is shaped by it.
2. **Spec** — settle each parameter. For anything the user didn't state, **propose a default and let them accept or change it in one line** (don't silently assume):
   - aspect/resolution (default **vertical 1080×1920**; offer landscape 1920×1080 / square 1080×1080),
   - **duration — ask it as a pick-list, and record which of two authorities results.** Don't leave it as a blank to type into: put the options in front of the user (AskUserQuestion is the right instrument) — two or three second-counts that suit this brief, "I'll name one", and **"don't constrain it — leave the length to the designer"**. Then record:
     - **locked** — the user picked or stated a second-count. *Any* number the user put their name to is locked, whether you proposed it or they volunteered it; accepting your proposal **is** choosing. It is a promise to the user, and **Step 4.5 may not change the total length.**
     - **free** — the user explicitly chose "don't constrain it". The builder still hard-wires a concrete `durationInFrames` (the engine needs one), but that number is **乙's own internal decision, never aligned with the user** — so it is not a promise, and **Step 4.5 may change it**. Same for any second-count 乙 writes into DESIGN.md: it's a one-shot draft value, not a constraint.
     - Carry this flag verbatim to Step 4.5. If in doubt, it is **locked** — never silently promote a user's number to "adjustable".
   - fps (default 30),
   - on-screen copy (required wording vs. designer's call),
   - audio intent — and if the user wants sound, **tell them plainly it's experimental and unverified by this pipeline** (visual-only equipment + critic loop; see `Inputs`). Only proceed with audio if they still want it, eyes open.
3. **Knobs** — surface the production knobs too; don't bury them as silent defaults:
   - **N (draws before blind-select)** — default **3**. This is the user's knob (more draws = higher ceiling, more cost/time). State the default and let them raise/lower it. **Never silently pick N** — the gate exists precisely to surface the user's decisions.
   - **workspace** — where the piece is built; default a `<piece-slug>/` folder in the user's CWD. Offer to change it.
4. **Confirm back** the resolved commission in one short summary (brief + final spec + **duration authority: locked ⟨Ns⟩ / free** + N + workspace) and proceed once the user is content. If the user said "just go / your call", fill every blank with the defaults above, state what you chose (including N), and proceed — note that "your call" on the duration means **free**: you did not put a number in front of them to accept.

Carry the resolved spec forward: it sets the composition's `width`/`height`/`durationInFrames`/`fps` that the builder hard-wires into `<Composition id="piece">`, and it's part of the brief context every sub-agent receives.

> The pipeline is **validated at 1080×1920**. Landscape/square are supported by the same harnesses but are **not yet smoke-tested**; if the user picks one, say so (it's a first-class option, just less-trodden) and watch the first render closely.

## Step 1 — Prepare the latest engineering environment

Engine and skill versions are engineering inputs owned by upstream, not design constraints imposed by this plugin. After the commission has resolved the workspace, run once before starting any builders:

```bash
node "${CLAUDE_PLUGIN_ROOT}/tools/check-env.mjs" --workspace "<WORKSPACE>"
```

This creates a missing workspace, resolves npm’s stable `latest` Remotion release, updates all declared `remotion` / `@remotion/*` packages together, and installs missing tooling. For RBP, it compares the full official upstream skill with an existing global installation and updates that installation in place only when contents differ; without a global installation it installs under the workspace’s `.remotion-director/`. Existing unrelated dependencies and manifest fields are preserved. Exact versions in the workspace manifest and lockfile record this run’s resolved environment; the next new piece queries upstream again. `--fix` remains an alias for this automatic preparation.

Use the printed **`RBP_SKILL_PATH`** (also recorded with the upstream revision in `<WORKSPACE>/.remotion-director/environment.json`) in every builder task. The builder reads that exact synchronized installation, including when it is global. Upstream owns the skill layout and its release schedule; an RBP/engine version difference is informational, and actual installed exports determine API availability.

Node.js, npm, Git and a full ffmpeg build must be available. The check exercises ffmpeg rawvideo, scale and crop support. Install missing host tools as needed under the host’s permission policy. Engineering preparation includes updating an existing global RBP installation; follow host filesystem permissions, with no separate design approval. If network access, install or verification fails, repair the engineering problem and rerun; do not claim the environment is current or start drawing after a failed preparation.

Prepare the environment before parallel draws; a global RBP update is shared by other projects using it. During a run, use `check-env.mjs --workspace "<WORKSPACE>" --check` for a read-only check without updating. If an engineering issue requires another upgrade, coordinate it through the orchestrator while affected builders are stopped, then re-render affected outputs. This prevents parallel dependency writes; it is not a fixed-version design policy.

Each draw is `<workspace>/<piece-slug>/draw-i/`, holding `index.tsx`, `DESIGN.md`, `FIXES.md` and `out/`. `⟨RUN_DIR⟩` is that draw’s absolute directory; `⟨WORKDIR⟩` / `<WORKSPACE>` is the absolute project root holding `package.json` and `node_modules` (pass it explicitly; it need not be the draw’s immediate parent).

## Step 2 — N draws (乙), in parallel

Spawn **N `builder` agents** (one per draw), each with: the brief, the resolved **spec** from Step 0 (aspect/resolution, duration, fps, copy + audio intent), its absolute `<RUN_DIR>` (`…/draw-i`), the absolute **`<WORKSPACE>` root** (the dir holding `node_modules` + `package.json`;  the builder needs it for the `NODE_PATH` prefix on every render command, without which the first render crashes `Cannot find module '@remotion/bundler'`), the prepared **`RBP_SKILL_PATH`**, and the product contract (register `<Composition id="piece">` with the spec's `width`/`height`/`durationInFrames`/`fps`). Each builder's first act is to **Read the design-equipment in full** and obey it (you do not restate it). Each runs the full 3-step process → §4 self-check → renders R1 (render-arm then render-strip) to its `out/r1`.

- Keep each builder instance **alive** after R1 — the winner continues into the critic loop in the SAME context (do not start a fresh agent there).
- Verify each draw rendered non-white (read 2-3 stills).
- **A builder is done only when it says so — not when it goes idle.** See *Delivery protocol* (Hard rules). Wait for each builder to **SendMessage you an explicit `draw-i settled` report** naming its **canonical out dir** (which `out/rN` is final — it is NOT always `r1`; self-check may have re-rendered to `r2`/`r3`/…). Do not read disk to guess whether a draw finished or which render is canonical. Hold Step 3 until **all N** have reported settled.

## Step 3 — Blind select

**Precondition: all N builders have reported `settled`** (Step 2). Only then select. Invoke the **critic-loop** skill's selection step: spawn the `blind-selector` agent with the brief + the N candidate dirs — each draw's **canonical out dir as the builder reported it** (`…/draw-i/out/r⟨canonical⟩/` with `strip/`), **not a hardcoded `out/r1/`**. A builder whose self-check re-rendered to `r3` has its real work in `r3`; feeding the selector `r1` would judge an abandoned version. It returns `{ winner, reason }` selecting for **potential** (highest ceiling after the loop), not fewest current flaws. You do not pick.

## Step 4 — Critic loop (甲乙环), run to convergence

Run the **critic-loop** skill's loop, ferrying verbatim. Apply the **版本交接** rules in `CRITIC-PROTOCOL.md`: keep the review round separate from the render version, take canonical from explicit completion reports, and allocate unused output directories for re-renders.

1. Spawn ONE `aesthetic-critic` (甲) instance, design-blind, with the brief + **the winner's canonical strip** as the builder reported it (no DESIGN.md, no code). Fill the protocol slots: `⟨BRIEF⟩`, `⟨RUN_DIR⟩` (the winner draw dir, absolute), `⟨WORKDIR⟩` (workspace root), and **`⟨STRIP_DIR⟩` (the absolute canonical strip path)**. This is review round 1 even if the builder self-checked through render r3. Verify the reported video, stills and strip exist before dispatch; missing or conflicting paths require a corrected handoff, never a fallback to r1 or the highest directory number.
2. Take 甲's verdict **verbatim** → send to the winning **builder** instance's conversation (the same continuous-context 乙), and archive it to `⟨RUN_DIR⟩/CRITIC-VERDICTS.md` with the review round and reviewed strip path. Fill the ferry message's `⟨REVIEW_ROUND⟩`, `⟨STRIP_DIR⟩` and unused **`⟨NEXT_OUT_DIR⟩`** explicitly. The builder adjudicates per §5 环纪律 (fix / fulfill / pixel-grounded rebuttal), re-renders there (render-arm then render-strip), and **SendMessages an explicit `round ⟨REVIEW_ROUND⟩ done` naming its actual final output and strip dir** after verification (again: not idle — wait for the message). Self-check can advance beyond the assigned initial output. Verify that reported output's video, stills and strip, then update canonical and ferry **that exact strip path with the next review round number** to 甲. (A persistent 甲 fed a stale strip will file already-fixed defects as live ones and carry that poison into every later round; if you realize 甲 was fed a stale or wrong strip, the only clean fix is to shut that 甲 down and respawn a fresh one on the correct strip.)
3. If the builder rebuts an item, ferry the rebuttal **verbatim** → back to 甲 (甲's review protocol limits it to pixels + your relayed rebuttal). Name the same strip path already handed to 甲 for that round; a rebuttal alone does not select a different render.
4. **Loop until 甲 reports `CONVERGED: YES`** — there is no round cap. 甲 is a *persistent* instance with cross-round memory, which is exactly what makes it converge fast (typically a few rounds); do not impose an artificial ceiling that stops it while it still has high-/med-severity items. The converged result is the canonical output whose strip 甲 actually reviewed and marked converged.

Throughout: you **only** orchestrate + ferry verbatim + verify pixels landed. You report neutral pixel phenomena if asked, **never aesthetic conclusions** — all visual judgment lives in the design-blind 甲乙环.

## Step 4.5 — 节奏刀 (tempo pass; after convergence, before the user's eyes)

**Why this step exists.** The loop judges **frames**, and the punctuated strip discards the time axis *by construction*: a PAUSE contributes exactly **one** held frame whether it lasted 8 frames or 80 (that trade is correct — it's what kills the "motion mid-pass read as overlapping-text" misjudgment). The consequence is that across every round of the loop, **no judge ever spoke about dwell time or the piece's slack-and-tension arc**, while each frame-domain fix (more layering, bigger type, added stagger) silently spent time budget. Pacing drift after a long loop isn't a fluke — it's structural. This step closes it, once.

Spawn ONE `tempo-pass` agent — **fresh context, deliberately** (see *Hard rules* for why this one is legitimate). Give it:

- the brief, absolute `<RUN_DIR>` (the winner draw) and `<WORKSPACE>` root,
- **`⟨CANONICAL_OUT_DIR⟩`**, the absolute converged output (video + strip), and **`⟨NEXT_OUT_DIR⟩`**, an unused absolute render directory allocated by the same version handoff rules (not a directory derived from the critic's round number),
- the **duration authority from Step 0, verbatim: `locked ⟨N⟩s` or `free`.** This is the one input only you can supply — the agent cannot derive it from the workspace, and getting it wrong either breaks a promise to the user or needlessly straitjackets the piece.

Then **wait for its explicit message** (idle is not done — same delivery protocol as every other sub-agent). Two possible outcomes:

- **`tempo pass done`** — it names the actual final output and strip dir (self-check may have advanced beyond `⟨NEXT_OUT_DIR⟩`) and states whether the total length changed (only possible under `free`; X→Y with a reason). Verify that reported output's video, stills and strip, then make it canonical and carry it to Step 5.
- **`tempo pass blocked`** — `locked` only: redistribution inside the fixed total can't resolve the piece (content genuinely doesn't fit). It reports which beats are unresolvable, at what chars/sec, how many extra seconds would resolve it, and what cutting would. **Surface that to the user and let them decide** — relax the lock (then re-run this step as `free`) or ship the current piece. Do not decide this yourself, and never let a locked total be silently overrun.

The tempo pass does **not** redesign — conceit, narrative subject, copy, palette and layout are out of its scope; it moves time only. If it reports a non-time defect it noticed but did not touch, that is a normal finding: judge whether it's worth one more 甲乙环 round before Step 5.

> **Optional guard, your call:** a re-time can open new seams (an element now clipped at a beat's end, a stagger collapsed into simultaneous entry). 甲 is still alive with its cross-round memory, so ferrying the post-tempo canonical strip path with the next review round number is cheap insurance. Take it when the re-time was structural (beats moved, total length changed); skip it when it was a few dwell tweaks. If 甲 comes back `CONVERGED: NO`, that's just an ordinary round — hand it to 乙 with that reviewed strip path and an unused `⟨NEXT_OUT_DIR⟩`, following Step 4's version handoff.

## Step 5 — User eyeball (final gate)

Present the piece as it stands after Step 4.5 — **the post-tempo-pass render, not the pre-tempo one** — for the user's own eyes, the **final gate, outranking every VLM judge**:
- key stills: `⟨CANONICAL_OUT_DIR⟩/still-*.png`
- the video: `⟨CANONICAL_OUT_DIR⟩/video.mp4`

The version the user judges must be the version that ships; never re-time after this gate. If the duration authority was `free` and the tempo pass changed the total length, say so here (X→Y seconds) — the user picked "leave it to the designer", not "surprise me".

Do not declare the piece shipped on 甲's `CONVERGED: YES` alone. The user's verdict is final.

## Hard rules (do not violate)

- **Delegate by Read, never paraphrase.** The builder Reads the equipment; 甲/blind-selector ARE the verbatim protocols. You never restate tuned wording.
- **乙 is continuous context.** One builder instance per draw, alive through design→build→render→self-check→critic-loop. Never a fresh read-back agent mid-loop (that's the degraded rescue form only).
- **Fresh context is legitimate in exactly one place: Step 4.5.** The continuous-context rule above protects *design adjudication* — a fresh agent dropped into the loop would re-litigate a conceit it doesn't own. The tempo pass is not design adjudication: it is a bounded re-balancing of an already-converged piece, and unlike aesthetics, **time is written exactly in the source** (`<Sequence from durationInFrames>`, interpolate domains, springs), so a fresh reader gets complete, precise data rather than a lossy read-back. There, fresh context is the *asset*: 乙's context is saturated by N rounds of local defect work, which is precisely the state in which the whole-piece time arc is invisible. Do **not** read this as license for read-back agents anywhere else.
- **A locked duration is a promise.** If the user picked or stated a second-count at Step 0, no later step may change the total length — Step 4.5 redistributes inside it or reports back. Only an explicit "don't constrain it" makes the length 乙's own (and therefore movable).
- **甲 is design-blind.** It receives only the brief + frame paths. Never hand it DESIGN.md, code, or notes — that is the exact context-pollution the 甲乙环 exists to prevent.
- **The orchestrator never judges aesthetics.** Ferry 甲's verdicts verbatim; report only neutral pixel phenomena; all visual defects go to the 甲乙环.
- **User eyeball is the final gate.** VLM `CONVERGED: YES` is necessary, not sufficient.
- **Commission before draw.** Don't scaffold or draw until brief + spec + knobs are settled (Step 0). Fill blanks with stated defaults and say what you chose — never silently assume the aspect/duration/audio, and **never silently pick N**: surface the draw count and let the user own it. Put the **duration** in front of the user as a pick-list (including "don't constrain it") rather than a blank to type into, and record which authority resulted.
- **Delivery protocol — idle is not done.** Every sub-agent (乙 builders, 甲, blind-selector, tempo-pass) **finishes by SendMessage-ing you an explicit result**, and only that message means it's done. An agent going **idle is a yielded turn, not a delivered task** — a builder is idle between self-check re-renders; 甲 is idle between rounds. Never read disk artifacts to *infer* that an agent finished, which render is canonical, or what a verdict was.
  - **Builders** report `settled` + their **canonical out dir** (which `out/rN` is final — self-check may have moved it past `r1`). Hold blind-select until **all N** report settled; never select on half-baked snapshots (a draw mid-self-check, or one that abandoned its `r1`).
  - **甲 and the blind-selector** must hand their verdict/`{winner,reason}` back to you by message before idling — if a one-shot judge ends its turn without sending the result, ask it for the result; don't go fishing on disk.
  - **tempo-pass** reports `tempo pass done` (actual final output and strip dir + whether the total length changed) or `tempo pass blocked` (locked total, unresolvable — the user decides).
  - **Always carry the *canonical* artifact.** Whatever you ferry to 甲 (the winner's strip) or to the builder must be the latest reported render, never a stale earlier one — a stale strip makes a persistent 甲 condemn already-fixed defects round after round.
