# Viwo TODOs

- **Frontends**: Flesh out all frontends
  - TUI (should have the same layout as web frontend)
  - Discord bot
- Fix playground

  - MonacoEditor doesn't update when selected example changes
  - ScriptEditor shows a single node with the entire program as string contents (rather than structured nodes) when selected example changes

- [ ] packages/scripting/src/interpreter.ts: This should be interpreted inside the stack machine
- [ ] packages/core/src/runtime/hotel.test.ts: `move` should not support `id`
- [ ] packages/core/src/runtime/lib/net.ts: Get binary
- [ ] packages/core/src/runtime/lib/net.ts: Also, return a response rather than just a string
- [ ] packages/core/src/runtime/lib/kernel.ts: In a real system, we'd need to ensure restrictions are actually restrictive (subset)
- [ ] packages/core/src/index.ts: In a real system, we would check authentication here.
- [ ] apps/tui/src/App.tsx: Fetch script content properly. For now, mock or try to find in entities if loaded.
- [ ] apps/web/src/components/ItemEditor.tsx: Batch retrieve items.
- [ ] apps/web/src/components/GameLog.tsx: ErrorView
