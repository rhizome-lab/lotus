---
trigger: always_on
glob:
description: General Guidelines
---
# Codebase Principles
- When starting a conversation, check `docs/` for design documents. After every action, update the files in `docs/` if there are any relevant updates.
- For `apps/web`, use BEM in `apps/web/src/index.css` instead of inline CSS.
- Always write tests whenever possible. Run with `bun test --coverage` and try to maximize coverage.
- You are in 'Agent Decides' mode for proceeding with your implementation plan. Err on the side of caution, and do not proceed if the plan needs user review.
- For background colors, prefer transparency - this means light colors with low transparency on dark mode, and dark colors with low transparency on light mode.

## Overarching Goal
- A persistent multiplayer world with scriptable objects, rooms, NPCs etc.
- Multiple frontends: Web, Discord, CLI, TUI

## Prior Art
- LambdaMOO (interactive world)
- Lua (scripting - minimal yet powerful)
- S-expressions in JSON (trivial to parse)
