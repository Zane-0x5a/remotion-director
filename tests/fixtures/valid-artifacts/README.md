# Real media for artifact verification

These committed MP4/PNG files are a synthetic engineering fixture created with this repository's Remotion render tools: 320×568, 30fps, 3 seconds, six stills, four held frames and two mid frames. They contain a moving square, a one-frame flash and diagnostic text. The version string drawn into the pixels describes the original fixture run; it is not an engine compatibility pin.

Tests copy the files into temporary output directories, replace the manifest's video path, and create fresh receipts bound to their temporary source. This deliberately avoids network access and dependence on untracked local render outputs. Tests also corrupt copies, change dimensions/paths/source, amend verdicts and exercise interrupted preparation; the originals stay unchanged.

`ffprobe` must be available on PATH. The fixture establishes media and state-machine behavior only, not motion-design quality or native subagent behavior.
