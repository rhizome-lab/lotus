# Web Frontend Documentation

## Overview

The Lotus web frontend is a modern, responsive single-page application built with [SolidJS](https://www.solidjs.com/). It provides a rich interface for interacting with the game world, including a command-line interface, visual room representation, inventory management, and a powerful "Builder Mode" for content creation.

## Layout

The application uses a CSS Grid layout to organize the screen into distinct functional areas.

```text
+--------------------------------------------------+
|                      Header                      |
+--------------+--------------------+--------------+
|              |                    |              |
|              |                    |              |
|     Log      |        Room        |  Inventory   |
|              |                    |              |
|              |                    |              |
+--------------+--------------------+--------------+
|   Compass    |             Inspector             |
+--------------+-----------------------------------+
```

- **Header**: Contains the game title, connection status, and global controls (Builder, Settings).
- **Log**: Displays the game history and custom exits.
- **Room**: The main viewport showing the current location's details and the Builder interface overlay.
- **Inventory**: A dedicated panel for managing player items.
- **Compass**: A 3x3 grid for navigation.
- **Inspector**: A detailed view for inspecting specific items or entities.

## Architecture

The application is structured as a standard SolidJS project within `apps/web`.

- **`src/App.tsx`**: The main entry point and layout component. It handles global event listeners (like keyboard shortcuts) and renders the main UI sections.
- **`src/store/game.ts`**: Contains the `gameStore`, which manages the client-side state of the game (entities, connection status, player location) and handles communication with the core server via JSON-RPC.

## Key Components

### Room Panel (`src/components/RoomPanel.tsx`)

The central view of the game. It displays:

- **Room Name**: The title of the current location.
- **Description**: A textual description of the room.
- **Exits**: Clickable links to move to adjacent rooms.
- **Contents**: Interactive list of items and NPCs in the room.

### Inventory Panel (`src/components/InventoryPanel.tsx`)

Displays the items currently held by the player. Clicking on an item allows for interaction (e.g., "look", "drop").

### Game Log (`src/components/GameLog.tsx`)

A scrolling log of game events, messages, and command history. It serves as the primary feedback mechanism for user actions.

### Compass (`src/components/Compass.tsx`)

A 3x3 grid of buttons representing the cardinal and ordinal directions (North, South, East, West, NE, NW, SE, SW) and "Here".

- **Navigation**: Clicking a direction button sends a `move` command.
- **Visual Feedback**: Buttons light up if an exit exists in that direction.
- **Popover**: Clicking a direction with no exit (or long-pressing/right-clicking) opens a `DigPanel` popover, allowing builders to quickly create new rooms in that direction.

### Custom Exits (`src/components/CustomExits.tsx`)

Displays a list of exits that do not fit into the standard compass directions (e.g., "up", "down", "enter portal").

- **Location**: Rendered within the Log area for easy access.
- **Functionality**: Clicking a custom exit sends the corresponding `move` command.
- **Creation**: Includes a "+" button to open a `DigPanel` for creating new custom exits.

## Builder Mode

Builder Mode is a powerful feature that allows users to modify the game world directly from the client. It can be toggled by clicking the "Builder" button in the header.

### Features

1.  **Room Tab**:

    - Allows editing the description of the current room.
    - Changes are applied immediately via the `set` command.

2.  **Create Item Tab** (`src/components/ItemCreator.tsx`):

    - Provides a form to create new entities (items, NPCs) in the current room.
    - Users can specify name, description, and initial properties.

3.  **Edit Item Tab** (`src/components/ItemEditor.tsx`):

    - Allows modifying properties of existing items in the room.

4.  **Script Tab** (`src/components/ScriptEditor/`):
    - An integrated code editor for writing and attaching scripts to entities.
    - **Dual View**: Supports both a block-based visual editor (for beginners) and a TypeScript-based text editor (Monaco) for advanced users.
    - Enables adding behavior and logic to game objects directly within the game.

## Theming

The frontend supports dynamic theming.

- **Theme Editor** (`src/components/ThemeEditor.tsx`): Allows users to customize colors and fonts.
- **Custom CSS**: Rooms can have a `custom_css` property that is injected into the page when the player enters, allowing for unique visual atmospheres per location.
