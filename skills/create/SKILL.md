---
name: create
description: Design and build a finished motion piece (default vertical 1080×1920; landscape/square also supported) from a brief through the 甲乙环 (critic-loop) pipeline — a unified design+build agent (乙) drafts a design and writes the Remotion code in one continuous context; a fresh-context concept step first lists N directions that differ at the idea level and each of N independent draws is dealt one; each draw renders a first full cut (the r1 preview) and the most promising base is picked from those previews — by the user by default, or by a blind selector when the user hands the pick to AI; only the picked draw self-checks; a design-blind aesthetic critic (甲) judges only the rendered frames, round after round until it converges; a fresh-context tempo pass then re-times the converged piece (the frame-judged loop is blind to the time axis); the user's own eyes are the final gate. Use when the user wants to generate, design, or build a short motion piece, text animation, or social video from a brief.
user-invocable: true
---

# create

Turn a brief into a finished motion piece (default **1080×1920 vertical**; landscape/square also available) through the **甲乙环 (critic-loop) pipeline**. Quality is produced by a unified design-and-build agent working in one continuous context with real design knowledge — each draw seeded with its own idea-level direction, judged on its **actual rendered frames**, picked at its r1 preview (by the user, or by a blind selector), self-checked and critic-refined, with the **user's eyes as the final gate**.

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
  - **audio intent**: does the user want sound (music / SFX / VO)? The scope is: **simple sound effects the builder synthesizes itself are in scope** — basic, but acceptable; **choosing and scoring full music, and voice-over, are out of scope for now**. Either way, the design equipment and the critic loop are **visual-only** (no audio dimension in the 3-step process, nothing in §4 / the 甲乙环 judges sound), so any sound is unverified by the pipeline; say so before committing to it. The minimal tool-chain pointer for sound is: consult the `remotion-best-practices` skill's `remotion-markup` node (`audio.md` / `sfx.md` — `<Audio>`, `remotion.media` remote SFX) for what the engine supports, and source CC0 assets yourself — the pipeline neither provides nor validates audio. (Note: `sfx.md` uses `@remotion/sfx`, which is deliberately NOT in the base dep set — audio being experimental, the builder installs it on demand with `npx remotion add @remotion/sfx`, which resolves the version matching the prepared engine.)
- **target-project port (only if asked)**: if the user intends to *port the finished piece back into an existing Remotion project* rather than ship the standalone workspace render, **ask for that project's Remotion version and whether it has `three` / `@remotion/media` installed** up front. The workspace automatically prepares the latest stable Remotion + three before drawing; an older/leaner target can drift on API, so knowing the target version before drawing avoids a port-time surprise. (Porting is a user-side activity the pipeline doesn't itself verify.)
- **N (draws)**: independent draws before the pick. Default **3**. (More draws = higher ceiling; N is the user's knob.) Each draw is dealt its own idea-level direction (Step 1.5), so the N previews are genuinely different options.
- **who picks the base**: **the user** (default) — they watch each draw's **preview** (its r1 video) and pick the base; or **交给 AI 挑** — the `blind-selector` agent picks on the same previews. Either way the pick happens at r1, before any self-check.
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
   - audio intent — if the user wants sound, **tell them plainly what is in scope**: simple self-synthesized SFX yes, full music or VO not for now, and nothing in the pipeline judges sound (see `Inputs`).
3. **Knobs** — surface the production knobs too; don't bury them as silent defaults:
   - **N (draws before the pick)** — default **3**. This is the user's knob (more draws = higher ceiling, more cost/time). State the default and let them raise/lower it. **Never silently pick N** — the gate exists precisely to surface the user's decisions.
   - **who picks the base** — ask it as a choice: **the user picks** (default — once all N previews are ready they watch each draw's r1 video and choose) or **交给 AI 挑** (the blind selector picks on the same r1 previews). Record the choice. If the user chose to pick, they can still say "你替我挑" at pick time and the blind selector picks instead (Step 3).
   - **workspace** — where the piece is built; default a `<piece-slug>/` folder in the user's CWD. Offer to change it.
4. **Confirm back** the resolved commission in one short summary (brief + final spec + **duration authority: locked ⟨Ns⟩ / free** + N + who picks + workspace) and proceed once the user is content. Then write it to `<WORKSPACE>/<piece-slug>/COMMISSION.md`, together with **the model ID you are running on** and the model each sub-agent role runs on (they inherit yours unless their definition overrides it) — a run is only comparable to another if you know which model made it. If the user said "just go / your call", fill every blank with the defaults above, state what you chose (including N, and that the user picks the base), and proceed — note that "your call" on the duration means **free**: you did not put a number in front of them to accept.

Carry the resolved spec forward: it sets the composition's `width`/`height`/`durationInFrames`/`fps` that the builder hard-wires into `<Composition id="piece">`, and it's part of the brief context every sub-agent receives.

> The pipeline is **validated at 1080×1920 and 1920×1080**. Square uses the same harnesses but is **not yet smoke-tested**; if the user picks it, say so (it's a first-class option, just less-trodden) and watch the first render closely.

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

## Step 1.5 — 分方向 (deal directions; before any draw)

Left alone, independent draws tend to converge on the same idea, and then the pick has nothing real to choose between. So before any builder exists, one separate concept call lists the directions the draws will take — different at the **idea level** (the core conveying mechanism and the key action relation; a different subject or palette alone is the same idea).

Spawn ONE `direction-lister` agent — **fresh context, one-shot**. Give it only the brief, the resolved spec from Step 0 (aspect/resolution, duration, fps, on-screen copy, audio intent) and N. Nothing else: no workspace paths, no earlier draws or directions, and no wording of your own about how the directions should differ — its definition is the verbatim prompt (*Delegate by Read*). Wait for its explicit message: exactly N directions, `=== 方向 1 ===` … `=== 方向 N ===`, one or two sentences each, ranked by its own judgment of potential. If the list is malformed (not exactly N numbered directions), ask the same lister to resend it in its format — a format fix, not a content request.

Every direction is dealt, the lister's own **方向 1** always among them. You never drop, merge, re-rank, reword or judge a direction (you never judge design). Write the list verbatim to `<WORKSPACE>/<piece-slug>/DIRECTIONS.md` under a batch heading that also records the deal (batch 1: 方向 1 → draw-1, 方向 2 → draw-2, …). The file is pipeline-internal: no builder, judge or pick material ever includes it.

## Step 2 — N draws (乙), in parallel

Spawn **N `builder` agents** (one per draw), each with: **its one direction from Step 1.5, verbatim** (the batch's i-th draw takes 方向 i of that batch's list — never the other directions or `DIRECTIONS.md`), the brief, the resolved **spec** from Step 0 (aspect/resolution, duration, fps, copy + audio intent), its absolute `<RUN_DIR>` (`…/draw-i`), the absolute **`<WORKSPACE>` root** (the dir holding `node_modules` + `package.json`;  the builder needs it for the `NODE_PATH` prefix on every render command, without which the first render crashes `Cannot find module '@remotion/bundler'`), the prepared **`RBP_SKILL_PATH`**, and the product contract (register `<Composition id="piece">` with the spec's `width`/`height`/`durationInFrames`/`fps`). Each builder's first act is to **Read the design-equipment in full** and obey it (you do not restate it). Each designs the whole piece from its direction — the direction is a seed; the full 3-step process is the builder's own — then builds and renders its **preview** (render-arm then render-strip) to `out/r1` — the draw's first successful, non-white full render (ad-hoc stills checks before it are fine). Then the builder **reports `draw-i preview ready` and stops** — no §4 self-check yet; that belongs to the picked draw only (Step 3.5).

- Keep each builder instance **alive** after its preview — the picked draw's builder continues into self-check and the critic loop in the SAME context (do not start a fresh agent there).
- Verify each preview rendered non-white (read 2-3 stills; this is your engineering check, not something you show the user).
- **A builder is done only when it says so — not when it goes idle.** See *Delivery protocol* (Hard rules). Wait for each builder to **SendMessage you an explicit `draw-i preview ready` report** naming its **preview output dir** (normally `out/r1`; if an earlier render attempt crashed or came out white, the builder names the later unused dir it actually rendered to). Do not read disk to guess whether a draw finished or which render is its preview. Hold Step 3 until **all N** have reported preview ready.

## Step 3 — Pick the base at the previews

**Precondition: all N builders have reported `preview ready`** (Step 2). Only then pick. The user or the blind selector picks, as recorded at Step 0 — **you, the orchestrator, never pick.** Nobody has self-checked yet: the pick is for the idea and direction that can go furthest, not for the fewest current flaws. Both modes choose among the same dealt draws on their previews alone — the directions behind them are never shown.

**Default — the user picks.** Do not spawn the selector. Give the user **only each draw's preview `video.mp4`** — no stills, no DESIGN.md, no directions, no code, no builder notes. Use neutral labels (`A`, `B`, `C`…) assigned in a random order, copy each video to a neutral file name (e.g. `<piece-slug>/pick/A.mp4`; a fresh folder after a redraw) so its path does not reveal the draw, and keep the label → draw mapping to yourself. Add exactly one line of guidance, in the user's language: *this is a first version, not yet self-checked or polished — pick the one whose idea and direction can go furthest, not the one with the fewest flaws right now.* Take their answer as given (any draw, with or without a reason), append it to `COMMISSION.md` (label, draw, the reason if given), and continue with that draw as the winner. Don't argue for or against a draw.

- **"你替我挑" (hand it to AI) at pick time** — run the blind select below on the same previews, and record that the pick was handed over.
- **"都不要，再抽" (none of these; redraw)** — no reason required. Tell all N current builders their draws are ended (no self-check), append the redraw to `COMMISSION.md`, then run Step 1.5 again: a **fresh** `direction-lister` and a fresh, independent list for the N new draws. Do not hand it the earlier directions — "avoid what was already tried" would turn the list into a novelty objective. Append the new list to `DIRECTIONS.md` as the next batch (its 方向 1 → the first new draw, and so on), then run Step 2 on the same brief and commission with N fresh builders in **new** draw dirs (continue the numbering: `draw-(N+1)`…; leave the earlier draws on disk untouched), and pick again at their previews.

**交给 AI 挑 — blind select** (chosen at Step 0, or handed over at pick time). Invoke the **critic-loop** skill's selection step: spawn the `blind-selector` agent with the brief + the N candidate dirs — each draw's **preview dir as the builder reported it** (`…/draw-i/out/r1/` with its stills and `strip/`, or the later dir the builder named), and never the directions. It returns `{ winner, reason }` selecting for **potential** (highest ceiling after self-check and the loop), not fewest current flaws. Append the winner and reason to `COMMISSION.md`.

## Step 3.5 — Self-check (the picked draw only)

Tell the picked draw's builder (its SAME instance) that it was picked: it now runs its §4 render self-check per the equipment. Tell every other builder its draw is not picked and end it — losing draws do **not** self-check or render further.

Wait for the picked builder's explicit **`draw-i settled`** report naming its **canonical out dir** — it is NOT always the preview dir; self-check may have re-rendered to `r2`/`r3`/…. Verify that output's video, stills and strip before Step 4. The preview is never handed to 甲 unless the builder's settled report names it as canonical.

## Step 4 — Critic loop (甲乙环), run to convergence

Run the **critic-loop** skill's loop, ferrying verbatim. Apply the **版本交接** rules in `CRITIC-PROTOCOL.md`: keep the review round separate from the render version, take canonical from explicit completion reports, and allocate unused output directories for re-renders.

1. Spawn ONE `aesthetic-critic` (甲) instance, design-blind, with the brief + **the winner's canonical strip** as the builder reported it when it settled (Step 3.5) — no DESIGN.md, no code. Fill the protocol slots: `⟨BRIEF⟩`, `⟨RUN_DIR⟩` (the winner draw dir, absolute), `⟨WORKDIR⟩` (workspace root), and **`⟨STRIP_DIR⟩` (the absolute canonical strip path)**. This is review round 1 even if the builder self-checked through render r3. Verify the reported video, stills and strip exist before dispatch; missing or conflicting paths require a corrected handoff, never a fallback to r1 or the highest directory number.
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

- **Delegate by Read, never paraphrase.** The builder Reads the equipment; the direction-lister, 甲 and the blind-selector ARE the verbatim protocols. You never restate tuned wording.
- **乙 is continuous context.** One builder instance per draw, alive through design→build→preview→(if picked) self-check→critic-loop. Never a fresh read-back agent mid-loop (that's the degraded rescue form only).
- **Fresh context is legitimate in exactly one place downstream of the draws: Step 4.5.** (The Step 1.5 direction lister is also fresh, but it runs before any draw exists: it owns no conceit and reads nothing back, it only seeds the builders.) The continuous-context rule above protects *design adjudication* — a fresh agent dropped into the loop would re-litigate a conceit it doesn't own. The tempo pass is not design adjudication: it is a bounded re-balancing of an already-converged piece, and unlike aesthetics, **time is written exactly in the source** (`<Sequence from durationInFrames>`, interpolate domains, springs), so a fresh reader gets complete, precise data rather than a lossy read-back. There, fresh context is the *asset*: 乙's context is saturated by N rounds of local defect work, which is precisely the state in which the whole-piece time arc is invisible. Do **not** read this as license for read-back agents anywhere else.
- **A locked duration is a promise.** If the user picked or stated a second-count at Step 0, no later step may change the total length — Step 4.5 redistributes inside it or reports back. Only an explicit "don't constrain it" makes the length 乙's own (and therefore movable).
- **甲 is design-blind.** It receives only the brief + frame paths. Never hand it DESIGN.md, code, or notes — that is the exact context-pollution the 甲乙环 exists to prevent.
- **The orchestrator never judges aesthetics.** Ferry 甲's verdicts verbatim; report only neutral pixel phenomena; all visual defects go to the 甲乙环.
- **User eyeball is the final gate.** VLM `CONVERGED: YES` is necessary, not sufficient.
- **Commission before draw.** Don't scaffold or draw until brief + spec + knobs are settled (Step 0). Fill blanks with stated defaults and say what you chose — never silently assume the aspect/duration/audio, and **never silently pick N**: surface the draw count and let the user own it. Put the **duration** in front of the user as a pick-list (including "don't constrain it") rather than a blank to type into, and record which authority resulted. Ask who picks the base (default: the user).
- **You never pick the base.** The user or the blind selector does, on the r1 previews (Step 3); your own aesthetic preference never enters the choice.
- **Deal directions; never author them.** Before every batch of draws (the first, and each redraw) a fresh `direction-lister` lists N idea-level directions (Step 1.5). Each builder gets exactly one, verbatim, and never sees the others; the lister's own 方向 1 is always dealt. You add no diversity or novelty wording of your own, and never edit, re-rank or judge a direction. Directions never reach the user's pick materials, the blind selector, 甲 or the tempo pass.
- **Pick at the preview, self-check after the pick.** Every draw stops at its r1 preview; only the picked draw runs §4 self-check (Step 3.5). The user sees only the preview videos — neutral labels, random order, the one-line first-version note — never stills, DESIGN.md, directions or builder notes.
- **Delivery protocol — idle is not done.** Every sub-agent (the direction-lister, 乙 builders, 甲, blind-selector, tempo-pass) **finishes by SendMessage-ing you an explicit result**, and only that message means it's done. An agent going **idle is a yielded turn, not a delivered task** — a builder is idle while waiting for the pick and between self-check re-renders; 甲 is idle between rounds. Never read disk artifacts to *infer* that an agent finished, which render is canonical, or what a verdict was.
  - **The direction-lister** returns its list of N directions by message. Hold Step 2 until it has; never spawn a builder without its direction.
  - **Builders** report `preview ready` + their **preview dir** after r1, then wait. Hold the pick until **all N** report preview ready; never pick on a draw that is still building or rendering.
  - **The picked builder** reports `settled` + its **canonical out dir** after its §4 self-check (self-check may have moved it past the preview). Hold Step 4 until it does; never hand 甲 a preview the builder has not settled on, or a mid-self-check snapshot.
  - **甲 and the blind-selector** must hand their verdict/`{winner,reason}` back to you by message before idling — if a one-shot judge ends its turn without sending the result, ask it for the result; don't go fishing on disk.
  - **tempo-pass** reports `tempo pass done` (actual final output and strip dir + whether the total length changed) or `tempo pass blocked` (locked total, unresolvable — the user decides).
  - **Always carry the *canonical* artifact.** Whatever you ferry to 甲 (the winner's strip) or to the builder must be the latest reported render, never a stale earlier one — a stale strip makes a persistent 甲 condemn already-fixed defects round after round.
