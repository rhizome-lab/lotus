# Notes Client

A SolidJS wiki-style notes app with wikilinks and backlinks.

## Running

```bash
# Start the server first
bun dev:notes-server  # port 8081

# Then start the client
bun dev:notes         # port 3004
```

## Features

- Create, edit, delete notes
- Markdown rendering with GFM support (tables, strikethrough, autolinks, task lists)
- Wikilinks: `[[Note Title]]` or `[[Note Title|display text]]`
- Backlinks panel showing notes that link to current note
- Search by title, content, or tags
- Tags and aliases

## Architecture

```
src/
├── App.tsx                 # Main layout (header + 3-column grid)
├── index.tsx               # Entry point
├── store/
│   └── notes.ts            # LotusClient + SolidJS store
├── components/
│   ├── NoteList.tsx        # Sidebar with search and note list
│   ├── NoteEditor.tsx      # Edit/preview modes
│   └── BacklinksPanel.tsx  # Shows incoming links
└── lib/
    └── wikilinks.ts        # Markdown rendering with remark/rehype
```

## Markdown Pipeline

Uses unified with remark/rehype:

```
remark-parse        # Parse markdown to mdast
    ↓
remark-gfm          # GitHub Flavored Markdown
    ↓
remark-wiki-link    # [[wikilinks]] support
    ↓
remark-rehype       # Convert to hast
    ↓
rehype-raw          # Handle raw HTML
    ↓
rehype-stringify    # Convert to HTML string
```

## Wikilinks

The `extractWikilinks()` function parses markdown and returns link targets:

```typescript
extractWikilinks("See [[Note A]] and [[Note B|other note]]")
// Returns: ["Note A", "Note B"]
```

These are sent to the server when saving, enabling server-side backlink computation.

## Store API

```typescript
import { notesStore } from "./store/notes";

const { state } = notesStore;
// state.connected, state.notes, state.currentNote, state.backlinks, etc.

await notesStore.createNote("Title", "Content");
await notesStore.getNote(noteId);
await notesStore.updateNote(noteId, content, newTitle);
await notesStore.deleteNote(noteId);
await notesStore.searchNotes("query");
await notesStore.addTag(noteId, "tag");
await notesStore.addAlias(noteId, "alias");
```

## CSS

Styles are in `packages/shared/src/index.css` using BEM:

- `.notes`, `.notes__header`, `.notes__main`, `.notes__sidebar`, `.notes__editor`, `.notes__backlinks`
- `.note-list`, `.note-list__item`, `.note-list__item--active`
- `.note-editor`, `.note-editor__textarea`, `.note-editor__preview`
- `.backlinks-panel`, `.backlinks-panel__item`
- `.wikilink`, `.wikilink--missing`
