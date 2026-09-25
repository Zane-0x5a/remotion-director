# Codex installation and usage

The Codex distribution is `codex-plugin/`. The original Claude plugin remains at the repository root. This adaptation is a draft: read [validation status](CODEX-VALIDATION.md) before relying on it for production delivery.

## Build the distribution

From the repository root, with Node installed:

```text
node tools/generate-codex-plugin.mjs
node tools/generate-codex-plugin.mjs --check
```

The generated folder contains a portable root manifest, a Codex compatibility manifest, one public `remotion-director` skill, internal role/design references and runtime tools. The bundle does not need its own `node_modules`. Changes belong in the source files and generator, followed by regeneration.

## Install from this GitHub repository

The repository has a separate Codex marketplace whose entry points at `./codex-plugin`. For the current preview branch, add that marketplace and install the `remotion-director` plugin with:

```text
codex plugin marketplace add Zane-0x5a/remotion-director --ref codex/codex-plugin-migration
codex plugin add remotion-director@remotion-director-codex
```

After the change is merged, run the same commands without `--ref`; the default branch will contain the marketplace entry:

```text
codex plugin marketplace add Zane-0x5a/remotion-director
codex plugin add remotion-director@remotion-director-codex
```

Start a new task, or restart the host, after installing or updating so skill discovery reloads. The installed plugin exposes one public skill, `remotion-director`; its internal role and design files are bundled references. Do not register the repository root as the Codex plugin or install the internal references as separate public skills.

The original Claude marketplace remains independent. `.claude-plugin/marketplace.json` keeps `source: "."`, so Claude continues to use the repository root's default `skills/` and `agents/` routes. A Claude cache may contain the nested `codex-plugin/` directory as inert extra files; that directory is selected only by the Codex marketplace entry. The additive `file` field in the shared `render-strip` manifest is the common runtime change. Shared global RBP updates can affect both hosts by the existing intended policy.

## Install in a local Codex host

Use Codex's plugin-creator workflow to add the generated folder to your personal marketplace when working from a checkout or a locally generated package. Give it the absolute path to `codex-plugin/` and the plugin name `remotion-director`; ask it to copy the complete folder, install it and verify discovery.

If you already maintain a configured local marketplace, copy the generated folder to that marketplace's existing `remotion-director` source location, update its cachebuster through the plugin-creator update workflow, and reinstall:

```text
codex plugin add remotion-director@<your-marketplace-name>
codex plugin list --marketplace <your-marketplace-name> --json
```

Start a new task after installing or updating so the host reloads the skill. Invoke `remotion-director` with your brief. Discovery should expose only `remotion-director:remotion-director` from this plugin; `design-brain` and `critic-loop` are internal references.

The host must support fresh child contexts, continuation of the same child, explicit result collection, local commands, image inspection and permitted crop writes. The skill maps these roles to the actual host tools; installing Markdown does not automatically register Claude agent definitions or create filesystem isolation.

## Prepare a production workspace

The workflow asks for the commission and creates a workspace outside the installed plugin. The launcher uses absolute installed-package and workspace paths:

```text
node "<installed-plugin>/tools/codex-launcher.mjs" --help
node "<installed-plugin>/tools/codex-launcher.mjs" prepare-environment --workspace "<workspace>"
```

Preparation resolves the stable Remotion release and current upstream RBP. If global RBP already exists, it is updated there; otherwise a workspace copy is installed. It requires network access and permission to write the selected location. Failures must be reported; an unavailable global update must not silently create a second copy.

Node, Chromium and a full ffmpeg build (including `ffprobe` on PATH) are local runtime requirements. The production workspace owns dependencies and generated caches. No renderer should import the development checkout or write into the installed package. Canonical validation requires the default punctuated strip with held/mid roles; legacy uniform sampling and `--step` output are not accepted as equivalent critic evidence.

See launcher help for the run ledger and render commands. Canonical output comes from an explicit successful role report and verified artifacts. Read the final video selected by the workflow; the largest output directory number does not identify the deliverable.
