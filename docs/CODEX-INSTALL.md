# Codex installation and usage

The Codex distribution is `codex-plugin/`. The original Claude plugin remains at the repository root. This adaptation is a draft: read [validation status](CODEX-VALIDATION.md) before relying on it for production delivery.

## Build the distribution

From the repository root, with Node installed:

```text
node tools/generate-codex-plugin.mjs
node tools/generate-codex-plugin.mjs --check
```

The generated folder contains a portable root manifest, a Codex compatibility manifest, one public `remotion-director` skill, internal role/design references and runtime tools. The bundle does not need its own `node_modules`. Changes belong in the source files and generator, followed by regeneration.

## Install in a local Codex host

Use Codex's plugin-creator workflow to add the generated folder to your personal marketplace. Give it the absolute path to `codex-plugin/` and the plugin name `remotion-director`; ask it to copy the complete folder, install it and verify discovery. Do not register the repository root as the Codex plugin or install the internal references as separate public skills.

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
