# Viwo TODOs

## Refactoring & Technical Debt

- [ ] **Core/Scripting**: Move `getAvailableVerbs` from `packages/core/src/index.ts` to scripting.
- [ ] **Core/Repo**: When implementing `move` in scripting, ensure it disallows a box to be put inside itself (recursive check). (Ref: `packages/core/src/repo.test.ts`)
- [ ] **Core/Scripting**: Consider splitting math and boolean operations out from `packages/core/src/scripting/lib/core.ts` (and extract tests as appropriate).

## Features & Enhancements

- [ ] **AI Plugin**: Switch `handleGen` to use `generateObject` for structured output. (Ref: `plugins/ai/src/index.ts`)
- [ ] **AI Plugin**: Use JSON Schema to specify the shape of generated objects. (Ref: `plugins/ai/src/index.ts`)
- [ ] **AI Plugin**: Remove unsafe type assertions. (Ref: `plugins/ai/src/index.ts`)
- [ ] **Core/Scheduler**: Actually call `scheduler.process` in `packages/core/src/scheduler.ts`.
- [ ] **Scripting**: Better script errors (stack traces, line numbers (optional), diagnostic showing the code that errored, etc.)

## Documentation

- [ ] **Socket**: Verify and implement proper login logic in `apps/discord-bot/src/socket.ts`.
- [ ] **Web**: Document web frontend more comprehensively (layout, builder mode, etc).

## Long-term Vision

- [ ] **Editor**: Use `apps/web/src/utils/type_generator.ts` to generate types for a Monaco editor (+ LSP) for the script editor.
- [ ] **AI**: AI support for the Monaco editor using the above types, using live feedback from LSP. This should use the AI plugin.
- [ ] **Frontends**: Flesh out all frontends
  - [ ] TUI (should have the same layout as web frontend)
  - [ ] Discord bot
- [ ] **TUI**: Script editor support for TUI.
- [ ] **Security**: Capability based security
  - [ ] Does this/should this replace the current permissions system?
- [ ] **System Integration**: System integration as (optional) libraries
  - [ ] IO, FS, network etc. (these MUST use capability based security)
- [ ] **Compiler**: Compiler from ViwoScript to TypeScript - typechecking should be removed from the runtime for performance reasons. It may be desired to typecheck at the boundary (the very outermost call) for type safety. We should also consider typechecking for areas where TypeScript reports type errors.
- [ ] **Typing**: Add generics to type annotations for ViwoScript.
- [ ] **Packaging**: Extract ViwoScript to a separate package.
