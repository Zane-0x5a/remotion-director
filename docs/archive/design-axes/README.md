# Archived design-axis references

These six files (`narrative`, `aesthetic`, `color`, `composition`, `persuasion`, `texture`) were the knowledge axes of the builder's design equipment from the Alpha release (2026-06-16) until 2026-09-26. They are no longer loaded by the builder and are not shipped in the plugin payload.

**Why they left.** A preregistered ablation on the current model (claude-opus-5-5, three briefs, one draw per arm) compared no equipment (N), the minimal equipment (M: persona + §0–§5 process, no axis files or anchor examples) and the full equipment (F: M plus these axes and the entry file's examples). The user's blind ranking put F below another arm on two of the three briefs and never above any arm, so the preregistered verdict was D2: retire the full equipment, new baseline M. The write-up lives in `docs/research/2026-09-25-equipment-ablation-results.md`.

**Why they are kept.** The verdict says the axes, loaded wholesale, do not help the current model. It does not say every item in them is wrong. The review (`docs/research/2026-09-25-design-equipment-review.md` §4.11) sorts their content by how fast it decays with model generations: capability-era workarounds and old-slop blacklists decay fastest; viewer and display physics (contrast floors, 8-bit banding, thin strokes flickering under compression, reading speed) do not decay. Anything rebuilt from here should be re-derived and tested on the current model, not copied back.

`tempo.md` is not archived: the tempo pass (`agents/tempo-pass.md`) reads it as its criteria, and the ablation did not test the tempo pass.
