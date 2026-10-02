# Codex migration validation

Date: 2026-09-25. Source baseline: `28fb82cc437f7bf3b231e2694ace0f65d031b9bd`.

This record separates engineering checks from acceptance of the creative product. The engineering checks below date from 2026-09-25; the creative acceptance passed end to end on 2026-10-02 (see [End-to-end creative acceptance](#end-to-end-creative-acceptance-2026-10-02)).

> **Update 2026-10-02.** The checks below were run before the source pipeline was rebuilt on Claude Opus 5.5. Stills, strip frames, `render-strip.ts`, the tempo pass and post-tempo review no longer exist: every render now writes `video.mp4` and a `review/` directory (time overview pages, settle frames, `overview.json`), which the ledger (schema 4) verifies. The automated suite now covers the rebuilt runtime (dealt directions, the pick at the previews, redraws, both polish modes, `duration blocked`). Entries below that mention stills, strips or tempo describe that earlier state.

## Reproducible engineering checks

From the repository root:

```text
npm run build:plugins
npm run check:plugins
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
| `npm test` | 69/69 passed after separate Claude packaging, including six distribution tests, 12 independent primary-review boundary tests and marketplace routing |
| Clean export of staged files | Both generation checks and all 69 tests passed with no ignored workspace files or local `node_modules`; only an external `ffprobe` was supplied on PATH |
| `npm run typecheck` | Passed |
| JavaScript syntax and staged whitespace checks | Passed, allowing the existing trailing blank line preserved from source `texture.md`; ordinary `git diff --check` reports that one copied-source whitespace warning |
| Final isolated reinstall and skill discovery | Passed; exactly one plugin-owned public skill |
| Installed package content comparison | 28 non-manifest files matched byte-for-byte; only the two test-install manifests carry the same local cachebuster |
| Final installed fixture render and artifact verification | Passed: 1080×1920, 30fps, 6 seconds, six stills and eight strip frames |
| Repository marketplace installation | Local repository registration and installation passed in a separate temporary Codex profile; selected `./codex-plugin`, version `0.4.0` |
| GitHub preview installation and discovery | Documented `marketplace add ... --ref codex/codex-plugin-migration` and `plugin add` succeeded from remote commit `e512f14`; app-server found exactly one enabled plugin-owned skill |
| Claude marketplace validation | Before the packaging follow-up, `claude plugin validate .` passed with the original root route. The follow-up selects `./claude-plugin` and increments Claude metadata to `0.3.2`; root skill/agent wording remains unchanged |

The artifact tests require a working `ffprobe` on PATH and use the committed media in `tests/fixtures/valid-artifacts`; they need no network, global RBP writes or ignored local render files. On this Windows host the final unit suite used the installed Remotion compositor's `ffprobe`. Starting the separate full FFmpeg binary inside the sandbox returned `EPERM`; using the existing compositor binary at the same permission level worked. Full rendering and strip extraction used the approved elevated full-FFmpeg path, as noted below.

## Installed execution observed

- Direct GitHub installation was also checked in a fresh temporary Codex profile. The repository marketplace `remotion-director-codex` selected the generated `codex-plugin/` package, installed version `0.4.0`, and exposed only `remotion-director:remotion-director`. The probe used a separate empty workspace and did not modify the normal user profile. Windows Git TLS returned `SEC_E_NO_CREDENTIALS` inside the sandbox; the same documented install succeeded with approved elevated execution and the command-local proxy. Discovery then succeeded inside the sandbox.
- Host: Windows; bundled Codex CLI `0.155.0-alpha.16.4`.
- Test profile and local marketplace were isolated under the system temporary directory. The source plugin was copied into that marketplace, then installed into the profile cache.
- `plugin add`, `plugin list`, and app-server `skills/list` discovered exactly one plugin skill: `remotion-director:remotion-director`. Internal design/critic references were not separately discoverable skills.
- The production workspace was separate from the development repository and used a path containing both Chinese characters and spaces. The installed package had no `node_modules`.
- The final test install was `0.4.0+codex.20260925103143` in the isolated profile; both manifests used that test-only cachebuster. The distributed package remains `0.4.0`.
- An installed-cache launcher rendered a six-second fixture at 1080×1920 and 30fps: 180 frames, one MP4, six stills and eight punctuated held frames. The output was inspected as pixels and verified against its source and artifact receipt.
- The final rerun used `fixture/out/r7`; its MP4 SHA-256 is `6ccb7a190fb6e59d3c7f69d253dea20c355f898ada978192b2a46370357ea2cf`. The installed launcher verified source binding, dimensions, duration, video, all six stills and all eight strip frames. This is an engineering fixture, not creative acceptance.
- Full ffmpeg 8.1.1 was supplied on the command-local PATH. Chromium 149.0.7790.0 came from an existing local cache after the original download failed. The successful render used an approved elevated process; sandbox-only rendering was not established.
- Environment preparation resolved stable Remotion 4.0.529 and upstream RBP version 4.0.529 at the time of the run. Existing global RBP was updated in place and reused on a second check; no workspace RBP copy was created. These are observations, not supported-version pins.

## Separate Claude installation follow-up

The root-source install was reproduced with Claude Code `2.1.281`, remote branch commit `8d18a07`, in a temporary profile. Its `0.3.1` active cache included `codex-plugin/`, docs, tests, media, the root lockfile and an automatically installed `node_modules`: 23,031 files and 365,718,431 bytes on this host, including Claude's cache marker. These numbers describe the observed install, not a fixed download size.

The `6f715cb` distribution change was tested through GitHub using two isolated profiles:

- Fresh sparse registration: `claude plugin marketplace add Zane-0x5a/remotion-director#codex/codex-plugin-migration --sparse .claude-plugin claude-plugin`, then `claude plugin install remotion-director@remotion-director --json` succeeded.
- Existing full registration: `claude plugin marketplace update remotion-director`, then `claude plugin update remotion-director@remotion-director --json` reported an actual `0.3.1` to `0.3.2` update.
- Both active caches contained exactly the 27 distribution files, 199,767 bytes, plus Claude's `.in_use` marker. File-by-file comparison matched the generated package after normalizing only Git checkout line endings. No Codex package/runtime, tests, docs, lockfile or `node_modules` was installed.
- `plugin details` still listed the original three skills and four agents. Both catalog and nested plugin manifest passed Claude CLI validation. Original source skills, agents and shared runtime text remain unchanged by the packaging change.
- The fresh marketplace working tree had only `.claude-plugin/`, `claude-plugin/`, `.git/` and Git sparse-checkout's retained top-level files. It had no `codex-plugin/`, `docs/`, `tests/` or root skill/agent directories. The old full marketplace checkout and old `0.3.1` cache remain separate; upgrading does not purge them.
- The installed `check-env.mjs --help` worked from an unrelated directory. `--check` validated the already prepared production workspace without network or global RBP changes.
- The new installed Claude `render-arm.ts` and `render-strip.ts` ran with `NODE_PATH` pointing to that workspace's dependencies, with no dependencies in the plugin cache. They produced a 6-second 1080×1920, 30fps MP4, six stills and eight strip frames at `fixture/out/claude-package-r1`. Metadata, strip filenames and a rendered still were inspected. The full renderer used approved elevated execution, existing Chromium and full FFmpeg as in the prior fixture; this proves package dependency resolution, not creative acceptance.

The initial remote registration hit the known Windows Git TLS sandbox error `SEC_E_NO_CREDENTIALS`; approved elevated registration, installation and update succeeded through the command-local proxy. Normal user profiles were not changed. Both generators and all 69 tests also passed from a clean LF export of the staged repository, with no local `node_modules`. Final Windows-case guard cleanup passed the focused seven packaging/routing tests and generation check.

Primary review corrected platform-dependent provenance hashes and strengthened output replacement checks against source directories and symlink/junction ancestors. The generator rejects missing/changed/extra output; Claude source content is copied without host transformations. Installation/update commands and cache boundaries are documented in [PLUGIN-DISTRIBUTION.md](PLUGIN-DISTRIBUTION.md).

## Primary review

Primary inspection checked generator fidelity, actual launcher commands, identity/continuation records, canonical transitions and artifact binding. Review found defects missed by the initial green unit suite, including incomplete listing metadata, source-only generation checks, a missing CLI review-round argument, anonymous evidence created after selection, and permissive report/artifact validation. Corrections are validated before final packaging; a green unit result alone is not a substitute for these paths.

### Standards review

The final corrections cover root-only source exclusions, retryable anonymous-evidence preparation, distinct role/recovery handles, trailing-newline convergence parsing, native PNG dimensions and explicit rejection of strip modes without held/mid semantics. The generator's quoted-command regression now passes. Duplicated historical verdict text remains a low-priority maintainability observation; it is not used to claim stronger runtime guarantees.

### Specification review

The final corrections preserve critic continuation IDs, unused render directories across the entire run, explicit same-round amendments, post-tempo review, and video receipts that cannot be rebound to changed source by recapturing artifact metadata. Anonymous selection is prepared before dispatch and checked again on consumption. Independent tests also reject delayed completion after the critic changes convergence, including retracting convergence after a tempo report.

The primary boundary tests exercise the actual verdict CLI and a synthetic multi-round ledger flow through amendment, tempo and post-tempo repair. Synthetic role handles in tests establish the command/state mechanism only; they do not establish native-agent continuity, reading behavior or creative quality.

The ledger validates actions submitted through its commands. It does not intercept arbitrary host tool calls or enforce a filesystem sandbox. Fresh context, same-agent continuation, forbidden reads, native crops and faithful relay remain protocol requirements that need actual host trace evidence.

## End-to-end creative acceptance, 2026-10-02

Host: Codex CLI `0.160.0` app-server on Windows, held open by a test driver so that the user's messages could be relayed between turns. The model was `gpt-6.1-sol` at `xhigh`, reached through a third-party Responses API relay. The approval policy was `never` with full access, because nobody was present to approve commands. The plugin was installed from the local repository with `codex plugin marketplace add` and `plugin add`; the installed files matched the generated package byte for byte. The brief was a late-night study room at a public library ("The Reading Room — open until 2am."). The commission was the user's own: full auto, the designer picks the length, simple sound effects.

**Run 4 passed** at plugin commit `6dcac44`:

1. The commission questions came first. Then came a separate confirm-back, which the user answered in person.
2. Environment preparation resolved Remotion 4.0.532.
3. One direction lister returned three directions, recorded verbatim. Each of three builders was dealt one direction.
4. The three r1 previews (16 s, 24 s and 26 s, each with sound) were accepted through `accept-preview`.
5. `prepare-selection` made anonymous candidates. A fresh blind selector picked C, which was draw-3, and `record-selection` recorded it.
6. The picked builder self-checked and settled on `r3`, which `accept-canonical` verified.
7. A fresh critic saw only the role, the brief, `review/` and the video. Round 1 returned three low-severity items and `CONVERGED: YES`.
8. The orchestrator's closing claim matched the ledger: an accepted canonical whose last verdict converged.
9. The finished film is 26.0 s, 1080×1920 at 30 fps, with a stereo AAC track (mean −22.7 dB). The user accepted it at the final gate.

Deviations in run 4. Each is recorded, and the plugin changes that answer them are listed.

- The orchestrator spawned four direction listers. It interrupted the first, then spawned three more at once, registered one and used only that one's list. The ledger cannot see unregistered children; the host guide allows one lister per batch.
- It registered all three builders before spawning them, and never spawned draw-3's. It waited on draw-3 for about an hour before noticing, then replaced it with a fresh builder. That builder had no preview yet, so nothing was lost.
- The test driver ran the app-server under a two-hour job limit, which killed it during the picked builder's self-check. After the restart, `list_agents` showed no children. The orchestrator replaced the picked builder with a fresh one instead of continuing it. So the self-check and the critic round were done by a builder that read the piece back rather than designed it: the degraded form, which the skill reserves for the user's choice. Commit `29622ed` makes `recover-role` refuse that without the user's words. A probe verified that `followup_task` to a child's original handle reloads it with its context, even after a machine reboot, and the host guide now says so.
- Token use for the whole run was 41.7 M input tokens (34.5 M of them cached) and 124 k output tokens. The orchestrator accounts for 28.4 M of the input, mostly from repeated `wait_agent` polls during the hour it waited.

Earlier runs were void:

- **Run 1** found that `render-arm` served the workspace's `public/` instead of each draw's, so sound effects returned 404. It also found that the orchestrator added an audience to the brief and guessed model IDs.
- **Run 2** lost the host's inter-agent messages partway through: tasks arrived as opaque tokens. The orchestrator then spawned helpers and claimed a finished film that the ledger did not show.
- **Run 3** registered builders that it never spawned, and reported a host capability block that did not exist.

Every finding that belongs to the plugin was fixed and unit-tested before the next run. Fixes for what only Codex showed live in the Codex adapter, not in the shared sources the Claude plugin reads.

Not established by these runs: other Codex hosts and models, hard read isolation (prompt blindness remains a protocol constraint), the 亲自打磨 polish mode, the user's own pick at the previews, and a critic loop that runs beyond one round on Codex.

## Earlier creative attempt, 2026-09-25

The real test brief was a 12-second, 1080×1920, 30fps, silent night-bus service piece with required Chinese copy, using two independent draws.

- Draw 2 delivered its explicit settled report, rendered video and strip, and inspected native text and door crops.
- Draw 1 saved its staged design and source, but sandboxed rendering failed with `uv_os_get_passwd ENOMEM`. Automatic approval review rejected its elevated render retry. It has no settled render and was not promoted to canonical.
- Because the commissioned two draws have not both settled, no blind selection was made. The run was not silently reduced to one draw.

At the time these were release blockers; the 2026-10-02 runs above answer them.

## Unrelated work

The existing untracked `dsh/` and `.dsh-path-backup.txt` are excluded. A before/after SHA-256 comparison covers all 25 pre-existing files; no differences were found during primary review.
