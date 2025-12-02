# TODOs and Feature Requests

## Refactoring

- [ ] **Core/Scripting**: Move `getAvailableVerbs` from `packages/core/src/index.ts` to scripting.
- [ ] **Core/Repo**: When implementing `move` in scripting, ensure it disallows a box to be put inside itself (recursive check). (Ref: `packages/core/src/repo.test.ts`)

## Features

- [ ] **AI Plugin**: Switch `handleGen` to use `generateObject` for structured output. (Ref: `plugins/ai/src/index.ts`)
- [ ] **AI Plugin**: Use JSON Schema to specify the shape of generated objects. (Ref: `plugins/ai/src/index.ts`)
- [ ] **AI Plugin**: Remove unsafe type assertions. (Ref: `plugins/ai/src/index.ts`)

## Documentation

- [ ] **Socket**: Verify and implement proper login logic in `apps/discord-bot/src/socket.ts`.
