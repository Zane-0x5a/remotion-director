/**
 * render-arm.ts — generic render harness.
 *
 * Bundles a self-contained Remotion entry (<armDir>/index.tsx, which calls
 * registerRoot() and registers a Composition id "piece"; staticFile() assets
 * come from <armDir>/public), renders the mp4, then derives the review materials from
 * the rendered pixels into <out>/review/ (see time-overview.ts): the time overview
 * pages, the full-resolution settle frames and overview.json. The piece code is
 * arbitrary author-written Remotion; this harness does NOT touch the design — it
 * only turns whatever the piece wrote into real rendered pixels.
 *
 * Usage: node "<PLUGIN_ROOT>/tools/codex-launcher.mjs" render-arm --workspace <workspace> --dir <armDir> [--out <dir>]
 *   The launcher supplies workspace dependencies; this harness lives in the package and has no node_modules;
 *   the engine deps it imports (@remotion/bundler, …) are installed in the workspace,
 *   the launcher stages the helper under the workspace so its dependency tree is used.
 */
import { bundle } from "@remotion/bundler";
import { ensureBrowser, selectComposition, renderMedia } from "@remotion/renderer";
import * as path from "node:path";
import * as fs from "node:fs";
import { preferHighPerformanceGpu } from "./gpu-preference.ts";
import { buildReview } from "./time-overview.ts";

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

  // On a two-GPU Windows machine the render's Chrome starts on the integrated GPU
  // unless Windows is told otherwise (see gpu-preference.ts); tell it before the
  // first Chrome of this render starts.
  const browser = await ensureBrowser();
  if ("path" in browser) {
    const gpu = preferHighPerformanceGpu(browser.path);
    if (gpu) console.error(`[harness] ${gpu}`);
  }

  // staticFile() resolves against the draw's own <armDir>/public, not the
  // workspace's: every draw keeps its assets in its own directory.
  const publicDir = path.resolve(dir, "public");
  console.error(`[harness] bundling ${entry} ...`);
  const serveUrl = await bundle({ entryPoint: entry, publicDir });
  const composition = await selectComposition({ serveUrl, id: "piece" });
  console.error(
    `[harness] comp ${composition.width}x${composition.height} ${composition.durationInFrames}f @${composition.fps}fps`,
  );

  const mp4 = path.join(out, "video.mp4");
  await renderMedia({ composition, serveUrl, codec: "h264", outputLocation: mp4, chromiumOptions: { gl: "angle" } });
  console.error(`[harness] video -> ${mp4}`);

  const reviewDir = path.join(out, "review");
  fs.rmSync(reviewDir, { recursive: true, force: true });
  const review = await buildReview(mp4, reviewDir);
  console.error(
    `[harness] review -> ${reviewDir} (${review.pages.length} overview page(s), ${review.settle_frames.length} settle frame(s))`,
  );
  console.error(`[harness] DONE: ${out}`);
}

main().catch((e) => {
  console.error("[harness] FAILED:", e);
  process.exit(1);
});
