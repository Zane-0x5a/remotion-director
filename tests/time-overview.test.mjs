import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const hasFfmpeg = spawnSync('ffmpeg', ['-version'], { encoding: 'utf8' }).status === 0;

function pngSize(file) {
  const b = readFileSync(file);
  assert.equal(b.subarray(1, 4).toString('latin1'), 'PNG', `${file} is a PNG`);
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
}

test('time overview reads a black stretch, a still hold and motion off the pixels', { skip: !hasFfmpeg && 'ffmpeg not available' }, () => {
  const root = mkdtempSync(join(tmpdir(), 'remotion-director-overview-'));
  try {
    const video = join(root, 'video.mp4');
    // 1 s black, 1.5 s static bars, 1.5 s moving test pattern; 320x180 @ 30 fps.
    const made = spawnSync('ffmpeg', ['-v', 'error', '-y',
      '-f', 'lavfi', '-i', 'color=c=black:s=320x180:r=30:d=1',
      '-f', 'lavfi', '-i', 'smptebars=s=320x180:r=30:d=1.5',
      '-f', 'lavfi', '-i', 'testsrc2=s=320x180:r=30:d=1.5',
      '-filter_complex', '[0:v][1:v][2:v]concat=n=3:v=1[v]', '-map', '[v]',
      '-pix_fmt', 'yuv420p', '-c:v', 'libx264', video], { encoding: 'utf8' });
    assert.equal(made.status, 0, made.stderr);
    const out = join(root, 'review');
    const run = spawnSync(process.execPath, [join(ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs'), join(ROOT, 'tools', 'time-overview.ts'), '--video', video, '--out', out], { encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr);

    const data = JSON.parse(readFileSync(join(out, 'overview.json'), 'utf8'));
    assert.equal(data.schemaVersion, 1);
    assert.equal(data.width, 320);
    assert.equal(data.height, 180);
    assert.ok(Math.abs(data.duration_s - 4) < 0.1, `duration ${data.duration_s}`);
    const black = data.blank_stretches.find((b) => b.kind === 'black');
    assert.ok(black && black.from_s < 0.1 && Math.abs(black.to_s - 1) < 0.15, `black stretch ${JSON.stringify(data.blank_stretches)}`);
    assert.ok(data.first_content_s > 0.85 && data.first_content_s < 1.15, `first content ${data.first_content_s}`);
    // The 0.5 s motion window still sees the black-to-bars cut until ~1.5 s, so the hold reads from there.
    const still = data.segments.find((s) => s.kind === 'still' && s.from_s > 0.8 && s.from_s < 1.6 && s.dur_s >= 0.9);
    assert.ok(still, `a still hold on the bars: ${JSON.stringify(data.segments)}`);
    assert.ok(data.segments.some((s) => s.kind === 'motion' && s.from_s > 2.2), `motion on the moving pattern: ${JSON.stringify(data.segments)}`);

    assert.ok(data.pages.length >= 1);
    for (const page of data.pages) {
      assert.match(page, /^overview-\d+\.png$/);
      assert.ok(pngSize(join(out, page)).width > 300);
    }
    assert.ok(data.settle_frames.length >= 2);
    for (const frame of data.settle_frames) {
      assert.match(frame.file, /^settle-\d{2}_t\d{2}\.\d{2}s\.png$/);
      assert.deepEqual(pngSize(join(out, frame.file)), { width: 320, height: 180 }, 'settle frames are native resolution');
    }
    assert.ok(data.settle_frames.some((f) => f.t_s > 1 && f.t_s < 2.5), 'one settle frame on the still hold');
    assert.ok(existsSync(join(out, data.settle_frames.at(-1).file)));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
