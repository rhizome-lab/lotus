# Repository Quality Guide

This document outlines the standards and processes for maintaining high quality in the Lotus repository.

## Automated Checks

These checks are run automatically in CI (`bun run ci:check`). You should run them locally before pushing.

- **Linting**: `bun run lint` (using `oxlint`) - Catches common bugs and correctness issues.
- **Formatting**: `bun run format` (using `oxfmt`) - Enforces consistent code style.
- **Type Checking**: `bun run typecheck` - Ensures TypeScript type safety across all workspaces.
- **Tests**: `bun test` - Runs unit and integration tests.
- **Documentation**: `bun run check:readmes` - Ensures every package has a README and corresponding documentation.
- **Unused Code**: `bun run check:unused` (using `knip`) - Finds unused files, dependencies, and exports.
- **Circular Dependencies**: `bun run check:circular` (using `madge`) - Detects circular dependencies between files.

### Design Decisions: Tooling

We explicitly **do not** use the following tools to avoid friction and false positives:

- **Husky/Pre-commit hooks**: Can be intrusive and slow down the development loop. We rely on CI to catch issues.
- **Spellcheckers (CSpell)**: Often flag variable names or technical terms, requiring constant maintenance of ignore lists.

## Manual Code Review Checklist

Use this checklist when reviewing code or submitting a Pull Request.

### 1. Correctness & Logic

- [ ] **Edge Cases**: Are empty states, null values, and error conditions handled?
- [ ] **Error Handling**: Are errors caught and handled gracefully? Avoid silent failures.
- [ ] **Complexity**: Is the logic overly complex? Can it be simplified?
- [ ] **Concurrency**: Are there potential race conditions or unawaited promises?

### 2. Architecture & Design

- [ ] **Modularity**: Does the code respect module boundaries? Avoid tight coupling.
- [ ] **Reusability**: Is the code reusable? Should it be moved to a shared package?
- [ ] **Dependencies**: Are new dependencies necessary? Do they add too much weight?
- [ ] **Scalability**: Will this perform well with large datasets (e.g., O(n) vs O(n^2))?

### 3. Code Style & Readability

- [ ] **Naming**: Are variable and function names descriptive and accurate?
- [ ] **Comments**: Are complex blocks explained? (Prefer self-documenting code where possible).
- [ ] **Dead Code**: Are there unused variables, imports, or functions?
- [ ] **Type Safety**: Avoid `any` and `as` casts unless absolutely necessary.

### 4. Testing

- [ ] **Coverage**: Do new features have corresponding tests?
- [ ] **Scenarios**: Do tests cover both success and failure paths?
- [ ] **Isolation**: Are tests independent of each other?

### 5. Documentation

- [ ] **Public API**: Are exported functions and classes documented (JSDoc)?
- [ ] **README**: Is the package README updated if the scope changed?
- [ ] **Docs**: Is `docs/` updated for user-facing changes?

### 6. User Experience (Frontend/CLI)

- [ ] **Performance**: Does the UI feel responsive?
- [ ] **Feedback**: Is there clear feedback for user actions (loading states, success messages)?
- [ ] **Accessibility**: Is the UI accessible (keyboard nav, contrast)?

## Recommended Workflows

### Pre-Commit

Run `bun run commit` to automatically generate types, format code, and stage changes.

### New Feature

1. Create an Implementation Plan (if complex).
2. Write tests.
3. Implement feature.
4. Update documentation.
5. Run `bun run ci:check`.
