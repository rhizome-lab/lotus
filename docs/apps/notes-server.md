# Notes Server

The Notes Server (`apps/notes-server`) provides a wiki-style notes backend with wikilinks and backlinks.

## Overview

The server uses the Lotus entity system to store notes:

1. **NotesBase**: Base prototype with ID generation
2. **NotesUser**: User prototype with all note verbs
3. **Notebook**: User instance that stores notes

## Running

```bash
bun dev:notes-server  # runs on port 8081
```

## Data Model

```typescript
interface Note {
  id: string;           // Unique ID
  title: string;
  content: string;      // Markdown with [[wikilinks]]
  created: number;      // Unix timestamp (ms)
  modified: number;
  tags: string[];
  aliases: string[];    // Alternative titles for linking
  links: string[];      // Outgoing wikilink targets
}
```

## Verbs

| Verb | Description |
|------|-------------|
| `list_notes` | List all notes |
| `create_note` | Create a new note |
| `get_note` | Get note by ID (includes backlinks) |
| `update_note` | Update note content/title |
| `delete_note` | Delete a note |
| `get_backlinks` | Get notes that link to this note |
| `add_tag` | Add tag to note |
| `remove_tag` | Remove tag |
| `add_alias` | Add alias for linking |
| `search_notes` | Search by title/content/tags |
| `find_note_by_title` | Find note by title or alias |

## Backlinks

Backlinks are computed server-side by searching all notes for ones whose `links` array contains the target note's title or aliases. The client extracts wikilinks from markdown and sends them when saving.
