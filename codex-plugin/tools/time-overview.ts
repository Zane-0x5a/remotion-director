/**
 * time-overview.ts — 时间总览 (time overview) + 定态帧 (settle frames) for one rendered video.
 *
 * Everything is measured from the rendered pixels only (ffmpeg decode, no Remotion bundle):
 *   - overview-1.png … overview-K.png (always numbered, even when K = 1): uniform-time thumbnails
 *     (every 0.25 s; 0.5 s past 20 s), 12 per row, with a light-red change-heat tint; under each row
 *     a two-scale motion curve (blue = frame-to-frame change, orange = 0.5 s window, i.e. slow
 *     motion; worst 8x8 block on a 4x mean-pooled raster so per-frame grain averages out) over
 *     segment bands (grey = whole frame still, light orange = slow motion, white = motion); and the
 *     phenomena on the same time axis: blank/black stretches, flash rate, holds that keep changing
 *     (measured at native resolution, red box) and short-lived content (a region that appears and is
 *     gone within 1 s, orange box). At most 4 rows per page so no page is silently downscaled by
 *     the reader.
 *   - settle-NN_tSS.SSs.png: native-resolution frames at the moments the picture comes to rest:
 *     the calmest frame of every whole-frame hold >= 0.5 s; the calmest moments of every motion /
 *     slow-motion stretch > 1.5 s (at most one per 2 s, at least 1 s apart); the last frame. Picked
 *     from the same motion analysis and extracted frame-accurately in one ffmpeg pass.
 *   - overview.json (schemaVersion 1): every number above.
 *
 * This is a port of the Python prototypes time_overview_v3.py + settle_frames.py. Every threshold,
 * rounding and tie rule follows them: Python round() is half-to-even, numpy std is the population
 * std computed with numpy's pairwise summation, argsort is stable.
 * Times in the json and file names are on the video's own time axis (from_s + frame / fps); the
 * `frame` of a settle frame is its index in the analysed frame sequence (= the video frame when
 * from_s = 0 on a constant-rate video). The analysis decode keeps ffmpeg's constant-rate raw output
 * exactly as the prototype did, so a seek that lands between frames can repeat the first frame; the
 * extraction resolves every analysis index to the real decoded frame, so the PNGs are the frames
 * the numbers were measured on.
 *
 * Usage: node "<PLUGIN_ROOT>/tools/codex-launcher.mjs" time-overview --workspace <workspace> --video <mp4> --out <dir>
 *        [--title T] [--from S] [--to S] [--cell S]
 *   --from/--to: analyse only that stretch (seconds); --cell: seconds per thumbnail.
 *   Node built-ins only (ffmpeg + ffprobe on PATH). The launcher stages it under the workspace
 *   together with render-arm.ts, which imports it.
 * Library: import { buildReview } from "./time-overview"; await buildReview(video, outDir, opts).
 */
import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import { deflateSync } from "node:zlib";

// ===================================================================== public types

export type SegmentKind = "still" | "slow" | "motion";
/** [x0, y0, x1, y1] in percent of the frame. */
export type BoxPct = [number, number, number, number];

export interface BlankStretch { from_s: number; to_s: number; dur_s: number; kind: "black" | "flat" }
export interface HoldStillChanging { from_s: number; to_s: number; frames_changing_pct: number; median_px: number; box_pct: BoxPct }
export interface ShortLivedContent { from_s: number; to_s: number; held_s: number; box_pct: BoxPct; blocks: number }
export interface Segment { from_s: number; to_s: number; dur_s: number; kind: SegmentKind }
export interface SettleFrame { file: string; frame: number; t_s: number }

export interface OverviewData {
  schemaVersion: 1;
  video: string;
  width: number;
  height: number;
  fps: number;
  from_s: number;
  duration_s: number;
  cell_s: number;
  first_content_s: number;
  final_hold_s: number;
  blank_stretches: BlankStretch[];
  max_flashes_per_s: number;
  hold_still_changing: HoldStillChanging[];
  short_lived_content: ShortLivedContent[];
  segments: Segment[];
  pages: string[];
  settle_frames: SettleFrame[];
}

export interface ReviewOptions {
  /** Shown at the start of each page header (default: none). */
  title?: string;
  /** Start of the analysed stretch, seconds (default 0). */
  from?: number;
  /** End of the analysed stretch, seconds (default: end of video). */
  to?: number;
  /** Seconds per thumbnail (default 0.25 s, or 0.5 s when the stretch is longer than 20 s). */
  cell?: number;
}

export interface ReviewResult extends OverviewData {
  outDir: string;
  jsonPath: string;
  pagePaths: string[];
  settlePaths: string[];
}

// ===================================================================== Python number semantics

const TIE_TAIL = "5" + "0".repeat(29);

/** Python format(x, `.${d}f`): correctly rounded from the exact binary value, ties to even. */
function pyFixed(x: number, d: number): string {
  const s = x.toFixed(d); // exact rounding, but ties go away from zero
  const long = x.toFixed(d + 30);
  const cut = long.length - 30;
  if (long.slice(cut) === TIE_TAIL) {
    let head = long.slice(0, cut);
    if (head.endsWith(".")) head = head.slice(0, -1);
    if ((head.charCodeAt(head.length - 1) - 48) % 2 === 0) return head;
  }
  return s;
}

/** Python round(x, 2). */
const r2 = (x: number): number => Number(pyFixed(x, 2));

/** Python int(round(x)): half to even. */
function pyRound(x: number): number {
  const f = Math.floor(x);
  const d = x - f;
  if (d < 0.5) return f;
  if (d > 0.5) return f + 1;
  return f % 2 === 0 ? f : f + 1;
}

/** Python f'{x}' for a float (repr), as passed to ffmpeg -ss/-to by the prototype. */
function pyFloatStr(x: number): string {
  return Number.isInteger(x) && Math.abs(x) < 1e16 ? x.toFixed(1) : String(x);
}

/** Python format(x, 'g'). */
function pyG(x: number): string {
  if (x === 0 || !Number.isFinite(x)) return String(x);
  const [mant, expStr] = x.toExponential(5).split("e");
  const exp = Number(expStr);
  const strip = (s: string) => (s.includes(".") ? s.replace(/0+$/, "").replace(/\.$/, "") : s);
  if (exp < -4 || exp >= 6) return `${strip(mant)}e${exp < 0 ? "-" : "+"}${String(Math.abs(exp)).padStart(2, "0")}`;
  return strip(x.toFixed(5 - exp));
}

/** numpy's float64 add.reduce over a contiguous run (pairwise summation, 8-way unrolled blocks of <= 128). */
function pairwiseSum(a: Float64Array, off: number, n: number): number {
  if (n < 8) {
    let res = 0;
    for (let i = 0; i < n; i++) res += a[off + i];
    return res;
  }
  if (n <= 128) {
    let r0 = a[off], r1 = a[off + 1], r2_ = a[off + 2], r3 = a[off + 3];
    let r4 = a[off + 4], r5 = a[off + 5], r6 = a[off + 6], r7 = a[off + 7];
    const lim = n - (n % 8);
    let i = 8;
    for (; i < lim; i += 8) {
      const o = off + i;
      r0 += a[o]; r1 += a[o + 1]; r2_ += a[o + 2]; r3 += a[o + 3];
      r4 += a[o + 4]; r5 += a[o + 5]; r6 += a[o + 6]; r7 += a[o + 7];
    }
    let res = ((r0 + r1) + (r2_ + r3)) + ((r4 + r5) + (r6 + r7));
    for (; i < n; i++) res += a[off + i];
    return res;
  }
  let n2 = Math.floor(n / 2);
  n2 -= n2 % 8;
  return pairwiseSum(a, off, n2) + pairwiseSum(a, off + n2, n - n2);
}

/** numpy .std() (ddof=0) of integer samples, same float64 operation order as numpy. */
function npStd(vals: ArrayLike<number>, scratch: Float64Array): number {
  const n = vals.length;
  let s = 0;
  for (let i = 0; i < n; i++) s += vals[i]; // integer sum: exact in any order
  const mean = s / n;
  for (let i = 0; i < n; i++) {
    const x = vals[i] - mean;
    scratch[i] = x * x;
  }
  return Math.sqrt(pairwiseSum(scratch, 0, n) / n);
}

/** numpy np.median of integers. */
function npMedian(vals: number[]): number {
  const s = [...vals].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// ===================================================================== ffmpeg

function capture(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    const out: Buffer[] = [];
    let err = "";
    p.stdout.on("data", (c: Buffer) => out.push(c));
    p.stderr.on("data", (c: Buffer) => (err += c.toString()));
    p.on("error", (e) => reject(new Error(`${cmd} could not start (${e.message}); is it on PATH?`)));
    p.on("close", (code) =>
      code === 0 ? resolve(Buffer.concat(out).toString("utf8")) : reject(new Error(`${cmd} exit ${code}: ${err.trim()}`)),
    );
  });
}

/** Run ffmpeg writing raw frames to stdout; hand each complete frame (a fresh Buffer) to onFrame. */
function streamFrames(args: string[], frameSize: number, onFrame: (f: Buffer) => void): Promise<number> {
  return new Promise((resolve, reject) => {
    const ff = spawn("ffmpeg", args, { stdio: ["ignore", "pipe", "pipe"] });
    let cur = Buffer.allocUnsafe(frameSize);
    let fill = 0;
    let count = 0;
    let err = "";
    let failed: unknown = null;
    ff.stdout.on("data", (chunk: Buffer) => {
      if (failed) return;
      try {
        let off = 0;
        while (off < chunk.length) {
          const take = Math.min(frameSize - fill, chunk.length - off);
          chunk.copy(cur, fill, off, off + take);
          fill += take;
          off += take;
          if (fill === frameSize) {
            onFrame(cur);
            count++;
            cur = Buffer.allocUnsafe(frameSize);
            fill = 0;
          }
        }
      } catch (e) {
        failed = e;
        ff.kill();
      }
    });
    ff.stderr.on("data", (c: Buffer) => {
      err += c.toString();
      process.stderr.write(c);
    });
    ff.on("error", (e) => reject(new Error(`ffmpeg could not start (${e.message}); is it on PATH?`)));
    ff.on("close", (code) => {
      if (failed) reject(failed);
      else if (code !== 0) reject(new Error(`ffmpeg exit ${code}: ${err.trim()}`));
      else resolve(count);
    });
  });
}

/** The prototype's seek: -ss a [-to b] as input options, `-to` only when b is truthy. */
function seekArgs(a: number, b: number | undefined): string[] {
  return ["-ss", pyFloatStr(a), ...(b ? ["-to", pyFloatStr(b)] : [])];
}

function rawArgs(video: string, seek: string[], w: number, h: number, fmt: "gray" | "rgb24"): string[] {
  return ["-v", "error", ...seek, "-i", video, "-vf", `scale=${w}:${h}:flags=area`, "-f", "rawvideo", "-pix_fmt", fmt, "-"];
}

async function probe(video: string): Promise<{ W: number; H: number; fps: number }> {
  const out = await capture("ffprobe", [
    "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,r_frame_rate", "-of", "json", video,
  ]);
  const s = JSON.parse(out).streams?.[0];
  if (!s) throw new Error(`ffprobe found no video stream in ${video}`);
  const [num, den] = String(s.r_frame_rate).split("/").map((v) => parseInt(v, 10));
  const fps = num / den;
  if (!(fps > 0) || !Number.isFinite(fps)) throw new Error(`unusable r_frame_rate ${s.r_frame_rate} in ${video}`);
  return { W: s.width, H: s.height, fps };
}

// ===================================================================== motion measure

const P = 4; // mean-pooling factor
const BY = 8; // block grid
const BX = 8;

/** 4x4 pooled sums (= 16 * numpy's pooled mean, exact). */
function pool(g: Uint8Array, AW: number, PW: number, PH: number): Uint16Array {
  const out = new Uint16Array(PW * PH);
  for (let py = 0; py < PH; py++) {
    for (let px = 0; px < PW; px++) {
      let s = 0;
      for (let i = 0; i < P; i++) {
        const o = (py * P + i) * AW + px * P;
        s += g[o] + g[o + 1] + g[o + 2] + g[o + 3];
      }
      out[py * PW + px] = s;
    }
  }
  return out;
}

/** Worst 8x8-block mean |a - b| on the pooled raster (same float64 result as the numpy expression). */
function blockMax(a: Uint16Array, b: Uint16Array, PW: number, ch: number, cw: number): number {
  const cnt = ch * cw;
  let best = -Infinity;
  for (let by = 0; by < BY; by++) {
    for (let bx = 0; bx < BX; bx++) {
      let s = 0;
      for (let i = 0; i < ch; i++) {
        const o = (by * ch + i) * PW + bx * cw;
        for (let j = 0; j < cw; j++) {
          const d = a[o + j] - b[o + j];
          s += d < 0 ? -d : d;
        }
      }
      const m = s / 16 / cnt;
      if (m > best) best = m;
    }
  }
  return best;
}

type K = "H" | "S" | "M"; // hold (still) / slow motion / motion
type Seg = [number, number, K]; // first frame, last frame (inclusive), kind
const KIND: Record<K, SegmentKind> = { H: "still", S: "slow", M: "motion" };

/** Hysteresis on frame-to-frame (fast) and 0.5 s window (slow) change, then runs of equal kind. */
function segmentsOf(fast: Float64Array, slow: Float64Array, n: number): Seg[] {
  const segs: Seg[] = [];
  let cur: K = "H";
  for (let t = 0; t < n; t++) {
    const f = fast[t];
    const s = slow[t];
    if (cur === "M") cur = f >= 0.6 ? "M" : s >= 0.1 ? "S" : "H";
    else if (cur === "S") cur = f >= 1.0 ? "M" : s >= 0.1 ? "S" : "H";
    else cur = f >= 1.0 ? "M" : s >= 0.15 ? "S" : "H";
    const last = segs[segs.length - 1];
    if (last && last[2] === cur) last[1] = t;
    else segs.push([t, t, cur]);
  }
  return segs;
}

/** Fill the edges the way the prototypes do: slow[:win] = slow[win] (or 0); fast[0] = fast0. */
function edgeFilled(fastRaw: Float64Array, slowRaw: Float64Array, n: number, win: number, fast0: number) {
  const fast = fastRaw.slice(0, n);
  const slow = slowRaw.slice(0, n);
  if (n > 0) fast[0] = fast0;
  const fillS = n > win ? slowRaw[win] : 0;
  for (let t = 0; t < Math.min(win, n); t++) slow[t] = fillS;
  return { fast, slow };
}

// ===================================================================== settle frames (settle_frames.py)

function pickSettle(fastRaw: Float64Array, slowRaw: Float64Array, n: number, fps: number, win: number): number[] {
  const { fast, slow } = edgeFilled(fastRaw, slowRaw, n, win, n > 1 ? fastRaw[1] : 0);
  const segs = segmentsOf(fast, slow, n); // settle_frames.py does not merge short segments
  const picks: number[] = [];
  for (const [a, b, k] of segs) {
    const L = b - a + 1;
    if (k === "H" && L >= fps * 0.5) {
      let best = a;
      for (let t = a + 1; t <= b; t++) if (fast[t] < fast[best]) best = t; // np.argmin: first minimum
      picks.push(best);
    } else if (k !== "H" && L > fps * 1.5) {
      const want = Math.max(1, Math.ceil(L / (fps * 2)));
      const order: number[] = [];
      for (let t = a; t <= b; t++) order.push(t);
      order.sort((x, y) => fast[x] - fast[y] || x - y); // argsort(kind='stable')
      const chosen: number[] = [];
      for (const t of order) {
        if (chosen.every((c) => Math.abs(t - c) >= fps)) chosen.push(t);
        if (chosen.length >= want) break;
      }
      picks.push(...chosen);
    }
  }
  picks.push(n - 1);
  const uniq = [...new Set(picks)].sort((x, y) => x - y);
  const dedup: number[] = [];
  for (const t of uniq) {
    if (!dedup.length || t - dedup[dedup.length - 1] >= fps * 0.5 || t === n - 1) {
      if (dedup.length && t === n - 1 && t - dedup[dedup.length - 1] < fps * 0.5) dedup[dedup.length - 1] = t;
      else dedup.push(t);
    }
  }
  return dedup;
}

// ===================================================================== drawing: canvas, font, PNG

type RGB = readonly [number, number, number];

class Canvas {
  readonly px: Uint8Array;
  constructor(readonly w: number, readonly h: number, bg: RGB) {
    this.px = new Uint8Array(w * h * 3);
    for (let i = 0; i < w * h; i++) {
      this.px[i * 3] = bg[0];
      this.px[i * 3 + 1] = bg[1];
      this.px[i * 3 + 2] = bg[2];
    }
  }

  /** Filled rectangle, both corners inclusive (PIL semantics, coordinates truncated). */
  fillRect(x0: number, y0: number, x1: number, y1: number, c: RGB): void {
    const xa = Math.max(0, Math.trunc(x0)), xb = Math.min(this.w - 1, Math.trunc(x1));
    const ya = Math.max(0, Math.trunc(y0)), yb = Math.min(this.h - 1, Math.trunc(y1));
    for (let y = ya; y <= yb; y++) {
      for (let x = xa; x <= xb; x++) {
        const o = (y * this.w + x) * 3;
        this.px[o] = c[0];
        this.px[o + 1] = c[1];
        this.px[o + 2] = c[2];
      }
    }
  }

  /** Outline drawn inward from the corners, `width` px thick (PIL ImageDraw.rectangle outline). */
  outlineRect(x0: number, y0: number, x1: number, y1: number, c: RGB, width = 1): void {
    const xa = Math.trunc(x0), ya = Math.trunc(y0), xb = Math.trunc(x1), yb = Math.trunc(y1);
    for (let i = 0; i < width; i++) {
      this.fillRect(xa, ya + i, xb, ya + i, c);
      this.fillRect(xa, yb - i, xb, yb - i, c);
      this.fillRect(xa + i, ya, xa + i, yb, c);
      this.fillRect(xb - i, ya, xb - i, yb, c);
    }
  }

  blit(src: Uint8Array, sw: number, sh: number, dx: number, dy: number): void {
    for (let y = 0; y < sh; y++) {
      const ty = dy + y;
      if (ty < 0 || ty >= this.h) continue;
      for (let x = 0; x < sw; x++) {
        const tx = dx + x;
        if (tx < 0 || tx >= this.w) continue;
        const s = (y * sw + x) * 3, o = (ty * this.w + tx) * 3;
        this.px[o] = src[s];
        this.px[o + 1] = src[s + 1];
        this.px[o + 2] = src[s + 2];
      }
    }
  }

  /** Line of the given width: a width x width brush stamped along the segment. */
  line(x0: number, y0: number, x1: number, y1: number, c: RGB, width: number): void {
    const dx = x1 - x0, dy = y1 - y0;
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) * 2));
    for (let i = 0; i <= steps; i++) {
      const x = Math.round(x0 + (dx * i) / steps - width / 2);
      const y = Math.round(y0 + (dy * i) / steps - width / 2);
      this.fillRect(x, y, x + width - 1, y + width - 1, c);
    }
  }

  polyline(pts: [number, number][], c: RGB, width: number): void {
    for (let i = 1; i < pts.length; i++) this.line(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], c, width);
  }

  text(x: number, y: number, s: string, c: RGB, maxRight = Infinity): void {
    let cx = Math.round(x);
    const cy = Math.round(y);
    for (const ch of s) {
      if (cx + GLYPH_W * SCALE > maxRight) break;
      const rows = glyph(ch);
      for (let r = 0; r < GLYPH_H; r++) {
        for (let col = 0; col < GLYPH_W; col++) {
          if (rows[r] & (1 << (GLYPH_W - 1 - col))) {
            this.fillRect(cx + col * SCALE, cy + r * SCALE, cx + col * SCALE + SCALE - 1, cy + r * SCALE + SCALE - 1, c);
          }
        }
      }
      cx += ADVANCE;
    }
  }
}

// Own 5x7 bitmap font, LCD/terminal style, printable ASCII 32..126 in order. Each glyph is 7 rows
// top to bottom of 5 columns ('#' = lit). Descender letters (g p q y) are raised one row so their
// bowls stay closed inside the 7 rows; squashed 2-row bowls read as 's' at this size.
const GLYPHS: string[] = [
  /*   */ "..... ..... ..... ..... ..... ..... .....",
  /* ! */ "..#.. ..#.. ..#.. ..#.. ..#.. ..... ..#..",
  /* " */ ".#.#. .#.#. .#.#. ..... ..... ..... .....",
  /* # */ ".#.#. .#.#. ##### .#.#. ##### .#.#. .#.#.",
  /* $ */ "..#.. .#### #.#.. .###. ..#.# ####. ..#..",
  /* % */ "##... ##..# ...#. ..#.. .#... #..## ...##",
  /* & */ ".##.. #..#. #.#.. .#... #.#.# #..#. .##.#",
  /* ' */ "..#.. ..#.. .#... ..... ..... ..... .....",
  /* ( */ "...#. ..#.. .#... .#... .#... ..#.. ...#.",
  /* ) */ ".#... ..#.. ...#. ...#. ...#. ..#.. .#...",
  /* * */ "..... ..#.. #.#.# .###. #.#.# ..#.. .....",
  /* + */ "..... ..#.. ..#.. ##### ..#.. ..#.. .....",
  /* , */ "..... ..... ..... ..... .##.. ..#.. .#...",
  /* - */ "..... ..... ..... ##### ..... ..... .....",
  /* . */ "..... ..... ..... ..... ..... .##.. .##..",
  /* / */ "..... ....# ...#. ..#.. .#... #.... .....",
  /* 0 */ ".###. #...# #..## #.#.# ##..# #...# .###.",
  /* 1 */ "..#.. .##.. ..#.. ..#.. ..#.. ..#.. .###.",
  /* 2 */ ".###. #...# ....# ...#. ..#.. .#... #####",
  /* 3 */ "##### ...#. ..#.. ...#. ....# #...# .###.",
  /* 4 */ "...#. ..##. .#.#. #..#. ##### ...#. ...#.",
  /* 5 */ "##### #.... ####. ....# ....# #...# .###.",
  /* 6 */ "..##. .#... #.... ####. #...# #...# .###.",
  /* 7 */ "##### ....# ...#. ..#.. .#... .#... .#...",
  /* 8 */ ".###. #...# #...# .###. #...# #...# .###.",
  /* 9 */ ".###. #...# #...# .#### ....# ...#. .##..",
  /* : */ "..... .##.. .##.. ..... .##.. .##.. .....",
  /* ; */ "..... .##.. .##.. ..... .##.. ..#.. .#...",
  /* < */ "...#. ..#.. .#... #.... .#... ..#.. ...#.",
  /* = */ "..... ..... ##### ..... ##### ..... .....",
  /* > */ ".#... ..#.. ...#. ....# ...#. ..#.. .#...",
  /* ? */ ".###. #...# ....# ...#. ..#.. ..... ..#..",
  /* @ */ ".###. #...# ....# .##.# #.#.# #.#.# .###.",
  /* A */ ".###. #...# #...# ##### #...# #...# #...#",
  /* B */ "####. #...# #...# ####. #...# #...# ####.",
  /* C */ ".###. #...# #.... #.... #.... #...# .###.",
  /* D */ "###.. #..#. #...# #...# #...# #..#. ###..",
  /* E */ "##### #.... #.... ####. #.... #.... #####",
  /* F */ "##### #.... #.... ####. #.... #.... #....",
  /* G */ ".###. #...# #.... #.### #...# #...# .####",
  /* H */ "#...# #...# #...# ##### #...# #...# #...#",
  /* I */ ".###. ..#.. ..#.. ..#.. ..#.. ..#.. .###.",
  /* J */ "..### ...#. ...#. ...#. ...#. #..#. .##..",
  /* K */ "#...# #..#. #.#.. ##... #.#.. #..#. #...#",
  /* L */ "#.... #.... #.... #.... #.... #.... #####",
  /* M */ "#...# ##.## #.#.# #.#.# #...# #...# #...#",
  /* N */ "#...# #...# ##..# #.#.# #..## #...# #...#",
  /* O */ ".###. #...# #...# #...# #...# #...# .###.",
  /* P */ "####. #...# #...# ####. #.... #.... #....",
  /* Q */ ".###. #...# #...# #...# #.#.# #..#. .##.#",
  /* R */ "####. #...# #...# ####. #.#.. #..#. #...#",
  /* S */ ".#### #.... #.... .###. ....# ....# ####.",
  /* T */ "##### ..#.. ..#.. ..#.. ..#.. ..#.. ..#..",
  /* U */ "#...# #...# #...# #...# #...# #...# .###.",
  /* V */ "#...# #...# #...# #...# #...# .#.#. ..#..",
  /* W */ "#...# #...# #...# #.#.# #.#.# #.#.# .#.#.",
  /* X */ "#...# #...# .#.#. ..#.. .#.#. #...# #...#",
  /* Y */ "#...# #...# .#.#. ..#.. ..#.. ..#.. ..#..",
  /* Z */ "##### ....# ...#. ..#.. .#... #.... #####",
  /* [ */ ".###. .#... .#... .#... .#... .#... .###.",
  /* \ */ "..... #.... .#... ..#.. ...#. ....# .....",
  /* ] */ ".###. ...#. ...#. ...#. ...#. ...#. .###.",
  /* ^ */ "..#.. .#.#. #...# ..... ..... ..... .....",
  /* _ */ "..... ..... ..... ..... ..... ..... #####",
  /* ` */ ".#... ..#.. ...#. ..... ..... ..... .....",
  /* a */ "..... ..... .###. ....# .#### #...# .####",
  /* b */ "#.... #.... #.##. ##..# #...# #...# ####.",
  /* c */ "..... ..... .###. #.... #.... #...# .###.",
  /* d */ "....# ....# .##.# #..## #...# #...# .####",
  /* e */ "..... ..... .###. #...# ##### #.... .###.",
  /* f */ "..##. .#..# .#... ###.. .#... .#... .#...",
  /* g */ "..... .#### #...# #...# .#### ....# .###.",
  /* h */ "#.... #.... #.##. ##..# #...# #...# #...#",
  /* i */ "..#.. ..... .##.. ..#.. ..#.. ..#.. .###.",
  /* j */ "...#. ..... ..##. ...#. ...#. #..#. .##..",
  /* k */ "#.... #.... #..#. #.#.. ##... #.#.. #..#.",
  /* l */ ".##.. ..#.. ..#.. ..#.. ..#.. ..#.. .###.",
  /* m */ "..... ..... ##.#. #.#.# #.#.# #...# #...#",
  /* n */ "..... ..... #.##. ##..# #...# #...# #...#",
  /* o */ "..... ..... .###. #...# #...# #...# .###.",
  /* p */ "..... ####. #...# #...# ####. #.... #....",
  /* q */ "..... .#### #...# #...# .#### ....# ....#",
  /* r */ "..... ..... #.##. ##..# #.... #.... #....",
  /* s */ "..... ..... .#### #.... .###. ....# ####.",
  /* t */ ".#... .#... ###.. .#... .#... .#..# ..##.",
  /* u */ "..... ..... #...# #...# #...# #..## .##.#",
  /* v */ "..... ..... #...# #...# #...# .#.#. ..#..",
  /* w */ "..... ..... #...# #...# #.#.# #.#.# .#.#.",
  /* x */ "..... ..... #...# .#.#. ..#.. .#.#. #...#",
  /* y */ "..... #...# #...# #...# .#### ....# .###.",
  /* z */ "..... ..... ##### ...#. ..#.. .#... #####",
  /* { */ "...#. ..#.. ..#.. .#... ..#.. ..#.. ...#.",
  /* | */ "..#.. ..#.. ..#.. ..#.. ..#.. ..#.. ..#..",
  /* } */ ".#... ..#.. ..#.. ...#. ..#.. ..#.. .#...",
  /* ~ */ "..... ..... .#... #.#.# ...#. ..... .....",
];
const GLYPH_W = 5;
const GLYPH_H = 7;
const SCALE = 2;
const ADVANCE = (GLYPH_W + 1) * SCALE; // 12 px per character
const FONT: Uint8Array[] = GLYPHS.map((g, i) => {
  const rows = g.split(" ");
  if (rows.length !== GLYPH_H || rows.some((r) => r.length !== GLYPH_W || /[^#.]/.test(r))) {
    throw new Error(`font glyph ${i + 32} is malformed`);
  }
  return Uint8Array.from(rows, (r) => parseInt(r.replace(/#/g, "1").replace(/\./g, "0"), 2));
});
if (FONT.length !== 95) throw new Error("font must cover ASCII 32..126");
const NBSP = " "; // non-breaking space: kept together when wrapping, drawn as a space

function glyph(ch: string): Uint8Array {
  const code = ch === NBSP ? 32 : ch.charCodeAt(0);
  return FONT[code >= 32 && code <= 126 ? code - 32 : 31]; // anything else draws as '?'
}

const textWidth = (s: string): number => (s.length ? s.length * ADVANCE - SCALE : 0);
const keep = (s: string): string => s.replace(/ /g, NBSP);

/** Greedy word wrap at ordinary spaces; NBSP-joined units stay whole unless longer than a line. */
function wrapText(text: string, maxChars: number): string[] {
  const lines: string[] = [];
  let cur = "";
  const place = (word: string) => {
    // word longer than a line: break at its NBSPs, then hard-break what is still too long
    let piece = "";
    for (const sub of word.split(NBSP)) {
      let w = sub;
      const cand = piece ? piece + NBSP + w : w;
      if (cand.length <= maxChars) { piece = cand; continue; }
      if (piece) lines.push(piece);
      while (w.length > maxChars) { lines.push(w.slice(0, maxChars)); w = w.slice(maxChars); }
      piece = w;
    }
    cur = piece;
  };
  for (const m of text.matchAll(/ *[^ ]+/g)) {
    const tok = m[0];
    const word = tok.trimStart();
    if (cur && cur.length + tok.length <= maxChars) { cur += tok; continue; }
    if (cur) lines.push(cur);
    cur = "";
    if (word.length <= maxChars) cur = word;
    else place(word);
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [""];
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Uint8Array): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crc]);
}

/** Minimal PNG writer: 8-bit RGB, filter type 0 on every row, zlib deflate. */
function encodePng(c: Canvas): Buffer {
  const stride = c.w * 3;
  const raw = Buffer.alloc((stride + 1) * c.h);
  for (let y = 0; y < c.h; y++) {
    raw[y * (stride + 1)] = 0;
    raw.set(c.px.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(c.w, 0);
  ihdr.writeUInt32BE(c.h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type RGB
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw, { level: 6 })),
    pngChunk("IEND", new Uint8Array(0)),
  ]);
}

/** Pillow-style BILINEAR resize (triangle filter widened by the reduction factor), single channel. */
function resizeBilinear(src: Uint8Array, sw: number, sh: number, dw: number, dh: number): Uint8Array {
  const coeffs = (inSize: number, outSize: number) => {
    const scale = inSize / outSize;
    const fscale = Math.max(scale, 1);
    return Array.from({ length: outSize }, (_, o) => {
      const center = (o + 0.5) * scale;
      const lo = Math.max(Math.trunc(center - fscale + 0.5), 0);
      const hi = Math.min(Math.trunc(center + fscale + 0.5), inSize);
      const w: number[] = [];
      let tot = 0;
      for (let x = lo; x < hi; x++) {
        const v = Math.max(0, 1 - Math.abs((x - center + 0.5) / fscale));
        w.push(v);
        tot += v;
      }
      return { lo, w: w.map((v) => (tot > 0 ? v / tot : 0)) };
    });
  };
  const clamp8 = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));
  const hx = coeffs(sw, dw);
  const vy = coeffs(sh, dh);
  const tmp = new Uint8Array(dw * sh);
  for (let y = 0; y < sh; y++) {
    for (let o = 0; o < dw; o++) {
      const { lo, w } = hx[o];
      let s = 0;
      for (let i = 0; i < w.length; i++) s += w[i] * src[y * sw + lo + i];
      tmp[y * dw + o] = clamp8(s);
    }
  }
  const out = new Uint8Array(dw * dh);
  for (let o = 0; o < dh; o++) {
    const { lo, w } = vy[o];
    for (let x = 0; x < dw; x++) {
      let s = 0;
      for (let i = 0; i < w.length; i++) s += w[i] * tmp[(lo + i) * dw + x];
      out[o * dw + x] = clamp8(s);
    }
  }
  return out;
}

// ===================================================================== main analysis

const PER_ROW = 12;
const ROWS_PER_PAGE = 4;
const GAP = 4; // between thumbnails
const CH = 46; // curve band height
const LAB = 16; // cell-label band height (glyphs are 7 * SCALE = 14 px tall)
const LINE_H = 20;
const BG: RGB = [250, 250, 251];
const INK: RGB = [20, 20, 26];
const LEGEND_INK: RGB = [90, 94, 105];
const CELL_INK: RGB = [70, 74, 85];
const SEG_INK: RGB = [60, 64, 75];
const BAND: Record<K, RGB | null> = { H: [226, 228, 233], S: [252, 232, 214], M: null };
const BAND_OUTLINE: RGB = [200, 203, 210];
const SLOW_CURVE: RGB = [222, 120, 30];
const FAST_CURVE: RGB = [49, 64, 212];
const TINT: RGB = [235, 40, 40];
const RED_BOX: RGB = [220, 30, 30];
const ORANGE_BOX: RGB = [240, 140, 0];

const log = (msg: string) => console.error(`[overview] ${msg}`);

export async function buildReview(video: string, outDir: string, opts: ReviewOptions = {}): Promise<ReviewResult> {
  const t0 = opts.from ?? 0;
  const t1 = opts.to;
  const title = opts.title ?? "";
  if (!Number.isFinite(t0) || t0 < 0) throw new Error(`from must be a number >= 0 (got ${opts.from})`);
  if (t1 !== undefined && !Number.isFinite(t1)) throw new Error(`to must be a number (got ${opts.to})`);
  if (opts.cell !== undefined && !(opts.cell >= 0)) throw new Error(`cell must be a positive number (got ${opts.cell})`);
  if (!fs.existsSync(video)) throw new Error(`video not found: ${video}`);
  const absOut = path.resolve(outDir);
  fs.mkdirSync(absOut, { recursive: true });
  const clock = Date.now();
  const lap = () => `${((Date.now() - clock) / 1000).toFixed(1)}s`;

  const { W, H, fps } = await probe(video);
  const portrait = H > W;
  const [AW, AH] = portrait ? [270, 480] : [480, 270]; // analysis raster
  const [TW, TH] = portrait ? [90, 160] : [160, 90]; // thumbnail size
  const seek = seekArgs(t0, t1);

  // ---- decode, in parallel: gray analysis raster, rgb thumbnails, and a frame map.
  // The raw decodes keep ffmpeg's default constant-rate output (as the prototype did), which can
  // duplicate or drop a frame, e.g. the first frame after an input seek that lands between frames.
  // The map pass runs the same pipeline but writes the filter-input frame number N into the
  // pixels, so analysis index t -> real frame frameMap[t], used for the frame-accurate extraction.
  const G: Buffer[] = [];
  const C: Buffer[] = [];
  const frameMap: number[] = [];
  await Promise.all([
    streamFrames(rawArgs(video, seek, AW, AH, "gray"), AW * AH, (f) => G.push(f)),
    streamFrames(rawArgs(video, seek, TW, TH, "rgb24"), TW * TH * 3, (f) => C.push(f)),
    streamFrames(
      ["-v", "error", ...seek, "-i", video, "-vf",
        "scale=4:2:flags=area,format=gray,crop=4:1:0:0,geq=lum='mod(floor(N/pow(256\\,X))\\,256)'",
        "-f", "rawvideo", "-pix_fmt", "gray", "-"],
      4, (f) => frameMap.push(f[0] + 256 * f[1] + 65536 * f[2] + 16777216 * f[3]),
    ),
  ]);
  const nG = G.length; // settle_frames.py works on its own decode's length
  const n = Math.min(nG, C.length);
  if (n === 0) throw new Error(`no frames decoded from ${video} (from ${t0}${t1 ? ` to ${t1}` : ""})`);
  if (frameMap.length !== nG) throw new Error(`frame map has ${frameMap.length} frames, analysis has ${nG}`);
  log(`${W}x${H} @ ${pyG(fps)}fps, ${n} frames decoded (${lap()})`);
  const dur = n / fps;
  const cell = opts.cell || (dur <= 20 ? 0.25 : 0.5);
  const step = fps * cell;
  const T = (f: number) => t0 + f / fps;
  const NPX = AW * AH;

  // ---- motion: 4x mean-pooled, worst 8x8 block; fast = frame to frame, slow = 0.5 s window / win
  const PW = Math.floor(AW / P), PH = Math.floor(AH / P);
  const bch = Math.floor(PH / BY), bcw = Math.floor(PW / BX);
  const Gc = G.map((g) => pool(g, AW, PW, PH));
  const win = pyRound(fps * 0.5);
  if (win < 1) throw new Error(`fps ${fps} too low for the 0.5 s window`);
  const fastRaw = new Float64Array(nG);
  const slowRaw = new Float64Array(nG);
  for (let t = 1; t < nG; t++) {
    fastRaw[t] = blockMax(Gc[t], Gc[t - 1], PW, bch, bcw);
    if (t >= win) slowRaw[t] = blockMax(Gc[t], Gc[t - win], PW, bch, bcw) / win;
  }
  const { fast, slow } = edgeFilled(fastRaw, slowRaw, n, win, 0); // the overview leaves fast[0] = 0
  const minlen = Math.max(4, Math.trunc(fps * 0.25));
  const segs: Seg[] = [];
  for (const sg of segmentsOf(fast, slow, n)) {
    const last = segs[segs.length - 1];
    if (last && (sg[1] - sg[0] + 1 < minlen || last[2] === sg[2])) last[1] = sg[1];
    else segs.push([sg[0], sg[1], sg[2]]);
  }

  // ---- blank / black stretches, first content, final hold, flashes
  const scratch = new Float64Array(NPX);
  const blank: boolean[] = [];
  const frameSum: number[] = [];
  for (let t = 0; t < n; t++) {
    const g = G[t];
    let s = 0;
    for (let i = 0; i < NPX; i++) s += g[i];
    frameSum.push(s);
    blank.push(npStd(g, scratch) < 3.0);
  }
  const blanks: BlankStretch[] = [];
  let b0: number | null = null;
  for (let t = 0; t <= n; t++) {
    const on = t < n && blank[t];
    if (on && b0 === null) b0 = t;
    if (!on && b0 !== null) {
      if (t - b0 >= 3) {
        let s = 0;
        for (let f = b0; f < t; f++) s += frameSum[f];
        blanks.push({ from_s: r2(T(b0)), to_s: r2(T(t)), dur_s: r2((t - b0) / fps), kind: s / ((t - b0) * NPX) < 20 ? "black" : "flat" });
      }
      b0 = null;
    }
  }
  let firstContent = n;
  for (let t = 0; t < n; t++) if (!blank[t]) { firstContent = t; break; }
  const lastSeg = segs[segs.length - 1];
  const finalHold = lastSeg && lastSeg[2] === "H" ? lastSeg[1] - lastSeg[0] + 1 : 0;
  const lum = frameSum.map((s) => s / NPX / 255);
  const ext: number[] = [];
  let lastSign: number | null = null;
  for (let t = 1; t < n; t++) { // a flash is a pair of opposing luminance swings >= 0.1
    const d = lum[t] - lum[Math.max(0, t - 3)];
    if (Math.abs(d) >= 0.1) {
      const sg = d > 0 ? 1 : -1;
      if (lastSign !== sg) { ext.push(t); lastSign = sg; }
    }
  }
  let flashMax = 0;
  for (let t = 0; t < n; t++) {
    let c = 0;
    for (const e of ext) if (t <= e && e < t + fps) c++;
    flashMax = Math.max(flashMax, Math.floor(c / 2));
  }

  // ---- holds that keep changing, at native resolution (streamed: two frames + per-pixel counters)
  type HoldHit = HoldStillChanging & { fa: number; fb: number };
  const holdChange: HoldHit[] = [];
  for (const [a, b, k] of segs) {
    if (k !== "H" || b - a + 1 < fps * 0.5) continue;
    const size = W * H;
    const perPix = new Uint32Array(size);
    const counts: number[] = [];
    let prev: Buffer | null = null;
    const frames = await streamFrames(rawArgs(video, seekArgs(T(a), T(b + 1)), W, H, "gray"), size, (f) => {
      const pv = prev;
      if (pv) {
        let c = 0;
        for (let p = 0; p < size; p++) {
          const d = f[p] - pv[p];
          if (d > 24 || d < -24) { c++; perPix[p]++; }
        }
        counts.push(c);
      }
      prev = f;
    });
    if (frames < 3) continue;
    const nd = counts.length;
    let busy = 0;
    for (const c of counts) if (c >= 50) busy++;
    const frac = busy / nd;
    const med = npMedian(counts);
    if (frac >= 0.5 && med >= 50) {
      let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
      const scan = (hit: (p: number) => boolean) => {
        for (let y = 0; y < H; y++) {
          for (let x = 0; x < W; x++) {
            if (!hit(y * W + x)) continue;
            if (x < x0) x0 = x;
            if (x > x1) x1 = x;
            if (y < y0) y0 = y;
            if (y > y1) y1 = y;
          }
        }
      };
      scan((p) => perPix[p] / nd >= 0.25); // persistent change
      if (x1 < 0) scan((p) => perPix[p] > 0); // else anything that changed at all
      holdChange.push({
        from_s: r2(T(a)), to_s: r2(T(b + 1)), frames_changing_pct: Math.trunc(frac * 100), median_px: Math.trunc(med),
        box_pct: [Math.trunc((x0 / W) * 100), Math.trunc((y0 / H) * 100), Math.ceil(((x1 + 1) / W) * 100), Math.ceil(((y1 + 1) / H) * 100)],
        fa: a, fb: b,
      });
    }
  }
  log(`motion, blanks and ${holdChange.length} changing hold(s) measured (${lap()})`);

  // ---- short-lived content: a 15 px block whose content holds still for 0.15-1.0 s, differs from what
  // was there before and from what comes after, and has visible detail (text, marks)
  const BS = 15;
  const gy = Math.floor(AH / BS), gx = Math.floor(AW / BS), NB = gy * gx;
  const bchg = new Uint8Array(Math.max(0, n - 1) * NB); // [t-1][block]: changed between t-1 and t
  for (let t = 1; t < n; t++) {
    const A = G[t], B = G[t - 1];
    for (let yy = 0; yy < gy; yy++) {
      for (let xx = 0; xx < gx; xx++) {
        let s = 0;
        for (let i = 0; i < BS; i++) {
          const o = (yy * BS + i) * AW + xx * BS;
          for (let j = 0; j < BS; j++) {
            const d = A[o + j] - B[o + j];
            s += d < 0 ? -d : d;
          }
        }
        bchg[(t - 1) * NB + yy * gx + xx] = s / (BS * BS) > 1.5 ? 1 : 0;
      }
    }
  }
  const blockVals = (t: number, yy: number, xx: number): Int16Array => {
    const v = new Int16Array(BS * BS);
    const g = G[t];
    for (let i = 0; i < BS; i++) for (let j = 0; j < BS; j++) v[i * BS + j] = g[(yy * BS + i) * AW + xx * BS + j];
    return v;
  };
  const meanAbsDiff = (u: Int16Array, v: Int16Array) => {
    let s = 0;
    for (let i = 0; i < u.length; i++) s += Math.abs(u[i] - v[i]);
    return s / u.length;
  };
  const blockScratch = new Float64Array(BS * BS);
  const short: [number, number, number, number][] = []; // a, b, xx, yy
  for (let yy = 0; yy < gy; yy++) {
    for (let xx = 0; xx < gx; xx++) {
      const changed = (t: number) => t === 0 || bchg[(t - 1) * NB + yy * gx + xx] === 1;
      const runs: [number, number][] = [];
      let t = 0;
      while (t < n) {
        if (!changed(t)) {
          const s0 = t;
          while (t < n && !changed(t)) t++;
          runs.push([s0, t - 1]);
        } else t++;
      }
      for (let i = 1; i < runs.length - 1; i++) {
        const [a, b] = runs[i];
        const L = b - a + 1;
        if (!(fps * 0.15 <= L && L <= fps * 1.0)) continue;
        const S = blockVals(a, yy, xx);
        if (npStd(S, blockScratch) < 12) continue;
        const Pv = blockVals(runs[i - 1][1], yy, xx);
        const Qv = blockVals(runs[i + 1][0], yy, xx);
        if (meanAbsDiff(S, Pv) > 6 && meanAbsDiff(S, Qv) > 6) short.push([a, b, xx, yy]);
      }
    }
  }
  short.sort((p, q) => p[0] - q[0] || p[1] - q[1] || p[2] - q[2] || p[3] - q[3]);
  const groups: { a: number; b: number; cells: [number, number][] }[] = [];
  for (const [a, b, xx, yy] of short) { // merge blocks whose short interval matches within 3 frames
    const g = groups.find(
      (g) => Math.abs(g.a - a) <= 3 && Math.abs(g.b - b) <= 3 && Math.min(...g.cells.map(([x, y]) => Math.abs(xx - x) + Math.abs(yy - y))) <= 2,
    );
    if (g) g.cells.push([xx, yy]);
    else groups.push({ a, b, cells: [[xx, yy]] });
  }
  type ShortHit = ShortLivedContent & { fa: number; fb: number };
  let shortLived: ShortHit[] = [];
  const calmLimit = Math.max(2, 0.03 * NB);
  for (const g of [...groups].sort((p, q) => q.cells.length - p.cells.length)) {
    if (g.cells.length < 2) continue;
    // only when the rest of the frame is calm: inside busy motion (particles, counters, water) it is just motion
    const own = new Uint8Array(NB);
    for (const [x, y] of g.cells) own[y * gx + x] = 1;
    const lo = Math.max(0, g.a - 1), hi = Math.min(g.b, n - 1);
    let calmFrames = 0;
    for (let f = lo; f < hi; f++) {
      let c = 0;
      for (let k = 0; k < NB; k++) if (bchg[f * NB + k] && !own[k]) c++;
      if (c <= calmLimit) calmFrames++;
    }
    const calm = hi > lo ? calmFrames / (hi - lo) : 1.0;
    if (calm < 0.7) continue;
    const xs = g.cells.map(([x]) => x), ys = g.cells.map(([, y]) => y);
    shortLived.push({
      from_s: r2(T(g.a)), to_s: r2(T(g.b + 1)), held_s: r2((g.b - g.a + 1) / fps),
      box_pct: [
        Math.trunc((Math.min(...xs) / gx) * 100), Math.trunc((Math.min(...ys) / gy) * 100),
        Math.ceil(((Math.max(...xs) + 1) / gx) * 100), Math.ceil(((Math.max(...ys) + 1) / gy) * 100),
      ],
      blocks: g.cells.length, fa: g.a, fb: g.b,
    });
  }
  shortLived = shortLived.slice(0, 12).sort((p, q) => p.from_s - q.from_s);
  log(`${shortLived.length} short-lived region(s) (${lap()})`);

  // ---- settle frames: same motion analysis, settle_frames.py rules, one frame-accurate ffmpeg pass
  for (const f of fs.readdirSync(absOut)) {
    if (/^(settle-.*|overview-\d+)\.png$/.test(f)) fs.rmSync(path.join(absOut, f)); // names shift between runs
  }
  const settleIdx = pickSettle(fastRaw, slowRaw, nG, fps, win);
  const settle: SettleFrame[] = settleIdx.map((t, i) => ({
    file: `settle-${String(i + 1).padStart(2, "0")}_t${pyFixed(T(t), 2).padStart(5, "0")}s.png`,
    frame: t,
    t_s: r2(T(t)),
  }));
  const src = settleIdx.map((t) => frameMap[t]);
  const uniqSrc = [...new Set(src)].sort((a, b) => a - b);
  const tmpOf = (j: number) => path.join(absOut, `settle-tmp-${String(j + 1).padStart(4, "0")}.png`);
  await capture("ffmpeg", [
    "-v", "error", "-y", ...seek, "-i", video, "-vf", `select=${uniqSrc.map((m) => `eq(n\\,${m})`).join("+")}`,
    "-fps_mode", "passthrough", path.join(absOut, "settle-tmp-%04d.png"),
  ]);
  const written = fs.readdirSync(absOut).filter((f) => f.startsWith("settle-tmp-")).length;
  if (written !== uniqSrc.length) throw new Error(`ffmpeg wrote ${written} settle frame(s), expected ${uniqSrc.length}`);
  settle.forEach((s, i) => fs.copyFileSync(tmpOf(uniqSrc.indexOf(src[i])), path.join(absOut, s.file)));
  uniqSrc.forEach((_, j) => fs.rmSync(tmpOf(j)));
  log(`${settle.length} settle frame(s) extracted (${lap()})`);

  // ---- draw
  const f2 = (x: number) => pyFixed(x, 2);
  const xw = PER_ROW * (TW + GAP) - GAP;
  const imgW = xw + 40;
  const rowH = TH + LAB + CH + 18;
  const kTotal = Math.ceil(n / step);
  const rows = Math.ceil(kTotal / PER_ROW);
  const pageCount = Math.max(1, Math.ceil(rows / ROWS_PER_PAGE));
  const maxChars = Math.floor((imgW - 40 + SCALE) / ADVANCE);

  const body: { text: string; ink: RGB }[] = [];
  const blankTxt = blanks.length
    ? blanks.map((b) => keep(`${b.kind} ${f2(b.from_s)}-${f2(b.to_s)}s (${f2(b.dur_s)}s)`)).join("; ")
    : "none";
  body.push({
    text: `${keep(`first content ${f2(r2(T(firstContent)))}s`)}   ${keep(`final hold ${f2(r2(finalHold / fps))}s`)}   ` +
      `${keep(`max flashes ${flashMax}/s`)}   blank: ${blankTxt}`,
    ink: INK,
  });
  if (holdChange.length) {
    body.push({
      text: `${keep("hold still changing (red box):")} ` +
        holdChange.map((h) => keep(`${f2(h.from_s)}-${f2(h.to_s)}s, ${h.frames_changing_pct}% of frames, median ${h.median_px} px`)).join("; "),
      ink: INK,
    });
  }
  if (shortLived.length) {
    body.push({
      text: `${keep("short-lived (orange box, gone within 1 s):")} ` +
        shortLived.slice(0, 6).map((s) => keep(`${f2(s.from_s)}-${f2(s.to_s)}s held ${f2(s.held_s)}s`)).join("; ") +
        (shortLived.length > 6 ? "; ..." : ""),
      ink: INK,
    });
  }
  body.push({
    text: [
      "light red = where the picture changes in this cell",
      "curve: blue = frame-to-frame change, orange = 0.5 s window (slow motion)",
      "band: grey = whole frame still, light orange = slow motion, white = motion",
    ].map(keep).join("   "),
    ink: LEGEND_INK,
  });
  const bodyLines = body.flatMap(({ text, ink }) => wrapText(text, maxChars).map((l) => ({ l, ink })));

  const boxesFor = (f0: number, f1: number): [BoxPct, RGB][] => [
    ...holdChange.filter((h) => h.fa <= f1 && h.fb >= f0).map((h): [BoxPct, RGB] => [h.box_pct, RED_BOX]),
    ...shortLived.filter((s) => s.fa <= f1 && s.fb >= f0).map((s): [BoxPct, RGB] => [s.box_pct, ORANGE_BOX]),
  ];
  const span = t0 || t1 ? `${f2(t0)}-${f2(T(n))}s` : `${f2(dur)}s`;
  const pageNames: string[] = [];
  const chg = new Uint8Array(NPX);
  const carry: { seg: Seg | null } = { seg: null }; // segment label moved to the next row
  for (let p = 0; p < pageCount; p++) {
    const p0 = p * ROWS_PER_PAGE;
    const pageRows = Math.max(0, Math.min(rows, p0 + ROWS_PER_PAGE) - p0);
    const header =
      (title ? `${title}  ` : "") +
      `${W}x${H}  ${keep(`${span} @ ${pyG(fps)}fps`)}   ${keep(`cell ${pyG(cell)} s, row ${pyG(cell * PER_ROW)} s`)}` +
      (pageCount > 1 ? `   ${keep(`page ${p + 1}/${pageCount}`)}` : "");
    const headLines = wrapText(header, maxChars);
    const bodyY = 8 + LINE_H * headLines.length + 4;
    const top = bodyY + LINE_H * bodyLines.length + 6;
    const img = new Canvas(imgW, top + pageRows * rowH + 10, BG);
    headLines.forEach((l, i) => img.text(20, 8 + LINE_H * i, l, INK));
    bodyLines.forEach(({ l, ink }, i) => img.text(20, bodyY + LINE_H * i, l, ink));

    for (let r = p0; r < p0 + pageRows; r++) {
      const yr = top + (r - p0) * rowH;
      for (let c = 0; c < PER_ROW; c++) {
        const k = r * PER_ROW + c;
        if (k >= kTotal) break;
        const x0 = 20 + c * (TW + GAP);
        const f0 = Math.min(n - 1, pyRound(k * step));
        const f1 = Math.min(n - 1, pyRound((k + 1) * step) - 1);
        const th = new Canvas(TW, TH, BG);
        th.px.set(C[f0]);
        if (f1 > f0) { // light-red tint where the picture changes inside this cell
          chg.fill(0);
          let changedPx = 0;
          for (let t = f0; t < f1; t++) {
            const ga = G[t], gb = G[t + 1];
            for (let i = 0; i < NPX; i++) {
              if (!chg[i]) {
                const d = gb[i] - ga[i];
                if (d > 10 || d < -10) { chg[i] = 255; changedPx++; }
              }
            }
          }
          if (changedPx / NPX <= 0.4) { // skip when the whole frame moves (camera, water)
            const m = resizeBilinear(chg, AW, AH, TW, TH);
            for (let i = 0; i < TW * TH; i++) {
              const al = Math.trunc(m[i] * 0.3);
              if (!al) continue;
              for (let ch3 = 0; ch3 < 3; ch3++) {
                const v = th.px[i * 3 + ch3] * (255 - al) + TINT[ch3] * al + 128;
                th.px[i * 3 + ch3] = ((v >> 8) + v) >> 8;
              }
            }
          }
        }
        for (const [[bx0, by0, bx1, by1], col] of boxesFor(f0, Math.max(f0, f1))) {
          th.outlineRect((bx0 * TW) / 100, (by0 * TH) / 100, (bx1 * TW) / 100 - 1, (by1 * TH) / 100 - 1, col, 2);
        }
        img.blit(th.px, TW, TH, x0, yr + LAB);
        img.text(x0, yr + 1, `${f2(t0 + k * cell)}s`, CELL_INK);
      }
      const y0 = yr + LAB + TH + 6;
      const fa = pyRound(r * PER_ROW * step);
      const fb = Math.min(n, pyRound((r + 1) * PER_ROW * step));
      const X = (f: number) => 20 + ((f - fa) / (PER_ROW * step)) * xw;
      const inRow = segs.filter(([a, b]) => b >= fa && a < fb);
      for (const [a, b, k] of inRow) {
        const col = BAND[k];
        if (col) img.fillRect(X(Math.max(a, fa)), y0, X(Math.min(b + 1, fb)), y0 + CH, col);
      }
      img.outlineRect(20, y0, 20 + xw, y0 + CH, BAND_OUTLINE, 1);
      if (fb - fa > 1) {
        const curve = (v: Float64Array, scale: number): [number, number][] => {
          const pts: [number, number][] = [];
          for (let f = fa; f < fb; f++) pts.push([X(f), y0 + CH - Math.min(1, Math.sqrt(v[f] / scale)) * CH]);
          return pts;
        };
        img.polyline(curve(slow, 6), SLOW_CURVE, 2);
        img.polyline(curve(fast, 40), FAST_CURVE, 2);
      }
      // segment labels go on top of the curves with a 1 px halo in the band colour, so a curve
      // crossing the label cannot cut through the letters; each label stops before the next one,
      // falling back to the bare duration when the kind name does not fit. A segment that starts
      // too close to the row end for even the duration is labelled at the start of the next row,
      // where it continues, instead of being cut to a fragment.
      const labelled = [
        ...(carry.seg && carry.seg[1] >= fa ? [{ seg: carry.seg, x: X(fa) + 3 }] : []),
        ...inRow.filter(([a, b]) => a >= fa && (b - a + 1) / fps >= 0.5).map((seg) => ({ seg, x: X(seg[0]) + 3 })),
      ];
      carry.seg = null;
      labelled.forEach(({ seg: [a, b, k], x }, i) => {
        const limit = i + 1 < labelled.length ? labelled[i + 1].x - 6 : 20 + xw - 2;
        const d = pyFixed((b - a + 1) / fps, 1);
        const full = `${KIND[k]} ${d}s`;
        if (textWidth(`${d}s`) > limit - x && b >= fb && i === labelled.length - 1 && a >= fa) {
          carry.seg = [a, b, k];
          return;
        }
        const label = textWidth(full) <= limit - x ? full : `${d}s`;
        const halo = BAND[k] ?? BG;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) if (dx || dy) img.text(x + dx, y0 + 3 + dy, label, halo, limit + dx);
        }
        img.text(x, y0 + 3, label, SEG_INK, limit);
      });
    }
    const name = `overview-${p + 1}.png`;
    fs.writeFileSync(path.join(absOut, name), encodePng(img));
    pageNames.push(name);
  }
  log(`${pageNames.length} page(s) drawn (${lap()})`);

  const strip = <T extends { fa: number; fb: number }>(L: T[]) => L.map(({ fa: _a, fb: _b, ...rest }) => rest);
  const data: OverviewData = {
    schemaVersion: 1,
    video: path.basename(video),
    width: W,
    height: H,
    fps,
    from_s: t0,
    duration_s: r2(dur),
    cell_s: cell,
    first_content_s: r2(T(firstContent)),
    final_hold_s: r2(finalHold / fps),
    blank_stretches: blanks,
    max_flashes_per_s: flashMax,
    hold_still_changing: strip(holdChange),
    short_lived_content: strip(shortLived),
    segments: segs.map(([a, b, k]) => ({ from_s: r2(T(a)), to_s: r2(T(b + 1)), dur_s: r2((b - a + 1) / fps), kind: KIND[k] })),
    pages: pageNames,
    settle_frames: settle,
  };
  const jsonPath = path.join(absOut, "overview.json");
  fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2) + "\n");
  return {
    ...data,
    outDir: absOut,
    jsonPath,
    pagePaths: pageNames.map((f) => path.join(absOut, f)),
    settlePaths: settle.map((s) => path.join(absOut, s.file)),
  };
}

// ===================================================================== CLI

function isMain(): boolean {
  const argv1 = process.argv[1];
  if (!argv1) return false;
  let a = import.meta.url;
  let b = pathToFileURL(path.resolve(argv1)).href;
  if (process.platform === "win32") { a = a.toLowerCase(); b = b.toLowerCase(); }
  return a === b;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const get = (k: string) => {
    const i = args.indexOf(k);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const num = (k: string) => {
    const v = get(k);
    if (v === undefined) return undefined;
    const x = Number(v);
    if (!Number.isFinite(x)) throw new Error(`${k} expects a number of seconds, got "${v}"`);
    return x;
  };
  const video = get("--video");
  const out = get("--out");
  if (!video || !out) {
    console.error("usage: codex-launcher.mjs time-overview --workspace <workspace> --video <mp4> --out <dir> [--title T] [--from S] [--to S] [--cell S]");
    process.exit(1);
  }
  const started = Date.now();
  const r = await buildReview(video, out, { title: get("--title"), from: num("--from"), to: num("--to"), cell: num("--cell") });
  const hold = r.hold_still_changing.map((h) => `${h.from_s}-${h.to_s}s ${h.frames_changing_pct}% median ${h.median_px}px`);
  const short = r.short_lived_content.map((s) => `${s.from_s}s held ${s.held_s}s (${s.blocks} blocks)`);
  const blank = r.blank_stretches.map((b) => `${b.kind} ${b.from_s}-${b.to_s}s`);
  console.log(`overview: ${r.jsonPath}`);
  console.log(`pages: ${r.pages.join(", ")}`);
  console.log(`settle: ${r.settle_frames.map((s) => s.file).join(", ")}`);
  console.log(`hold still changing: ${hold.join("; ") || "none"} | short-lived: ${short.join("; ") || "none"} | ` +
    `blank: ${blank.join("; ") || "none"} | final hold ${r.final_hold_s}s | max flashes ${r.max_flashes_per_s}/s`);
  log(`DONE in ${((Date.now() - started) / 1000).toFixed(1)}s -> ${r.outDir}`);
}

if (isMain()) {
  main().catch((e) => {
    console.error("[overview] FAILED:", e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
