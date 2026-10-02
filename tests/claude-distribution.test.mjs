import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  OUT,
  PROVENANCE_FILE,
  REQUIRED_ROOT_FILES,
  RUNTIME_TOOLS,
  SOURCE,
  assertSafeOutput,
  compareTrees,
  generatePackage,
  hashFiles,
  packageDefaults,
  validateOutput,
} from '../tools/generate-claude-plugin.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_FILES = (root) => {
  const files = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile()) files.push(path);
    }
  };
  visit(root);
  return files.sort();
};
const relativeFiles = (root) => SOURCE_FILES(root).map((path) => path.slice(root.length + 1).replaceAll('\\', '/'));
const temporaryRoot = () => mkdtempSync(join(tmpdir(), 'remotion-director-claude-distribution-'));
const indexedSounds = (pack) => JSON.parse(readFileSync(join(pack, 'index.json'), 'utf8')).sounds.map((sound) => sound.file).sort();
const wavFiles = (pack) => readdirSync(pack).filter((name) => /\.wav$/i.test(name)).sort();

test('generated Claude package contains the complete dependency closure and no Codex/development baggage', () => {
  const root = temporaryRoot();
  try {
    const output = join(root, 'package');
    generatePackage(output);
    validateOutput(output);

    const expected = [
      '.claude-plugin/plugin.json',
      'LICENSE',
      'SOURCE-PROVENANCE.json',
      'package.json',
      'tsconfig.json',
      ...relativeFiles(SOURCE.skills).map((path) => `skills/${path}`),
      ...relativeFiles(SOURCE.agents).map((path) => `agents/${path}`),
      ...relativeFiles(SOURCE.sfx).map((path) => `assets/sfx/${path}`),
      ...RUNTIME_TOOLS.map((name) => `tools/${name}`),
    ].sort();
    assert.deepEqual(relativeFiles(output), expected);

    for (const forbidden of [
      'codex-plugin', 'dsh', 'docs', 'tests', 'README.md', 'README.zh-CN.md', '.git',
      'package-lock.json', 'npm-shrinkwrap.json', 'yarn.lock', 'pnpm-lock.yaml', 'bun.lock', 'bun.lockb',
    ]) {
      assert.equal(existsSync(join(output, forbidden)), false, `Claude payload unexpectedly contains ${forbidden}`);
    }
    assert.equal(existsSync(join(output, 'tools', 'codex-launcher.mjs')), false);
    assert.equal(existsSync(join(output, 'tools', 'codex-runtime.mjs')), false);

    // Import the transitive ESM closure through the real executable entry point.
    // --help exits before touching npm, ffmpeg or a user workspace, but it loads
    // check-env -> environment -> rbp and therefore catches omitted runtime files.
    const help = spawnSync(process.execPath, [join(output, 'tools', 'check-env.mjs'), '--help'], { encoding: 'utf8' });
    assert.equal(help.status, 0, help.stderr);
    assert.doesNotMatch(help.stderr, /ERR_MODULE_NOT_FOUND|Cannot find module/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('skills, agents, sound pack, runtime tools and license preserve source bytes exactly', () => {
  const root = temporaryRoot();
  try {
    const output = join(root, 'package');
    generatePackage(output);
    for (const [sourceRoot, outputRoot] of [[SOURCE.skills, join(output, 'skills')], [SOURCE.agents, join(output, 'agents')], [SOURCE.sfx, join(output, 'assets', 'sfx')]]) {
      for (const source of SOURCE_FILES(sourceRoot)) {
        const relative = source.slice(sourceRoot.length + 1);
        assert.deepEqual(readFileSync(join(outputRoot, relative)), readFileSync(source), relative);
      }
    }
    for (const name of [...RUNTIME_TOOLS, ...REQUIRED_ROOT_FILES]) {
      const source = name === 'LICENSE' || name === 'tsconfig.json' ? join(ROOT, name) : join(SOURCE.tools, name);
      assert.deepEqual(readFileSync(join(output, name === 'LICENSE' || name === 'tsconfig.json' ? name : `tools/${name}`)), readFileSync(source), name);
    }
    assert.deepEqual(JSON.parse(readFileSync(join(output, 'package.json'), 'utf8')), packageDefaults());
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('generator detects changed, missing and extra payload files without touching source', () => {
  const root = temporaryRoot();
  try {
    const expected = join(root, 'expected');
    const actual = join(root, 'actual');
    generatePackage(expected);
    generatePackage(actual);
    compareTrees(actual, expected);
    const sourceBefore = readFileSync(join(SOURCE.skills, 'create', 'SKILL.md'));

    const changed = join(actual, 'skills', 'create', 'SKILL.md');
    writeFileSync(changed, `${readFileSync(changed, 'utf8')}\nchanged\n`, 'utf8');
    assert.throws(() => compareTrees(actual, expected), /changed/);
    generatePackage(actual);

    rmSync(join(actual, 'tools', RUNTIME_TOOLS[0]));
    assert.throws(() => compareTrees(actual, expected), /missing.*tools\/check-env\.mjs/);
    generatePackage(actual);

    writeFileSync(join(actual, 'unexpected.txt'), 'drift', 'utf8');
    assert.throws(() => compareTrees(actual, expected), /extra.*unexpected\.txt/);
    assert.deepEqual(readFileSync(join(SOURCE.skills, 'create', 'SKILL.md')), sourceBefore);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('the sound pack ships whole, its index lists exactly its WAVs, and the builder names its installed path', () => {
  // Every listed file exists, no WAV is unlisted, and nothing else rides along.
  assert.deepEqual(indexedSounds(SOURCE.sfx), wavFiles(SOURCE.sfx));
  assert.deepEqual(readdirSync(SOURCE.sfx).sort(), [...wavFiles(SOURCE.sfx), 'index.json'].sort());
  const root = temporaryRoot();
  try {
    const output = join(root, 'package');
    generatePackage(output);
    const pack = join(output, 'assets', 'sfx');
    assert.deepEqual(relativeFiles(pack), relativeFiles(SOURCE.sfx));
    for (const name of relativeFiles(SOURCE.sfx)) assert.deepEqual(readFileSync(join(pack, name)), readFileSync(join(SOURCE.sfx, name)), name);
    assert.deepEqual(indexedSounds(pack), wavFiles(pack));
    const builder = readFileSync(join(output, 'agents', 'builder.md'), 'utf8');
    assert.match(builder, /`\$\{CLAUDE_PLUGIN_ROOT\}\/assets\/sfx\/`/);
    const receipt = JSON.parse(readFileSync(join(output, PROVENANCE_FILE), 'utf8'));
    assert.deepEqual(receipt.source.sfx, hashFiles(SOURCE.sfx));
    assert.equal(receipt.source.sfx.count, relativeFiles(SOURCE.sfx).length);
    assert.equal(receipt.output.sfx, 'assets/sfx/');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a changed WAV byte, a missing sound and an extra sound are package drift', () => {
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

test('output safety rejects source tree and symlink replacement boundaries', () => {
  assert.throws(() => assertSafeOutput(ROOT), /source tree/i);
  assert.throws(() => assertSafeOutput(join(ROOT, 'skills', 'generated')), /in-repository|source path/i);
  assert.throws(() => assertSafeOutput(SOURCE.sfx), /in-repository|source path/i);
  const root = temporaryRoot();
  try {
    const output = join(root, 'package');
    generatePackage(output);
    assert.doesNotThrow(() => assertSafeOutput(output));

    // Junctions are the Windows equivalent of directory symlinks.  Some locked
    // down runners do not permit creating one; in that case the lexical guards
    // above still run and this platform-specific assertion is skipped.
    const link = join(root, 'source-link');
    try {
      symlinkSync(ROOT, link, 'junction');
      assert.throws(() => assertSafeOutput(join(link, 'would-delete-source')), /symlink/i);
    } catch (error) {
      if (!['EPERM', 'EACCES', 'UNKNOWN'].includes(error?.code)) throw error;
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('provenance hashes are stable across checkout line endings and exact for recorded sounds', () => {
  const root = temporaryRoot();
  try {
    const lfRoot = join(root, 'lf');
    const crlfRoot = join(root, 'crlf');
    const lf = join(lfRoot, 'content.txt');
    const crlf = join(crlfRoot, 'content.txt');
    mkdirSync(lfRoot, { recursive: true });
    mkdirSync(crlfRoot, { recursive: true });
    writeFileSync(lf, 'one\ntwo\n', 'utf8');
    writeFileSync(crlf, 'one\r\ntwo\r\n', 'utf8');
    assert.deepEqual(hashFiles(lfRoot), hashFiles(crlfRoot));

    // As text both would read "�\n"; as bytes they differ.
    const ffRoot = join(root, 'ff');
    const feRoot = join(root, 'fe');
    mkdirSync(ffRoot, { recursive: true });
    mkdirSync(feRoot, { recursive: true });
    writeFileSync(join(ffRoot, 'tone.wav'), Buffer.from([0xff, 0x0d, 0x0a]));
    writeFileSync(join(feRoot, 'tone.wav'), Buffer.from([0xfe, 0x0a]));
    assert.notEqual(hashFiles(ffRoot).hash, hashFiles(feRoot).hash);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('checked repository payload matches a disposable regeneration', () => {
  // OUT is read-only here; check uses a temporary generation and compares every
  // file while ignoring only the timestamp in SOURCE-PROVENANCE.json.
  validateOutput(OUT);
  const root = temporaryRoot();
  try {
    const expected = join(root, 'expected');
    generatePackage(expected);
    compareTrees(OUT, expected);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('source pipeline picks at the r1 previews and self-checks only the picked draw', () => {
  const read = (...parts) => readFileSync(join(ROOT, ...parts), 'utf8');
  const create = read('skills', 'create', 'SKILL.md');
  const order = ['## Step 2', '`draw-i preview ready`', '## Step 3 ', '**Default — the user picks.**', '**交给 AI 挑 — blind select**', '## Step 3.5', '`draw-i settled`', '## Step 4 '];
  let at = -1;
  for (const marker of order) {
    const next = create.indexOf(marker, at + 1);
    assert.ok(next > at, `create skill is missing or misorders ${marker}`);
    at = next;
  }
  assert.match(create, /only each draw's preview `video\.mp4`/);
  assert.match(create, /你替我挑/);
  assert.match(create, /都不要，再抽/);
  for (const stale of [/opt-in shortcut/, /default: the blind selector/i, /Default — blind select/, /self-check → renders R1/, /Hold blind-select until/]) {
    assert.doesNotMatch(create, stale);
  }
  const builder = read('agents', 'builder.md');
  assert.ok(builder.indexOf('draw 预览就绪') > -1 && builder.indexOf('draw 预览就绪') < builder.indexOf('通知你**被选中**'), 'builder reports its preview before any self-check');
  assert.match(builder, /通知你\*\*落选\*\*/);
  const protocol = read('skills', 'critic-loop', 'BLIND-SELECT-PROTOCOL.md');
  assert.match(protocol, /<该候选明确报告的预览输出目录的绝对路径>/);
  assert.doesNotMatch(protocol, /报告 settled/);
  assert.match(builder, /这时还不做自检/);
});

test('source pipeline deals one idea-level direction to each draw before any builder spawns, and re-lists on a redraw', () => {
  const read = (...parts) => readFileSync(join(ROOT, ...parts), 'utf8');
  const create = read('skills', 'create', 'SKILL.md');
  const order = ['## Step 1.5', '`direction-lister`', '`<WORKSPACE>/<piece-slug>/DIRECTIONS.md`', '## Step 2', '**its one direction from Step 1.5, verbatim**', '`draw-i preview ready`', '## Step 3 '];
  let at = -1;
  for (const marker of order) {
    const next = create.indexOf(marker, at + 1);
    assert.ok(next > at, `create skill is missing or misorders ${marker}`);
    at = next;
  }
  assert.match(create, /lister's own \*\*方向 1\*\* always among them/);
  assert.match(create, /never the other directions or `DIRECTIONS\.md`/);
  // A redraw runs a fresh, independent list before the new builders.
  const redraw = create.slice(create.indexOf('**"都不要，再抽"'), create.indexOf('**交给 AI 挑 — blind select**'));
  assert.ok(redraw.indexOf('run Step 1.5 again') > -1 && redraw.indexOf('run Step 1.5 again') < redraw.indexOf('then run Step 2'), 'redraw re-lists before drawing again');
  assert.match(redraw, /a \*\*fresh\*\* `direction-lister` on the current brief and a fresh, independent list/);
  assert.match(redraw, /Do not hand it the earlier directions/);
  // An optional comment, invited once, folded into the brief; never a question about what is missing.
  assert.match(redraw, /a comment is optional/);
  assert.match(redraw, /anything, even just how it felt/);
  assert.match(redraw, /never ask what is missing or how to fix it, and don't follow up/);
  assert.match(redraw, /fold it into the brief the way Step 0 settles one/);
  assert.match(redraw, /never a design instruction of your own, and never your own description of the rejected draws or their directions/);
  assert.match(redraw, /from then on it is \*\*the brief\*\* every role receives/);
  assert.match(redraw, /the user's words as given, and the updated brief/);
  assert.match(create, /At a redraw you may invite a comment — anything, even a feeling — but never require one or follow up/);
  // Both pick modes see the previews only; directions never reach the pick.
  assert.match(create, /only each draw's preview `video\.mp4`\*\* — no overviews, no frames, no DESIGN\.md, no directions/);
  assert.match(create, /or the later dir the builder named\), and never the directions/);
  // The lister's prompt asks only for different ideas, never for novelty.
  const lister = read('agents', 'direction-lister.md');
  const body = lister.slice(lister.indexOf('\n---', 3) + 4);
  assert.match(body, /提出 N 个不同的方向,按你判断的潜力从高到低排序/);
  assert.match(body, /两个方向的核心传达机制和关键动作关系相同,就是同一个想法/);
  assert.match(body, /题材相同、配色相同、"都很常见",都不算同一个想法/);
  assert.match(body, /你判断潜力最高的那个,就排第 1/);
  assert.match(body, /=== 方向 1 ===[\s\S]*=== 方向 N ===/);
  for (const objective of [/新颖/, /新奇/, /俗套/, /套路/, /反常规/, /出人意料/, /跳出/, /避开/, /避免/, /离开常见/, /novel/i, /clich/i, /unexpected/i, /surpris/i]) {
    assert.doesNotMatch(body, objective);
  }
  // Each builder designs the whole piece from its one direction and never sees the others.
  const builder = read('agents', 'builder.md');
  assert.ok(builder.indexOf('## 你这支 draw 的方向') > builder.indexOf('## 任务') && builder.indexOf('## 你这支 draw 的方向') < builder.indexOf('## 渲染'), 'builder reads its direction before building');
  assert.match(builder, /它是种子,不是设计稿:整支片的设计,全由你定/);
  assert.match(builder, /别把核心机制或关键动作关系换成另一个想法/);
  assert.match(builder, /你只拿到自己这一个方向/);
});

const promptBody = (text, start, end) => {
  const a = text.indexOf(start);
  assert.ok(a > -1, `missing ${start}`);
  const b = end ? text.indexOf(end, a) : text.length;
  assert.ok(b > a, `missing ${end}`);
  return text.slice(a, b).trim();
};

test('critic and selector agents carry their protocol prompts verbatim, on the time overview materials', () => {
  const read = (...parts) => readFileSync(join(ROOT, ...parts), 'utf8').replace(/\r\n/g, '\n');
  const critic = read('agents', 'aesthetic-critic.md');
  const criticProtocol = read('skills', 'critic-loop', 'CRITIC-PROTOCOL.md');
  assert.equal(promptBody(critic, 'ROLE: You are 甲'), promptBody(criticProtocol, 'ROLE: You are 甲', '\n---\n\n## 乙方'));
  for (const needle of [/You judge this as a top motion designer/, /aesthetic and narrative effect/, /FIRST LOOK, each round/, /premium vs cheap/, /`overview-\*\.png`/, /`settle-\*\.png`/, /⟨REVIEW_DIR⟩/, /⟨VIDEO⟩/, /only in settled states/, /CONVERGED: YES/]) {
    assert.match(critic, needle);
  }
  for (const stale of [/seq-NN/, /strip/i, /held/, /\bmid\b/]) assert.doesNotMatch(critic, stale);
  const selector = read('agents', 'blind-selector.md');
  const selectProtocol = read('skills', 'critic-loop', 'BLIND-SELECT-PROTOCOL.md');
  assert.equal(promptBody(selector, '你是一位资深动态设计评审'), promptBody(selectProtocol, '你是一位资深动态设计评审', '\n---\n\n## 槽位'));
  for (const needle of [/先给第一眼整体判断/, /\*\*设计\/叙事\*\*/, /\*\*质感\*\*/, /review\/overview-\*\.png/, /review\/settle-\*\.png/, /只在定态上判/]) {
    assert.match(selector, needle);
  }
  for (const stale of [/still-\*\.png/, /strip/, /held/]) assert.doesNotMatch(selector, stale);
});

test('the kit has no equipment and no tempo pass; the builder keeps the duration promise', () => {
  const read = (...parts) => readFileSync(join(ROOT, ...parts), 'utf8');
  assert.ok(!existsSync(join(ROOT, 'skills', 'design-brain')), 'design-brain is archived');
  assert.ok(!existsSync(join(ROOT, 'agents', 'tempo-pass.md')), 'tempo-pass is archived');
  assert.ok(!existsSync(join(ROOT, 'tools', 'render-strip.ts')), 'render-strip is replaced by the time overview');
  for (const file of [['skills', 'create', 'SKILL.md'], ['skills', 'critic-loop', 'SKILL.md'], ['skills', 'critic-loop', 'CRITIC-PROTOCOL.md'], ['agents', 'builder.md']]) {
    const text = read(...file);
    for (const stale of [/design-brain/, /design-equipment/, /tempo-pass/, /render-strip/, /Step 4\.5/, /装备/]) assert.doesNotMatch(text, stale, `${file.join('/')} still mentions ${stale}`);
  }
  const builder = read('agents', 'builder.md');
  assert.match(builder, /`locked ⟨N⟩s` 是对用户的承诺,总时长不许改/);
  assert.match(builder, /回报 `duration blocked`/);
  assert.match(builder, /render-arm\.ts" --dir "<RUN_DIR>" --out "<RUN_DIR>\/out\/r1"/);
  const create = read('skills', 'create', 'SKILL.md');
  assert.match(create, /the builder fits the piece inside it or reports `duration blocked`, and the user decides/);
});

test('sound is on by default, simple effects only, and judged by no one but the user', () => {
  const create = readFileSync(join(ROOT, 'skills', 'create', 'SKILL.md'), 'utf8');
  assert.match(create, /sound is \*\*on by default\*\* — simple sound effects the builder makes or sources itself; the user may turn it off/);
  assert.match(create, /audio intent — default \*\*on\*\*/);
  assert.match(create, /that the critic loop polishes it, and that sound is on\)/);
  assert.match(create, /The pipeline adds no full music or voice-over \*\*by default\*\*; the user can ask for them/);
  assert.doesNotMatch(create, /out of scope for now/);
  assert.match(create, /only the user's own ears do/);
  assert.doesNotMatch(create, /if the user wants sound/);
});

test('defaults are not limits: extra requests such as a TTS voice-over travel in the brief', () => {
  const create = readFileSync(join(ROOT, 'skills', 'create', 'SKILL.md'), 'utf8');
  assert.match(create, /\*\*extra requests \(only if the user volunteers them\)\*\*/);
  assert.match(create, /voice-over through an open-source TTS or one the user provides/);
  assert.match(create, /carry it in the brief, so the direction-lister and every builder receive it/);
  assert.match(create, /never refuse it only because the defaults don't mention it/);
  assert.match(create, /never written into a file\. Don't quiz the user for extras/);
  assert.match(create, /- \*\*Defaults are not limits\.\*\*/);
  assert.match(create, /who polishes \+ workspace \+ any extra requests\)/);
  const builder = readFileSync(join(ROOT, 'agents', 'builder.md'), 'utf8');
  assert.match(builder, /brief 里如果有用户的额外要求/);
  assert.match(builder, /用户给的密钥只从环境变量读,不写进任何文件/);
  assert.match(builder, /\+ 用户额外要求里明确给出的文件和工具;不读其他目录/);
});

test('the commission is confirmed back as its own message before any work starts', () => {
  const create = readFileSync(join(ROOT, 'skills', 'create', 'SKILL.md'), 'utf8');
  const step0 = create.slice(create.indexOf('## Step 0'), create.indexOf('## Step 1 '));
  assert.match(step0, /\*\*The user's answers to your questions are not the confirmation:\*\* send the summary as its own message and wait for their reply before writing anything or starting Step 1/);
  assert.match(step0, /saying how you read anything the user left open/);
  assert.match(step0, /that statement is the confirm-back, with nothing to wait for/);
  assert.match(create, /settled and confirmed back to the user, with their reply in hand \(Step 0\)/);
});

test('polishing is the critic loop by default, or the user\'s own eye with comments ferried verbatim', () => {
  const read = (...parts) => readFileSync(join(ROOT, ...parts), 'utf8');
  const create = read('skills', 'create', 'SKILL.md');
  const order = ['## Step 3.5', '## Step 4 — Critic loop', '## Step 4b — 亲自打磨', '## Step 5', '## Hard rules'];
  let at = -1;
  for (const marker of order) {
    const next = create.indexOf(marker, at + 1);
    assert.ok(next > at, `create skill is missing or misorders ${marker}`);
    at = next;
  }
  assert.match(create, /\*\*who polishes the picked piece\*\*.*\*\*the critic loop\*\* \(default/s);
  const polish = create.slice(create.indexOf('## Step 4b'), create.indexOf('## Step 5'));
  assert.match(polish, /No 甲 is spawned/);
  assert.match(polish, /goes \*\*verbatim\*\* to the picked builder's conversation/);
  assert.match(polish, /\*\*Never ask the user what is missing or how to fix it\*\*/);
  assert.match(polish, /`revision ⟨K⟩ done`/);
  // The settled video comes first; words said at the pick went with the pick message, under one fixed line.
  assert.match(polish, /First show the user the settled canonical `video\.mp4`.*nothing goes to the builder in this step before they have seen it/s);
  const pickWords = create.slice(create.indexOf('**Words about a draw at the pick**'), create.indexOf('**"都不要，再抽"'));
  assert.match(pickWords, /goes to that draw's builder \*\*with the pick message\*\* \(Step 3\.5\), verbatim, under this one line and nothing else of yours: `The user's words at the pick \(they saw your draw as "⟨label⟩"\):`/);
  assert.match(pickWords, /They are not a polish round: in 亲自打磨, Step 4b still starts by showing the user the settled video/);
  assert.match(create, /\*\*More than one draw\*\* — if the user wants to keep more than one \("AC我都想要"\), keep them all: each kept draw self-checks and is polished like a pick, side by side or one after another\. Never ask the user to choose only one\./);
  assert.match(create, /If the user said anything about this draw at the pick, it goes in this message under the fixed line from Step 3/);
  assert.match(create, /that switches the piece to 亲自打磨/);
  const builder = read('agents', 'builder.md');
  assert.match(builder, /通知里若附了用户挑选时说的话,那是用户在预览上看到的现象或意愿,自检时一并处理/);
  assert.match(builder, /\*\*亲自打磨\(用户自己看片\)\*\*/);
  assert.match(builder, /不要反过来问用户缺什么、该怎么改/);
  assert.match(builder, /`revision ⟨K⟩ done`/);
});
