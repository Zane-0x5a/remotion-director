# remotion-director

> **Codex 适配：**生成包在 `codex-plugin/`。参见[安装与使用](docs/CODEX-INSTALL.md)、[移植计划](docs/CODEX-MIGRATION-PLAN.md)和[验收记录](docs/CODEX-VALIDATION.md)。2026-10-02，Codex 上完整的创作流程验收通过：委托、三个方向和预览、盲选、自检、评论环，最后由用户亲眼过目。

<div align="center">

https://github.com/user-attachments/assets/8b1b1bd1-15cb-4fdd-99d8-b791f8a8e33e

<sub>*本插件自己的 hero 片，由 **remotion-director 在 Claude Opus 5.5 上**从一句 brief 做出。* AI 列出方向，设计、施工、渲出三支片，并对选中的那支做了自检。人这边的全部输入是：brief、一句 slogan、在三支预览里挑选，以及一条意见（"盲评阶段选了四个 draw 里面看起来最不出彩的一个？"）。没有设计稿，没有参考，没有美术指导。*（有声音。播放器加载不出来时，可[直接打开 mp4](https://cdn.jsdelivr.net/gh/Zane-0x5a/remotion-director@master/docs/assets/promos/hero-opus-5-5-c.mp4)。）*</sub>

<sub>[**English →**](README.md)</sub>

</div>

<div align="center">

<table>
  <tr>
    <td><a href="https://cdn.jsdelivr.net/gh/Zane-0x5a/remotion-director@master/docs/assets/promos/hero-opus-5-5-a.mp4"><img src="https://raw.githubusercontent.com/Zane-0x5a/remotion-director/master/docs/assets/promos/hero-opus-5-5-a-thumb.webp" width="430" alt="同一次运行的另一支——点击播放"></a></td>
    <td><a href="https://cdn.jsdelivr.net/gh/Zane-0x5a/remotion-director@master/docs/assets/promos/control-opus-5-5-bare.mp4"><img src="https://raw.githubusercontent.com/Zane-0x5a/remotion-director/master/docs/assets/promos/control-opus-5-5-bare-thumb.webp" width="430" alt="空白对照：同一模型、同一 brief、不装插件——点击播放"></a></td>
  </tr>
  <tr>
    <td align="center"><sub><b>同一次运行，另一个方向</b>——挑中后自检，没有任何人的意见</sub></td>
    <td align="center"><sub><b>空白对照</b>——同一模型、同一 brief、不装插件</sub></td>
  </tr>
</table>

</div>

## 模型已经拥有设计动画的能力

到了 Claude Opus 5.5，模型的前端综合能力上了一个新台阶。这不是宣传口径，是我们自己的实验一次次看到的：把一个好想法交给模型，**不给任何设计指导**——没有风格规则、没有参考、没有评审——做出来的 **6 支片里有 5 支惊艳**。我们为上一代模型调了几个月的设计知识，到了这一代反而成了天花板，已经由一次预注册的消融实验退役（详见下文）。

## 但顶尖的那一支，依然在长尾

能设计，不等于每次都做出最好的设计。我们测到了三件事：

- **好想法很少第一次就出现。** 让它独立做几次，多数会撞到同一个想法上。
- **模型认不准自己最好的想法。** 它给自己的想法排的名次，不比随机好。
- **惊艳的片子也还差最后一段打磨。** 粗糙的 hero 字、一拍走得太早：做的人透过自己的设计叙事，看不见这些。

## 工作流把它推到上限

remotion-director 就是去长尾里把那一支捞出来的工作流。你给一句 brief，它交回一支渲染好的成品动态影片。

1. **委托。** 简短确认 brief、画幅、时长、文案和声音，都有合理的默认值。
2. **分方向。** 一个全新上下文的概念步骤，列出 **N** 个在*想法*层面互不相同的方向；每个 draw 领一个，让可挑的选项真的不同。
3. **抽卡。** N 个设计师兼施工者（乙）各自从自己的方向出发，在一条连续上下文里设计整支片、写 Remotion 代码，并渲出第一版完整成片。
4. **挑选。** 你看 N 支预览，挑走得最远的那支；也可以交给看不到来历的 AI 盲选。都不喜欢就整批再抽，可以附一句为什么，哪怕只是感受。
5. **打磨**，有两种，委托时选：
   - **批评环**（默认，全自动）。一个看不到设计的评审（甲）只看渲染出来的成片、只报看到的现象，一轮轮直到收敛；改不改、怎么改由乙定。安全、省心，不突破上限。
   - **亲自打磨。** 不派评审。你看片后说的话原样转给同一个乙，由它决定怎么改。从不问你缺什么、怎么改。
6. **你的眼睛是最后一关。**

**设计从头到尾都归 AI。** 全自动模式（AI 挑、批评环打磨）里，没有人的眼睛碰过像素，交出来的就是好设计。全自动不承诺顶尖，这正是另外两条可选路线的用处：你来挑，愿意的话再说说感受。设计依然出自模型。

### 为什么评审看不到设计稿

我们一次次看到：模型拿着自己的设计稿评自己的画面，会逐条复述稿子去夸，而不是看图；同一个画面单独拿给同一个模型看，它能把毛病一条条指出来。模型的视觉判断，会被上下文里的设计叙事带着走。所以评审只拿到 brief 和像素，看不到设计稿、代码和笔记。它也从不和乙直接对话：编排者在两边之间原样传话，任何概括都没法把设计漏回去。评审还会跨轮次保持记忆。健忘的评审每轮都挑出新毛病，永远收敛不了；记得自己说过什么的评审，标尺才稳得住。

### 评审看得见时间，而不只是帧

每次渲染都会从像素生成一份看片材料：

- **时间总览。** 按固定时间间隔平铺的缩略格，下面对齐运动曲线；黑场、闪烁、定格里的抖动、停留太短的字，都标在同一条时间轴上。
- **定态帧。** 画面每次停下来时的一张原分辨率画面，用来判构图、排印和质感。
- **视频本身**，可以从中抽任意一帧、做任意裁切。

旧工具每次停顿只给评审一帧，停半秒和停三秒看起来一模一样，只好在最后加一道"节奏刀"补时间。现在时间直接画出来了，这道补丁也就删了。

## 管不管用？发行验收

发版前，我们拿插件对比了一组**空白对照**：同一个模型、同一条 brief、不装插件。插件这次走的是"亲自打磨"。用户按固定锚点给每支片打分（质量：5 惊艳、3 合格；成熟度：5 可直接发）。实验设计和判定规则在打分前就[预注册](docs/research/2026-10-01-release-acceptance-prereg.md)了。

| 片 | 质量 | 成熟度 |
|---|---|---|
| 空白对照：一次做完，不装插件 | 3 | 5 |
| 插件，另一个方向：挑中后自检，**没有任何人的意见** | 4 | 5 |
| 插件，主 hero：自检定稿 | 4 | 4 |
| 插件，主 hero：按用户的意见打磨一轮后 | **4** | **5** |

**结论：过。** 用户对空白对照的评价是："basically 就是一个高级的 PPT……动效做得还是很好的，只不过是 opus 的能力基准；但设计远没有出彩。"插件这次花了 **$12.09**，从委托到三支预览约 22 分钟；空白对照花了 $2.36。局限：只有一条 brief，而且是开发中用过的那类自我宣传 brief；只有一位评分者。新 brief 留到实际使用中检验。完整记录见 [`docs/research/2026-10-02-release-acceptance-results.md`](docs/research/2026-10-02-release-acceptance-results.md)。

## 这一版改了什么，为什么

架构没变，还是**甲乙环（批评环）**：一个在单条连续上下文里设计兼施工的乙，加一个看不到设计、跨轮次保持记忆的评审。围绕它的套件，按在当前模型上做的实验重做了：

- **设计装备删了。** 一次预注册消融发现，完整装备从没排在更轻的方案之上；随后的执行诊断也没找到还需要装备去修的共同缺陷。现在乙只拿到目标（顶级动态设计师的水准）和产物契约，别无其他。旧文本归档在 [`docs/archive/`](docs/archive/)。
- **节奏刀和帧条带删了**，换成时间总览和定态帧。
- **新增：** 抽卡前先分方向；在第一版完整成片上挑选（默认由你挑）；两种打磨方式；再抽时可以把你的话并进 brief。
- **声音默认开。** 乙自己做或自己找简单音效。默认不是限制：想用 TTS 配旁白、用自己的音乐或素材，提出来，乙会想办法做到。

> **关于本仓库的"年龄"：**这里的 git 历史很短，因为这是 2026 年年中从一个长期开发仓库拆出来的*干净发布仓库*。真正的工作跨越**约七个月**：前三个半月走过三代架构，之后是实际使用，再之后是这次在 Claude Opus 5.5 上由实验驱动的重建，全程靠预注册实验和一份逐像素核验的事实登记推进。来龙去脉见 [`docs/DEVELOPMENT-JOURNEY.md`](docs/DEVELOPMENT-JOURNEY.md)，背后的思考见 [`docs/WHY.md`](docs/WHY.md)。

## 安装

这是一个 Claude Code 插件，直接从本 GitHub 仓库安装，不需要手动 clone，也不用配置本地 marketplace。在 Claude Code 中：

```
/plugin marketplace add Zane-0x5a/remotion-director
/plugin install remotion-director@remotion-director
```

本仓库自己就是 marketplace：`.claude-plugin/marketplace.json` 指向生成的 `./claude-plugin` 发布包。装好后调用 `create` 技能。安装的包里只有 Claude 的技能、agent、运行时工具、音效包和依赖默认值，不含 Codex 包、测试、研究文档和宣传素材。

想同时限制 marketplace 检出的内容，就在终端里添加：

```sh
claude plugin marketplace add Zane-0x5a/remotion-director --sparse .claude-plugin claude-plugin
claude plugin install remotion-director@remotion-director
```

`--sparse` 让另一个发布包不进入 marketplace 的工作树；普通的 GitHub marketplace 注册仍可能单独缓存整个仓库。详见[发布与更新说明](docs/PLUGIN-DISTRIBUTION.md)。

### Codex

Codex 用仓库里单独的 marketplace 条目，指向 `./codex-plugin`，插件名同样是 `remotion-director`：

```
codex plugin marketplace add Zane-0x5a/remotion-director
codex plugin add remotion-director@remotion-director-codex
```

安装或更新后，开新任务或重启宿主。两个 marketplace 各装各的生成目录：Claude 用 `./claude-plugin`，Codex 用 `./codex-plugin`；根目录的 `skills/` 和 `agents/` 仍是共同的源文件。Codex 工作区的完整要求见 [`docs/CODEX-INSTALL.md`](docs/CODEX-INSTALL.md)。

### 工程环境自动更新

委托确认后、任何一次抽卡之前，`create` 会先准备工程环境：

- **Remotion 引擎。** 每次新运行都查询 npm 上最新的稳定版，把声明的所有 `remotion` / `@remotion/*` 包一起更新，包括项目里额外的包；已安装的辅助媒体依赖按目标版本的推荐对齐。
- **RBP 技能。** 把整个技能目录和官方 [`remotion-dev/skills`](https://github.com/remotion-dev/skills) 上游比对。已有的全局安装（`~/.agents/skills`、`$CODEX_HOME/skills` 或 Claude 的技能目录）会被复用，只有内容不同时才原地更新；都没有时装到工作区的 `.remotion-director/` 下。乙读取返回的 `RBP_SKILL_PATH`。
- **宿主工具。** Node.js、npm、Git 和完整版 ffmpeg（5.1 或更新）。预检会实际跑一遍 rawvideo、scale 和 crop，Remotion 自带的精简版 ffmpeg 可能不支持这些。缺的宿主工具由 agent 按宿主的权限策略安装。

工程版本归上游，不归本插件的设计。同一次运行的所有 draw 共用准备好的环境；下一支片会再刷新一次。想手动跑同样的准备（缺工作区时也会顺便搭好）：

```bash
node "${CLAUDE_PLUGIN_ROOT}/tools/check-env.mjs" --workspace <your-project-dir>
```

`--check` 只查看已记录的安装，不联网、不更新。更新失败会报错退出：修好网络或安装问题后重跑，不要把旧环境当成最新的。全局 RBP 的更新会影响所有用这个技能的项目，开工前先协调好。

## 使用

带上你的 brief 调用 `create` 技能，例如：

> /create — a 13s vertical piece for a public library's late-night study space, "The Reading Room — open until 2am." Takeaway: "the quietest place in the city is still awake when you are." Tone: calm, unhurried, a little nocturnal.

它会先走委托这一步，再开始抽卡。你没定的项都会说明用了什么默认值：

- **画幅**：竖屏 1080×1920（默认）、横屏 1920×1080 或方形 1080×1080
- **时长**：给一个秒数，之后任何环节都不能改；或者选"不限定"，长度交给设计师
- **N**，抽卡数：默认 3；抽得越多上限越高，花费也越多
- **谁来挑**：你（默认），或 AI 盲选
- **谁来打磨**：批评环（默认），或你自己
- **声音**：默认开
- **工作目录**：在哪里做这支片，默认是当前目录下的一个文件夹
- **你提的任何额外要求**，比如用 TTS 配旁白、用自己的素材

批评环没有轮数旋钮：它一直跑到评审收敛，然后由你的眼睛决定。

> **声音：**默认开，是乙自己做或自己找的简单音效。插件自带 15 条逐条听选过的 CC0 录音音效（挥扫、拟音、水滴、房间底噪），乙可以直接用，其余它自己合成。完整配乐和旁白不会主动加，你提了，乙会想办法做到。评审和盲选都**只看画面**，整条管线里只有你自己的耳朵评判声音。
> **已验证的画幅：**1080×1920 和 1920×1080。方形用同一套渲染工具，但还没做过冒烟测试。

### 你的片子放在哪里

产出在**你自己的**项目目录里，不在插件里面，所以插件更新永远碰不到你的作品：

```
<your-project>/
  package.json   node_modules/        # 一次 npm install 同时解析你的代码和渲染工具
  <piece-slug>/
    COMMISSION.md  DIRECTIONS.md
    pick/  A.mp4  B.mp4  …            # 预览，用中性标签
    draw-1/  index.tsx  DESIGN.md  FIXES.md  out/r1/{video.mp4, review/}
    draw-2/  …
```

每次渲染的 `review/` 里有时间总览（`overview-*.png`）、定态帧（`settle-*.png`）和 `overview.json`。每个 draw 都注册一个 `<Composition id="piece">`，这是渲染工具的契约。

## 内部结构

- **技能。** `create`（编排者，也是产品入口）和 `critic-loop`（盲选和甲乙环的协议）。
- **Agent。**
  - `direction-lister`：每批抽卡前一次全新上下文的调用。
  - `builder`（乙）：设计加施工，一条连续上下文。
  - `blind-selector`：看潜力挑选，不知道来历。
  - `aesthetic-critic`（甲）：看不到设计，跨轮次保持记忆；只报现象，不开处方。
- **工具。**
  - `render-arm.ts`：渲出 mp4，再写 `review/`。
  - `time-overview.ts`：时间总览和定态帧，只从像素算。
  - `check-env.mjs`：自动准备环境。

编排者只负责编排、在评审和乙之间（或你和乙之间）**原样**传话、核对像素确实落地。它从不评判审美，也从不转述任何角色的定义：每个 agent 都读自己逐字的提示词。

## 平台说明

管线在 **64 位 Windows 11** 上验证过。Node.js 把这个平台报告为 `"win32"`，这是它对*所有* Windows（32 位和 64 位都算）的历史叫法。渲染工具用 ANGLE GL 后端（`gl: "angle"`）和 ffmpeg；在 macOS 或 Linux 上可能需要换 GL 后端（`swangle` / `egl`）。跨平台目前未验证。

<details>
<summary>旧版管线、其他模型的作品</summary>

下面几支是用上一版管线做的，那时还有设计装备和节奏刀。brief 是同一句宣发 brief，没有任何人补一笔像素。

https://github.com/user-attachments/assets/1243ab0f-cb37-4a83-90d4-62b2a56688ba

<sub>Claude Opus 4.8，近乎 one-shot，唯一的额外输入是一句关于文字节奏的提示。</sub>

<table>
  <tr>
    <td><a href="https://cdn.jsdelivr.net/gh/Zane-0x5a/remotion-director@master/docs/assets/promos/promo-kimi-k3.mp4"><img src="https://raw.githubusercontent.com/Zane-0x5a/remotion-director/master/docs/assets/promos/promo-kimi-k3-thumb.webp" width="430" alt="Kimi K3 的作品——点击播放"></a></td>
    <td><a href="https://cdn.jsdelivr.net/gh/Zane-0x5a/remotion-director@master/docs/assets/promos/promo-claude-opus-5.mp4"><img src="https://raw.githubusercontent.com/Zane-0x5a/remotion-director/master/docs/assets/promos/promo-claude-opus-5-thumb.webp" width="430" alt="Claude Opus 5 的作品——点击播放"></a></td>
  </tr>
  <tr>
    <td align="center"><sub>Kimi K3</sub></td>
    <td align="center"><sub>Claude Opus 5</sub></td>
  </tr>
</table>

</details>
