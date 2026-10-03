# remotion-director

Give it a one-line brief; it returns a finished, rendered motion film. The AI designs it from end to end. A plugin for Claude Code and Codex.

<div align="center">

https://github.com/user-attachments/assets/8b1b1bd1-15cb-4fdd-99d8-b791f8a8e33e

<sub>*This plugin's own hero film, made **by remotion-director on Claude Opus 5.5** from a one-line brief.* The AI listed the directions, designed, built and rendered three films, and self-checked the one picked. The human input was the brief, a slogan, a pick among the three previews, and one comment ("the blind pick in the race chose the dullest of the four drafts?"). No design doc, no reference, no art direction. *(With sound. If the player doesn't load, [open the mp4](https://cdn.jsdelivr.net/gh/Zane-0x5a/remotion-director@master/docs/assets/promos/hero-opus-5-5-c.mp4).)*</sub>

<sub>[**中文说明 →**](README.zh-CN.md)</sub>

</div>

<div align="center">

<table>
  <tr>
    <td><a href="https://cdn.jsdelivr.net/gh/Zane-0x5a/remotion-director@master/docs/assets/promos/hero-opus-5-5-a.mp4"><img src="https://raw.githubusercontent.com/Zane-0x5a/remotion-director/master/docs/assets/promos/hero-opus-5-5-a-thumb.webp" width="430" alt="Another draw from the same run — click to play"></a></td>
    <td><a href="https://cdn.jsdelivr.net/gh/Zane-0x5a/remotion-director@master/docs/assets/promos/control-opus-5-5-bare.mp4"><img src="https://raw.githubusercontent.com/Zane-0x5a/remotion-director/master/docs/assets/promos/control-opus-5-5-bare-thumb.webp" width="430" alt="The blank control: same model, same brief, no plugin — click to play"></a></td>
  </tr>
  <tr>
    <td align="center"><sub><b>Same run, another direction</b> — picked and self-checked, no human feedback at all</sub></td>
    <td align="center"><sub><b>Blank control</b> — same model, same brief, no plugin</sub></td>
  </tr>
</table>

</div>

## The model can already design motion

With Claude Opus 5.5, a model's front-end craft reached a new level. That isn't marketing; it's what our own experiments kept showing. When we handed the model a strong idea with **no design guidance at all** — no style rules, no references, no critic — **five of six resulting films were stunning**. The design knowledge we had spent months tuning for earlier models had, on this one, turned into a ceiling, and a preregistered ablation retired it.

## But the best one still lives in the long tail

A model that *can* design doesn't make the best design every time. Three things we measured:

- **Good ideas rarely come first.** Ask several times independently and most of the draws converge on the *same* idea.
- **The model can't reliably spot its own best idea.** Its ranking of its own ideas did no better than chance.
- **Even a stunning film needs a last pass.** Rough hero type, a beat that leaves too soon: things the maker, looking through its own design narrative, doesn't see.

## The workflow pushes it to its ceiling

remotion-director is the workflow that goes and gets that tail. You give it a brief; it returns a finished, rendered motion film.

1. **Commission.** A short check of the brief, aspect, duration, copy and sound, with sensible defaults.
2. **Directions.** A fresh-context concept step lists **N** directions that differ at the *idea* level. Each draw is dealt one, so the options are really different.
3. **Draws.** N designer-builders each design the whole film from their direction, write the Remotion code, and render a first full cut, in one continuous context.
4. **Pick.** You watch the N previews and pick the one that can go furthest, or hand the pick to an AI selector that doesn't know which draw is which. If you dislike them all, redraw. You can add a word about why, even just a feeling.
5. **Polish**, in one of two ways, chosen at commission:
   - **The critic loop** (default, hands-off). A critic that never sees the design watches only the rendered film and reports what it sees, round after round, until it converges. The builder decides what to change. It's safe and effortless; it won't break the ceiling.
   - **Polish it yourself.** No critic. Whatever you say after watching goes word-for-word to the same builder, which decides how to change the film. You're never asked what's missing or how to fix it.
6. **Your eyes are the final gate.**

**The design is the AI's from end to end.** In full-auto (the AI picks, the critic loop polishes) no human eye ever touches the pixels, and the result is good design. Full-auto doesn't promise the very top. That's what the two optional routes are for: you pick, and if you want, you say what you feel. The design still comes from the model.

## Does it work?

Before release we ran the plugin against a blank control: the same model and brief, no plugin. The control scored quality 3 out of 5; the plugin's films scored 4, including one that no human ever commented on. The user's verdict on the control: *"basically a high-end slide deck — the motion is well made, that's Opus's baseline, but the design is nowhere near striking."* The plugin run cost $12.09, the control $2.36. [Details](docs/HOW-IT-WORKS.md#the-release-acceptance)

## Install

**Claude Code:**

```
/plugin marketplace add Zane-0x5a/remotion-director
/plugin install remotion-director@remotion-director
```

**Codex:**

```
codex plugin marketplace add Zane-0x5a/remotion-director
codex plugin add remotion-director@remotion-director-codex
```

Start a new session afterwards. You need Node.js, npm, Git and a full ffmpeg build (5.1 or newer). Everything else, the Remotion engine included, is prepared automatically at the start of each piece. Tested on Windows 11; macOS and Linux are not yet verified. On a Windows computer with two GPUs, renders run on the more powerful one: the first render sets Remotion's Chrome to High performance under Settings > System > Display > Graphics, unless you have already chosen a setting for it there.

To update later: [Claude Code](docs/PLUGIN-DISTRIBUTION.md#update-an-existing-claude-installation), or in Codex `codex plugin marketplace upgrade` and the `plugin add` line again.

## Usage

Give it your brief: invoke the `create` skill in Claude Code, or ask Codex to use remotion-director. For example:

> /create — a 13s vertical piece for a public library's late-night study space, "The Reading Room — open until 2am." Takeaway: "the quietest place in the city is still awake when you are." Tone: calm, unhurried, a little nocturnal.

It first confirms the commission, then draws. Anything you don't pin down gets a stated default:

- **aspect**: vertical 1080×1920 (default), landscape 1920×1080 or square 1080×1080
- **duration**: a second-count, which is then a promise nothing downstream may break, or *"don't constrain it"*, which leaves the length to the designer
- **N**, the number of draws: default 3; more draws mean a higher ceiling and more cost
- **who picks**: you (default) or the AI selector
- **who polishes**: the critic loop (default; it runs until the critic converges, with no round limit) or you
- **sound**: on by default
- **workspace**: where the piece is built; default is a folder in your current directory
- **anything extra** you ask for, such as a TTS voice-over or your own assets

**Sound** means simple effects that the builder makes or finds, from a small pack of recorded CC0 sounds or its own synthesis. Full music and voice-over are added only when you ask. Nothing in the pipeline judges sound except your own ears.

Your film is built in your own project folder, never inside the plugin, so updates never touch your work.

## Learn more

- [How it works](docs/HOW-IT-WORKS.md): why the critic can't see the design, how it sees time, what changed in this version, and how the pieces are wired
- [Why it exists](docs/WHY.md) and [how it got here](docs/DEVELOPMENT-JOURNEY.md)
- [Codex package](docs/CODEX-INSTALL.md) and its [validation](docs/CODEX-VALIDATION.md)

<details>
<summary>Earlier pipeline versions, other models</summary>

These were made with the previous version of the pipeline, which still had the design equipment and the tempo pass. The brief was the same one-line promo brief, with no human retouching.

https://github.com/user-attachments/assets/f34c4aef-fd88-44be-9300-b2a5418fdfe1

<sub>Claude Opus 4.8, near one-shot: the only extra input was one prompt on text pacing.</sub>

<table>
  <tr>
    <td><a href="https://cdn.jsdelivr.net/gh/Zane-0x5a/remotion-director@master/docs/assets/promos/promo-kimi-k3.mp4"><img src="https://raw.githubusercontent.com/Zane-0x5a/remotion-director/master/docs/assets/promos/promo-kimi-k3-thumb.webp" width="430" alt="Promo created by Kimi K3 — click to play"></a></td>
    <td><a href="https://cdn.jsdelivr.net/gh/Zane-0x5a/remotion-director@master/docs/assets/promos/promo-claude-opus-5.mp4"><img src="https://raw.githubusercontent.com/Zane-0x5a/remotion-director/master/docs/assets/promos/promo-claude-opus-5-thumb.webp" width="430" alt="Promo created by Claude Opus 5 — click to play"></a></td>
  </tr>
  <tr>
    <td align="center"><sub>Kimi K3</sub></td>
    <td align="center"><sub>Claude Opus 5</sub></td>
  </tr>
</table>

</details>
