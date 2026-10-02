---
name: critic-loop
description: The blind-select + critic-loop (盲选 + 甲乙环) stage of the remotion-director pipeline — how the blind selector picks the most promising base among N draws' r1 previews (when the user hands the pick to AI), then, once the picked draw has self-checked and settled, run the design-blind aesthetic critic (甲) against the builder (乙), round after round until it converges, with the orchestrator ferrying verdicts verbatim. Loads the two authoritative protocol files (BLIND-SELECT-PROTOCOL.md, CRITIC-PROTOCOL.md). Use when N draws of a piece exist and need selecting + refining; invoked by the create skill.
user-invocable: false
---

# critic-loop

This stage turns N draws' previews (each draw's first full render, r1) into one refined piece. Two protocols govern it; both are the **authoritative wording** and are used **verbatim** (`⟨…⟩` = slots the orchestrator fills, the rest unchanged). Do NOT paraphrase them — Read the files and use their exact text.

Every render (`render-arm.ts`) writes `video.mp4` plus a `review/` dir derived from its pixels: the time overview (`overview-*.png`), the full-resolution settle frames (`settle-*.png`) and `overview.json`. Those are the judges' materials; see 看片材料 in `CRITIC-PROTOCOL.md`.

## 1 · Blind select — pick the most promising base

Used when the commission handed the pick to AI (交给 AI 挑), or the user says "你替我挑" at pick time. Read **`${CLAUDE_PLUGIN_ROOT}/skills/critic-loop/BLIND-SELECT-PROTOCOL.md`**. Wait for all N builders to report preview ready, verify each reported preview's `video.mp4` and `review/`, then spawn the `blind-selector` agent (fresh, one-shot) with the brief + those exact preview dirs (each draw's r1, before any self-check). It selects for **potential** (the base whose ceiling after self-check and polishing is highest), not fewest current flaws. It returns `{ winner, reason }`. The orchestrator does NOT judge; it hands over candidates and takes back the winner.

By default the user picks on the preview videos (create Step 3) and this section is skipped. Either way, only the picked draw's builder then self-checks and reports settled with its canonical output (create Step 3.5); polishing starts from that settled canonical, never from an unsettled preview.

## 2 · Critic loop (甲乙环) — refine the winner until it converges

Used when the commission left polishing to the loop (the default; create Step 4). Read **`${CLAUDE_PLUGIN_ROOT}/skills/critic-loop/CRITIC-PROTOCOL.md`** (看片材料 harness contract + 版本交接 + the verbatim 甲 prompt + the per-round ferry message + the rescue form). Follow its version handoff rules: review rounds and render versions are independent; fill `⟨REVIEW_DIR⟩` and `⟨VIDEO⟩` from the builder's explicitly reported canonical output and allocate an unused `⟨NEXT_OUT_DIR⟩` for fixes.

- **甲 (critic)** = the `aesthetic-critic` agent. Spawn ONE instance for the piece and continue the SAME instance across rounds (it is persistent — retained memory across rounds is the point — but design-blind: it sees only the review materials, the video and the brief, never DESIGN.md or code). It reports phenomena + severity and never prescribes a fix; its last line is `CONVERGED: YES|NO`.
- **乙 (builder)** = the SAME continuous-context builder instance that designed and built the winning draw (do NOT spawn a fresh agent to read-back context — that is the degraded rescue form). It receives 甲's verdict and handles it as its own definition says.
- **The orchestrator ferries verbatim, both ways, and never judges aesthetics**:
  - 甲's verdict text → the builder's conversation, and archive it to `⟨RUN_DIR⟩/CRITIC-VERDICTS.md`.
  - The builder's pixel-grounded rebuttal → 甲 (甲's INTEGRITY forbids it from reading anything but its materials and its own crops, so it cannot fetch the rebuttal itself).
- The builder re-renders to the assigned `⟨NEXT_OUT_DIR⟩`, confirms the fix landed, and appends fixes to `⟨RUN_DIR⟩/FIXES.md`. If it needs further renders, it uses later unused directories and reports the actual final output. Advance canonical only after its explicit completion report and artifact verification; deliver that output's `review/` and `video.mp4` to 甲 with the next review round number.
- **Loop until `CONVERGED: YES`** — no round cap. 甲's retained cross-round memory is what drives fast convergence (typically a few rounds); never stop it while high-/med-severity items remain. The result is the canonical output 甲 actually reviewed and marked converged.

## 3 · Final gate = the user's eyes

Blind-select and 甲 are VLM-perspective reference judgments, NOT ground truth. The **user's own eyes are the final gate** (they outrank every VLM judge). Present the converged piece's video for the user to judge; do not declare it shipped on a VLM's `CONVERGED: YES` alone.
