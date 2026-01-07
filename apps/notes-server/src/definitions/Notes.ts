// oxlint-disable-next-line no-unassigned-import
import "@viwo/core/generated_types";
import { EntityBase } from "@viwo/core/seeds/definitions/EntityBase";

interface Note {
  id: string;
  title: string;
  content: string;
  created: number;
  modified: number;
  tags: string[];
  aliases: string[];
  links: string[]; // Outgoing wikilinks (titles), extracted by client via mdast
}

interface NotesUserProps {
  notes?: Record<string, Note>;
  current_note_id?: string;
  note_counter?: number;
}

interface NotesList {
  type: "notes_list";
  notes: Note[];
}

interface NoteCreated {
  type: "note_created";
  note: Note;
}

interface NoteUpdated {
  type: "note_updated";
  note: Note;
}

interface NoteDeleted {
  type: "note_deleted";
  id: string;
}

interface NoteContent {
  type: "note_content";
  note: Note;
  backlinks: Array<{ id: string; title: string; context: string }>;
}

interface BacklinksList {
  type: "backlinks";
  noteId: string;
  backlinks: Array<{ id: string; title: string; context: string }>;
}

/**
 * Base prototype for notes entities.
 */
export class NotesBase extends EntityBase {
  override name = "Notes Base";
  override description = "Base prototype for notes entities.";

  /**
   * Generate a unique ID for a note.
   * Uses timestamp + counter for uniqueness.
   */
  _generate_note_id(): string {
    const user = std.caller() as NotesUserProps;
    const counter = (user.note_counter ?? 0) + 1;
    const timestamp = time.to_timestamp(time.now());

    // Update counter on user
    const controlCap = get_capability("entity.control", { target_id: std.caller().id });
    if (controlCap) {
      controlCap.update(std.caller(), { note_counter: counter });
    }

    return str.concat(String(timestamp), "_", String(counter));
  }

}

/**
 * User entity for notes paradigm.
 * Stores notes and provides CRUD + backlinks.
 */
export class NotesUser extends NotesBase {
  override name = "Notes User";
  override description = "A notes user with wiki-style linking.";
  notes?: Record<string, Note> = {};
  current_note_id?: string;

  /**
   * List all notes.
   */
  list_notes() {
    const user = std.caller() as NotesUserProps;
    const notesMap = user.notes ?? {};
    const keys = obj.keys(notesMap) as string[];

    // Map keys to notes
    const notesList = list.map(keys, (key: string) => obj.get(notesMap, key) as Note) as Note[];

    // Notes are returned in key order (no custom sort comparator available)

    const result: NotesList = {
      notes: notesList,
      type: "notes_list",
    };

    return result;
  }

  /**
   * Create a new note.
   * @param links - Outgoing wikilink titles, extracted by client via mdast
   */
  create_note(title: string, content?: string, links?: string[]) {
    if (!title) {
      std.throw_("Usage: create_note <title> [content] [links]");
    }

    const user = std.caller() as NotesUserProps;
    const notesMap = user.notes ?? {};
    const now = time.to_timestamp(time.now());
    const noteId = call(std.this_(), "_generate_note_id") as string;

    const note: Note = {
      aliases: [],
      content: content ?? "",
      created: now,
      id: noteId,
      links: (links ?? []) as string[],
      modified: now,
      tags: [],
      title: title,
    };

    obj.set(notesMap, noteId, note);

    const controlCap = get_capability("entity.control", { target_id: std.caller().id });
    if (controlCap) {
      controlCap.update(std.caller(), { notes: notesMap, current_note_id: noteId });
    }

    const result: NoteCreated = {
      note: note,
      type: "note_created",
    };

    return result;
  }

  /**
   * Get a note by ID.
   */
  get_note(noteId: string) {
    if (!noteId) {
      std.throw_("Usage: get_note <noteId>");
    }

    const user = std.caller() as NotesUserProps;
    const notesMap = user.notes ?? {};

    if (!obj.has(notesMap, noteId)) {
      std.throw_(str.concat("Note not found: ", noteId));
    }

    const note = obj.get(notesMap, noteId) as Note;
    const backlinks = call(std.this_(), "_get_backlinks_for", note.title, note.aliases ?? []) as Array<{
      id: string;
      title: string;
      context: string;
    }>;

    const controlCap = get_capability("entity.control", { target_id: std.caller().id });
    if (controlCap) {
      controlCap.update(std.caller(), { current_note_id: noteId });
    }

    const result: NoteContent = {
      backlinks: backlinks,
      note: note,
      type: "note_content",
    };

    return result;
  }

  /**
   * Update an existing note.
   * @param links - Outgoing wikilink titles, extracted by client via mdast
   */
  update_note(noteId: string, content: string, title?: string, links?: string[]) {
    if (!noteId) {
      std.throw_("Usage: update_note <noteId> <content> [title] [links]");
    }

    const user = std.caller() as NotesUserProps;
    const notesMap = user.notes ?? {};

    if (!obj.has(notesMap, noteId)) {
      std.throw_(str.concat("Note not found: ", noteId));
    }

    const note = obj.get(notesMap, noteId) as Note;
    const now = time.to_timestamp(time.now());

    const updatedNote: Note = {
      aliases: note.aliases,
      content: content,
      created: note.created,
      id: note.id,
      links: links ?? note.links ?? [],
      modified: now,
      tags: note.tags,
      title: title ?? note.title,
    };

    obj.set(notesMap, noteId, updatedNote);

    const controlCap = get_capability("entity.control", { target_id: std.caller().id });
    if (controlCap) {
      controlCap.update(std.caller(), { notes: notesMap });
    }

    const result: NoteUpdated = {
      note: updatedNote,
      type: "note_updated",
    };

    return result;
  }

  /**
   * Delete a note.
   */
  delete_note(noteId: string) {
    if (!noteId) {
      std.throw_("Usage: delete_note <noteId>");
    }

    const user = std.caller() as NotesUserProps;
    const notesMap = user.notes ?? {};

    if (!obj.has(notesMap, noteId)) {
      std.throw_(str.concat("Note not found: ", noteId));
    }

    obj.del(notesMap, noteId);

    const updateProps: Record<string, unknown> = { notes: notesMap };
    if (user.current_note_id === noteId) {
      updateProps["current_note_id"] = null;
    }

    const controlCap = get_capability("entity.control", { target_id: std.caller().id });
    if (controlCap) {
      controlCap.update(std.caller(), updateProps);
    }

    const result: NoteDeleted = {
      id: noteId,
      type: "note_deleted",
    };

    return result;
  }

  /**
   * Get backlinks for a note by ID.
   * Searches all notes for ones whose `links` array contains this note's title or aliases.
   */
  get_backlinks(noteId: string) {
    if (!noteId) {
      std.throw_("Usage: get_backlinks <noteId>");
    }

    const user = std.caller() as NotesUserProps;
    const notesMap = user.notes ?? {};

    if (!obj.has(notesMap, noteId)) {
      std.throw_(str.concat("Note not found: ", noteId));
    }

    const targetNote = obj.get(notesMap, noteId) as Note;
    const backlinks = call(std.this_(), "_get_backlinks_for", targetNote.title, targetNote.aliases) as Array<{
      id: string;
      title: string;
      context: string;
    }>;

    const result: BacklinksList = {
      backlinks: backlinks,
      noteId: noteId,
      type: "backlinks",
    };

    return result;
  }

  /**
   * Internal: Find notes that link to a given title/aliases.
   */
  _get_backlinks_for(title: string, aliases: string[]) {
    const user = std.caller() as NotesUserProps;
    const notesMap = user.notes ?? {};
    const keys = obj.keys(notesMap) as string[];
    const lowerTitle = str.lower(title);

    // Build lowercase aliases list for matching
    const lowerAliases = list.map(aliases, (a: string) => str.lower(a)) as string[];

    // Filter notes that have a link matching title or aliases
    const matchingKeys = list.filter(keys, (key: string) => {
      const note = obj.get(notesMap, key) as Note;
      const links = note.links ?? [];

      // Check if any link matches
      const matchingLink = list.find(links, (link: string) => {
        const lowerLink = str.lower(link);
        if (lowerLink === lowerTitle) {
          return true;
        }
        // Check against aliases
        const aliasMatch = list.find(lowerAliases, (alias: string) => alias === lowerLink);
        return aliasMatch !== null;
      });

      return matchingLink !== null;
    });

    // Map to backlink objects
    const backlinks = list.map(matchingKeys, (key: string) => {
      const note = obj.get(notesMap, key) as Note;
      return {
        context: note.content, // Full content as context
        id: note.id,
        title: note.title,
      };
    }) as Array<{ id: string; title: string; context: string }>;

    return backlinks;
  }

  /**
   * Add a tag to a note.
   */
  add_tag(noteId: string, tagName: string) {
    if (!noteId || !tagName) {
      std.throw_("Usage: add_tag <noteId> <tag>");
    }

    const user = std.caller() as NotesUserProps;
    const notesMap = user.notes ?? {};

    if (!obj.has(notesMap, noteId)) {
      std.throw_(str.concat("Note not found: ", noteId));
    }

    const note = obj.get(notesMap, noteId) as Note;
    const tags = note.tags ?? [];

    if (!list.includes(tags, tagName)) {
      list.push(tags, tagName);
    }

    const updatedNote: Note = {
      aliases: note.aliases,
      content: note.content,
      created: note.created,
      id: note.id,
      links: note.links ?? [],
      modified: time.to_timestamp(time.now()),
      tags: tags,
      title: note.title,
    };

    obj.set(notesMap, noteId, updatedNote);

    const controlCap = get_capability("entity.control", { target_id: std.caller().id });
    if (controlCap) {
      controlCap.update(std.caller(), { notes: notesMap });
    }

    return {
      noteId: noteId,
      tag: tagName,
      type: "tag_added",
    };
  }

  /**
   * Remove a tag from a note.
   */
  remove_tag(noteId: string, tagName: string) {
    if (!noteId || !tagName) {
      std.throw_("Usage: remove_tag <noteId> <tag>");
    }

    const user = std.caller() as NotesUserProps;
    const notesMap = user.notes ?? {};

    if (!obj.has(notesMap, noteId)) {
      std.throw_(str.concat("Note not found: ", noteId));
    }

    const note = obj.get(notesMap, noteId) as Note;
    const tags = note.tags ?? [];
    const newTags = list.filter(tags, (tag: string) => tag !== tagName) as string[];

    const updatedNote: Note = {
      aliases: note.aliases,
      content: note.content,
      created: note.created,
      id: note.id,
      links: note.links ?? [],
      modified: time.to_timestamp(time.now()),
      tags: newTags,
      title: note.title,
    };

    obj.set(notesMap, noteId, updatedNote);

    const controlCap = get_capability("entity.control", { target_id: std.caller().id });
    if (controlCap) {
      controlCap.update(std.caller(), { notes: notesMap });
    }

    return {
      noteId: noteId,
      tag: tagName,
      type: "tag_removed",
    };
  }

  /**
   * Add an alias to a note.
   */
  add_alias(noteId: string, aliasName: string) {
    if (!noteId || !aliasName) {
      std.throw_("Usage: add_alias <noteId> <alias>");
    }

    const user = std.caller() as NotesUserProps;
    const notesMap = user.notes ?? {};

    if (!obj.has(notesMap, noteId)) {
      std.throw_(str.concat("Note not found: ", noteId));
    }

    const note = obj.get(notesMap, noteId) as Note;
    const aliases = note.aliases ?? [];

    if (!list.includes(aliases, aliasName)) {
      list.push(aliases, aliasName);
    }

    const updatedNote: Note = {
      aliases: aliases,
      content: note.content,
      created: note.created,
      id: note.id,
      links: note.links ?? [],
      modified: time.to_timestamp(time.now()),
      tags: note.tags,
      title: note.title,
    };

    obj.set(notesMap, noteId, updatedNote);

    const controlCap = get_capability("entity.control", { target_id: std.caller().id });
    if (controlCap) {
      controlCap.update(std.caller(), { notes: notesMap });
    }

    return {
      alias: aliasName,
      noteId: noteId,
      type: "alias_added",
    };
  }

  /**
   * Search notes by title or content.
   */
  search_notes(query: string) {
    if (!query) {
      std.throw_("Usage: search_notes <query>");
    }

    const user = std.caller() as NotesUserProps;
    const notesMap = user.notes ?? {};
    const lowerQuery = str.lower(query);
    const keys = obj.keys(notesMap) as string[];

    // Filter notes that match query in title, content, or tags
    const matchingKeys = list.filter(keys, (key: string) => {
      const note = obj.get(notesMap, key) as Note;

      // Search in title
      if (str.includes(str.lower(note.title), lowerQuery)) {
        return true;
      }

      // Search in content
      if (str.includes(str.lower(note.content), lowerQuery)) {
        return true;
      }

      // Search in tags
      const matchingTag = list.find(note.tags, (tag: string) => str.includes(str.lower(tag), lowerQuery));
      return matchingTag !== null;
    });

    const results = list.map(matchingKeys, (key: string) => obj.get(notesMap, key) as Note) as Note[];

    return {
      notes: results,
      query: query,
      type: "search_results",
    };
  }

  /**
   * Find note by title (for wikilink resolution).
   */
  find_note_by_title(title: string) {
    if (!title) {
      return null;
    }

    const user = std.caller() as NotesUserProps;
    const notesMap = user.notes ?? {};
    const lowerTitle = str.lower(title);
    const keys = obj.keys(notesMap) as string[];

    // Find first note that matches title or has matching alias
    const matchingKey = list.find(keys, (key: string) => {
      const note = obj.get(notesMap, key) as Note;

      // Check title
      if (str.lower(note.title) === lowerTitle) {
        return true;
      }

      // Check aliases
      const matchingAlias = list.find(note.aliases, (alias: string) => str.lower(alias) === lowerTitle);
      return matchingAlias !== null;
    });

    if (matchingKey === null) {
      return null;
    }

    return obj.get(notesMap, matchingKey) as Note;
  }
}
