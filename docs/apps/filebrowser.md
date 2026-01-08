# File Browser

The File Browser (`apps/filebrowser`) is a SolidJS file browser client with bookmarks and tags.

## Overview

A web-based file browser that connects to the filebrowser-server via WebSocket.

## Features

- Navigate directories
- Preview file contents
- Create/delete files and directories
- Bookmarks for quick navigation
- Tags and annotations on files

## Running

```bash
# Start the server first
bun dev:filebrowser-server  # port 8080

# Then start the client
bun dev:filebrowser         # port 3003
```

## Architecture

```
src/
├── App.tsx                 # Main layout
├── store/browser.ts        # LotusClient + SolidJS store
└── components/
    ├── Toolbar.tsx         # Navigation and actions
    ├── FileList.tsx        # Directory listing
    ├── FilePreview.tsx     # File content viewer
    ├── BookmarksPanel.tsx  # Saved locations
    └── TagsPanel.tsx       # File tags
```

## Store

The `browserStore` provides reactive state and actions:

```typescript
import { browserStore } from "./store/browser";

await browserStore.look();           // Refresh directory
await browserStore.go(path);         // Navigate
await browserStore.open(name);       // Open file/directory
await browserStore.bookmark(name);   // Save location
```
