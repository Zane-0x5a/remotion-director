---
name: design-brain
description: The design knowledge (设计大脑装备) for the remotion-director builder (乙). Loads the full design equipment — the motivational framing, §0 心法, §1 visual conceit, §2 the 3-step process (narrative → texture → engine plan, order is a hard rule), §3 build discipline, §4 render self-check (you-the-designer signing off on real pixels), §5 critic-loop discipline — plus the seven design-axis references. Use when designing and building a vertical motion piece from a brief (you are the designer AND the engineer, in one continuous context). It is design knowledge itself, NOT an interface spec; obey it verbatim.
version: 0.1.0
user-invocable: false
---

# design-brain

This skill is the standing equipment for 乙 — the unified design-and-build agent. It is **design knowledge itself, not an interface specification**. Do not skim it for an API; read it and let it make your design better.

## Load this, in full, before any design judgment

Read **`${CLAUDE_PLUGIN_ROOT}/skills/design-brain/reference/design-equipment.md`** completely and obey it. It carries, verbatim and load-bearing:

- the opening framing (you are a top-tier motion designer; this is your best work this year; the full bandwidth is in your hands),
- **§0 心法** (understand before design; strategy before specifics),
- **§1 视觉 conceit** — the命门: one falsifiable visual/structural mechanism that makes the piece itself; its protagonist is a concrete thing/event, never a light effect or material,
- **§2 工序与深度装备** — the 3-step process whose ORDER IS A HARD RULE (earlier step's output is frozen for later steps): 第一步 narrative → §A (texture.md FORBIDDEN here; §A lands on disk independently first) · 第二步 texture → §B · 第三步 engine plan annotated INLINE next to each beat,
- **§3 施工纪律** (make the render faithful to your design),
- **§4 渲染自检** — after R1, before handing to 甲: you-the-designer (with your standards) judge the real pixels, dare to change the DESIGN itself, refuse to sign off "acceptable residue", re-check everything after each fix,
- **§5 甲乙环纪律** — once in the critic loop: phenomena belong to 甲, mechanism/fix belong to you; pixel-verify before declaring FIXED; §A is protected but not welded shut.

## The seven design-axis references

They live as siblings in `${CLAUDE_PLUGIN_ROOT}/skills/design-brain/reference/`, loaded on demand per §2's timing (you decide which axis to read as the design advances; do NOT bulk-read them as a checklist up front):

`narrative.md` · `aesthetic.md` · `color.md` · `composition.md` · `tempo.md` · `persuasion.md` · `texture.md`

`texture.md` is **forbidden during 第一步** — the conceit and narrative protagonist must be set without knowing the texture techniques (so the protagonist is a concrete thing/event, not a light effect). Read it only after §A is on disk; §B is appended.

## Engine capability surface (§2 第三步)

Read the **`RBP_SKILL_PATH`** supplied by the orchestrator: Step 1 synchronized it with official upstream, reusing a global installation when present and installing locally otherwise. Follow its current routing to the relevant engine documentation (currently `remotion-markup/REFERENCE.md` for code), loading technical references as the design needs them. The skill’s layout and engine version are engineering concerns owned by upstream; this plugin imposes no permanent version pin or ban on upgrades.

Keep the existing workspace and `<Composition id="piece">` output contract when following upstream examples. Use the actually installed APIs. Missing packages can be added at the prepared engine version with `npx remotion add <pkg>`. Coordinate environment changes with the orchestrator so parallel draws share a consistent installation; refresh and re-render when an engineering upgrade is needed.
