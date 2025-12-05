---
trigger: always_on
description: General Guidelines
---

# Core Tenets
- 
- Use `??`, not `||`, for fallbacks
- Deliberate slowly and thoroughly on matters that require more care/attention.
- Avoid `any` whenever possible. It is the equivalent of `NaN` for the type system - it is infectious.
- One thing at a time: Finish **one feature** at a time. Because you are in 'Agent Decides' mode, please **stop** once a feature is finished so the user can make a git commit.
- Optimize for modularity. Anything that makes sense as a plugin should be a plugin; dependencies per module should be minimal - dependencies for optional functionality should be in plugins.
- For `apps/web` and `apps/playground`, use BEM in `packages/shared/src/index.css` instead of inline CSS.
- Always write tests whenever possible. Run with `bun test --coverage` and try to maximize coverage.
- Always clean up long comments. Use `rg` with `//.+\n *//.+\n *//`.
- Try to avoid `ts-expect-error`, but even that is preferable to `ts-ignore`.

# Stack
- bun (`bun test`; `bun install <package>` etc)
- bun:sqlite for DB
- vitepress for docs (`docs/`)
- vite for web (`apps/web/` and `apps/playground/`)

## Advice
- When starting a conversation, check `docs/` for design documents. After every action, update the files in `docs/` if there are any relevant updates.
- Add one-shot scripts in `scratch/` subdirectories if possible.
- The scripting language for this has a spec in `docs/scripting_spec.md`. Update this file when adding new functionality; refer to this file when writing AND debugging scripts.
- IPC between servers and clients/frontends uses WebSocket and JSON-RPC.

## Style Guide
- For background colors, prefer transparency - this means light colors with low transparency on dark mode, and dark colors with low transparency on light mode.

## Overarching Goal
- A fully scriptable, modular, flexible platform to manipulate objects
  - Game world (LambdaMOO https://en.wikipedia.org/wiki/LambdaMOO)
  - Note taking (Notion)
  - AI Chatbots (SillyTavern https://github.com/SillyTavern/SillyTavern)
  - AI World (Talemate https://github.com/vegu-ai/talemate)
- Highly modular - every component should be embeddable and frontend agnostic