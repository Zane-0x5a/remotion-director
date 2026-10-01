# 音效来源调研：给 builder 换掉合成音色（2026-10-01）

> 只做调研，没有改仓库文件。调研由后台 agent 完成，它听不见声音：音质只凭出处、格式和测量判断。样本在 `D:/Projects/_studio-1002-ops/sfx-research/samples/`，脚本在同级的 `tmp/`。

## 结论

> **用户决定（2026-10-01）**：采用 A，定稿前由用户逐条试听。但**现场搜依旧不限制**：内置包是推荐的默认，builder 仍可自己上网找音效。下文 §3 里"不允许现场搜索""只能取清单里的直链"两句，按这条改为"默认用内置包；需要时可以自己找"。
>
> **范围缩小（2026-10-02）**：发行验收里，A、C 两支的声音全是乙用脚本自己合成的，用户的评价是"合成音效的效果都比我预期的好"。所以包只收合成做不像的录音类：纸、布、机械拟音，水滴，带材质的撞击，真实的挥扫声，房间底噪和风，共 22 条候选，交用户试听。低频下坠、上升铺垫、点击、啵、闪光、故障、界面提示交还合成。下文的 45–55 条和类目分配按这条作废。

**主方案选 A：在插件里内置一个 CC0 音效包，约 45–55 个文件、3–5 MB。合成（C）只用在少数场合。按需联网抓取（B）只作受控的扩展口。**

- **骨架用 Kenney。** 它是 CC0，可以放进 MIT 仓库，同一作者、处理统一。实测 8 个文件的峰值都在 −0.9 到 −1.4 dBFS 之间。
- **Kenney 缺的类目从三处补**：whoosh、riser、shimmer、水滴、氛围底、sub drop。来源是 Sonic Pi 自带的 CC0 样本、OpenGameArt 的 Swishes 包，以及少量人工挑过的 Freesound CC0。
- **合成只做两类。** 一类是 sub drop、riser 这种行业里本来就常靠合成做的素材，另一类是需要贴合画面长度或音高的素材。做法从临时手搓改成用 Tone.js 离线渲染。
- **builder 不能现场去 Freesound 搜。** 它听不见，搜回来的质量是随机的。如果要扩展，只能从清单里用 commit SHA 钉死的直链取。

已有先例：另一个 AI 视频项目 reelkit 已合并 PR #2（https://github.com/asaf5767/reelkit/pull/2）。它把合成占位音换成了内置的 CC0 包，共 17 条、108 KB，来源是 Kenney Interface/Impact/UI Audio、OpenGameArt Swishes 和 Freesound 685256（一个 riser）。理由和本报告一致。

## 1. 来源对比

"可放进仓库"指能否把原始文件放进我们这个 MIT 开源仓库。

### 1a. 可用的 CC0 来源

| 来源 | 许可证（原文 + URL） | 需署名 | 可放进仓库 | 无 key、无登录能脚本取 | 类目覆盖 | 格式 | 备注 |
|---|---|---|---|---|---|---|---|
| **Kenney 音频包**（kenney.nl，共 10 个包） | 包内 License.txt："License: (Creative Commons Zero, CC0) … This content is free to use in personal, educational and commercial projects. Support us by crediting Kenney or www.kenney.nl (this is not mandatory)"（镜像 https://github.com/kapishdima/soundcn/blob/main/assets/kenney_interface-sounds/License.txt ）；"Yes, all game assets on the asset pages are public domain licensed (CC0)." https://kenney.nl/support | 否 | ✔ CC0："You can copy, modify, distribute and perform the work, even for commercial purposes, all without asking permission." https://creativecommons.org/publicdomain/zero/1.0/ 。唯一限制："Do not use our logo" | ✔ zip 直链，但 URL 带版本 hash，需先抓资产页 | click/tick ✔，UI 提示 ✔，impact ✔，foley △，glitch △，pop △，boom △，whoosh ✘，riser ✘，shimmer ✘，水 ✘，氛围 △ | 只有 OGG Vorbis；44.1k（RPG 包 48k）；每条 0.01–2 s、4–20 KB | 一致性最好，但定位是游戏音效，偏短偏干。Interface 100、Impact 130、UI Audio 50、Digital 60、Sci-fi 70、RPG 50、Casino 50 个 |
| **soundcn**（kapishdima/soundcn） | 代码 MIT。registry.json 里 703 条 `"license": "CC0"`，110 条 `"© Blizzard Entertainment, Inc. — All Rights Reserved"` https://github.com/kapishdima/soundcn | Kenney 部分否 | Kenney 部分 ✔；**WoW 的 110 条绝对不行** | ✔ `raw.githubusercontent.com/kapishdima/soundcn/<sha>/assets/<包>/<文件>.ogg`，可钉 SHA，已实测 | 同 Kenney | OGG | 实质是 9 个 Kenney 包的镜像加 WoW 110 条。有用之处：单文件可钉 SHA 的直链；每条带英文描述、关键词和时长（描述可能是模型写的，只能当提示） |
| **Freesound CC0** | 每条许可由上传者选 https://freesound.org/help/tos_web/ | CC0 条目否 | CC0 条目 ✔ | △ API 要账号，原文件下载要 OAuth2（实测 302 跳登录、API 401）；**网页搜索和 HQ 预览 CDN 直链不用鉴权**（实测） | 全类目 | 原文件 44.1–96k；预览约 190 kbps 有损 | 覆盖最全、质量最乱：按下载量排序的第一页混进 508 s 的音乐。适合人工一次性挑选后内置，不适合 builder 现场搜 |
| **Sonic Pi 自带样本** | "All other samples in this directory are from http://freesound.org and have also been placed in the public domain via the Creative Commons 0 License" https://github.com/sonic-pi-net/sonic-pi/blob/dev/etc/samples/README.md | 否 | ✔ | ✔ raw 直链，可钉 SHA | whoosh ✔，boom ✔，impact △，pop/tick ✔，铃 ✔，glitch ✔，黑胶 ✔，氛围 ✔ | FLAC 16-bit 44.1k | ambi_swoosh、ambi_dark_woosh、perc_swoosh、misc_cineboom（7.9 s）、bd_boom、perc_impact1/2、elec_pop/plip/blup/tick/chime/bell、glitch_perc1–5、vinyl_rewind/scratch/hiss、ambi_drone/glass_hum/soft_buzz |
| **OpenGameArt CC0** | Swishes 包 "License(s): CC0" https://opengameart.org/content/swishes-sound-pack ；VCSL 的 UI 包同为 CC0 https://opengameart.org/content/ui-sound-effects-button-clicks-user-feedback-notifications | 否（只算单一 CC0 的条目） | ✔ | ✔ `opengameart.org/sites/default/files/<文件>` | whoosh ✔，UI ✔，水和 foley △ | Swishes 24-bit WAV 0.07–0.20 s | 质量看作者；有的包同时列多个许可（如 "Wierd Whooshes" 同列 CC0、GPL、CC-BY-SA），不算干净的 CC0 |
| **Remotion @remotion/sfx**（remotion.media） | whoosh 页 "License: Creative Commons 0" https://www.remotion.dev/docs/sfx/whoosh ；whip、page-turn、mouse-click、shutter-modern、shutter-old 也是 CC0。switch、ding、record-scratch 页面无 license 行，**未确认** | 否："All files can be used without attribution" https://www.remotion.dev/docs/sfx | 已确认的 6 条 ✔ | ✔ | 少量 | WAV | 能用的几条本身来自 Freesound CC0 或 Kenney |
| **uisfx**（romainsimon/uisfx） | "…waived all copyright … to the procedurally generated audio files"；"Attribution is appreciated but not required." https://github.com/romainsimon/uisfx/blob/main/LICENSE-AUDIO | 否 | ✔ | ✔ | 只有 UI 提示音：12 个风格包 × 78 个 cue | mp3 + ogg | **程序化合成，不是录音** |

### 1b. 不可用或不推荐

| 来源 | 关键原文 + URL | 结论 |
|---|---|---|
| **Pixabay** | "You cannot sell or distribute Content … on a Standalone basis." https://pixabay.com/service/license-summary/ ；"Bulk, large-scale or systematic copying of Content is strictly prohibited" https://pixabay.com/service/terms/ ；API 只有图片和视频，音效页 403（Cloudflare） | 不用 |
| **Mixkit** | "You can't redistribute the Item on its own, as stock, in a tool or template, or with source files." https://mixkit.co/license/#sfxFree ；禁止 "use scripts or bots to mass download Items" https://mixkit.co/terms/ | 插件自动抓取也处在灰色地带，不用 |
| **Sonniss GameAudioGDC** | "Not as standalone files or in sound effect libraries." https://sonniss.com/gameaudiogdc ；禁止以 "sample pack, asset pack … software development kit" 形式提供 https://sonniss.com/gdc-bundle-license/ ；curl 403 | 质量最专业，但不能内置，也不适合自动获取 |
| **BBC Sound Effects（RemArc）** | "Commercial use of this content is not allowed under the RemArc license." https://sound-effects.bbcrewind.co.uk/ | 不能商用 |
| **Zapsplat** | "Attribution Required"；禁止 "Redistribute our sounds in any form"；要账号 https://www.zapsplat.com/license-type/standard-license/ | 不用 |
| **Octave** | "Do not sell the sound set, host the sound set or rent the sound set" https://github.com/scopegate/octave/blob/master/LICENSE.md | 不用 |
| **SND**（snd.dev） | 禁止 "Redistributing or selling the materials by itself as unprocessed." https://snd.dev/ | Kenney 已覆盖，没必要 |
| **Material Design sounds** | "Available under CC-BY 4.0."（archive.org 镜像） | 要署名 |
| **sfxmint / videoeditingsfx.com** | 自称 CC0，来源不明，项目很新 | 存续风险高，不依赖 |

### 1c. 代码合成（方案 C）

| 工具 | 许可 | 名声（作者自述，不是听出来的） |
|---|---|---|
| ZzFX | MIT | README："Ideal for placeholder sound effects." |
| jsfxr | Unlicense | sfxr 作者："just as placeholder sounds" https://www.drpetter.se/project_sfxr.html |
| Tone.js 15.1.22 | MIT | 完整的 Web Audio 合成框架，`Tone.Offline` 能渲染成文件。适合本来就靠合成的素材（riser、sub drop、定音高的 ping）；纸、布、水、机械这类录音型 foley 很难合成得像 |

### 1d. 生成式（门槛都高）

| 工具 | 许可 / 费用 | 门槛 |
|---|---|---|
| ElevenLabs Sound Effects | "$0.12 per minute"；免费档 "does not include a commercial license" | 要 API key 和付费档 |
| Stable Audio Open 1.0 | Community License：年营收低于 $1M 可免费商用 | 权重 gated，要登录 Hugging Face；需要本地 GPU |
| Meta AudioGen | "CC-BY-NC 4.0" | 不能商用，排除 |

## 2. 脚本下载实测（全部没登录、没用 key；共 6.5 MB）

| 来源 | 命令 / URL 模式 | 结果 |
|---|---|---|
| Kenney | 先从资产页抓 zip 链接，再下载；模式 `…/assets/<slug>/<hash>-<时间戳>/kenney_<slug>.zip`，**hash 随版本变** | ✔ interface、impact、ui-audio |
| soundcn | `raw.githubusercontent.com/kapishdima/soundcn/7cbfbb3f…/assets/kenney_sci-fi-sounds/lowFrequency_explosion_000.ogg` | ✔ 可钉 SHA |
| OpenGameArt | `curl -A "Mozilla/5.0" https://opengameart.org/sites/default/files/swishes.zip` | ✔（zip 里有 `__MACOSX/` 垃圾目录） |
| Sonic Pi | `raw.githubusercontent.com/sonic-pi-net/sonic-pi/<sha>/etc/samples/misc_cineboom.flac` | ✔ |
| Freesound 预览 | 搜索页免登录，取 `data-mp3` 换成 `-hq`；`cdn.freesound.org/previews/<id/1000>/<id>_<上传者id>-hq.ogg` | ✔ |
| 失败 | Pixabay 403、Sonniss 403、Freesound 原文件 302 跳登录、API 401 | ✘ |

测量要点：
- **Kenney 内部峰值统一**，都在 −1 dBFS 左右；其他来源从 0 到 −10.6 dBFS 都有，混用前要重新做响度对齐。
- Kenney 只有有损 OGG，个别文件码率偏低（约 57 kbps）。
- Kenney 的 glitch 和 tick 只有 0.01–0.05 s，只能当颗粒素材。

## 3. 推荐与理由

- **为什么选 A**：builder 听不见，一份小而精、带文字索引的素材表比一个能搜的海量库更有用。内置后离线可用、结果确定、能复现，没有链接失效。许可上站得住，reelkit 已这样做并合并。
- **为什么不选 B**：Kenney 的 zip 链接带版本 hash，builder 拼不出来；Freesound 预览要抓页面，不是官方接口；现场搜质量随机（"cinematic impact" 第一条是 "Car Crash"）。
- **为什么 C 只留一部分**：ZzFX 和 sfxr 的作者自己把它们定位为占位音；录音型 foley 合成做不像。sub drop 和 riser 业内常靠合成，又要贴合画面长度，所以留合成，改用 Tone.js 离线渲染。
- **B 的边界**：只能取清单里用 SHA 钉死的直链（soundcn 的 Kenney 镜像、Sonic Pi、OpenGameArt 的具体文件），不允许现场搜索。

| 风险 | 对策 |
|---|---|
| 调色板不统一 | 入包时统一处理：裁静音、统一采样率、按类目对齐响度；每个类目最多 2 个来源 |
| 许可模糊 | 只收单一 CC0 的条目；manifest 逐条记原页 URL、作者、下载日期，许可原文另存 `licenses/` |
| 体积 | 约 50 个文件，3–5 MB |
| 格式兼容 | `@remotion/media` 对 ogg、flac 未实测：入包时统一转成 WAV/MP3，第一次接入时渲一遍确认 |
| 挑选时没人听 | 先用测量初筛（时长、峰值、包络、频谱重心）；定稿前由用户试听一次 |
| 风格偏游戏 | riser、shimmer、长 whoosh 由 Freesound 精选、Sonic Pi 和合成来补 |

## 4. 内置包候选清单（约 60 个，试听后定稿 45–55 个）

Freesound 一栏是 sound id（页面 `https://freesound.org/s/<id>/`），入包前逐条复核许可。

| 类目 | 候选 |
|---|---|
| whoosh / swish（约 8） | OGA Swishes：swish-1、-7、-9、-13；Sonic Pi：ambi_swoosh、perc_swoosh、ambi_dark_woosh；Freesound：683101、171255；Remotion：whoosh、whip |
| impact / hit（约 6） | Kenney Impact：impactPunch_heavy_000、impactSoft_heavy_000、impactSoft_medium_000、impactWood_medium_000、impactMetal_light_000、impactBell_heavy_000；Sonic Pi：perc_impact1 |
| sub drop / boom（约 4） | Sonic Pi：misc_cineboom、bd_boom；Kenney Sci-fi：lowFrequency_explosion_000/001；Freesound：212768；外加 Tone.js 合成的可变长 sub |
| click / tick（约 6） | Kenney Interface：click_001、click_003、tick_001、tick_002、select_001；Kenney UI Audio：click1、switch1；Sonic Pi：elec_tick |
| pop（约 4） | Sonic Pi：elec_pop、elec_plip、elec_blup；Kenney Interface：drop_002、pluck_001；Freesound：202230 |
| riser / build（约 3） | Freesound：685256、244249（裁短）；Sonic Pi：vinyl_rewind；外加 Tone.js 合成的可变长 riser |
| shimmer / sparkle（约 4） | Kenney Interface：glass_001、glass_003；Sonic Pi：elec_chime；Freesound：591131、511485；OGA VCSL：chimes |
| glitch（约 4） | Kenney Interface：glitch_001–004（颗粒）；Sonic Pi：glitch_perc1、glitch_perc3；Freesound：534695（截一段） |
| UI 提示（约 5） | Kenney Interface：confirmation_001/003、question_001、error_001、bong_001；OGA VCSL：Ding、ding_deep；Freesound：380482 |
| 纸 / 布 / 机械 foley（约 7） | Kenney RPG：bookFlip1–3、cloth1/2、metalClick、metalLatch；Kenney Casino：card-slide-1；Kenney Interface：switch_001、toggle_001；Remotion：page-turn、shutter-modern；Freesound：181774 |
| 水滴（约 2） | Freesound：174718、351623（截单滴） |
| 氛围底（约 3–4） | Sonic Pi：ambi_soft_buzz、ambi_glass_hum、ambi_drone、vinyl_hiss；Freesound：329533；截成 8–15 s，做成可循环 |

**给 builder 的说明**：manifest 每个文件一行（类目、文件名、时长、峰值、一句描述、来源 URL、作者、许可）；builder 说明里放一张"类目 → 文件"速查表，写明可以裁剪、变调、增益、叠层、用 `playbackRate` 拉伸。
