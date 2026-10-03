/**
 * gpu-preference.ts — run the render's Chrome on the high-performance GPU (Windows).
 *
 * On a machine with an integrated and a discrete GPU, Windows starts an app on the
 * power-saving GPU unless the app has its own entry under Settings > System > Display >
 * Graphics. Remotion's Chrome is a private chrome-headless-shell.exe inside the workspace,
 * so without an entry the whole render runs on the integrated GPU. Neither `gl: "angle"`
 * nor a page asking for powerPreference "high-performance" (React Three Fiber's default)
 * moves it: WebGL and WebGPU both stay on the integrated GPU until the entry exists
 * (measured on an Intel UHD + RTX 4060 laptop).
 *
 * preferHighPerformanceGpu(executable) writes that entry before Chrome starts: the same
 * value the Settings page writes, under HKCU, no admin rights. An entry that already holds
 * a GPU preference is the user's own choice and stays as it is. Nothing here fails a
 * render; a registry error comes back as a warning line. Off Windows it does nothing.
 * Library: import { preferHighPerformanceGpu } from "./gpu-preference.ts".
 */
import { spawnSync } from "node:child_process";

const KEY = "HKCU\\Software\\Microsoft\\DirectX\\UserGpuPreferences";
const HIGH_PERFORMANCE = "GpuPreference=2;";

/** The value to store for an entry that currently holds `current` (null = no entry); null = leave it alone. */
export function withHighPerformanceGpu(current: string | null): string | null {
  if (!current?.trim()) return HIGH_PERFORMANCE;
  if (/(?:^|;)\s*GpuPreference=/i.test(current)) return null;
  // Keep the entry's other settings (e.g. AutoHDREnable=…;) and add the preference.
  return current.trim().replace(/;?$/, ";") + HIGH_PERFORMANCE;
}

/** The data of the single value printed by `reg query <key> /v <name>`; null when no value line is found. */
export function regQueryData(stdout: string): string | null {
  for (const line of stdout.split(/\r?\n/)) {
    const m = / {4}REG_[A-Z_]+(?: {4}(.*))?$/.exec(line);
    if (m) return (m[1] ?? "").trim();
  }
  return null;
}

/** Make Windows start `executable` on the high-performance GPU. Returns a line for the render log; null off Windows. */
export function preferHighPerformanceGpu(executable: string): string | null {
  if (process.platform !== "win32") return null;
  const reg = (args: string[]) => spawnSync("reg", args, { encoding: "utf8", windowsHide: true });
  // Exit 1 means no entry yet (or no UserGpuPreferences key at all; `reg add` creates it).
  const query = reg(["query", KEY, "/v", executable]);
  let current: string | null = null;
  if (query.status === 0) {
    current = regQueryData(query.stdout);
    if (current === null) return `GPU: could not read the Windows graphics preference for ${executable}; left it as is`;
  }
  const next = withHighPerformanceGpu(current);
  if (next === null) {
    return /(?:^|;)\s*GpuPreference=2(?:;|$)/i.test(current ?? "")
      ? `GPU: high performance (Windows graphics preference for ${executable})`
      : `GPU: kept the Windows graphics preference already set for ${executable} (${current})`;
  }
  const add = reg(["add", KEY, "/v", executable, "/t", "REG_SZ", "/d", next, "/f"]);
  if (add.status !== 0) {
    const reason = add.error?.message ?? (add.stderr.trim() || `reg exit ${add.status}`);
    return `GPU: WARNING could not set the Windows graphics preference (${reason}); on a two-GPU machine this render may run on the integrated GPU`;
  }
  return `GPU: set the Windows graphics preference for ${executable} to high performance (listed under Settings > System > Display > Graphics)`;
}
