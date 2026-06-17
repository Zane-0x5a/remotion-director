# remotion-director

<div align="center">

https://github.com/user-attachments/assets/da315ac3-4cff-4546-b9e9-5d3aba8c73b9

<sub>*这支宣发片本身就是管线自己的作品,由模型近乎 one-shot 设计并构建。* 人类的全部输入只有一句目标「给这个项目做支宣发片」,外加一处对文字节奏的提醒——没有设计文档、没有参考、没有美术指导。你看到的,是模型亲口说出自己的默认套路(*居中反射、暖渐变默认*)、又把它们划掉。</sub>

<sub>[**English →**](README.md)</sub>

</div>

关于「AI 与设计」,有一种根深蒂固的成见,而且有两副面孔。其一:**AI 只配写代码**——好设计仍得靠人一轮一轮 prompt 硬挤出来,品味、判断、方向全是人的,AI 只是双手,不是眼睛。其二,听起来开明得多:AI *能*设计——前提是你把品味喂给它,一份 `design.md`、一个模板、一份参考、一套品牌系统,而「把你的设计体系交给模型」被奉为成熟实践。

细看,两副面孔认同的是同一件事——**设计不源自 AI**。前者直接否认;后者把人的品味洗进一份文档,再把产出冠以模型之名。这个项目,拒绝这个共同前提。

对一个几乎读遍了整个互联网的模型而言——每一条被写下的设计原则、每一份参考、每一位艺术总监公开过的每一次品味之举,它都见过——**好设计本就在它体内。** 它默认吐出平庸,不是因为缺设计,而是因为请求里没有任何东西**把权重里那一部分激发**成代码。所以,如果好设计不在 AI 的默认区间——那它在哪?

**在长尾。** 它住在那片低概率、高质量的区域,模型凭自己永远不会信步走进去,因为它的默认是均值,而均值就是模板。于是整个项目,就是一台**抵达长尾**的机器:用对的**装备**让模型**从第一性原理出发去设计**(选一个真实的想法,越过安全线去赌它),再抽足够多次、judge 得足够诚实,把那支真能让人多看一眼的右尾作品捞出来——**自主地、可规模化地、没有任何人去补那一笔像素。**

remotion-director 就是围绕这个赌注造出来的、能跑的管线。你给它一句话的 brief;它还你一支成品**动态影片**,并以唯一诚实的方式评判它——评在它**真正渲出来的帧**上,而不是模型对自己作品的那套溢美之词。

一个设计施工一体的 agent 在一条连续上下文里草拟设计、写下 Remotion 代码;若干次独立抽卡被盲选出最有潜力的基底;一位**对设计盲(design-blind)的审美批判家**对着渲染帧反复打磨;而**你自己的眼睛是最终关卡**。

> 这就是 **甲乙环(critic-loop)** 架构——经项目一系列实验验证、并被选定为 Alpha 发行基线的生产形态。想了解野心、它所依赖的洞察与证据,读 [`docs/WHY.md`](docs/WHY.md);想看它一路走过、又被推翻的两套死架构,读 [`docs/DEVELOPMENT-JOURNEY.md`](docs/DEVELOPMENT-JOURNEY.md)。

## 它做什么

你给一句 brief——受众、要传达什么、调性。经过一个简短的**委托步(commission step)**(它确认 brief、规格——画幅/分辨率、时长、帧率、屏上文案、是否要声音——以及抽卡轮数 **N**,对你留白的项给出合理默认值),它还你一支渲好的动态影片(`video.mp4` + 静帧),其间它已:

1. 在一条连续上下文里**设计 + 构建**这支片,带着真实的设计知识(顶级设计师的框定、一个可证伪的视觉 *conceit*、一套严格的三步工序,以及一次渲染自检——设计师本人对着真像素验收、拒绝将就);
2. 做了 **N 次独立抽卡**,并**盲选**出最有潜力的基底(选的是*潜力*,不是当下毛病最少);
3. 让胜出者穿过一个**对设计盲的批判环**——一轮接一轮直到收敛——这个批判家只看帧、只报现象、从不开处方;
4. 把它交到**你**手上——你的眼睛是最终关卡,凌驾于一切机器判官之上。

## 安装

这是一个 Claude Code 插件。直接从这个 GitHub 仓库安装即可——无需手动 clone、也无需搭本地 marketplace。在 Claude Code 里:

```
/plugin marketplace add Zane-0x5a/remotion-director
/plugin install remotion-director@remotion-director
```

(本仓库自身即 marketplace:根目录的 `.claude-plugin/marketplace.json` 以 `source: "."` 列出了这个插件。)然后调用 `create` skill。

### 前置依赖(`create` skill 的 Step 0 会替你检查)

- **Node.js**(给渲染工具用)和 **npm**。
- **ffmpeg** 在你的 PATH 上——**必需**。帧条采样器靠它找出运动的*标点*(批判家要读的「持定帧 vs 运动中帧」)。缺了 ffmpeg,采样器会静默退化成均匀采样,破坏经验证的批判家选帧机制——所以在它就位前,管线会拒绝运行。
  - Windows:`winget install Gyan.FFmpeg` · macOS:`brew install ffmpeg` · Linux:`apt install ffmpeg`
- **`remotion-best-practices` skill**——builder 读它来获取*实时*的引擎能力面。它**单独所有、随上游热更新**(来自 [`remotion-dev/skills`](https://github.com/remotion-dev/skills)),**不打包**进本插件,因此始终跟随上游 Remotion。若缺失,从其官方源安装:
  ```bash
  npx skills add remotion-dev/skills
  ```
- **引擎依赖**(Remotion 4.0.477 + three + 工具链)——由 `create` skill 的脚手架步逐片装进你的 workspace(一次 `npm install`)。

你也可以随时自己跑环境检查:
```bash
node "${CLAUDE_PLUGIN_ROOT}/tools/check-env.mjs" --workspace <你的项目目录>
```

## 用法

带上你的 brief 调用 `create` skill,例如:

> /create —— 一支 13 秒竖屏片,为一家公共图书馆的深夜自习区,「The Reading Room —— 开放至凌晨 2 点」。要传达:「这座城市最安静的地方,在你还醒着时也还醒着。」调性:平静、不慌不忙、带一点夜的气息。

它会先跑一个快速的**委托步**——确认 brief、规格(画幅/分辨率、时长、帧率、屏上文案、音频意图)和抽卡轮数 **N**——并对你没钉死的项给出默认值——然后开抽。这些你可以在 brief 里先说,也可以让它来问。

旋钮:**N**(盲选前的抽卡数;默认 3——抽得越多,上限越高)、**画幅**(竖屏 1080×1920 默认 / 横屏 1920×1080 / 方屏 1080×1080)、**workspace**(你的片在哪构建;默认你当前目录下的一个文件夹)。批判环没有轮数旋钮——它跑到批判家收敛为止,然后由你的眼睛拍板。

> **音频是实验性的。** 引擎能挂载一条音轨,但设计知识与批判环都是**纯视觉**的——管线里没有任何环节*评判*声音。如果你要 music/SFX/VO,它是 best-effort 且未经验证;管线被验证过的那些作品都是无声的。(已记为一项待办的已知限制。)
> **已验证画幅:** 管线在 **1080×1920** 上经过验证。横屏/方屏走同一套 harness,但尚未冒烟测试。

### 你的作品在哪

你的产出落在**你自己的**项目目录里,而非插件内部(这样插件更新永远碰不到你的工作):

```
<你的项目>/
  package.json   node_modules/        # 一次 npm install 同时解析你的代码和 harness
  <piece-slug>/
    draw-1/  index.tsx  DESIGN.md  FIXES.md  out/r1/{still-*.png, video.mp4, strip/}
    draw-2/  …
    draw-N/  …
```

每个 draw 都注册一个 `<Composition id="piece">`(渲染 harness 的契约)。

## 它怎么接线的(给好奇者)

- **Skills** —— `create`(编排器 + 产品入口)、`design-brain`(装载设计装备 + 7 份轴 ref)、`critic-loop`(盲选 + 甲乙环)。
- **Agents** —— `builder`(乙:设计施工一体、连续上下文)、`aesthetic-critic`(甲:对设计盲、持续、只报现象)、`blind-selector`(挑出最有潜力的基底)。
- **Tools** —— `render-arm.ts`(6 静帧 + mp4)、`render-strip.ts`(批判家要读的那些帧)、`check-env.mjs`(Step 0 的检查)。

> **这条帧条比看上去更讲究。** 批判家是个 VLM——它看的是静帧,不是视频——所以 `render-strip.ts` 不做均匀采样(均匀采样会把一个干净的半秒位移抽成一摞「叠字」静帧,把一个完美的瞬态判成缺陷)。它从渲好的 mp4 上量运动,只抽运动的**标点**:每个停顿给一张*持定(held)*帧(真正的构图,可以拿来判),外加只属于运动的*中途(mid)*帧——后者被明确规定永不计为缺陷。在这里,选帧是一个设计决策,不是水管活——详见 [`docs/DEVELOPMENT-JOURNEY.md`](docs/DEVELOPMENT-JOURNEY.md)。

编排器只做编排,在批判家与 builder 之间**逐字**摆渡批判家的判词,并核验像素落地——它从不评判审美,也从不用自己的话转述那套调好的设计知识(每个 agent 都去读逐字的装备/协议文件)。

## 平台说明

管线在 **64 位 Windows 11** 上经过验证(Node.js 把这个平台报告为 `"win32"`——这是它对*所有* Windows 的历史标识符,32 位和 64 位皆然,并不代表只支持 32 位)。渲染 harness 用 ANGLE GL 后端(`gl: "angle"`)和 ffmpeg;在 macOS/Linux 上 GL 后端可能需要调整(`swangle` / `egl`)。跨平台目前尚未验证。
