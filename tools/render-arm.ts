/**
 * render-arm.ts — generic render harness.
 *
 * Bundles a self-contained Remotion entry (<armDir>/index.tsx, which registers a
 * Composition id "piece"), then renders a 6-frame still strip + an mp4. The piece
 * code is arbitrary author-written Remotion; this harness does NOT touch the design —
 * it only turns whatever the piece wrote into real rendered pixels.
 *
 * Usage: npx tsx "${CLAUDE_PLUGIN_ROOT}/tools/render-arm.ts" --dir <armDir> [--out <dir>]
 */
import { bundle } from "@remotion/bundler";
import { selectComposition, renderMedia, renderStill } from "@remotion/renderer";
import * as path from "node:path";
import * as fs from "node:fs";

async function main() {
  const args = process.argv.slice(2);
  const get = (k: string) => {
    const i = args.indexOf(k);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const dir = get("--dir");
  if (!dir) {
    console.error("usage: --dir <armDir> [--out <dir>]");
    process.exit(1);
  }
  const out = get("--out") ?? path.join(dir, "out");
  const entry = path.join(dir, "index.tsx");
  fs.mkdirSync(out, { recursive: true });

  console.error(`[harness] bundling ${entry} ...`);
  const serveUrl = await bundle({ entryPoint: entry });
  const composition = await selectComposition({ serveUrl, id: "piece" });
  console.error(
    `[harness] comp ${composition.width}x${composition.height} ${composition.durationInFrames}f @${composition.fps}fps`,
  );

  // still strip (6 evenly-spaced frames)
  const n = 6;
  for (let i = 0; i < n; i++) {
    const frame = Math.round(((composition.durationInFrames - 1) * i) / (n - 1));
    const png = path.join(out, `still-${String(frame).padStart(3, "0")}.png`);
    await renderStill({ composition, serveUrl, output: png, frame, overwrite: true, chromiumOptions: { gl: "angle" } });
    console.error(`[harness] still f${frame} -> ${png}`);
  }

  // mp4
  const mp4 = path.join(out, "video.mp4");
  await renderMedia({ composition, serveUrl, codec: "h264", outputLocation: mp4, chromiumOptions: { gl: "angle" } });
  console.error(`[harness] video -> ${mp4}`);
  console.error(`[harness] DONE: ${out}`);
}

main().catch((e) => {
  console.error("[harness] FAILED:", e);
  process.exit(1);
});
