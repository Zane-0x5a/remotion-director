# Codex migration validation

Date: 2026-09-25. Source baseline: `28fb82cc437f7bf3b231e2694ace0f65d031b9bd`.

This record separates engineering checks from acceptance of the creative product. The migration is implemented for review; full creative acceptance remains blocked.

## Reproducible engineering checks

From the repository root:

```text
node tools/generate-codex-plugin.mjs
node tools/generate-codex-plugin.mjs --check
npm test
npm run typecheck
```

The generator check regenerates into a temporary directory and compares the complete distribution tree, ignoring only the generation timestamp. Design and role source files remain under `skills/` and `agents/`; generated files must not be edited by hand.

Local authoring validators also check the compatibility manifest and public skill:

```text
python <plugin-creator>/scripts/validate_plugin.py codex-plugin
python <skill-creator>/scripts/quick_validate.py codex-plugin/skills/remotion-director
```

Final post-review results on 2026-09-25:

| Check | Result |
| --- | --- |
| Full distribution regeneration and `--check` | Passed; complete output tree matches source plus declared host transforms |
| Plugin and public-skill validators | Passed |
| `npm test` | 63/63 passed, including 12 independent primary-review boundary tests and the repository marketplace routing check |
| Clean export of staged files | Regeneration check and all 62 tests passed with no ignored workspace files or local `node_modules`; only an external `ffprobe` was supplied on PATH |
| `npm run typecheck` | Passed |
| JavaScript syntax and staged whitespace checks | Passed, allowing the existing trailing blank line preserved from source `texture.md`; ordinary `git diff --check` reports that one copied-source whitespace warning |
| Final isolated reinstall and skill discovery | Passed; exactly one plugin-owned public skill |
| Installed package content comparison | 28 non-manifest files matched byte-for-byte; only the two test-install manifests carry the same local cachebuster |
| Final installed fixture render and artifact verification | Passed: 1080×1920, 30fps, 6 seconds, six stills and eight strip frames |
| Repository marketplace installation | Local repository registration and installation passed in a separate temporary Codex profile; selected `./codex-plugin`, version `0.4.0` |
| Claude marketplace validation | `claude plugin validate .` selected `.claude-plugin/marketplace.json` and passed; root skills, agents and Claude manifests match the source baseline |

The artifact tests require a working `ffprobe` on PATH and use the committed media in `tests/fixtures/valid-artifacts`; they need no network, global RBP writes or ignored local render files. On this Windows host the final unit suite used the installed Remotion compositor's `ffprobe`. Starting the separate full FFmpeg binary inside the sandbox returned `EPERM`; using the existing compositor binary at the same permission level worked. Full rendering and strip extraction used the approved elevated full-FFmpeg path, as noted below.

## Installed execution observed

- Host: Windows; bundled Codex CLI `0.155.0-alpha.16.4`.
- Test profile and local marketplace were isolated under the system temporary directory. The source plugin was copied into that marketplace, then installed into the profile cache.
- `plugin add`, `plugin list`, and app-server `skills/list` discovered exactly one plugin skill: `remotion-director:remotion-director`. Internal design/critic references were not separately discoverable skills.
- The production workspace was separate from the development repository and used a path containing both Chinese characters and spaces. The installed package had no `node_modules`.
- The final test install was `0.4.0+codex.20260925103143` in the isolated profile; both manifests used that test-only cachebuster. The distributed package remains `0.4.0`.
- An installed-cache launcher rendered a six-second fixture at 1080×1920 and 30fps: 180 frames, one MP4, six stills and eight punctuated held frames. The output was inspected as pixels and verified against its source and artifact receipt.
- The final rerun used `fixture/out/r7`; its MP4 SHA-256 is `6ccb7a190fb6e59d3c7f69d253dea20c355f898ada978192b2a46370357ea2cf`. The installed launcher verified source binding, dimensions, duration, video, all six stills and all eight strip frames. This is an engineering fixture, not creative acceptance.
- Full ffmpeg 8.1.1 was supplied on the command-local PATH. Chromium 149.0.7790.0 came from an existing local cache after the original download failed. The successful render used an approved elevated process; sandbox-only rendering was not established.
- Environment preparation resolved stable Remotion 4.0.529 and upstream RBP version 4.0.529 at the time of the run. Existing global RBP was updated in place and reused on a second check; no workspace RBP copy was created. These are observations, not supported-version pins.

## Primary review

Primary inspection checked generator fidelity, actual launcher commands, identity/continuation records, canonical transitions and artifact binding. Review found defects missed by the initial green unit suite, including incomplete listing metadata, source-only generation checks, a missing CLI review-round argument, anonymous evidence created after selection, and permissive report/artifact validation. Corrections are validated before final packaging; a green unit result alone is not a substitute for these paths.

### Standards review

The final corrections cover root-only source exclusions, retryable anonymous-evidence preparation, distinct role/recovery handles, trailing-newline convergence parsing, native PNG dimensions and explicit rejection of strip modes without held/mid semantics. The generator's quoted-command regression now passes. Duplicated historical verdict text remains a low-priority maintainability observation; it is not used to claim stronger runtime guarantees.

### Specification review

The final corrections preserve critic continuation IDs, unused render directories across the entire run, explicit same-round amendments, post-tempo review, and video receipts that cannot be rebound to changed source by recapturing artifact metadata. Anonymous selection is prepared before dispatch and checked again on consumption. Independent tests also reject delayed completion after the critic changes convergence, including retracting convergence after a tempo report.

The primary boundary tests exercise the actual verdict CLI and a synthetic multi-round ledger flow through amendment, tempo and post-tempo repair. Synthetic role handles in tests establish the command/state mechanism only; they do not establish native-agent continuity, reading behavior or creative quality.

The ledger validates actions submitted through its commands. It does not intercept arbitrary host tool calls or enforce a filesystem sandbox. Fresh context, same-agent continuation, forbidden reads, native crops and faithful relay remain protocol requirements that need actual host trace evidence.

## Creative acceptance and release blockers

The real test brief was a 12-second, 1080×1920, 30fps, silent night-bus service piece with required Chinese copy, using two independent draws.

- Draw 2 delivered its explicit settled report, rendered video and strip, and inspected native text and door crops.
- Draw 1 saved its staged design and source, but sandboxed rendering failed with `uv_os_get_passwd ENOMEM`. Automatic approval review rejected its elevated render retry. It has no settled render and was not promoted to canonical.
- Because the commissioned two draws have not both settled, no blind selection was made. The run was not silently reduced to one draw.
- Persistent multi-round critic behavior, read-access blindness, pixel rebuttal, post-tempo validation, locked/free creative cases and user visual approval are not yet accepted end to end.

These are release blockers, not optional future enhancements. The review PR must remain draft until the intended creative flow is demonstrated under an authorized execution path. The current evidence does not establish public-directory approval, all Codex hosts, Bash execution, audio quality, nonvertical punctuation geometry, restart-persistent agent memory or hard read isolation.

## Unrelated work

The existing untracked `dsh/` and `.dsh-path-backup.txt` are excluded. A before/after SHA-256 comparison covers all 25 pre-existing files; no differences were found during primary review.
