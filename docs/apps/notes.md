# Notes

The Notes app (`apps/notes`) is a SolidJS wiki-style notes client with wikilinks and backlinks.

## Overview

An Obsidian-style notes app that connects to the notes-server via WebSocket.

## Features

- Create, edit, delete notes
- Markdown with GFM support (tables, strikethrough, autolinks, task lists)
- Wikilinks: `[[Note Title]]` or `[[Note Title|display text]]`
- Backlinks panel showing notes that link to current note
- Search by title, content, or tags
- Tags and aliases

## Running

```bash
# Start the server first
bun dev:notes-server  # port 8081

# Then start the client
bun dev:notes         # port 3004
```

## Architecture

```
src/
├── App.tsx                 # Main layout (3-column grid)
├── store/notes.ts          # ViwoClient + SolidJS store
├── lib/wikilinks.ts        # Markdown rendering
└── components/
    ├── NoteList.tsx        # Sidebar with search
    ├── NoteEditor.tsx      # Edit/preview modes
    └── BacklinksPanel.tsx  # Incoming links
```

## Markdown Pipeline

Uses unified with remark/rehype:

```
remark-parse → remark-gfm → remark-wiki-link → remark-rehype → rehype-raw → rehype-stringify
```

## Store

The `notesStore` provides reactive state and actions:

```typescript
import { notesStore } from "./store/notes";

await notesStore.createNote("Title", "Content");
await notesStore.getNote(noteId);
await notesStore.updateNote(noteId, content, title);
await notesStore.searchNotes("query");
```
