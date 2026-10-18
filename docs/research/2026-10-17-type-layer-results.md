# 结果：文字层的两个候选（2026-10-17/18）

预注册：`2026-10-17-type-layer-prereg.md`（commit 9e6252b，在任何运行之前写定）。运行记录：`D:/Projects/_studio-1017-ops/RUN-LOG.md`。

## 测试 2：乙 的提示词（候选 A）——过关，已进 `agents/builder.md`

### 运行

| 支 | brief | 臂 | 成本 | 结果 |
|---|---|---|---|---|
| run-2 | B 港口 | A1 | $3.84 | r1 预览，15.02 s |
| run-3 | B 港口 | A0 | $3.92 | r1 预览，15.02 s |
| run-1 | F 盐湖 | A1 | $1.42 | r1 预览，12.01 s |
| run-4 | F 盐湖 | A0 | $1.64 | r1 预览，12.01 s |

另有两次分方向，各 $0.03。四支都一次跑完，没有续跑，没有"无成片"。事后检查了四支的工具调用，都没有读别的 draw 目录、运维目录或评分目录。

### 评判（用户，盲评，揭盲前原文记录）

> 这四支我看不出明显区别，除港口Y有配乐、X只有配音，硬要说的话X的字审美要好一点，B的最后的神色字压在树上，有可读性问题；盐湖那两个，风格高度收敛，字也就那么几个，几乎一毛一样。

- 用户没有打数字分。"看不出明显区别"按两对的质量都没有差别记。
- "最后的深色字压在树上"：我核对了两支港口片的最后一帧（14.5 s），说的是港口-Y：深蓝色的日期和"可登桥吊观察平台"压在一排树上。港口-X 的字都在干净的灰色天空上。

### 揭盲

`rate-mapping.txt`：港口-X = run-2（A1），港口-Y = run-3（A0），盐湖-X = run-1（A1），盐湖-Y = run-4（A0）。

| brief | 字哪一支好 | 质量 |
|---|---|---|
| 港口 | A1（"硬要说"） | 没有差别 |
| 盐湖 | 一样 | 没有差别 |

### 判定

预注册规则：两条 brief 里字都是 A1 更好或一样、至少一条 A1 更好，并且两条 brief 里 A1 的质量都不低于 A0，候选 A 就进 乙 的提示词。两条都满足，**候选 A 过关**，原句加进 `agents/builder.md` "任务"一节目标那段之后，两个插件包已重新生成。

### 这个结论有多弱

- 每格只有 1 支，唯一的差别是一对片里一次"硬要说"的偏好，预注册的"局限"一节已经写明结论很弱。
- 质量没有差别是从"看不出明显区别"读出来的，不是逐支打的分。
- 港口这对在声音上也不同：A0 有配乐，A1 只有配音。用户的偏好只针对字。
- 盐湖这对没有矫枉过正：两支的字几乎一样。

## 测试 1：甲 的评判标准（候选 B）——两臂都没命中，删掉候选 B

### 运行

第三次开跑（10-18 07:42）完全按预注册条件，两臂都在 5 分钟左右交出第 1 轮判词，中途没有出错：B0 $1.54，B1 $1.32。前两次开跑都作废，原因见下面"基础设施"一节。

### 编码（只看判词原文）

判词全文：`D:/Projects/_studio-1017-ops/logs/critic-B0-verdict.md`、`critic-B1-verdict.md`。

命中的定义：判词的任何一条、初看印象或 OVERALL，把标题或文案的字（字体、样式、排版）说成廉价、模板化、过时、粗糙，或者和画面不搭。只说看不清、太小、停留太短，不算命中。

**B0（现行清单）：没命中。**

- 初看只是描述，没有评价："serif headings, and particles as the single visual language"。
- 和字有关的条目都是遮挡或可读性，不算命中：
  - title-collision："Moving balls pass across settled titles and captions."
  - quote-over-cell："It's still legible but competes with the background."
  - ch-tag-lost："The small chapter tag sits on dense particles and mostly disappears"
  - ending-caption："It's legible, but the caption isn't clearly separated from the scene."

**B1（清单里加了 typography and layout）：没命中，而且夸了字。**

- 初看："a black serif display face with a thin red rule, and a small "01 —— 秩序" section header"。
- OVERALL："Typography and palette are disciplined and consistent"。
- 和字有关的条目也都是遮挡或可读性：
  - "Section header covered by geometry"
  - "Body captions over busy fields … They are still legible"
- 第 8 条提到 "The underline spans only the first half of the title"，但那一条说的是结尾不够有力，没有说字廉价或不搭。

### 判定

两臂都没命中，按预注册删掉候选 B，甲 的初看清单不改。

在初看清单里点名字体与版式，也没有让 甲 说出用户说的"土"：B1 反而明确夸了字。作废那次的 B0（medium effort，只作旁证）也夸了字："The editorial typography is strong: a large serif heading, spaced sans subtitles"。这一处的差距在评判标准之外。可能是 甲 和用户对这套字的看法本来就不同，也可能这套字只是在用户眼里"土"。每臂只有一个样本，分不出是哪种。

### 基础设施：为什么前两次作废

1. 第一次（10-17 20:56 起）两臂都在读完约 30 张图后断在 API 524 上，续跑多次也一样。
2. 第二次（23:33）按"思考时线路空着"的判断，加了 `--thinking-display summarized` 重跑，又在 B1 读到 22 张图、B0 读到 28 张图时断开。

"思考时线路空着"这个判断后来被对照实验否定：小上下文下连续思考 280 秒，两种模式都没有出错；即使思考设成省略，API 也至少每 1.7 秒发一次数据。

和 524 对得上的是请求体大小：

- 每个请求都把读过的所有图片以 base64 重新上传。甲 的单个请求耗时随之上涨：0 MB 时 6 秒，6 MB 时 85 秒，8–15 MB 时 110–140 秒。
- 中转站的流量被代理软件的兜底规则转到了一个美国节点，上传 5 MB 实测每秒 0.17–1.86 MB。
- 请求超过 120 秒还没得到响应，中转站前面的 Cloudflare 就返回 524。
- 用户在代理软件里把中转站改成直连后，实测每秒 1.25–1.43 MB。第三次开跑时，15–19 MB 的请求只要 13–17 秒。

测试 1 总共约 $9.6：计分的两次 $2.86，作废的四次 $3.91，探针和对照实验 $2.84。
