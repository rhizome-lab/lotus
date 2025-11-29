---
trigger: always_on
glob:
description: General Guidelines
---
# Core Tenets
- One thing at a time: Finish **one feature** at a time. Because you are in 'Agent Decides' mode, please **stop** once a feature is finished so the user can make a git commit.
- Optimize for modularity. Anything that makes sense as a plugin should be a plugin; dependencies per module should be minimal - dependencies for optional functionality should be in plugins.
- You are in 'Agent Decides' mode for proceeding with your implementation plan. Err on the side of caution, and do not proceed if the plan needs user review.
- For `apps/web`, use BEM in `apps/web/src/index.css` instead of inline CSS.
- Always write tests whenever possible. Run with `bun test --coverage` and try to maximize coverage.
- Always address TODOs.
- Always clean up long comments. Use `rg` with `//.+\n *//.+\n *//`.

## Advice
- When starting a conversation, check `docs/` for design documents. After every action, update the files in `docs/` if there are any relevant updates.
- Add one-shot scripts in `scratch/` subdirectories if possible.
- The scripting language for this has a spec in `docs/scripting_spec.md`. Update this file when adding new functionality; refer to this file when writing AND debugging scripts.

## Style Guide
- For background colors, prefer transparency - this means light colors with low transparency on dark mode, and dark colors with low transparency on light mode.

## Overarching Goal
- A persistent multiplayer world with scriptable objects, rooms, NPCs etc.
- Multiple frontends: Web, Discord, CLI, TUI

## Prior Art
- LambdaMOO (interactive world)
- Lua (scripting - minimal yet powerful)
- S-expressions in JSON (trivial to parse)
