# Real media for artifact verification

These committed files are a synthetic engineering fixture: a 320×568, 30fps, 3-second `video.mp4` rendered with this repository's Remotion tools (a moving square, a one-frame flash and diagnostic text), and its `review/` generated from that video by `tools/time-overview.ts` (one time-overview page, three full-resolution settle frames and `overview.json`, schemaVersion 1). The version string drawn into the pixels describes the original fixture run; it is not an engine compatibility pin.

Tests copy the files into temporary output directories and create fresh provenance receipts bound to their temporary source. This deliberately avoids network access and dependence on untracked local render outputs. Tests also corrupt copies, change dimensions/paths/source, amend verdicts and exercise interrupted preparation; the originals stay unchanged. Regenerate `review/` with `npx tsx tools/time-overview.ts --video tests/fixtures/valid-artifacts/video.mp4 --out tests/fixtures/valid-artifacts/review` if the overview contract changes.

`ffprobe` must be available on PATH. The fixture establishes media and state-machine behavior only, not motion-design quality or native subagent behavior.
