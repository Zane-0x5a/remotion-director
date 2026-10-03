# remotion-director 是怎么工作的

[README](../README.zh-CN.md) 讲这个插件做什么、怎么用。这一页放细节：怎样让评审不被设计稿带偏、它看的是什么、发行验收、这一版改了什么、工程环境，以及各部分怎么接起来。

## 为什么评审看不到设计稿

我们一次次看到：模型拿着自己的设计稿评自己的画面，会逐条复述稿子去夸，而不是看图；同一个画面单独拿给同一个模型看，它能把毛病一条条指出来。模型的视觉判断，会被上下文里的设计叙事带着走。所以评审只拿到 brief 和像素，看不到设计稿、代码和笔记。它也从不和乙直接对话：编排者在两边之间原样传话，任何概括都没法把设计漏回去。评审还会跨轮次保持记忆。健忘的评审每轮都挑出新毛病，永远收敛不了；记得自己说过什么的评审，标尺才稳得住。

## 评审看得见时间，而不只是帧

每次渲染都会从像素生成一份看片材料：

- **时间总览。** 按固定时间间隔平铺的缩略格，下面对齐运动曲线；黑场、闪烁、定格里的抖动、停留太短的字，都标在同一条时间轴上。
- **定态帧。** 画面每次停下来时的一张原分辨率画面，用来判构图、排印和质感。
- **视频本身**，可以从中抽任意一帧、做任意裁切。

旧工具每次停顿只给评审一帧，停半秒和停三秒看起来一模一样，只好在最后加一道"节奏刀"补时间。现在时间直接画出来了，这道补丁也就删了。

## 发行验收

发版前，我们拿插件对比了一组**空白对照**：同一个模型、同一条 brief、不装插件。插件这次走的是"亲自打磨"。用户按固定锚点给每支片打分（质量：5 惊艳、3 合格；成熟度：5 可直接发）。实验设计和判定规则在打分前就[预注册](research/2026-10-01-release-acceptance-prereg.md)了。

| 片 | 质量 | 成熟度 |
|---|---|---|
| 空白对照：一次做完，不装插件 | 3 | 5 |
| 插件，另一个方向：挑中后自检，**没有任何人的意见** | 4 | 5 |
| 插件，主 hero：自检定稿 | 4 | 4 |
| 插件，主 hero：按用户的意见打磨一轮后 | **4** | **5** |

**结论：过。** 用户对空白对照的评价是："basically 就是一个高级的 PPT……动效做得还是很好的，只不过是 opus 的能力基准；但设计远没有出彩。"插件这次花了 **$12.09**，从委托到三支预览约 22 分钟；空白对照花了 $2.36。局限：只有一条 brief，而且是开发中用过的那类自我宣传 brief；只有一位评分者。新 brief 留到实际使用中检验。完整记录见 [`research/2026-10-02-release-acceptance-results.md`](research/2026-10-02-release-acceptance-results.md)。

Codex 上，2026-10-02 完整的创作流程验收通过，见 [CODEX-VALIDATION.md](CODEX-VALIDATION.md)。

## 这一版改了什么，为什么

架构没变，还是**甲乙环（批评环）**：一个在单条连续上下文里设计兼施工的乙，加一个看不到设计、跨轮次保持记忆的评审。围绕它的套件，按在当前模型上做的实验重做了：

- **设计装备删了。** 一次预注册消融发现，完整装备从没排在更轻的方案之上；随后的执行诊断也没找到还需要装备去修的共同缺陷。现在乙只拿到目标（顶级动态设计师的水准）和产物契约，别无其他。旧文本归档在 [`archive/`](archive/)。
- **节奏刀和帧条带删了**，换成时间总览和定态帧。
- **新增：** 抽卡前先分方向；在第一版完整成片上挑选（默认由你挑）；两种打磨方式；再抽时可以把你的话并进 brief。
- **声音默认开。** 乙自己做或自己找简单音效。默认不是限制：想用 TTS 配旁白、用自己的音乐或素材，提出来，乙会想办法做到。

> **关于本仓库的"年龄"：**这里的 git 历史很短，因为这是 2026 年年中从一个长期开发仓库拆出来的*干净发布仓库*。真正的工作跨越**约七个月**：前三个半月走过三代架构，之后是实际使用，再之后是这次在 Claude Opus 5.5 上由实验驱动的重建，全程靠预注册实验和一份逐像素核验的事实登记推进。来龙去脉见 [`DEVELOPMENT-JOURNEY.md`](DEVELOPMENT-JOURNEY.md)，背后的思考见 [`WHY.md`](WHY.md)。

## 你的片子放在哪里

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

## 工程环境自动更新

委托确认后、任何一次抽卡之前，`create` 会先准备工程环境：

- **Remotion 引擎。** 每次新运行都查询 npm 上最新的稳定版，把声明的所有 `remotion` / `@remotion/*` 包一起更新，包括项目里额外的包；已安装的辅助媒体依赖按目标版本的推荐对齐。
- **RBP 技能。** 把整个技能目录和官方 [`remotion-dev/skills`](https://github.com/remotion-dev/skills) 上游比对。已有的全局安装（`~/.agents/skills`、`$CODEX_HOME/skills` 或 Claude 的技能目录）会被复用，只有内容不同时才原地更新；都没有时装到工作区的 `.remotion-director/` 下。乙读取返回的 `RBP_SKILL_PATH`。
- **宿主工具。** Node.js、npm、Git 和完整版 ffmpeg（5.1 或更新）。预检会实际跑一遍 rawvideo、scale 和 crop，Remotion 自带的精简版 ffmpeg 可能不支持这些。缺的宿主工具由 agent 按宿主的权限策略安装。

工程版本归上游，不归本插件的设计。同一次运行的所有 draw 共用准备好的环境；下一支片会再刷新一次。想手动跑同样的准备（缺工作区时也会顺便搭好）：

```bash
node "${CLAUDE_PLUGIN_ROOT}/tools/check-env.mjs" --workspace <your-project-dir>
```

`--check` 只查看已记录的安装，不联网、不更新。更新失败会报错退出：修好网络或安装问题后重跑，不要把旧环境当成最新的。全局 RBP 的更新会影响所有用这个技能的项目，开工前先协调好。

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

### 一份源文件，两个发布包

本仓库自己就是 marketplace：`.claude-plugin/marketplace.json` 指向生成的 `./claude-plugin` 发布包，Codex 的 marketplace 条目指向 `./codex-plugin`。根目录的 `skills/` 和 `agents/` 是共同的源文件，两个包都由生成器从它们生成。安装的 Claude 包里只有 Claude 的技能、agent、运行时工具、音效包和依赖默认值，不含 Codex 包、测试、研究文档和宣传素材。稀疏检出、缓存和更新见 [PLUGIN-DISTRIBUTION.md](PLUGIN-DISTRIBUTION.md)；Codex 包见 [CODEX-INSTALL.md](CODEX-INSTALL.md)。

## 平台说明

管线在 **64 位 Windows 11** 上验证过。Node.js 把这个平台报告为 `"win32"`，这是它对*所有* Windows（32 位和 64 位都算）的历史叫法。渲染工具用 ANGLE GL 后端（`gl: "angle"`）和 ffmpeg；在 macOS 或 Linux 上可能需要换 GL 后端（`swangle` / `egl`）。跨平台目前未验证。

在有核显和独显的 Windows 电脑上，Windows 会让 Remotion 私有的 `chrome-headless-shell.exe` 跑在省电的那块显卡上，`gl: "angle"` 和页面里的 `powerPreference: "high-performance"` 都改变不了。所以 `render-arm` 在启动 Chrome 前，为这个程序写入「设置 > 系统 > 屏幕 > 显示卡」写的那条按应用设置（`HKCU\Software\Microsoft\DirectX\UserGpuPreferences`，值 `GpuPreference=2;`，不需要管理员权限；见 `tools/gpu-preference.ts`）。已经带有显卡偏好的条目是用户自己的选择，保持不动；注册表出错只记一条警告。渲染日志里的 `[harness] GPU:` 一行报告结果。

已验证的画幅：1080×1920 和 1920×1080。方形用同一套渲染工具，但还没做过冒烟测试。
