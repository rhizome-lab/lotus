# File Browser Client

A SolidJS file browser with bookmarks and tags.

## Running

```bash
# Start the server first
bun dev:filebrowser-server  # port 8080

# Then start the client
bun dev:filebrowser         # port 3003
```

## Features

- Navigate directories
- Preview file contents
- Create/delete files and directories
- Bookmarks for quick navigation
- Tags and annotations on files

## Architecture

```
src/
├── App.tsx                 # Main layout
├── index.tsx               # Entry point
├── store/
│   └── browser.ts          # LotusClient + SolidJS store
└── components/
    ├── Toolbar.tsx         # Navigation and actions
    ├── FileList.tsx        # Directory listing
    ├── FilePreview.tsx     # File content viewer
    ├── BookmarksPanel.tsx  # Saved locations
    └── TagsPanel.tsx       # File tags
```

## Store API

```typescript
import { browserStore } from "./store/browser";

const { state } = browserStore;
// state.connected, state.cwd, state.entries, state.preview, etc.

await browserStore.look();           // Refresh current directory
await browserStore.go(path);         // Navigate to path
await browserStore.back();           // Go up one directory
await browserStore.open(name);       // Open file or directory
await browserStore.createDir(name);  // Create directory
await browserStore.createFile(name); // Create empty file
await browserStore.remove(name);     // Delete file/directory
await browserStore.bookmark(name);   // Save current location
await browserStore.jump(name);       // Jump to bookmark
await browserStore.addTag(path, tag);
await browserStore.removeTag(path, tag);
```

## CSS

Styles are in `packages/shared/src/index.css` using BEM:

- `.fb`, `.fb__header`, `.fb__main`, `.fb__sidebar`
- `.fb-toolbar`, `.fb-toolbar__btn`
- `.fb-list`, `.fb-list__item`, `.fb-list__item--directory`
- `.fb-preview`, `.fb-preview__content`
- `.fb-bookmarks`, `.fb-bookmarks__item`
- `.fb-tags`, `.fb-tags__item`
