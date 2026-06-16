# 通用美学规则 + 文案 + 反套路

> 大部分是 impeccable 设计 skill 的 General rules / Copy / Absolute bans / AI-slop test 原文。`[原文]` 段几乎逐字保留(那些具体到 "muted gray on tinted near-white" / "letter-spacing floor ≥ -0.04em" 的实践智慧一压缩就丢)。你亲手写每个数值——下面是落笔时的设计判断。

---

## Color [原文]

- **Verify contrast.** Body text must hit ≥4.5:1 against its background; large text (≥18px or bold ≥14px) needs ≥3:1. The most common failure: muted gray body text on a tinted near-white. If the contrast is even close, bump the body color toward the ink end of the ramp; **light gray "for elegance" is the single biggest reason AI designs feel hard to read.**
- Gray text on a colored background looks washed out. Use a darker shade of the background's own hue, or a transparency of the text color.

竖屏文字动画里文字常是大字号(hero/primary),多落 large-text ≥3:1 档;但 whisper/氛围拍(低对比文字)可以是**有意的设计**——你自己决定它是有意的,别把**该被读的核心文案**做成低对比。

---

## Typography [原文 + 适配]

- Hierarchy through scale + weight contrast (≥1.25 ratio between steps). Avoid flat scales.
- Cap font-family count at 3 (display + body + optional mono). More than 3 reads as indecision, not richness. One well-tuned family with weight contrast usually beats three competing typefaces.
- Don't pair fonts that are similar but not identical (two geometric sans-serifs, two humanist sans-serifs). Pair on a contrast axis (serif + sans, geometric + humanist) or use one family in multiple weights.
- No all-caps body copy. Reserve uppercase for short labels (≤4 words), section eyebrows (used sparingly), and badges.
- Display heading letter-spacing floor: ≥ -0.04em. Anything tighter and letters touch; cramped, not "designed".

适配:
- **行宽**:行宽随画幅宽度与字号决定——竖屏窄幅 + 大字号下,CJK 单行十几字就到顶、Latin 单行不溢出安全边距才是实际约束。别把一拍塞进读不完的长句——超了拆拍。
- **字号天花板**:hero 字号相对画幅有上限——大到某档,页面就是在喊叫、不是在设计("Above that the page is shouting, not designing")。竖屏窄幅下 hero clamp 约 ≤96px 是经验落点;判准是"还在设计 vs 已在喊叫",不是某个绝对像素值。
- **运动中的字重**:粗/中字重在运动中更稳;**细字重(<300)在运动 + 视频压缩后会闪烁甚至消失**。细线衬线在移动时**频闪**——动态文字用 sans 更安全,衬线留给静态停留或大号 display。
- **文字静读要求**:文字在被阅读的时段必须完全静止——运动只发生在入场/退场,中间 1px 漂移都算违规。
- **默认脸 = 没做决定**:Inter / Roboto / Arial / Open Sans / Lato / Montserrat 当主显示字 = **没有做任何排版决定,零身份**。要有意图地选脸(编辑感→Fraunces/Newsreader/Lora;克制现代→Instrument Sans/Plus Jakarta/Outfit)。**别把"≥1.25 比例"误记成某个固定数(如 1.333)**——比例是概念,具体值非教条。

---

## Motion [原文 + 适配]

- Motion should be intentional, and not be an afterthought. Consider it as part of the build.
- Ease out with exponential curves (ease-out-quart / quint / expo). **No bounce, no elastic.**
- **Staggering the items within one list is legitimate. The tell is the uniform reflex (one identical entrance applied to every section), not motion itself; each reveal should fit what it reveals.** Suppressing the reflex is never a reason to ship with no motion at all.
- Premium motion materials are not just transform/opacity. Blur, backdrop-filter, clip-path, mask, and shadow/glow are part of the palette when they materially improve the effect and stay smooth.

适配:
- **"no bounce, no elastic" + ease-out exponential** 是承重共识(Remotion 里 spring 用高 damping 的零弹跳,或 interpolate + 自定义 easing)。
- **"the tell is the uniform reflex"**:别给每拍套同一个 fade-in-up;每个入场贴合它揭示的内容。
- **80/20 静止-运动比**:80% 画面静止 + 20% 有目的的运动 > 100% 持续运动。**满屏一直在动 = 没有重点**。把运动预算花在少数承重拍。
- **错峰的语义类型**:零错峰(同时)/ 匀速 / 加速(渐聚势)/ 减速(渐落定)/ **语义错峰(最重要的先出、留最长间隔)**。别默认匀速。
- **形变克制**:文字/数据上做形变 = 可信度受损。文字动画里文字不做形变。

---

## Copy [原文,几乎全搬——文案是一种常见且通常承重的载荷]

- **Every word earns its place.** No restated headings, no intros that repeat the title.
- **No em dashes.** Use commas, colons, semicolons, periods, or parentheses. Also not `--`.
- **No aphoristic-cadence body copy as a default voice.** Don't fall into the rhythm of "serious statement, then punchy short negation" as the recurring voice. If three or more copy blocks land on a short rebuttal-shaped sentence, rewrite. Specific, not aphoristic.
- **No marketing buzzwords.** The streamline / empower / supercharge / leverage / unleash / transform / seamless / world-class / enterprise-grade / next-generation / cutting-edge / game-changer family. Pick a specific noun and a verb that describes what the product literally does.
- Button/label: verb + object. "Save changes" beats "OK".

CJK 文案另加:别用"赋能/打造/一键/极致/沉浸式/智能化"这类中文 buzzword,同样选具体名词 + 动词。

---

## Absolute bans(match-and-refuse)[原文]

If you're about to write any of these, **rewrite the element with different structure**(不是注释放行,是换结构重做):

- **Gradient text.** `background-clip: text` + gradient. Decorative, never meaningful. Single solid color; emphasis via weight or size.
- **Glassmorphism as default.** Blurs and glass cards used decoratively. Rare and purposeful, or nothing.
- **The hero-metric template.** Big number, small label, supporting stats, gradient accent. SaaS cliché.
- **Tiny uppercase tracked eyebrow above every section.** One named kicker as deliberate brand system is voice; an eyebrow on every section is AI grammar.
- **Numbered section markers as default scaffolding (01 / 02 / 03).** One deliberate numbered sequence is voice; numbered eyebrows on every section is AI grammar.
- **Text that overflows its container.** 别塞超长句(超了拆拍)。

**视频专属动态套路黑名单**(命中即换机制重做):漂浮粒子 / 抽象圆点无语义飘 · 变形几何体无目的 morph · 呼吸式 scale 脉冲当背景常驻 · 视差层当唯一空间手段 · 结尾撒彩纸(confetti)· 地球/网络图当"科技"的能指 · 数字滚动上升(counter roll-up)当"成就"的能指。这些是视频生成的跨模型默认反射——看到自己要伸手去拿,换一个真正服务 conceit 的机制。

---

## AI-slop test:两阶 category-reflex check [原文]

**If someone could look at this and say "AI made that" without doubt, it failed.** Run at two altitudes:

- **First-order:** if someone could guess the theme + palette from the **category alone**, it's the first training-data reflex. Rework the scene sentence and color strategy until the answer isn't obvious from the domain.
- **Second-order:** if someone could guess the aesthetic family from **category-plus-anti-references** ("AI workflow tool that's not SaaS → editorial-typographic", "fintech that's not navy-and-gold → terminal-native dark"), it's the trap one tier deeper. Rework until **both** answers are not obvious.

- **移除测试(removal test)**:把你那个"独特"特征从画面里拿掉,剩下的看起来和一支通用 motion 片有区别吗?**没区别 = 那个特征是装饰、不承重**。承重的 conceit 经得起这个测试。
- **收尾戒律**:别收在 fade-to-black / 静态 logo 卡 / 中性空场——收在一个正向情绪事件上。

---

## Color & Theme strategy 金句(防丢)[原文]

- **The cream / sand / beige body bg is the saturated AI default of 2026.** 整条暖中性带(OKLCH L 0.84-0.97, C < 0.06, hue 40-100)读作 cream/sand/paper 无论你叫它什么。"Warmth" is carried by accent + typography + imagery, not by body bg.
- **Pick a color strategy before picking colors.** Restrained / Committed / Full palette / Drenched.(详见 color.md)
