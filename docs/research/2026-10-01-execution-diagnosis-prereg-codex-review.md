# Codex 审查：执行诊断预注册草案（2026-10-01）

- **审查对象**：`2026-10-01-execution-diagnosis-prereg.md` 的草案，提交 `2ba4bbd`。
- **审查方式**：gpt-6-astra，effort high，只读。
- **提示词**：`D:/Projects/_studio-1002-ops/codex-review-prompt.md`。提示词里列出了用户已经定下的设计，要求审查只在这些前提之内提意见。
- **原始输出**：`D:/Projects/_studio-1002-ops/codex-review-raw-output.txt`。
- **处置**：见预注册 §9。

以下是审查意见原文，未作改动。

---

1. **BLOCKING — §2.4, Failure handling.** Retrying a crashed, timed-out, or non-rendering run...
[codex] Turn completion inferred after the main thread finished and subagent work drained.
1. **BLOCKING — §2.4, Failure handling.** Retrying a crashed, timed-out, or non-rendering run is a second generative draw for the same card. That contradicts the fixed “one draw per card, 6 draws” design and can create survivor bias.  
   **Fix:** Permit replacement only for verified pre-generation infrastructure failures. Any failure after the model starts is one of the six draws and is reported as no canonical final; predefine how it affects R1/R2.

2. **BLOCKING — §4.2 R1.** R1 stops before looking for common deficits when at least four finals score quality 5. Two lower-scoring finals across two briefs could still satisfy the stated common-deficit rule, so the experiment would not answer its second question.  
   **Fix:** Apply the common-deficit rule for every score pattern. Under R1, report both “at least 4/6 reached 5” and any qualifying recurring limitation; only report “none observed” when the rule is not met.

3. **BLOCKING — §4.2, common-deficit decision rule.** The rule is not tight enough for its claimed anti-storytelling purpose. “Higher,” “pointed out,” and “obviously lighter” are undefined; the agents write free text; and, if all six score below 5, comparison with the user’s paper ceiling supplies no observable counterexample. Thus, with six 4s, any phenomenon in two briefs can become a “common deficit.”  
   **Fix:** Freeze a coding rubric with defined labels and severity levels, a rule for mapping each sealed observation to one label, and `high = quality 5`, `low = quality <5`. If there are no high pieces, report cross-brief recurrence as *uncontrasted observations*, not common deficits/candidates. State explicitly: all 5s = no observed deficit; lows from one brief only = no cross-brief finding; a 4/5 split is analyzed using the fixed groups. The “2 pieces across 2 briefs” threshold is reasonable as a hypothesis-generating screen, not as proof.

4. **BLOCKING — §§2.3, 3.2, 4.1.** The intended estimand is execution of a user-rated 4/5 idea, but the builder may materially change the idea: all beats, means, and tone are only “starting points,” while only an undefined conceit must remain. The fidelity checker records beat presence but does not determine whether the scored film still represents the rated idea. A 5 could therefore reflect concept improvement.  
   **Fix:** Predefine an independently coded “core conceit retained / materially changed” status and its criteria. Report all six intent-to-treat results, but require retained-conceit status for the claim that execution reached the selected card’s ceiling.

5. **BLOCKING — §2.4, headless isolation and safety.** `Bash` plus `--permission-mode bypassPermissions` gives every builder unrestricted machine access. A shared cwd and shared dependencies let concurrent runs read other cards, inspect sibling outputs, alter tools/dependencies, or access files outside the experiment. A probe of initial context does not enforce filesystem isolation.  
   **Fix:** Run each draw in an OS-enforced sandbox or restricted account with a private writable run directory; expose only its brief/card, immutable render tools/dependencies, and required output path. Make cards, mappings, sibling runs, and host directories inaccessible. Freeze and record the exact CLI, model, tool, dependency, and timeout configuration.

6. **BLOCKING — §§3.2 and 5.** The secondary-endpoint inputs are not reproducible or fully blind. “6 stills,” strips, and “suspicious” full-resolution crops do not specify frame positions, crop selection, filenames, metadata removal, or the agent’s allowed filesystem/tools. Visual content can reveal the card’s conceit, which is unavoidable, but card identifiers and access to files are avoidable leaks.  
   **Fix:** Freeze deterministic extraction commands, frame timestamps, crop rules, neutral filenames, and hashes before review. Supply each agent only a sealed visual packet and a fixed prompt; forbid filesystem/network tools. Run each review independently, randomize review order, and seal outputs before user scoring.

7. **NON-BLOCKING — §2.2, card selection.** The selected cards follow the user’s rule and all are 4/5, so they fit the stated target. But a seed alone does not reproduce the random draw without a specified PRNG, candidate ordering, and sampling-without-replacement rule. The pooled sample also mixes deliberately selected converged default ideas (D/F) with random alternatives.  
   **Fix:** Record the algorithm, implementation/version, ordered candidate lists, and resulting random indices. Report default-converged and random-card results separately as descriptive strata; scope pooled conclusions to these six selected cards.

8. **NON-BLOCKING — §§2.1 and 7.** The draft says the inherited self-check has “no designer persona,” but `arm-n.md` explicitly opens with “designer and builder.” Also, varying 3D/WebGL versus flat-motion difficulty and unconstrained self-check time/revisions can affect results independently of the broad idea category.  
   **Fix:** Correct the prompt description, record per-draw elapsed time, render/revision count, and technical modality, and add these as threats to validity. The draft otherwise follows the shared anchors and the user’s fixed N0, final-only rating, and AI-comparison decisions.
