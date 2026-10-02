import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  COMPAT_MANIFEST,
  PORTABLE_MANIFEST,
  RUNTIME_TOOLS,
  SOURCE,
  compareTrees,
  generatePackage,
  sha,
  validateOutput,
} from '../tools/generate-codex-plugin.mjs';

function temporaryRoot() {
  return mkdtempSync(join(tmpdir(), 'remotion-director-generator-test-'));
}

test('generator emits portable and compatibility manifests with shared metadata', () => {
  const root = temporaryRoot();
  try {
    const output = join(root, 'package');
    generatePackage(output);
    validateOutput(output);
    const portable = JSON.parse(readFileSync(join(output, 'plugin.json'), 'utf8'));
    const compat = JSON.parse(readFileSync(join(output, '.codex-plugin', 'plugin.json'), 'utf8'));
    assert.deepEqual(portable, PORTABLE_MANIFEST);
    assert.deepEqual(compat, COMPAT_MANIFEST);
    assert.equal(portable.$schema, 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json');
    assert.deepEqual(portable.extensions['com.openai'].interface, compat.interface);
    assert.notDeepEqual(portable, compat);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('generator emits one public skill and strips Claude role frontmatter', () => {
  const root = temporaryRoot();
  try {
    const output = join(root, 'package');
    generatePackage(output);
    const skillRoot = join(output, 'skills');
    const skill = readFileSync(join(skillRoot, 'remotion-director', 'SKILL.md'), 'utf8');
    assert.match(skill, /^---\r?\nname: remotion-director\r?\ndescription:/);
    assert.doesNotMatch(skill, /^version:/m);
    assert.doesNotMatch(skill, /CLAUDE_PLUGIN_ROOT|AskUserQuestion|SendMessage|npx\s+tsx|NODE_PATH="/);
    const publicSkills = readdirSync(skillRoot).filter((name) => existsSync(join(skillRoot, name, 'SKILL.md')));
    assert.deepEqual(publicSkills, ['remotion-director']);
    const roles = readdirSync(join(output, 'internal', 'roles')).sort();
    assert.deepEqual(roles, ['aesthetic-critic.md', 'blind-selector.md', 'builder.md', 'direction-lister.md']);
    for (const role of roles.map((name) => name.replace(/\.md$/, ''))) {
      const text = readFileSync(join(output, 'internal', 'roles', `${role}.md`), 'utf8');
      assert.doesNotMatch(text, /^---\r?\n(?:name|description|model|color|tools):/m, role);
      assert.doesNotMatch(text, /^(model|color|tools):/m, role);
    }
    assert.deepEqual(readdirSync(join(output, 'internal', 'skills')), ['critic-loop']);
    const provenance = JSON.parse(readFileSync(join(output, 'SOURCE-PROVENANCE.json'), 'utf8'));
    assert.deepEqual(provenance.output.internalRoles, ['aesthetic-critic', 'blind-selector', 'builder', 'direction-lister']);
    assert.deepEqual(provenance.output.internalSkills, ['critic-loop']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('generator transforms delivery seams without malformed wording', () => {
  const root = temporaryRoot();
  try {
    const output = join(root, 'package');
    generatePackage(output);
    const skill = readFileSync(join(output, 'skills', 'remotion-director', 'SKILL.md'), 'utf8');
    assert.doesNotMatch(skill, /SendMessages?\s+an explicit|return an explicit results/);
    assert.match(skill, /returns an explicit `round/);
    assert.match(skill, /re-renders, and \*\*returns `revision ⟨K⟩ done`/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// Every `NODE_PATH=… npx tsx ".../tools/X.ts"` in the sources must become a
// launcher command; the generic prose rewrites must never swallow one.
test('every source tool command becomes a launcher command, including the time overview', () => {
  const root = temporaryRoot();
  try {
    const output = join(root, 'package');
    generatePackage(output);
    const read = (...parts) => readFileSync(join(output, ...parts), 'utf8');
    const protocol = read('internal', 'skills', 'critic-loop', 'CRITIC-PROTOCOL.md');
    assert.match(protocol, /`node "<PLUGIN_ROOT>\/tools\/codex-launcher\.mjs" time-overview --workspace "<WORKSPACE>" --video <mp4> --out <dir>`/);
    assert.match(protocol, /`node "<PLUGIN_ROOT>\/tools\/codex-launcher\.mjs" render-arm --workspace "<WORKSPACE>" --dir "⟨RUN_DIR⟩" --out "⟨NEXT_OUT_DIR⟩"`/);
    assert.match(protocol, /the Codex launcher command is required/);
    const builder = read('internal', 'roles', 'builder.md');
    assert.match(builder, /`node "<PLUGIN_ROOT>\/tools\/codex-launcher\.mjs" render-arm --workspace "<WORKSPACE>" --dir "<RUN_DIR>" --out "<RUN_DIR>\/out\/r1"`/);
    assert.match(builder, /渲染命令必须使用上面的 Codex launcher/);
    const skill = read('skills', 'remotion-director', 'SKILL.md');
    assert.match(skill, /node "<PLUGIN_ROOT>\/tools\/codex-launcher\.mjs" prepare-environment --workspace "<WORKSPACE>"/);
    assert.match(skill, /the Codex launcher uses it for every render command/);
    // Count: each source command maps to exactly one generated launcher command.
    const sources = [['skills', 'critic-loop', 'CRITIC-PROTOCOL.md'], ['agents', 'builder.md'], ['skills', 'create', 'SKILL.md'], ['skills', 'critic-loop', 'SKILL.md'], ['agents', 'aesthetic-critic.md'], ['agents', 'blind-selector.md']];
    const generated = [protocol, builder, skill, read('internal', 'skills', 'critic-loop', 'SKILL.md'), read('internal', 'roles', 'aesthetic-critic.md'), read('internal', 'roles', 'blind-selector.md')];
    sources.forEach((parts, index) => {
      const sourceCommands = readFileSync(join(SOURCE.skills, '..', ...parts), 'utf8').match(/NODE_PATH="[^"]+"\s+npx\s+tsx\s+"\$\{CLAUDE_PLUGIN_ROOT\}\/tools\/[^"]+\.ts"/g) ?? [];
      const launcherCommands = generated[index].match(/node "<PLUGIN_ROOT>\/tools\/codex-launcher\.mjs" (?:render-arm|time-overview) --workspace/g) ?? [];
      assert.equal(launcherCommands.length, sourceCommands.length, parts.join('/'));
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// The kit change archived the equipment, the tempo pass and the still/strip
// review materials; no generated document may still point at them.
test('generated documents carry no stills, strips, tempo pass or equipment', () => {
  const root = temporaryRoot();
  try {
    const output = join(root, 'package');
    generatePackage(output);
    const stale = /still-|six stills|stills,|\bstrips?\b|strip-manifest|render-strip|--strip-dir|\bheld\b|\btempo\b|tempo-pass|design-brain|design-equipment|equipment|装备|§4|three native crops|Step 4\.5/i;
    const documents = [...walk(output)].filter((file) => /\.(md|json)$/.test(file));
    assert.ok(documents.length >= 8);
    for (const file of documents) assert.doesNotMatch(readFileSync(file, 'utf8'), stale, file);
    const launcherHelp = readFileSync(join(output, 'tools', 'codex-launcher.mjs'), 'utf8').match(/const help = [\s\S]*?;\n/)[0];
    assert.doesNotMatch(launcherHelp, stale);
    assert.doesNotMatch(JSON.stringify(PORTABLE_MANIFEST), /tempo|equipment/i);
    assert.match(PORTABLE_MANIFEST.extensions['com.openai'].interface.longDescription, /亲自打磨/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(path); else yield path;
  }
}

test('host guide maps each role to its ledger command and prepares blind evidence first', () => {
  const root = temporaryRoot();
  try {
    const output = join(root, 'package');
    generatePackage(output);
    const skill = readFileSync(join(output, 'skills', 'remotion-director', 'SKILL.md'), 'utf8');
    assert.match(skill, /`preview` when their r1 preview is ready.*`accept-preview`.*`settled` only after they were picked.*`round-done`.*`revision-done` with `--revision K`/s);
    assert.match(skill, /`accept-canonical`, which verifies `video\.mp4`, its `review\/` \(`overview\.json` schema 1 and every page and settle frame it lists\)/);
    assert.match(skill, /critic delivers verdict text through `record-verdict --review-dir DIR`/);
    assert.match(skill, /Review round 1 requires the picked builder's accepted settled canonical/);
    assert.match(skill, /same-round correction.*`--amend-of ID`.*`--rebuttal-of ID`.*same review dir/s);
    assert.match(skill, /A converged verdict ends the review rounds/);
    assert.match(skill, /`duration-blocked`.*never advances canonical.*record-duration-decision --run-dir "<RUN_DIR>" --report-id ID --decision free\|locked/s);
    assert.match(skill, /init-run --polish critic\|user/);
    assert.match(skill, /In user polish no critic is registered and no verdict is recorded/);
    assert.match(skill, /record-user-note --run-dir "<RUN_DIR>" --revision K --note-file FILE/);
    assert.match(skill, /show the user the settled canonical video before anything goes to the builder/);
    assert.match(skill, /beyond the choice goes into `--reason` verbatim and to the picked builder with the pick follow-up, under the fixed line from Step 3; it is not a user-polish note/);
    assert.match(skill, /If the user keeps more than one draw, record the extras with `--also-keep draw-M`.*carry the picked one through self-check and polish first, then run `next-kept --run-dir "<RUN_DIR>" --key draw-M` for each kept draw in turn \(it self-checks, settles and is polished the same way.*never ask the user to choose only one\./s);
    assert.match(skill, /end the others, except draws the user also kept, which wait idle for `next-kept`/);
    assert.match(skill, /end every other builder the user did not keep, without self-check/);
    assert.match(skill, /USER-NOTES\.md/);
    assert.match(skill, /switch-polish --run-dir "<RUN_DIR>" --mode user/);
    assert.match(skill, /prepare-selection --run-dir/);
    assert.match(skill, /each an anonymous copy of the verified preview's `video\.mp4` and `review\/`/);
    assert.match(skill, /record-selection.*consuming that preparation/);
    assert.match(skill, /By default the user picks.*only each accepted preview's `video.mp4`.*record-user-selection --run-dir/s);
    assert.match(skill, /no overviews, frames, directions, design docs or notes/);
    assert.match(skill, /record-redraw --run-dir/);
    assert.match(skill, /Before any builder of a batch.*`internal\/roles\/direction-lister\.md`.*record-directions --run-dir.*no builder can register before it/s);
    assert.match(skill, /builder for each draw with `--direction K`/);
    assert.match(skill, /`--direction i` and put only that direction's text in its spawn message/);
    assert.match(skill, /fresh direction lister on the current brief for a fresh, independent list \(do not pass it the earlier directions\)/);
    assert.match(skill, /invite an optional comment as in Step 3 \(anything, even a feeling; never ask what is missing\)/);
    assert.match(skill, /record-redraw --run-dir "<RUN_DIR>" \[--reason TEXT\] \[--brief-hash HEX\]/);
    assert.match(skill, /who picks the base/);
    assert.match(skill, /the brief, and the current canonical's review dir and video; the critic pulls its own frames and crops/);
    assert.match(skill, /`<PLUGIN_ROOT>\/internal\/skills\/critic-loop\/`/);
    assert.match(skill, /register every initial role.*`register-role --fresh`/is);
    assert.match(skill, /Handles must be unique across roles and draws/s);
    assert.doesNotMatch(skill, /Treat a final child message as evidence only after recording a completion report/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('generated launcher usage strips TypeScript tool extensions', () => {
  const root = temporaryRoot();
  try {
    const output = join(root, 'package');
    generatePackage(output);
    for (const tool of ['render-arm.ts', 'time-overview.ts']) {
      const text = readFileSync(join(output, 'tools', tool), 'utf8');
      const command = tool.replace(/\.ts$/, '');
      assert.doesNotMatch(text, /codex-launcher\.mjs\s+(?:render-arm|time-overview)\.ts\b/);
      assert.match(text, new RegExp(`Usage: node "<PLUGIN_ROOT>/tools/codex-launcher\\.mjs"\\s+${command} --workspace <workspace>`));
      assert.doesNotMatch(text, /NODE_PATH="|\bnpx\s+tsx\b|\$\{CLAUDE_PLUGIN_ROOT\}/);
    }
    assert.ok(!RUNTIME_TOOLS.includes('render-strip.ts'));
    assert.ok(RUNTIME_TOOLS.includes('time-overview.ts'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('generator check detects changed, missing, and extra output files', () => {
  const root = temporaryRoot();
  try {
    const expected = join(root, 'expected');
    const actual = join(root, 'actual');
    generatePackage(expected);
    generatePackage(actual);
    compareTrees(actual, expected);

    const changed = join(actual, 'skills', 'remotion-director', 'SKILL.md');
    writeFileSync(changed, `${readFileSync(changed, 'utf8')}\nchanged\n`, 'utf8');
    assert.throws(() => compareTrees(actual, expected), /changed/);
    generatePackage(actual);

    rmSync(join(actual, 'tools', 'codex-launcher.mjs'));
    assert.throws(() => compareTrees(actual, expected), /missing.*codex-launcher\.mjs/);
    generatePackage(actual);

    writeFileSync(join(actual, 'unexpected.txt'), 'drift', 'utf8');
    assert.throws(() => compareTrees(actual, expected), /extra.*unexpected\.txt/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

const wavFiles = (pack) => readdirSync(pack).filter((name) => /\.wav$/i.test(name)).sort();

test('the sound pack ships byte-identical and the builder role names it under <PLUGIN_ROOT>', () => {
  const root = temporaryRoot();
  try {
    const output = join(root, 'package');
    generatePackage(output);
    validateOutput(output);
    const pack = join(output, 'assets', 'sfx');
    const sourceFiles = readdirSync(SOURCE.sfx).sort();
    assert.deepEqual(readdirSync(pack).sort(), sourceFiles);
    for (const name of sourceFiles) assert.deepEqual(readFileSync(join(pack, name)), readFileSync(join(SOURCE.sfx, name)), name);
    // Every listed file exists and no WAV is unlisted.
    const listed = JSON.parse(readFileSync(join(pack, 'index.json'), 'utf8')).sounds.map((sound) => sound.file).sort();
    assert.deepEqual(listed, wavFiles(pack));
    const builder = readFileSync(join(output, 'internal', 'roles', 'builder.md'), 'utf8');
    assert.match(builder, /`<PLUGIN_ROOT>\/assets\/sfx\/`/);
    assert.doesNotMatch(builder, /CLAUDE_PLUGIN_ROOT/);
    // <PLUGIN_ROOT> is the installed package root, so every assets path the role names is real.
    const named = [...builder.matchAll(/<PLUGIN_ROOT>\/(assets\/[^`(\s]*)/g)].map((match) => match[1]);
    assert.ok(named.length > 0);
    for (const path of named) assert.ok(existsSync(join(output, path)), path);
    const provenance = JSON.parse(readFileSync(join(output, 'SOURCE-PROVENANCE.json'), 'utf8'));
    assert.deepEqual(provenance.source.sfx, sha(SOURCE.sfx));
    assert.equal(provenance.source.sfx.count, sourceFiles.length);
    assert.equal(provenance.output.sfx, 'assets/sfx/');
    assert.ok(JSON.parse(readFileSync(join(output, 'package.json'), 'utf8')).files.includes('assets'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('generator check detects a changed WAV byte, a missing sound and an extra sound', () => {
  const root = temporaryRoot();
  try {
    const expected = join(root, 'expected');
    const actual = join(root, 'actual');
    generatePackage(expected);
    generatePackage(actual);
    const pack = join(actual, 'assets', 'sfx');
    const name = wavFiles(pack)[0];
    const pattern = (kind) => new RegExp(`${kind}: .*assets/sfx/${name.replaceAll('.', '\\.')}`);
    const wav = join(pack, name);
    const bytes = readFileSync(wav);
    // 0xFF and 0xFE both decode to U+FFFD as UTF-8, so only a byte compare sees this edit.
    const at = bytes.indexOf(0xff, bytes.length >> 1);
    assert.ok(at > -1, `${name} has no 0xFF sample byte to corrupt`);
    bytes[at] = 0xfe;
    writeFileSync(wav, bytes);
    assert.throws(() => compareTrees(actual, expected), pattern('changed'));
    generatePackage(actual);

    rmSync(wav);
    assert.throws(() => compareTrees(actual, expected), pattern('missing'));
    generatePackage(actual);

    writeFileSync(join(pack, 'unlisted.wav'), Buffer.from('RIFF'));
    assert.throws(() => compareTrees(actual, expected), /extra: .*assets\/sfx\/unlisted\.wav/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
