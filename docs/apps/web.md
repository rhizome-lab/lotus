# Web Client

The main web frontend for Lotus. A modern, responsive web application that allows users to play Lotus directly in their browser.

## Overview

The Web Client provides a rich graphical interface for the game world, chat, and other features. It connects to the Lotus Server using the `@lotus/client` SDK and renders the game state using a TUI-like interface built with web technologies.

## Architecture

The application is built using **SolidJS** and **Vite**.

### Key Components

- **`src/App.tsx`**: The root component that sets up the application structure and providers.
- **`src/store`**: State management logic, likely utilizing SolidJS stores to handle game state, user session, and UI state.
- **`src/components`**: Reusable UI components used throughout the application, such as the terminal window, chat input, and entity displays.

## Key Features

- **Game Rendering**: Renders the game world in a text-based format enhanced with modern UI elements.
- **Chat Integration**: Real-time chat functionality for communicating with other players and the game system.
- **Entity Interaction**: Interfaces for interacting with game entities (looking, taking, moving).
