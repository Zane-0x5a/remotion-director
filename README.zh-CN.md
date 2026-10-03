# remotion-director

给它一句 brief，它交回一支渲染好的成品动态影片，设计从头到尾由 AI 完成。支持 Claude Code 和 Codex。

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

到了 Claude Opus 5.5，模型的前端综合能力上了一个新台阶。这不是宣传口径，是我们自己的实验一次次看到的：把一个好想法交给模型，**不给任何设计指导**——没有风格规则、没有参考、没有评审——做出来的 **6 支片里有 5 支惊艳**。我们为上一代模型调了几个月的设计知识，到了这一代反而成了天花板，已经由一次预注册的消融实验退役。

## 但顶尖的那一支，依然在长尾

能设计，不等于每次都做出最好的设计。我们测到了三件事：

- **好想法很少第一次就出现。** 让它独立做几次，多数会撞到同一个想法上。
- **模型认不准自己最好的想法。** 它给自己的想法排的名次，不比随机好。
- **惊艳的片子也还差最后一段打磨。** 粗糙的 hero 字、一拍走得太早：做的人透过自己的设计叙事，看不见这些。

## 工作流把它推到上限

remotion-director 就是去长尾里把那一支捞出来的工作流。你给一句 brief，它交回一支渲染好的成品动态影片。

1. **委托。** 简短确认 brief、画幅、时长、文案和声音，都有合理的默认值。
2. **分方向。** 一个全新上下文的概念步骤，列出 **N** 个在*想法*层面互不相同的方向；每个 draw 领一个，让可挑的选项真的不同。
3. **抽卡。** N 个设计师兼施工者各自从自己的方向出发，在一条连续上下文里设计整支片、写 Remotion 代码，并渲出第一版完整成片。
4. **挑选。** 你看 N 支预览，挑走得最远的那支；也可以交给不知道哪支是哪支的 AI 来挑。都不喜欢就整批再抽，可以附一句为什么，哪怕只是感受。
5. **打磨**，有两种，委托时选：
   - **批评环**（默认，全自动）。一个看不到设计的评审只看渲染出来的成片、只报看到的现象，一轮轮直到收敛；改不改、怎么改由施工者定。安全、省心，不突破上限。
   - **亲自打磨。** 不派评审。你看片后说的话原样转给同一个施工者，由它决定怎么改。从不问你缺什么、怎么改。
6. **你的眼睛是最后一关。**

**设计从头到尾都归 AI。** 全自动模式（AI 挑、批评环打磨）里，没有人的眼睛碰过像素，交出来的就是好设计。全自动不承诺顶尖，这正是另外两条可选路线的用处：你来挑，愿意的话再说说感受。设计依然出自模型。

## 管不管用？

发版前，我们拿插件对比了一组空白对照：同一个模型、同一条 brief、不装插件。空白对照质量得 3 分（满分 5），插件的片子得 4 分，其中一支从头到尾没有任何人提过意见。用户对空白对照的评价是："basically 就是一个高级的 PPT……动效做得还是很好的，只不过是 opus 的能力基准；但设计远没有出彩。"插件这次花了 $12.09，空白对照花了 $2.36。[详情](docs/HOW-IT-WORKS.zh-CN.md#发行验收)

## 安装

**Claude Code：**

```
/plugin marketplace add Zane-0x5a/remotion-director
/plugin install remotion-director@remotion-director
```

**Codex：**

```
codex plugin marketplace add Zane-0x5a/remotion-director
codex plugin add remotion-director@remotion-director-codex
```

装好后开一个新会话。本机需要 Node.js、npm、Git 和完整版 ffmpeg（5.1 或更新）；其余的，包括 Remotion 引擎，每做一支片前都会自动准备好。已在 Windows 11 上测试；macOS 和 Linux 还没验证。在有两块显卡的 Windows 电脑上，渲染走性能更强的那块：第一次渲染时会在「设置 > 系统 > 屏幕 > 显示卡」里把 Remotion 的 Chrome 设为「高性能」；你在那里已经给它选过设置的，保持不动。

以后更新：[Claude Code](docs/PLUGIN-DISTRIBUTION.md#update-an-existing-claude-installation)；Codex 先跑 `codex plugin marketplace upgrade`，再跑一遍上面的 `plugin add`。

## 使用

把 brief 交给它：在 Claude Code 里调用 `create` 技能，在 Codex 里让它用 remotion-director。例如：

> /create — a 13s vertical piece for a public library's late-night study space, "The Reading Room — open until 2am." Takeaway: "the quietest place in the city is still awake when you are." Tone: calm, unhurried, a little nocturnal.

它会先确认委托，再开始抽卡。你没定的项都会说明用了什么默认值：

- **画幅**：竖屏 1080×1920（默认）、横屏 1920×1080 或方形 1080×1080
- **时长**：给一个秒数，之后任何环节都不能改；或者选"不限定"，长度交给设计师
- **N**，抽卡数：默认 3；抽得越多上限越高，花费也越多
- **谁来挑**：你（默认），或 AI
- **谁来打磨**：批评环（默认；一直跑到评审收敛，没有轮数上限），或你自己
- **声音**：默认开
- **工作目录**：在哪里做这支片，默认是当前目录下的一个文件夹
- **你提的任何额外要求**，比如用 TTS 配旁白、用自己的素材

**声音**是施工者自己做或自己找的简单音效，可以用插件自带的一小包 CC0 录音，也可以自己合成。完整配乐和旁白只在你提了之后才加。整条管线里只有你自己的耳朵评判声音。

片子做在你自己的项目文件夹里，不在插件里面，所以插件更新永远碰不到你的作品。

## 了解更多

- [工作原理](docs/HOW-IT-WORKS.zh-CN.md)：评审为什么看不到设计稿、它怎么看时间、这一版改了什么、各部分怎么接起来
- [为什么做这个](docs/WHY.md)和[一路怎么走过来的](docs/DEVELOPMENT-JOURNEY.md)（英文）
- [Codex 包](docs/CODEX-INSTALL.md)和它的[验收记录](docs/CODEX-VALIDATION.md)（英文）

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
