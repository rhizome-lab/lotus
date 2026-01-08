# Web Editor Package

Web-based code editor components. Provides specialized editor components used in the web client and playground for writing and editing LotusScript.

## Overview

This package encapsulates the UI and logic for the LotusScript editor. It offers a dual-view experience, allowing users to switch between a text-based code editor and a visual block-based editor.

## Components

- **`ScriptEditor`**: The main container component. It manages the state of the script and coordinates between the code and block views.
- **`MonacoEditor`**: A wrapper around the popular Monaco Editor (used in VS Code), configured for LotusScript syntax highlighting and editing features.
- **`BlockPalette`**: A UI component that lists available script blocks (opcodes), allowing users to drag and drop them into the workspace.
- **`BlockNode`**: A recursive component responsible for rendering the tree structure of the script in the visual block view.
