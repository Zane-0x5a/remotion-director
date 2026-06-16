/**
 * render-strip.ts — frame strip renderer for blind aesthetic review.
 *
 * Default mode = PUNCTUATED sampling (CRITIC-PROTOCOL 条带规格 v3.4):
 *   Motion is measured from the run's already-rendered video.mp4 (zero extra
 *   Remotion renders): ffmpeg decodes every frame to a 54x96 grayscale raster;
 *   d[i] = 0.5 * global mean abs diff + 0.5 * max 9x12-block mean abs diff — the
 *   block term catches small localized motion (e.g. a rolling counter in an
 *   otherwise still frame) that a global mean dilutes.
 *
 *   Then, instead of densely sampling the motion PROCESS (which over-weights bursts
 *   in the judge's eyes and turns a clean transient into a stack of "overlapping
 *   text" stills), we capture motion's PUNCTUATION via a hysteresis state machine:
 *     - Segment the timeline into alternating PAUSE / MOTION blocks with a double
 *       threshold (enter motion above `high`, return to pause below `low`, low<high)
 *       so a hold's internal grain jitter can't shred one hold into many blocks.
 *     - `high` = pHigh-quantile of per-frame motion (rides the lower edge of real
 *       motion); `low` = lowFrac*high, kept HIGH so every true pause (far below it)
 *       is captured — anti-false-negative: the line's only job is "anything above it
 *       definitely isn't a pause".
 *     - PAUSE block -> one HELD frame at its quietest point (a held composition the
 *       reviewer MAY adjudicate for layout/finish).
 *     - MOTION block -> MID frame count adapts to DURATION: a SHORT discrete move
 *       (len <= shortMax) -> one MID at the peak (the peak IS the action); a LONG
 *       continuous/silky move -> ceil(len/spanPerMid) MIDs spread evenly incl. both
 *       ends, so smoothness shows across a short series instead of one blurry peak.
 *       MID frames are "read-for-motion-logic only", NEVER a held defect.
 *     - First & last frame are forced HELD anchors (entry/settle are pauses).
 *     - DEGENERATE (no real motion structure) -> a few evenly spaced HELD, no MID.
 *   The SEGMENT is the unit of weight (not the frame), so neither long holds nor
 *   dense bursts inflate the count. Selection is written to <out>/strip-manifest.json.
 *
 * Fallback: no mp4 found -> uniform sampling + loud warning (the critic MATERIAL
 * wording must then be the legacy "sampled evenly" version, NOT "PUNCTUATED").
 * `--step N` forces legacy uniform sampling (back-compat with as-run scripts).
 *
 * Outputs ONLY PNGs (+ strip-manifest.json) so the strip can be handed to a
 * design-blind reviewer who must infer intent from the frames alone. PUNCTUATED
 * frames are named seq-NN_fNNN_<role>.png (role = held | mid); uniform/legacy
 * frames keep the role-less seq-NN_fNNN.png name.
 *
 * Usage: npx tsx "${CLAUDE_PLUGIN_ROOT}/tools/render-strip.ts" --dir <armDir> --out <dir>
 *        [--p-high 0.9] [--low-frac 0.5] [--short-max 12] [--span-per-mid 15]
 *        [--video <mp4>] [--step N] [--plan]
 *        --plan: analyze + write manifest only, render nothing (cheap preview).
 *        --step N: legacy uniform sampling (no roles, role-less filenames).
 */
import { bundle } from "@remotion/bundler";
import { selectComposition, renderStill } from "@remotion/renderer";
import { spawn } from "node:child_process";
import * as path from "node:path";
import * as fs from "node:fs";

const AW = 54; // analysis raster width  (1080x1920 aspect)
const AH = 96; // analysis raster height
const BW = 9; // block width  -> 6x8 = 48 blocks
const BH = 12; // block height

function extractGray(video: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const ff = spawn("ffmpeg", [
      "-v", "error",
      "-i", video,
      "-vf", `scale=${AW}:${AH}`,
      "-f", "rawvideo",
      "-pix_fmt", "gray",
      "-",
    ]);
    const chunks: Buffer[] = [];
    ff.stdout.on("data", (c: Buffer) => chunks.push(c));
    ff.stderr.on("data", (c: Buffer) => process.stderr.write(c));
    ff.on("error", reject);
    ff.on("close", (code) =>
      code === 0 ? resolve(Buffer.concat(chunks)) : reject(new Error(`ffmpeg exit ${code}`)),
    );
  });
}

/** d[i] = motion across boundary (frame i -> i+1), 0..255 scale. */
function frameDiffs(buf: Buffer): number[] {
  const size = AW * AH;
  const n = Math.floor(buf.length / size);
  const out: number[] = [];
  for (let i = 1; i < n; i++) {
    const a = (i - 1) * size;
    const b = i * size;
    let total = 0;
    let blockMax = 0;
    for (let by = 0; by < AH; by += BH) {
      for (let bx = 0; bx < AW; bx += BW) {
        let acc = 0;
        for (let y = by; y < by + BH; y++) {
          const row = y * AW;
          for (let x = bx; x < bx + BW; x++) {
            acc += Math.abs(buf[b + row + x] - buf[a + row + x]);
          }
        }
        total += acc;
        const bm = acc / (BW * BH);
        if (bm > blockMax) blockMax = bm;
      }
    }
    out.push(0.5 * (total / size) + 0.5 * blockMax);
  }
  return out;
}

type Picked = { frame: number; role: "held" | "mid" };
type Seg = { kind: "pause" | "motion"; start: number; end: number; reps: number[] };

/**
 * Punctuated selection via a hysteresis state machine. See file header for the full
 * rationale. d[i] = motion across boundary i->i+1 (length = last). We build a
 * per-frame motion proxy m[f] = max(d[f-1], d[f]) so a frame counts as "in motion"
 * if either bordering transition moves.
 */
function selectPunctuated(
  d: number[],
  last: number,
  pHigh: number,
  lowFrac: number,
  shortMax: number,
  spanPerMid: number,
): { picks: Picked[]; high: number; low: number; segments: Seg[] } {
  const total = last + 1;

  const m: number[] = new Array(total).fill(0);
  for (let f = 0; f <= last; f++) {
    const a = f - 1 >= 0 && f - 1 < d.length ? d[f - 1] : -Infinity;
    const b = f < d.length ? d[f] : -Infinity;
    m[f] = Math.max(a, b);
    if (!isFinite(m[f])) m[f] = 0;
  }

  const sorted = [...m].slice().sort((a, b) => a - b);
  const q = (p: number) => {
    if (sorted.length === 0) return 0;
    const idx = Math.min(sorted.length - 1, Math.max(0, Math.round(p * (sorted.length - 1))));
    return sorted[idx];
  };
  const high = q(pHigh);
  const low = high * lowFrac;
  const peakAll = sorted[sorted.length - 1] ?? 0;

  // DEGENERATE: no frame is clearly "in motion" -> evenly spaced held, no mid.
  if (peakAll <= high * 1.5 || high <= 1e-9) {
    const k = Math.min(8, total);
    const picks: Picked[] = [];
    const seen = new Set<number>();
    for (let i = 0; i < k; i++) {
      const f = Math.round((last * i) / Math.max(1, k - 1));
      if (!seen.has(f)) { seen.add(f); picks.push({ frame: f, role: "held" }); }
    }
    return { picks, high, low, segments: [] };
  }

  // Hysteresis segmentation -> raw alternating blocks.
  const blocks: { kind: "pause" | "motion"; start: number; end: number }[] = [];
  let state: "pause" | "motion" = m[0] >= high ? "motion" : "pause";
  let segStart = 0;
  for (let f = 1; f <= last; f++) {
    if (state === "pause" && m[f] > high) {
      blocks.push({ kind: "pause", start: segStart, end: f - 1 });
      state = "motion"; segStart = f;
    } else if (state === "motion" && m[f] < low) {
      blocks.push({ kind: "motion", start: segStart, end: f - 1 });
      state = "pause"; segStart = f;
    }
  }
  blocks.push({ kind: state, start: segStart, end: last });

  // Representatives per block (duration-adaptive MID count; see header).
  const segments: Seg[] = [];
  for (const b of blocks) {
    if (b.kind === "pause") {
      let rep = b.start, v = Infinity;
      for (let k = b.start; k <= b.end; k++) if (m[k] < v) { v = m[k]; rep = k; }
      segments.push({ kind: "pause", start: b.start, end: b.end, reps: [rep] });
    } else {
      const len = b.end - b.start + 1;
      let reps: number[];
      if (len <= shortMax) {
        let rep = b.start, v = -Infinity;
        for (let k = b.start; k <= b.end; k++) if (m[k] > v) { v = m[k]; rep = k; }
        reps = [rep];
      } else {
        const nn = Math.max(2, Math.ceil(len / spanPerMid));
        const set = new Set<number>();
        for (let i = 0; i < nn; i++) {
          set.add(b.start + Math.round((i * (b.end - b.start)) / (nn - 1)));
        }
        reps = [...set].sort((x, y) => x - y);
      }
      segments.push({ kind: "motion", start: b.start, end: b.end, reps });
    }
  }

  // Roles; force first & last frame to be held anchors.
  const heldSet = new Set<number>([0, last]);
  const midSet = new Set<number>();
  for (const s of segments) {
    if (s.kind === "pause") for (const r of s.reps) heldSet.add(r);
    else for (const r of s.reps) midSet.add(r);
  }

  const picks: Picked[] = [];
  for (const fr of heldSet) picks.push({ frame: fr, role: "held" });
  for (const fr of midSet) if (!heldSet.has(fr)) picks.push({ frame: fr, role: "mid" });
  picks.sort((a, b) => a.frame - b.frame);
  return { picks, high, low, segments };
}

function resolveVideo(explicit: string | undefined, out: string, dir: string): string | undefined {
  if (explicit) {
    if (!fs.existsSync(explicit)) throw new Error(`--video not found: ${explicit}`);
    return explicit;
  }
  const cands = [path.join(path.dirname(out), "video.mp4"), path.join(dir, "out", "video.mp4")];
  for (const c of cands) if (fs.existsSync(c)) return c;
  return undefined;
}

const r3 = (x: number) => Math.round(x * 1000) / 1000;

async function main() {
  const args = process.argv.slice(2);
  const get = (k: string) => {
    const i = args.indexOf(k);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const dir = get("--dir");
  const out = get("--out");
  if (!dir || !out) {
    console.error(
      "usage: --dir <armDir> --out <dir> [--p-high 0.9] [--low-frac 0.5] [--short-max 12] [--span-per-mid 15] [--video <mp4>] [--step N] [--plan]",
    );
    process.exit(1);
  }
  // pHigh: quantile of per-frame motion that defines the "in motion" threshold (rides
  //   the lower edge of real motion). lowFrac: low = lowFrac*high (hysteresis return-
  //   to-pause line; kept high so every true pause is captured = no false negative).
  // shortMax: a motion segment this short (frames) is a discrete event -> 1 peak mid;
  //   longer = silky drift -> ceil(len/spanPerMid) mids spread evenly incl. both ends.
  const pHigh = Math.min(0.99, Math.max(0.5, parseFloat(get("--p-high") ?? "0.9")));
  const lowFrac = Math.min(0.95, Math.max(0.1, parseFloat(get("--low-frac") ?? "0.5")));
  const shortMax = Math.max(2, parseInt(get("--short-max") ?? "12", 10));
  const spanPerMid = Math.max(4, parseInt(get("--span-per-mid") ?? "15", 10));
  const stepRaw = get("--step");
  const plan = args.includes("--plan");
  fs.mkdirSync(out, { recursive: true });

  let video: string | undefined;
  if (!stepRaw) video = resolveVideo(get("--video"), out, dir);

  let diffs: number[] = [];
  if (!stepRaw && video) {
    console.error(`[strip] analyzing motion from ${video} ...`);
    const buf = await extractGray(video);
    diffs = frameDiffs(buf);
    console.error(`[strip] ${diffs.length + 1} mp4 frames analyzed`);
  }

  let composition: Awaited<ReturnType<typeof selectComposition>> | undefined;
  let serveUrl = "";
  if (!plan) {
    const entry = path.join(dir, "index.tsx");
    console.error(`[strip] bundling ${entry} ...`);
    serveUrl = await bundle({ entryPoint: entry });
    composition = await selectComposition({ serveUrl, id: "piece" });
    console.error(
      `[strip] comp ${composition.width}x${composition.height} ${composition.durationInFrames}f @${composition.fps}fps`,
    );
  }

  // picks: frame + optional role (role only in punctuated mode).
  let picks: { frame: number; role?: "held" | "mid" }[] = [];
  let manifest: Record<string, unknown> = {};

  if (stepRaw) {
    if (!composition) throw new Error("--step requires rendering (no --plan)");
    const step = parseInt(stepRaw, 10);
    const last = composition.durationInFrames - 1;
    const fr: number[] = [];
    for (let f = 0; f <= last; f += step) fr.push(f);
    if (fr[fr.length - 1] !== last) fr.push(last);
    picks = fr.map((f) => ({ frame: f }));
    manifest = { mode: "uniform-step", step, frames: fr };
    console.error(`[strip] mode=uniform-step step=${step} -> ${fr.length} frames`);
  } else if (!video) {
    if (!composition) throw new Error("uniform fallback requires rendering (no --plan)");
    console.error(
      "[strip] WARN: no video.mp4 found (looked beside --out and in <dir>/out; pass --video). " +
        "FALLING BACK TO UNIFORM SAMPLING — the critic MATERIAL wording must be the legacy " +
        '"sampled evenly" version, NOT the PUNCTUATED one.',
    );
    const last = composition.durationInFrames - 1;
    const budget = 24;
    const fr: number[] = [];
    for (let i = 0; i < budget; i++) fr.push(Math.round((last * i) / (budget - 1)));
    const dedup = [...new Set(fr)].sort((a, b) => a - b);
    picks = dedup.map((f) => ({ frame: f }));
    manifest = { mode: "uniform-fallback", budget, frames: dedup };
  } else {
    const last = composition ? composition.durationInFrames - 1 : diffs.length; // plan mode: trust mp4
    const { picks: sel, high, low, segments } = selectPunctuated(diffs, last, pHigh, lowFrac, shortMax, spanPerMid);
    picks = sel;
    const held = sel.filter((p) => p.role === "held").length;
    const mid = sel.filter((p) => p.role === "mid").length;
    manifest = {
      mode: "punctuated",
      video,
      pHigh,
      lowFrac,
      shortMax,
      spanPerMid,
      high: r3(high),
      low: r3(low),
      counts: { held, mid },
      segments,
      frames: sel.map((p) => ({
        frame: p.frame,
        role: p.role,
        dIn: p.frame > 0 && p.frame - 1 < diffs.length ? r3(diffs[p.frame - 1]) : 0,
        dOut: p.frame < diffs.length ? r3(diffs[p.frame]) : 0,
      })),
    };
    console.error(
      `[strip] mode=punctuated pHigh=${pHigh} high=${r3(high)} low=${r3(low)} -> ` +
        `${sel.length} frames (${held} held + ${mid} mid): ` +
        sel.map((p) => `${p.frame}${p.role === "mid" ? "*" : ""}`).join(","),
    );
  }

  if (!plan && composition) {
    // Clean stale seq-*.png from a prior render: frame indices (and therefore
    // filenames) shift between runs, so overwrite-by-name does NOT remove old frames
    // — a re-render would otherwise leave a mix of old+new frames in the dir.
    for (const f of fs.readdirSync(out)) {
      if (/^seq-.*\.png$/.test(f)) fs.rmSync(path.join(out, f));
    }
    let idx = 0;
    for (const p of picks) {
      const seq = String(idx).padStart(2, "0");
      const role = p.role ? `_${p.role}` : "";
      const png = path.join(out, `seq-${seq}_f${String(p.frame).padStart(3, "0")}${role}.png`);
      await renderStill({ composition, serveUrl, output: png, frame: p.frame, overwrite: true, chromiumOptions: { gl: "angle" } });
      console.error(`[strip] ${seq} f${p.frame}${p.role ? " " + p.role : ""} -> ${png}`);
      idx++;
    }
  }

  fs.writeFileSync(path.join(out, "strip-manifest.json"), JSON.stringify(manifest, null, 2));
  console.error(`[strip] DONE${plan ? " (plan only)" : ""}: ${picks.length} frames -> ${out}`);
}

main().catch((e) => {
  console.error("[strip] FAILED:", e);
  process.exit(1);
});
