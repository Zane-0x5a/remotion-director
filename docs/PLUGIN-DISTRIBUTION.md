# Separate plugin distributions

The repository is both an authoring workspace and a marketplace for two hosts. Installing Claude must not copy the Codex package or development material into its active plugin directory. A successful component listing alone does not establish this: inspect the files actually installed.

| Host | Repository catalog | Plugin source |
| --- | --- | --- |
| Claude Code | `.claude-plugin/marketplace.json` | `./claude-plugin` |
| Codex | `.agents/plugins/marketplace.json` | `./codex-plugin` |

The root `skills/`, `agents/`, shared runtime files and dependency declarations are the authoring sources. Claude receives their generated copy without changes to the role or design wording. Codex receives its generated host adaptation. Do not hand-edit either generated directory.

```sh
npm run build:plugins
npm run check:plugins
npm test
```

The Claude generator includes the plugin manifest, skill/reference files, agent definitions, five runtime tools, dependency defaults, TypeScript configuration, source receipt and license. Neither generated package depends on files above its installed root. The dependency defaults have no lockfile: Claude's automatic plugin dependency installer requires both `package.json` and a supported lockfile, while this plugin deliberately installs its engine into the user's production workspace through environment preparation. Claude `0.3.2` marks the packaging change so existing versioned installs can update from `0.3.1`; Remotion and RBP still follow upstream through environment preparation.

## Install the preview

Run in a terminal before the migration PR is merged:

```sh
claude plugin marketplace add Zane-0x5a/remotion-director#codex/codex-plugin-migration --sparse .claude-plugin claude-plugin
claude plugin install remotion-director@remotion-director
```

After merge, omit `#codex/codex-plugin-migration`. The marketplace name and plugin name remain `remotion-director`, so the existing install identifier is unchanged.

There are two distinct caches. The active plugin cache contains the selected `claude-plugin/` subtree. The marketplace cache is a checkout of the source repository; ordinary registration may retain other repository directories there. The `--sparse .claude-plugin claude-plugin` registration keeps those directories out of its working tree. Git may still store objects, and Git sparse checkout retains top-level files; this is not a promise of zero unrelated bytes anywhere in the Git cache.

## Update an existing Claude installation

Once the version is available on the branch your marketplace tracks:

```sh
claude plugin marketplace update remotion-director
claude plugin update remotion-director@remotion-director
claude plugin details remotion-director
```

Restart Claude Code to use the updated package. Its inventory remains three skills (`create`, `critic-loop`, `design-brain`) and four agents (`aesthetic-critic`, `blind-selector`, `builder`, `tempo-pass`). Existing version caches and marketplace checkout settings are managed by Claude; a plugin update does not promise to purge historical copies or change an existing full checkout to sparse mode.

## Validation scope

Generation checks compare the complete expected distribution against the checked-in package, including missing, changed and extra files. Tests check dependency closure, source fidelity and excluded development/Codex content. Actual remote-install and upgrade observations are recorded in [CODEX-VALIDATION.md](CODEX-VALIDATION.md). The existing incomplete Codex creative acceptance is a separate release blocker and is not resolved by this packaging change.

Host behavior was checked against the official [marketplace guide](https://code.claude.com/docs/en/plugin-marketplaces) and [plugin loading reference](https://code.claude.com/docs/en/plugins/loading) on 2026-09-25, plus `claude plugin marketplace add --help` in Claude Code `2.1.281` for the sparse-checkout flags.
