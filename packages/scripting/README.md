# Scripting Package

ViwoScript language implementation.

## Overview

This package handles the parsing, compilation, and transpilation of ViwoScript. It transforms user-written scripts into executable instructions that the core runtime can process.

## Contents

- **src/compiler.ts**: Compiles source code into bytecode/intermediate representation.
- **src/lib**: Standard library functions available to scripts.
- **src/transpiler.ts**: Transpiles ViwoScript to JavaScript/TypeScript.

## Usage

Used by the `core` package to execute object verbs and scripts.
