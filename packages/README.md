# Packages

Shared libraries and core logic for Lotus.

## Overview

This directory houses the reusable components that power the Lotus applications. By separating core logic into packages, we ensure modularity, testability, and code sharing across different interfaces (web, CLI, bots).

## Contents

- **client**: Client-side SDK and utilities for connecting to Lotus.
- **core**: The heart of the Lotus engine, containing the runtime, database interactions, and core game logic.
- **scripting**: The implementation of the Reed language, including the transpiler and compiler.
- **shared**: Common utilities, types, and constants shared across apps and packages.
- **web-editor**: Reusable components and logic for the web-based code editor.

## Usage

These packages are managed via the workspace and are typically imported by the applications in `apps/`.
