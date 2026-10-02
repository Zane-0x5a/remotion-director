# Why remotion-director exists

## The ambition

There's a settled assumption about AI and design, and it travels in two forms. The first: **AI is for the code, not the design.** Good design is something a human extracts from the model over many rounds of prompting; the taste and the direction are the human's, and the AI is hands, not eyes. The second sounds more progressive: AI *can* design, *provided* you feed it the design. Hand it a `design.md`, a template, a style reference, a brand system, and the received wisdom calls that the mature practice: the better your input artifact, the better the output.

Look closely and both forms agree on one thing: **the design does not originate in the AI.** One says so outright; the other launders the human's taste through a document and calls the result the model's. This project rejects that shared premise.

The conviction underneath it: a model that has read every design principle ever written down, every reference, every published act of taste by every art director who came before, **already holds good design.** When it returns something generic, the knowledge didn't go missing. The request asked for the safe, expected thing, and the safe, expected thing is what lit up.

For most of this project's life that was a bet. With Claude Opus 5.5 it became something we could measure. The model's front-end craft reached a new level: handed a strong idea and **no design guidance at all**, it made five stunning films out of six. The design knowledge we had spent months tuning for earlier models had, on this one, become a ceiling, and we retired it.

So the question changed. It is no longer "how do we get a model past slop?" It is: **if the model can design well, why isn't every film its best one?** The answer is where this project always pointed. **The best work lives in the long tail.** A model's default is its most likely answer, and on this model the most likely answer is good. It is rarely the best the model can do. The ambition, stated plainly: **pull the model up to its own ceiling, reliably, with the design remaining the model's from end to end.**

Keep two layers distinct, because conflating them is the easiest way to misread this project.

- **In the product**, design is the AI's job. In full-auto (the AI picks among its own drafts, and a design-blind critic polishes the pick) no human eye touches the pixels, and the result is good design. That claim is scoped: full-auto doesn't promise the very top. For the top there are two optional routes: you pick among the AI's finished previews, and if you want, you say what you see or what you'd like after watching the picked film. Neither puts you in the design loop. You choose among options the AI made and react to them as a viewer. You're never asked what's missing or how to fix it, and every design answer still comes from the model.
- **In the development of the product**, the human did the load-bearing work, and that work was *method, not pixels*: holding the project to first-principles experiments, refuting the model's attractive but unsound conjectures, refusing the pessimistic "downgrade" conclusions it kept deriving from thin evidence, and keeping the bar where it was when the model would have settled. "A human's eye is better than the AI's" is not a claim this project makes. It is the assumption the project is built to falsify.

## Where the ceiling hides

Before changing anything for the new model, we measured where a capable model falls short of its own best. Both studies were preregistered and scored by the user ([idea diagnosis](research/2026-10-01-diagnosis-results.md), [execution diagnosis](research/2026-10-01-execution-diagnosis-results.md)).

**The ideas converge.** Run the model independently several times on one brief and it keeps landing on the same idea. On one brief, five of six independent runs produced a single idea. The idea they converge on is usually fine (most scored 4 of 5). It is rarely the best one available.

**The model can't spot its own best idea.** Asked to list and rank ideas, its first choice hit the top-scoring idea no more often than a random order would: 2 hits, where chance expects 2.5. One brief's only 5-point idea was ranked fourth.

**Execution is no longer the bottleneck.** We built six films from strong ideas, with no design guidance and only the builder's own self-check. Five were stunning, all six kept their core idea, and no defect was common enough to call a pattern. On earlier models the opposite was true: a bold design described in prose routinely collapsed back into the generic at the pixel level, and much of this project's machinery existed to stop that collapse. On this model we went looking for it and didn't find it.

**What's left is the last pass, and the maker can't see it.** Rough hero type, a beat that leaves too soon, specks in a shadow: a model reviewing its own render passes these. That failure did not go away with the new model, and the reason is specific. Hand a model its rendered frame *together with* its own design doc, and it sees the frame *through* the doc, reasoning toward "yes, this delivers" because the intent is right there in its context. Show the same model the same frame alone, with only the one-line job, and it names the flaw. A model's visual judgment gets pulled toward whatever design narrative sits in its context. This is the load-bearing insight of the whole project, and the architecture is shaped around it. How it was found is told below, because it is a good example of the human judgment the project runs on.

**And still frames don't show time.** A reviewer that sees only stills misreads motion. A designed mid-transition reads as a broken layout, and frame counts get read as durations. A line of type twitching in the final hold got past both the builder's self-check and the selector, while the user saw it in the video at once. Even a naive per-frame difference measures a slow twelve-second drift as no motion at all.

## The insights it rests on

These are the project's real contribution: not lines of prompt, but judgments about how to get a model to design work it doesn't reach on its own. Each came out of a controlled experiment.

**The ceiling is in the long tail of ideas, so the pipeline deals ideas before it draws.** If independent runs converge, drawing N times buys N copies of the likely idea. So a fresh-context step first lists N directions that differ at the level of the *idea*: the core mechanism and the key action, not the palette or the subject. Each draw is dealt one and never sees the others. The lister's own first choice is always dealt, because the convergent idea is usually good. The list asks for different ideas, never for novel ones. "Far from the common answer" is not a proxy for "better", and this project has paid for that confusion before (see [the journey](DEVELOPMENT-JOURNEY.md)).

**Pick at the first cut, for potential.** Each draw renders a complete first cut and stops. Then the one whose idea can go furthest is picked, not the one with the fewest flaws right now: polishing can fix nits, but it can't fix a mediocre idea. By default the user picks, watching the previews and nothing else; a provenance-blind AI selector can pick instead. Only the picked draw goes on to self-check and polish, so a losing draw costs one render. Picking this early assumes the first cut is already a fair baseline. On this model it is; earlier models' first cuts could be unusable, which is why draws used to self-check before the pick. If no draft is right, redraw. The user may say anything about the batch, even just how it felt, and those words are folded into the brief, never turned into a design instruction.

**The judge that catches the real flaw must be blind to the design.** This follows from the context-corruption finding. If holding the design doc bends the model's read of the pixels, the critic that finds what's actually wrong must not hold the doc. It gets the brief and the rendered film, nothing else: no design doc, no code, no notes. The gap is structural, so a better self-check persona can't close it. It appeared three independent times on three briefs in the earlier experiments: a builder signed off ("I smoothed the banding"), and a design-blind reviewer saw the cheap concentric rings anyway. On the current model, a pre-test of the blind critic again reported what the builder's self-check had passed: white specks and jagged shadows the builder never mentioned.

**Convergence needs a critic with memory, and a human at the end.** A fresh critic every round never converges: with a new eye each time it keeps finding new nitpicks, and the demands outrun the fixes. A *persistent* design-blind critic remembers its own prior calls, holds a stable bar, and lets the loop settle. Its `CONVERGED: YES` is necessary, never sufficient; the final gate is the user's eyes. The critic is there to catch what context corruption hides, not to match anyone's taste, so on its own it doesn't break the ceiling. That's what the second polish mode is for. In *polish it yourself* there is no critic. Whatever the user says after watching goes word for word to the same builder, which decides what to change. The user reacts as a viewer; the builder stays the designer.

**Reviewers must see time.** The older tooling showed the critic one held frame per pause. That was fair for judging layout, but it threw duration away: a half-second hold and a three-second hold looked identical, so a separate fresh-context "tempo pass" had to re-time the piece after the loop. Now every render ships with a **time overview** drawn from its pixels: thumbnails at a fixed interval, aligned with motion curves, with blank stretches, flashes, holds that never settle and short-lived text marked on the same time axis. With it comes a full-resolution **settle frame** at every moment the picture comes to rest. The builder, the selector and the critic all get the same material. Time is drawn directly, so the tempo pass is gone. A duration the user named is still a promise: the builder fits the film inside it, or reports `duration blocked` with the arithmetic and lets the user decide.

**What helps depends on the model, so every piece of guidance is re-tested against a bare control.** On older models, design knowledge given as *positive equipment* (a falsifiable visual conceit; typographic, color, composition and texture knowledge) beat a bare brief, and it beat the project's earlier attempt to fence the model with bans. On Claude Opus 5.5, a preregistered [ablation](research/2026-09-25-equipment-ablation-results.md) found the full equipment never ranked above the lighter arms on potential, and it came last on current finish on all three briefs. The execution diagnosis then found no common defect left for any equipment to fix. The rule we adopted: guidance stays only if it fixes a defect we can see. None did, so the equipment was retired in full. The builder now gets a goal (a top motion designer's standard) and the contract, nothing more. The old texts are archived in [`docs/archive/`](archive/).

**Defaults are not limits.** Sound is on by default: simple effects the builder makes or finds itself. In the release acceptance every sound was synthesized by the builders' own scripts, and the user found them better than expected. Nothing in the pipeline judges sound but the user's ears. Full music and voice-over aren't added by default, but a user who asks for them gets them: a voice-over through an open-source TTS or their own, their own music or footage. The request travels in the brief, and the builder works out how. The pipeline never refuses a request only because a default doesn't mention it.

## The architecture these insights force

They force a **甲乙环 (critic loop)**: light, asymmetric, judged on the rendered film.

- **Commission.** Brief, aspect, duration, copy and sound, with stated defaults, confirmed back to the user before anything is drawn.
- **Direction lister.** One fresh-context call per batch of draws: N directions that differ at the idea level.
- **乙 (builder).** One agent, one continuous context, designer and engineer both. It designs the whole film from its direction, writes the Remotion code and renders the first cut; if picked, it self-checks the real pixels and carries the film through polishing. A fresh agent reading back DESIGN.md and the code is only a degraded rescue form, never the product form.
- **The pick.** The user (default) or a provenance-blind selector, on the first cuts.
- **甲 (critic).** Design-blind and persistent. It sees only the film and its review material, reports phenomena and severity, and never prescribes a fix. Whether a phenomenon is a failure, an unrealized intent or a defensible choice is the builder's call.
- **The isolation layer.** 甲 and 乙 never talk directly. The orchestrator carries messages word for word in both directions (phenomena one way, pixel-grounded rebuttals the other) and, in *polish it yourself*, the user's words to the builder. It never summarizes, so no summary can leak the design back in, and it never judges aesthetics.
- **Your eyes.** The final gate, outranking every machine judge. It accepts or rejects the AI's output; it doesn't author it.

Each piece answers a specific failure the experiments surfaced. None of it is decoration.

## Does it work

The release acceptance ran the plugin against a blank control: the same model and the same brief, with no plugin. The user scored every film on preregistered anchors ([prereg](research/2026-10-01-release-acceptance-prereg.md), [results](research/2026-10-02-release-acceptance-results.md)).

| Film | Quality | Maturity |
|---|---|---|
| Blank control, no plugin | 3 | 5 |
| Plugin, the other direction: picked and self-checked, no human feedback | 4 | 5 |
| Plugin, the hero: self-checked | 4 | 4 |
| Plugin, the hero: after one round of the user's comments | 4 | 5 |

The control was well made and unremarkable. In the user's words: "basically a high-end slide deck. The motion is well made, that's Opus's baseline, but the design is nowhere near striking." Both plugin films cleared it, one with no human comment at all. The plugin run cost $12.09; the control cost $2.36.

The limits are real. There was one brief, of the self-promo kind used during development, and one rater. The run took the route where the user picks and polishes, so full-auto was not scored separately. Fresh briefs are being tested in real use.

## Why this deserves compute

The result here is not a clever prompt. It is a **method**: a human supplying **experimental discipline, directional insight and an unyielding bar**, and an AI supplying **execution bandwidth and compute**, including the design itself, together reaching a quality the AI doesn't reach alone. Be precise about what the human contributed, because it is *not* design taste. The load-bearing work was, in the development of the project:

- **Insisting on first principles** instead of `MUST`-clamping the model into compliance: betting that a model which *understands* the division of labor does the right thing for the right reason. The same principle cut this release's kit down. Guidance stays only if it fixes a defect we can see, and when the measurements showed none, the equipment the project had spent months tuning was retired.
- **Trusting a human intuition off a blurry phenomenon — the System-1 leap.** One example stands in for a whole class. I kept noticing that a model, shown a rendered frame *next to* its own high-minded design doc, would praise the result point-for-point with the document's self-congratulation — paraphrasing the doc, not seeing the image — while the *same* model shown the *same* frame **alone** named the flaws fine. From that smudge I formed a falsifiable hypothesis (a model's visual judgment is hypnotized by what sits in its context), then a deeper, off-to-the-side guess that the pipeline doesn't depend on but that I value as much (perhaps because a model is a next-token predictor with no *felt* experience of beauty to brace against a confident narrative), then the deduction that became the blind critic (the trustworthy judge must carry none of the corrupting context) — borne out in experiment. The point of telling it here is not that the finding itself is some breakthrough; it is the *faculty* on display — a fast intuition woven from broad, cross-domain life-and-knowledge that catches a real pattern in a vague phenomenon, the same first-system instinct that drives genuine research. What deserves backing is less any one finding than the mind that produces them, and what it could contribute to open source and to AI research given room.
- **Running solid, preregistered experiments** whose endpoints and judging criteria were fixed before the run, so a result could never move its own goalposts. This release alone rests on four: the equipment ablation, the idea diagnosis, the execution diagnosis and the release acceptance.
- **Refuting the model's attractive but unsound conjectures**: the steady stream of plausible hypotheses whose logic didn't hold, including "fixes" that were secretly regressions, sent back until the reasoning was airtight. Two from this release: a draft experiment that treated "far from the common answer" as "better" (the trap the first architecture fell into) was withdrawn before it ran. And when two small pre-tests led the model to propose deleting the critic loop, it was sent back to the founding documents. The loop exists to catch the defects context corruption hides, not to match anyone's taste, and in those same pre-tests it had caught real ones. It stayed.
- **Refusing the model's pessimism and its "downgrade" suggestions**: the recurring move where the model derives, from thin local evidence, that the top isn't reachable and proposes settling for less. Holding the line for the ambitious target, on taste and conviction, until the pipeline actually got there. This is the most easily lost part of the contribution and one of the most decisive.
- **Building a first-principles file system** (`EMPIRICAL-FINDINGS` and the ground-truth registry), the base that kept the project's direction from drifting across months of work.

Every one of these is a fact about *how the product was built*, not a hand on the pixels. In the product's own logic, the design originates in the AI.

What scales that method is compute, and the leverage is unusually clean: **human method × AI execution.** Every direction list, every draw, every critic round is an independent agent run on real rendered frames, and the long-tail quality the project reaches for *lives* in doing more of them. More directions and draws widen the tail the pick chooses from; more polishing carries a strong base further before it reaches the human gate. A token grant is the lever that turns one person's experimental discipline and refusal to settle into a pipeline that exercises it at scale — a pipeline whose *designing* is done by the AI.

---

*The experiments behind every claim above are in [`docs/research/`](research/), each with its preregistration. The full development arc — two dead architectures, the 甲乙环, and the rebuild on Claude Opus 5.5 — is in [`DEVELOPMENT-JOURNEY.md`](DEVELOPMENT-JOURNEY.md).*
