# Scripting Package

LotusScript language implementation. Handles parsing, compilation, and transpilation of LotusScript into executable instructions.

## Overview

This package contains the complete toolchain for LotusScript, a custom scripting language designed for the Lotus environment. It supports compiling source code into an Abstract Syntax Tree (AST) and executing it within a secure context.

## Components

- **`src/compiler.ts`**: The Compiler. Transforms the AST into executable JavaScript functions that can be run by the game runtime. It handles scope management and control flow.
- **`src/transpiler.ts`**: The Transpiler. Converts TypeScript-like LotusScript syntax into the internal AST format (or Intermediate Representation) used by the compiler. It supports modern syntax features like optional chaining and template literals.
- **`src/lib/`**: The Standard Library. A collection of built-in modules available to scripts, including:
  - `Std`: Core functions (control flow, variables).
  - `Math`: Mathematical operations.
  - `Boolean`: Boolean logic and comparisons.
  - `List`: Array manipulation.
  - `Object`: Object manipulation.
  - `String`: String processing.
- **`src/def.ts`**: Definitions. Contains the TypeScript interfaces for the AST nodes and script values.
