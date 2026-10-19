# 预注册：甲 的质量线（2026-10-19）

> 草稿，在任何运行之前写定，开跑前由用户确认。运维目录：`D:/Projects/_studio-1019-ops/`；工区：`D:/Projects/_studio-1019/`。

## 1. 来由

### 1.1 外部来源

Vincent 的视频（「Opus 5.5 · 15 种 MG 风格」的教学篇，TIP 01「把质量标准写到最高」、TIP 02「独立 subagent 审查打分」），以及他公开的仓库 `Vincentwei1021/mg-styles-15`（`prompts/*.md`、`rubric.md`）。仓库里的「质量标准」是三件事：

1. **制作方的目标档位**：`award-shortlist / high-end commercial quality. A clean, template-looking result is a fail.`，后面点名了一串对标工作室。
2. **一把人亲手写好的刻度尺，制作方和评委共用**：5 学生作业 / 6 模板 / 7 扎实的专业水准 / 8 高端广告公司 / 9 获奖入围 / 10 世界顶尖。评委那边还有一句 `Most first renders deserve 5–7. Do not inflate.`
3. **达标才停**：七个维度，单项 ≥ 7.5 才算过，改稿时的目标是每项 ≥ 9；每轮意见里至少要有一条 `raise the wow factor, not just polish`。

视频里说「这句话会让 Claude 自己拟定一个评估标准」，但刻度是作者写进提示词的。他的证据只有 AI 评委自己打的分（第一轮均分 6.95，改两轮后 7.81），没有对照组。

不借的部分：
- **每种风格的技法参数、工序和手艺清单**：这就是消融之后删掉的装备。他的质量有很大一块来自这里，算不到「标准」头上。
- **制作方给自己打分**：制作方的视觉判断会被自己的设计文档带着走，这是甲 要看不到设计文档的原因。
- **七个维度分**：甲 用的是顶级设计师的整体视角加初看清单，不把评判切成打分表。

### 1.2 我们自己的观察

- **意图和实现对不上。** `2026-10-01-prompt-rejudgment.md` §2.1 写的是「OVERALL：效果接没接住；像不像顶级设计师的作品。这是收敛的标尺。」现行 `agents/aesthetic-critic.md` 里，`CONVERGED` 只看还有没有高、中严重度的项，线是 `you would let this ship as genuinely well-executed`；OVERALL 里「像不像顶级设计师作品」那个是 / 否，不影响收敛。
- **测出来的差距在质量这一档。** 发行验收（`2026-10-02-release-acceptance-results.md`）里，插件成片质量 4（出色）、成熟度 5。现在的环停在「没有毛病」，没有哪一步把「出色 → 惊艳」当停止条件。全自动模式下，成片的上限就是 甲 的这条线。
- 旧运行里 甲 给出收敛时，说的是 `clears the "this is craft, not AI-default" bar`（`D:/Projects/videos/video/rd-promo/draw-3/CRITIC-VERDICTS.md`）：它守的是「不像 AI 默认」，不是「获奖入围」。

### 1.3 用户 2026-10-19 定的两点

- **不做校准。** 目的不是让 甲 的眼光和人对齐，「惊艳」这一档人与人之间都差得很远。刻度的作用是抬高环停下来的那条线，所以直接用成片 A/B 检验。
- **收敛不是问题。** 以前测过：每轮换一个新上下文的 甲，才会一轮接一轮地挑新毛病；同一个 甲 带着跨轮记忆，很快就收敛。候选里那条平台期出口，不是为了防评审漂移，而是给够不到最高一档的片子一个出口。

## 2. 候选（只改 甲；乙、分方向、盲选都不动）

在现行 `agents/aesthetic-critic.md` 正文（与 `CRITIC-PROTOCOL.md` 里的 甲方 prompt 同文）上改四处，其余逐字不变。

**① 在 `You judge this as a top motion designer judges a design / animation piece.` 之后加一段：**

> THE BAR. Each round, place the piece on this ladder, as that designer would:
> - competent: it does the brief's job and holds together, but nothing in it would stay with a designer (template level up to solid professional work);
> - excellent: the finished work of a high-end studio or agency;
> - stunning: award-shortlist work; a top studio would put it on its reel.
>
> Most first cuts land between competent and excellent. Do not inflate.

**② VERDICT 一段末尾加：**

> Items are not only defects: a moment that holds the piece below the next rung (a beat that reads as merely competent, a hero moment that does not land as one) is an item too, described as what you see. Mark such items `(rung)` after the severity.

**③ OVERALL 一段改为：**

> OVERALL line: (a) does the brief's intended effect land for a first-time viewer; (b) which rung the piece reads as now, and what in the pixels holds it below the next rung. Re-judge this every round from the current materials.

**④ CONVERGED 一段改为：**

> Last line of your final message, exactly: `CONVERGED: YES` or `CONVERGED: NO`. YES only if nothing high- or med-severity remains and the piece reads as stunning. Also YES if no high- or med-severity item remains other than `(rung)` items, the rung is the same as it was two rounds ago, and you judge further rounds will not lift it; then say so in OVERALL and name the rung it settled at. Low-severity notes may remain.

说明：
- 三档对齐用户的成片锚点（`2026-10-01-video-anchors.md`）：competent ≈ 合格，excellent ≈ 出色，stunning ≈ 惊艳。不规定风格、手法，也不把「离常见远」写成目标。
- 只有 ① ② ③ ④ 一起才是「达标才停」，所以作为一个候选整体测，不拆开归因。
- 平台期出口最早在第 3 轮生效，乙 至少有两轮机会往上爬。没有高、中缺陷还留着时，L1 不会比 L0 停得更早。

## 3. 设计

### 3.1 brief

取诊断预注册第一版（提交 `c752952`）里留着没用过的 A 和 E。两条都没跑过；都是竖屏，前几轮测试多是横屏。

| # | brief | spec | 必需文案 |
|---|---|---|---|
| A | 跑鞋品牌「TRACE」（虚构）新款「42」：中底在后半程逐渐变硬，补偿腿部疲劳。受众是跑过全马的业余跑者。要传达：「为第 30 公里设计。」调性：克制、有力、不喊口号 | 1080×1920，12 秒（锁定），30 fps，声音开 | TRACE 42；「为第 30 公里设计」 |
| E | 「南苑动物之家」（虚构）领养周，11 月 8 日–14 日：收容所里的狗平均要等 214 天才被领走。受众是考虑养宠的年轻人。要传达：「它已经等了 214 天。」调性：温暖但不煽情 | 1080×1920，15 秒（锁定），30 fps，声音开 | 领养周日期；收容所名 |

E 的原文只写了「领养周日期」，没给日期；这里补上「11 月 8 日–14 日」。

### 3.2 底片（两臂共用的起点）

每条 brief：
1. 一个全新的 direction-lister，N = 1，取它的方向 1。
2. 一个 乙（现行 `agents/builder.md`）按这个方向做到 r1 预览，然后收到固定的「被选中」通知（不带任何用户的话），自检到定稿。
3. 定稿的 canonical 输出就是**底片**。记下底片工区的哈希，之后不再改动。

### 3.3 两臂

- **L0**：现行 甲 正文。**L1**：§2 的候选。
- 两臂各起一个全新的 甲，跨轮用 `--resume` 续同一个会话（持续的 甲，产品形态）。
- 两臂的 乙 都从底片 乙 的会话分叉出来（`claude -p --resume <底片会话> --fork-session`），所以都带着设计和施工的真记忆。底片工区复制成 `arm-L0/`、`arm-L1/`，第 1 轮摆渡消息前加一句（两臂相同）：「你的工区已复制到 `⟨ARM_RUN_DIR⟩`，从现在起只读写那里；下文的 ⟨RUN_DIR⟩ 都指它。」
- 分叉只在第 1 轮用 `--fork-session`；之后每轮用 `--resume` 续这一臂自己的会话 ID。分叉要在底片工区作 cwd 时发起，这样才找得到原会话。
- 探针（2026-10-19，claude-haiku-5-5，几分钱）：从同一个会话分出两个分叉，两个都记得原会话里的内容，拿到不同的会话 ID；其中一个续下去时，看不到另一个分叉说过的话。如果正式运行里分叉失败，两臂都改用 `CRITIC-PROTOCOL.md` 末节的降级救援形态，记为偏离。

### 3.4 运行

- 无头 `claude.exe -p`，`claude-opus-5-5`，effort 默认，`--strict-mcp-config --setting-sources local`，环境变量按 `_studio-1017-ops/env-clean.sh` 清理。甲 的工具只有 Read、Bash；乙 的工具是 Read、Write、Edit、Bash、Glob、Grep。
- 无头改写，两臂相同：回报、判词都改成「作为最后一条消息给出后结束」；插件路径换成工区里的副本。
- **编排由运维脚本机械执行，不做任何判断**。它解析 甲 的最后一行 `CONVERGED`；用 `CRITIC-PROTOCOL.md` 的每轮摆渡消息原文（无头改写后）把判词逐字转给 乙；读取 乙 回报的实际输出目录，核验其中的 `video.mp4` 和 `review/`；把 `REBUTTAL.md` 本轮新增的内容逐字转给 甲。
- 第 2 轮起发给 甲 的消息固定为：

  > Round ⟨N⟩ materials (cwd = ⟨WORKDIR⟩): review dir `⟨REVIEW_DIR⟩`, video `⟨VIDEO⟩`. The builder's rebuttal since the last round, verbatim (empty if none):
  > ```
  > ⟨REBUTTAL⟩
  > ```
  > Deliver your Round ⟨N⟩ verdict as your final message, then end.

- **安全上限**：每臂最多 8 轮评审。这是实验的基础设施护栏，不是产品规则。到了上限还没收敛，记为「未收敛」，拿最后一版 canonical 去评。
- 失败处理沿用文字层测试：API 5xx 之类的基础设施故障用 `--resume` 续上；模型开工后没交出可用的成片，记「无成片」，不重跑。

## 4. 评判（用户，不知道分臂）

- 每条 brief 三支片放在一起看：底片、L0 终版、L1 终版。中性编号，顺序随机，映射表放在运维目录。
- 每支按共用锚点打质量、成熟度两项分；再给三支排一个整体喜好的顺序，允许并列。

**判定**（只比 L0 和 L1；底片只作描述）：
- 每条 brief：L1 的质量分高于 L0，或者质量分相同、喜好排在 L0 前面，记 **L1 胜**；反过来记 **L1 负**；其余记 **平**。
- 两条 brief 里 L1 至少胜一条、没有负，并且两条里 L1 的成熟度都不低于 L0：**候选进 甲 的提示词**（`agents/aesthetic-critic.md` 与 `CRITIC-PROTOCOL.md` 同步改），两个插件包重新生成。
- 有一条负，或者有一条 L1 的成熟度低于 L0：不进。
- 两条都平：记为未决，不进。

**另外报告（不进判定）**：每臂的轮数、成本、怎么停的（到了 stunning、平台期出口，还是撞上安全上限）；L1 每轮给出的档位；两臂终版相对底片的分数变化。批评环本身的效果还从没用用户打分测过，这里顺带有一份描述。

## 5. 隔离与审计

- 工区 `_studio-1019` 里只有依赖（junction 到现有工区的 `node_modules`）、渲染工具副本、音效副本、底片和两臂的目录。提示词材料、映射表、评分表都放在运维目录，哈希记进 `freeze.txt`。
- 事后检查工具调用：甲 只读自己的看片材料、视频和自己的裁切；乙 只读写自己那一臂的目录。底片工区的哈希在开跑后和结束时各核一次。读到另一臂、运维目录，或者改了底片，判为泄露，单独报告。

## 6. 成本估计

- 底片：分方向每次约 $0.03；乙 做到 r1 加自检，每条约 $3–5。
- 环：甲 每轮约 $1.3–1.5，乙 每轮约 $1.5–4。L0 预计 2–3 轮，L1 多半更多。每臂约 $6–25。
- 两条 brief 合计粗估 $40–90。

## 7. 局限

- 两条 brief，每臂一支，一位评分者，结论很弱。
- ①–④ 作为一个整体测，分不出哪一处起了作用。
- L1 多半跑更多轮。如果它赢了，一部分可能来自「多改了几轮」。但多改几轮正是这条线要买的东西，代价按每臂成本照实报告。
- 两臂的 乙 是从同一个会话分叉出来的，工区换了路径，和产品形态有这一点差别，两臂相同。
