/**
 * render-retry.ts — when a render ran the machine out of memory, render again with
 * fewer Chrome tabs.
 *
 * Every tab Remotion opens holds its own copy of the piece (a three.js scene keeps
 * its geometry, textures and shadow maps in every tab). Several draws rendering at
 * once, or another app's render beside them, can exhaust the machine's memory; then
 * Chrome or FFmpeg dies, on Windows often as 0xC0000142 (a process that could not
 * start). Fewer tabs need less memory, so render-arm retries such a render with half
 * the tabs, down to MIN_TABS, and gives up with a hint after that.
 */

/** Remotion's own default for renderMedia({ concurrency: null }): half the CPU threads, at most 8. */
export function defaultTabs(cpuThreads: number): number {
  return Math.round(Math.min(8, Math.max(1, cpuThreads / 2)));
}

const MIN_TABS = 2;

/** The next, smaller tab count to retry with, or null when there is none worth trying. */
export function fewerTabs(tabs: number): number | null {
  return tabs > MIN_TABS ? Math.max(MIN_TABS, Math.floor(tabs / 2)) : null;
}

// 3221225794 = 0xC0000142 (STATUS_DLL_INIT_FAILED): Windows could not start the
// process, which under memory pressure is how FFmpeg dies. The rest are Chrome
// running out of memory or its tab being killed.
const OUT_OF_MEMORY = /3221225794|0xC0000142|out of memory|ENOMEM|Page crashed|Target closed|Session closed/i;

/** Whether a render error looks like the machine ran out of memory, not like a bug in the piece. */
export function looksOutOfMemory(error: unknown): boolean {
  const text = error instanceof Error ? `${error.message}\n${error.stack ?? ""}` : String(error);
  return OUT_OF_MEMORY.test(text);
}

/** The first line of an error, for a one-line log. */
export function firstLine(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  return text.split("\n", 1)[0].trim();
}
