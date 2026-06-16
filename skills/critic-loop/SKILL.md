---
name: critic-loop
description: The blind-select + critic-loop (盲选 + 甲乙环) stage of the remotion-director pipeline — how to pick the most promising base among N draws, then run the design-blind aesthetic critic (甲) against the builder (乙) for ≤2 rounds, with the orchestrator ferrying verdicts verbatim. Loads the two authoritative protocol files (BLIND-SELECT-PROTOCOL.md, CRITIC-PROTOCOL.md). Use when N draws of a piece exist and need selecting + refining; invoked by the create skill.
version: 0.1.0
user-invocable: false
---

# critic-loop

This stage turns N rendered draws into one refined piece. Two protocols govern it; both are the **authoritative wording** and are used **verbatim** (`⟨…⟩` = slots the orchestrator fills, the rest unchanged). Do NOT paraphrase them — Read the files and use their exact text.

## 1 · Blind select — pick the most promising base

Read **`${CLAUDE_PLUGIN_ROOT}/skills/critic-loop/BLIND-SELECT-PROTOCOL.md`**. Spawn the `blind-selector` agent (fresh, one-shot) with the brief + the N candidate dirs (each has 6 `still-*.png` + `strip/`). It selects for **potential** (the base whose ceiling after the loop is highest), not fewest current flaws — fixable execution nits must not count against a strong base. It returns `{ winner, reason }`. The orchestrator does NOT judge; it hands over candidates and takes back the winner.

## 2 · Critic loop (甲乙环) — refine the winner, ≤2 rounds

Read **`${CLAUDE_PLUGIN_ROOT}/skills/critic-loop/CRITIC-PROTOCOL.md`** (条带规格 harness contract + the verbatim 甲 prompt + the per-round ferry message + 乙环纪律).

- **甲 (critic)** = the `aesthetic-critic` agent. Spawn ONE instance for the piece and continue the SAME instance across rounds (it is persistent — retained memory across rounds is the point — but design-blind: it sees only the frame strip + the brief, never DESIGN.md or code). It reports phenomena + severity and never prescribes a fix; its last line is `CONVERGED: YES|NO`.
- **乙 (builder)** = the SAME continuous-context builder instance that designed and built the winning draw (do NOT spawn a fresh agent to read-back context — that is the degraded rescue form). It receives 甲's verdict and adjudicates each item per §5 环纪律.
- **The orchestrator ferries verbatim, both ways, and never judges aesthetics**:
  - 甲's verdict text → the builder's conversation, and archive it to `⟨RUN_DIR⟩/CRITIC-VERDICTS.md`.
  - The builder's pixel-grounded rebuttal → 甲 (甲's INTEGRITY forbids it from reading any file other than the frames + its own crops, so it cannot fetch the rebuttal itself).
- The builder re-renders each round to `out/r⟨N⟩` (render-arm then render-strip), confirms non-white, appends fixes to `⟨RUN_DIR⟩/FIXES.md`.
- Stop at `CONVERGED: YES` or after ⟨MAX_ROUNDS⟩ (default 2). The result is the latest `out/rN`.

## 3 · Final gate = the user's eyes

Blind-select and 甲 are VLM-perspective reference judgments, NOT ground truth. The **user's own eyes are the final gate** (they outrank every VLM judge). Present the converged piece (key stills + the mp4) for the user to judge; do not declare it shipped on a VLM's `CONVERGED: YES` alone.
