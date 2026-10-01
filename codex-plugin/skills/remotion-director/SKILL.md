---
name: remotion-director
description: Design and build a finished motion piece (default vertical 1080×1920; landscape/square also supported) from a brief through the 甲乙环 (critic-loop) pipeline — a unified design+build agent (乙) drafts a design and writes the Remotion code in one continuous context; N independent draws each render a first full cut (the r1 preview) and the most promising base is picked from those previews — by the user by default, or by a blind selector when the user hands the pick to AI; only the picked draw self-checks; a design-blind aesthetic critic (甲) judges only the rendered frames, round after round until it converges; a fresh-context tempo pass then re-times the converged piece (the frame-judged loop is blind to the time axis); the user's own eyes are the final gate. Use when the user wants to generate, design, or build a short motion piece, text animation, or social video from a brief.
---
<!--
Codex host seam (generated): resolve <PLUGIN_ROOT> from this installed skill's package root.
The package intentionally has no dependency tree; run the launcher after preparing the user workspace.
Only lifecycle/path/shell spellings above were changed. The source protocol below is authoritative.
-->


# create

Turn a brief into a finished motion piece (default **1080×1920 vertical**; landscape/square also available) through the **甲乙环 (critic-loop) pipeline**. Quality is produced by a unified design-and-build agent working in one continuous context with real design knowledge — judged on its **actual rendered frames**, picked at its r1 preview (by the user, or by a blind selector), self-checked and critic-refined, with the **user's eyes as the final gate**.

You (the agent reading this skill) are the **orchestrator**. You spawn the sub-agents, run the render tooling, and **ferry critic verdicts verbatim** — you do NOT design, and you do NOT judge aesthetics. Every piece of design knowledge and every protocol reaches the sub-agents by them **Reading the verbatim equipment/protocol files** — never by you paraphrasing them.

> **The one rule that protects everything**: do not summarize the equipment, the §4 self-check persona, the conceit rules, or the critic protocol in your own words. The tuned wording only binds an agent when that agent has the literal text in its context. Always delegate by Read (`<PLUGIN_ROOT>/…`), never by retelling.

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
- **N (draws)**: independent draws before the pick. Default **3**. (More draws = higher ceiling; N is the user's knob.)
- **who picks the base**: **the user** (default) — they watch each draw's **preview** (its r1 video) and pick the base; or **交给 AI 挑** — the `blind-selector` agent picks on the same previews. Either way the pick happens at r1, before any self-check.
- **workspace**: a user-side project dir (NOT under the plugin). Default `./<piece-slug>/` in the user's CWD.

The critic loop has **no round knob** — it runs until 甲 reports `CONVERGED: YES`, then the user's eyes are the final gate.

## Step 0 — Commission (gate; collect before any draw)

A real run starts from the user, not from a guess. **Before scaffolding or drawing, confirm the commission** — the brief, the spec, and the production knobs from `Inputs`. Do not start drawing until this is settled.

1. **Brief** — if you don't have audience / takeaway / tone, ask. The brief is required; everything downstream is shaped by it.
2. **Spec** — settle each parameter. For anything the user didn't state, **propose a default and let them accept or change it in one line** (don't silently assume):
   - aspect/resolution (default **vertical 1080×1920**; offer landscape 1920×1080 / square 1080×1080),
   - **duration — ask it as a pick-list, and record which of two authorities results.** Don't leave it as a blank to type into: put the options in front of the user (host request-user-input operation is the right instrument) — two or three second-counts that suit this brief, "I'll name one", and **"don't constrain it — leave the length to the designer"**. Then record:
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
node "<PLUGIN_ROOT>/tools/codex-launcher.mjs" prepare-environment --workspace "<WORKSPACE>"
```

This creates a missing workspace, resolves npm’s stable `latest` Remotion release, updates all declared `remotion` / `@remotion/*` packages together, and installs missing tooling. For RBP, it compares the full official upstream skill with an existing global installation and updates that installation in place only when contents differ; without a global installation it installs under the workspace’s `.remotion-director/`. Existing unrelated dependencies and manifest fields are preserved. Exact versions in the workspace manifest and lockfile record this run’s resolved environment; the next new piece queries upstream again. `--fix` remains an alias for this automatic preparation.

Use the printed **`RBP_SKILL_PATH`** (also recorded with the upstream revision in `<WORKSPACE>/.remotion-director/environment.json`) in every builder task. The builder reads that exact synchronized installation, including when it is global. Upstream owns the skill layout and its release schedule; an RBP/engine version difference is informational, and actual installed exports determine API availability.

Node.js, npm, Git and a full ffmpeg build must be available. The check exercises ffmpeg rawvideo, scale and crop support. Install missing host tools as needed under the host’s permission policy. Engineering preparation includes updating an existing global RBP installation; follow host filesystem permissions, with no separate design approval. If network access, install or verification fails, repair the engineering problem and rerun; do not claim the environment is current or start drawing after a failed preparation.

Prepare the environment before parallel draws; a global RBP update is shared by other projects using it. During a run, use `check-env.mjs --workspace "<WORKSPACE>" --check` for a read-only check without updating. If an engineering issue requires another upgrade, coordinate it through the orchestrator while affected builders are stopped, then re-render affected outputs. This prevents parallel dependency writes; it is not a fixed-version design policy.

Each draw is `<workspace>/<piece-slug>/draw-i/`, holding `index.tsx`, `DESIGN.md`, `FIXES.md` and `out/`. `⟨RUN_DIR⟩` is that draw’s absolute directory; `⟨WORKDIR⟩` / `<WORKSPACE>` is the absolute project root holding `package.json` and `node_modules` (pass it explicitly; it need not be the draw’s immediate parent).

## Step 2 — N draws (乙), in parallel

Spawn **N `builder` agents** (one per draw), each with: the brief, the resolved **spec** from Step 0 (aspect/resolution, duration, fps, copy + audio intent), its absolute `<RUN_DIR>` (`…/draw-i`), the absolute **`<WORKSPACE>` root** (the dir holding `node_modules` + `package.json`; the Codex launcher uses it for every render command), the prepared **`RBP_SKILL_PATH`**, and the product contract (register `<Composition id="piece">` with the spec's `width`/`height`/`durationInFrames`/`fps`). Each builder's first act is to **Read the design-equipment in full** and obey it (you do not restate it). Each runs the full 3-step process → builds → renders its **preview** (render-arm then render-strip) to `out/r1` — the draw's first successful, non-white full render (ad-hoc stills checks before it are fine). Then the builder **reports `draw-i preview ready` and stops** — no §4 self-check yet; that belongs to the picked draw only (Step 3.5).

- Keep each builder instance **alive** after its preview — the picked draw's builder continues into self-check and the critic loop in the SAME context (do not start a fresh agent there).
- Verify each preview rendered non-white (read 2-3 stills; this is your engineering check, not something you show the user).
- **A builder is done only when it says so — not when it goes idle.** See *Delivery protocol* (Hard rules). Wait for each builder to **return an explicit `draw-i preview ready` report** naming its **preview output dir** (normally `out/r1`; if an earlier render attempt crashed or came out white, the builder names the later unused dir it actually rendered to). Do not read disk to guess whether a draw finished or which render is its preview. Hold Step 3 until **all N** have reported preview ready.

## Step 3 — Pick the base at the previews

**Precondition: all N builders have reported `preview ready`** (Step 2). Only then pick. The user or the blind selector picks, as recorded at Step 0 — **you, the orchestrator, never pick.** Nobody has self-checked yet: the pick is for the idea and direction that can go furthest, not for the fewest current flaws.

**Default — the user picks.** Do not spawn the selector. Give the user **only each draw's preview `video.mp4`** — no stills, no DESIGN.md, no code, no builder notes. Use neutral labels (`A`, `B`, `C`…) assigned in a random order, copy each video to a neutral file name (e.g. `<piece-slug>/pick/A.mp4`; a fresh folder after a redraw) so its path does not reveal the draw, and keep the label → draw mapping to yourself. Add exactly one line of guidance, in the user's language: *this is a first version, not yet self-checked or polished — pick the one whose idea and direction can go furthest, not the one with the fewest flaws right now.* Take their answer as given (any draw, with or without a reason), append it to `COMMISSION.md` (label, draw, the reason if given), and continue with that draw as the winner. Don't argue for or against a draw.

- **"你替我挑" (hand it to AI) at pick time** — run the blind select below on the same previews, and record that the pick was handed over.
- **"都不要，再抽" (none of these; redraw)** — no reason required. Tell all N current builders their draws are ended (no self-check), append the redraw to `COMMISSION.md`, then run Step 2 again on the same brief and commission with N fresh builders in **new** draw dirs (continue the numbering: `draw-(N+1)`…; leave the earlier draws on disk untouched), and pick again at their previews.

**交给 AI 挑 — blind select** (chosen at Step 0, or handed over at pick time). Invoke the **critic-loop** skill's selection step: spawn the `blind-selector` agent with the brief + the N candidate dirs — each draw's **preview dir as the builder reported it** (`…/draw-i/out/r1/` with its stills and `strip/`, or the later dir the builder named). It returns `{ winner, reason }` selecting for **potential** (highest ceiling after self-check and the loop), not fewest current flaws. Append the winner and reason to `COMMISSION.md`.

## Step 3.5 — Self-check (the picked draw only)

Tell the picked draw's builder (its SAME instance) that it was picked: it now runs its §4 render self-check per the equipment. Tell every other builder its draw is not picked and end it — losing draws do **not** self-check or render further.

Wait for the picked builder's explicit **`draw-i settled`** report naming its **canonical out dir** — it is NOT always the preview dir; self-check may have re-rendered to `r2`/`r3`/…. Verify that output's video, stills and strip before Step 4. The preview is never handed to 甲 unless the builder's settled report names it as canonical.

## Step 4 — Critic loop (甲乙环), run to convergence

Run the **critic-loop** skill's loop, ferrying verbatim. Apply the **版本交接** rules in `CRITIC-PROTOCOL.md`: keep the review round separate from the render version, take canonical from explicit completion reports, and allocate unused output directories for re-renders.

1. Spawn ONE `aesthetic-critic` (甲) instance, design-blind, with the brief + **the winner's canonical strip** as the builder reported it when it settled (Step 3.5) — no DESIGN.md, no code. Fill the protocol slots: `⟨BRIEF⟩`, `⟨RUN_DIR⟩` (the winner draw dir, absolute), `⟨WORKDIR⟩` (workspace root), and **`⟨STRIP_DIR⟩` (the absolute canonical strip path)**. This is review round 1 even if the builder self-checked through render r3. Verify the reported video, stills and strip exist before dispatch; missing or conflicting paths require a corrected handoff, never a fallback to r1 or the highest directory number.
2. Take 甲's verdict **verbatim** → send to the winning **builder** instance's conversation (the same continuous-context 乙), and archive it to `⟨RUN_DIR⟩/CRITIC-VERDICTS.md` with the review round and reviewed strip path. Fill the ferry message's `⟨REVIEW_ROUND⟩`, `⟨STRIP_DIR⟩` and unused **`⟨NEXT_OUT_DIR⟩`** explicitly. The builder adjudicates per §5 环纪律 (fix / fulfill / pixel-grounded rebuttal), re-renders there (render-arm then render-strip), and **returns an explicit `round ⟨REVIEW_ROUND⟩ done` naming its actual final output and strip dir** after verification (again: not idle — wait for the message). Self-check can advance beyond the assigned initial output. Verify that reported output's video, stills and strip, then update canonical and ferry **that exact strip path with the next review round number** to 甲. (A persistent 甲 fed a stale strip will file already-fixed defects as live ones and carry that poison into every later round; if you realize 甲 was fed a stale or wrong strip, the only clean fix is to shut that 甲 down and respawn a fresh one on the correct strip.)
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
- **乙 is continuous context.** One builder instance per draw, alive through design→build→preview→(if picked) self-check→critic-loop. Never a fresh read-back agent mid-loop (that's the degraded rescue form only).
- **Fresh context is legitimate in exactly one place: Step 4.5.** The continuous-context rule above protects *design adjudication* — a fresh agent dropped into the loop would re-litigate a conceit it doesn't own. The tempo pass is not design adjudication: it is a bounded re-balancing of an already-converged piece, and unlike aesthetics, **time is written exactly in the source** (`<Sequence from durationInFrames>`, interpolate domains, springs), so a fresh reader gets complete, precise data rather than a lossy read-back. There, fresh context is the *asset*: 乙's context is saturated by N rounds of local defect work, which is precisely the state in which the whole-piece time arc is invisible. Do **not** read this as license for read-back agents anywhere else.
- **A locked duration is a promise.** If the user picked or stated a second-count at Step 0, no later step may change the total length — Step 4.5 redistributes inside it or reports back. Only an explicit "don't constrain it" makes the length 乙's own (and therefore movable).
- **甲 is design-blind.** It receives only the brief + frame paths. Never hand it DESIGN.md, code, or notes — that is the exact context-pollution the 甲乙环 exists to prevent.
- **The orchestrator never judges aesthetics.** Ferry 甲's verdicts verbatim; report only neutral pixel phenomena; all visual defects go to the 甲乙环.
- **User eyeball is the final gate.** VLM `CONVERGED: YES` is necessary, not sufficient.
- **Commission before draw.** Don't scaffold or draw until brief + spec + knobs are settled (Step 0). Fill blanks with stated defaults and say what you chose — never silently assume the aspect/duration/audio, and **never silently pick N**: surface the draw count and let the user own it. Put the **duration** in front of the user as a pick-list (including "don't constrain it") rather than a blank to type into, and record which authority resulted. Ask who picks the base (default: the user).
- **You never pick the base.** The user or the blind selector does, on the r1 previews (Step 3); your own aesthetic preference never enters the choice.
- **Pick at the preview, self-check after the pick.** Every draw stops at its r1 preview; only the picked draw runs §4 self-check (Step 3.5). The user sees only the preview videos — neutral labels, random order, the one-line first-version note — never stills, DESIGN.md or builder notes.
- **Delivery protocol — idle is not done.** Every sub-agent (乙 builders, 甲, blind-selector, tempo-pass) **finishes by returning an explicit result to the orchestrator**, and only that message means it's done. An agent going **idle is a yielded turn, not a delivered task** — a builder is idle while waiting for the pick and between self-check re-renders; 甲 is idle between rounds. Never read disk artifacts to *infer* that an agent finished, which render is canonical, or what a verdict was.
  - **Builders** report `preview ready` + their **preview dir** after r1, then wait. Hold the pick until **all N** report preview ready; never pick on a draw that is still building or rendering.
  - **The picked builder** reports `settled` + its **canonical out dir** after its §4 self-check (self-check may have moved it past the preview). Hold Step 4 until it does; never hand 甲 a preview the builder has not settled on, or a mid-self-check snapshot.
  - **甲 and the blind-selector** must hand their verdict/`{winner,reason}` back to you by message before idling — if a one-shot judge ends its turn without sending the result, ask it for the result; don't go fishing on disk.
  - **tempo-pass** reports `tempo pass done` (actual final output and strip dir + whether the total length changed) or `tempo pass blocked` (locked total, unresolvable — the user decides).
  - **Always carry the *canonical* artifact.** Whatever you ferry to 甲 (the winner's strip) or to the builder must be the latest reported render, never a stale earlier one — a stale strip makes a persistent 甲 condemn already-fixed defects round after round.


## Codex host adapter

This package exposes one public skill. Load the internal role texts from `<PLUGIN_ROOT>/internal/roles/` only when dispatching that role; they are bundled references, not separately discoverable skills. The native host owns the actual child-agent lifecycle:

- On the current Codex host, use `collaboration.spawn_agent({task_name, message, fork_turns:"none", model:<user-selected-or-host-default>, reasoning_effort:<user-selected-or-host-default>})` to create a fresh child. Resume that same child with `collaboration.followup_task({target, message})`; use `collaboration.wait_agent({timeout_ms})` only to wait for a boundary. Use `collaboration.send_message({target, message})` only to ferry verbatim text and never to start work. These names describe the current host contract; use its native equivalent or report a clear capability block on another host. The child's actual final message is its result; an idle boundary is not completion.
- Start each builder with a new native child and a unique `agentId` plus `continuationId`. Keep every builder alive until the pick; afterwards continue only the picked builder with `followup_task` and end the others. Start selector and tempo as fresh native children. Start one persistent critic and continue its same `agentId`/`continuationId` for every review round. Keep the brief and artifact paths explicit; inject only the critic role body plus brief and strip paths, never the builder's design or code.
- Record the real agent and continuation handles returned by the host (the same handle may serve both fields); never invent IDs in the orchestrator ledger. If the host cannot provide a fresh child or a persistent continuation handle, stop with a capability block instead of claiming the lifecycle is preserved.
- Register every initial role with the returned handles and `register-role --fresh` (builder for each draw, one selector when the pick goes to AI, one critic, and one tempo pass). Handles must be unique across roles and draws, including draws ended by a redraw; only the picked builder and persistent critic may later use `continue-role` with their original handles.
- Builder and tempo children deliver explicit final messages through `record-report`: builders use `preview` when their r1 preview is ready (record it with `accept-preview`; a preview never becomes canonical output), `settled` only after they were picked and finished their §4 self-check, and `round-done` with `--review-round R` after a critic repair; the tempo pass uses `done`. Advance canonical output only with `accept-canonical`, which verifies video, six stills, a role-aware strip manifest, source hash and artifact provenance; `accept-preview` applies the same verification to a preview.
- The persistent critic delivers verdict text through `record-verdict`, never `record-report`. Review round 1 requires the picked builder's accepted settled canonical; new review rounds are sequential and require the accepted canonical from the preceding round. A same-round correction or pixel-grounded rebuttal amends the existing verdict with `--amend-of ID` or `--rebuttal-of ID` and the same strip; it is an auditable replacement, not a duplicate-round failure. After a post-tempo canonical is accepted, continue the same critic identity for the next review round when the optional structural recheck is used.
- Once all N previews are accepted, the pick follows the commission. By default the user picks: register and spawn no selector; show the user only each accepted preview's `video.mp4` (no stills, strips, design docs or notes) under neutral labels in a random order, copied to neutral file names so the path does not reveal the draw, with the one-line first-version note from Step 3. Map their answer to its draw key outside the conversation and record it with `record-user-selection --run-dir "<RUN_DIR>" --winner-key draw-N [--reason TEXT]`. It re-verifies every accepted preview before the pick is recorded.
- If the user rejects every preview ("都不要，再抽"), end all current builders without self-check and run `record-redraw --run-dir "<RUN_DIR>" [--reason TEXT]`; it archives those draws with their previews. Then register N fresh builders under new draw keys (continue the numbering) in new draw directories and repeat until the pick.
- When the pick goes to AI (chosen at commission, or the user says "你替我挑"), run `node "<PLUGIN_ROOT>/tools/codex-launcher.mjs" prepare-selection --run-dir "<RUN_DIR>" --candidates-file "<CANDIDATES_JSON>"` before dispatching the fresh selector. Pass only its returned anonymous evidence paths (labels A/B/C, verified preview stills and sanitized strip manifests) to the selector. Record the selector's `{ winner, reason }` with `record-selection`, consuming that preparation; never pass source draw directories to the selector.
- After either pick, follow up with the picked builder (it runs its §4 self-check, then reports `settled` with its canonical output) and end every other builder without self-check. Accept the settled report with `accept-canonical` before dispatching the critic.
- Spawn the selector fresh with `fork_turns:"none"`; keep the label→draw mapping outside its message. For critic review, pass only the role body from `internal/roles/aesthetic-critic.md`, the brief, and the current strip; the protocol requires at least three native crops per round.
- This host adapter dispatch rule takes precedence over the source Step 3 wording: prepare an anonymous, verified copy of each preview candidate before selector dispatch. Never expose draw keys, author identity, or the label mapping in the selector message; keep that mapping only in the orchestrator ledger.
- Initialize a run with `init-run` before dispatch. The record stores commission, duration authority, draw count, identities, continuations, previews, the pick, redraws, handoffs, verdicts and canonical output in `<RUN_DIR>/.remotion-director/codex-run.json`.

The package's launcher is cross-platform Node. It resolves the installed package root from its own file location, uses dependencies from the explicit user workspace, and never reads this development checkout. Plugin hooks may expose `PLUGIN_ROOT`; ordinary skill commands must still use the `<PLUGIN_ROOT>` path supplied by this skill. Prompt blindness is a protocol constraint plus access evidence, not a filesystem sandbox.
