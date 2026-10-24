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
 * Usage: NODE_PATH="<workspace>/node_modules" npx tsx "${CLAUDE_PLUGIN_ROOT}/tools/render-arm.ts" --dir <armDir> [--out <dir>]
 *   NODE_PATH is required: this harness lives in the plugin dir (no node_modules);
 *   the engine deps it imports (@remotion/bundler, …) are installed in the workspace,
 *   and tsx resolves bare imports via NODE_PATH, not via cwd. Omit it → "Cannot find module".
 */
import { bundle } from "@remotion/bundler";
import { ensureBrowser, selectComposition, renderMedia } from "@remotion/renderer";
import * as path from "node:path";
import * as fs from "node:fs";
import * as os from "node:os";
import { preferHighPerformanceGpu } from "./gpu-preference.ts";
import { defaultTabs, fewerTabs, firstLine, looksOutOfMemory } from "./render-retry.ts";
import { buildReview } from "./time-overview.ts";

/** A bundle that cannot be deleted only wastes disk, so it warns rather than failing a finished render. */
function removeBundle(dir: string) {
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch (e) {
    console.error(`[harness] could not delete the bundle ${dir} (${firstLine(e)}); delete it by hand`);
  }
}

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
  // bundle() copies the whole public/ (soundtrack, fonts, …) into a new directory under the OS
  // temp dir and never removes it: ~100 MB left behind per render. Remove it however the render ends.
  const serveUrl = await bundle({ entryPoint: entry, publicDir });
  const mp4 = path.join(out, "video.mp4");
  try {
    const composition = await selectComposition({ serveUrl, id: "piece" });
    console.error(
      `[harness] comp ${composition.width}x${composition.height} ${composition.durationInFrames}f @${composition.fps}fps`,
    );

    // A render that ran the machine out of memory runs again with fewer Chrome tabs
    // (see render-retry.ts); any other error is the piece's and fails right away.
    let tabs = defaultTabs(os.availableParallelism());
    for (;;) {
      try {
        await renderMedia({ composition, serveUrl, codec: "h264", outputLocation: mp4, concurrency: tabs, chromiumOptions: { gl: "angle" } });
        break;
      } catch (e) {
        if (!looksOutOfMemory(e)) throw e;
        const fewer = fewerTabs(tabs);
        if (fewer === null) {
          console.error(
            `[harness] the render ran out of memory even with ${tabs} Chrome tabs. Other renders running at the same time, ` +
              `or a piece that keeps a lot in memory (every tab holds its own copy of the piece), can cause this.`,
          );
          throw e;
        }
        console.error(`[harness] the render ran out of memory (${firstLine(e)}); rendering again with ${fewer} Chrome tabs instead of ${tabs}`);
        fs.rmSync(mp4, { force: true });
        tabs = fewer;
      }
    }
  } finally {
    removeBundle(serveUrl);
  }
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
