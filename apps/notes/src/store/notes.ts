import { BloomClient } from "@bloom/client";
import { createStore } from "solid-js/store";
import { extractAllLinks } from "../lib/wikilinks";

export interface Note {
  id: string;
  title: string;
  content: string;
  created: number;
  modified: number;
  tags: string[];
  aliases: string[];
  links: string[];
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

interface SearchResults {
  type: "search_results";
  query: string;
  notes: Note[];
}

interface NotesState {
  connected: boolean;
  loading: boolean;
  notes: Note[];
  currentNote: Note | null;
  backlinks: Array<{ id: string; title: string; context: string }>;
  searchQuery: string;
  searchResults: Note[];
  editMode: boolean;
  error: string | null;
}

const client = new BloomClient("ws://localhost:8081");

const [state, setState] = createStore<NotesState>({
  backlinks: [],
  connected: false,
  currentNote: null,
  editMode: false,
  error: null,
  loading: false,
  notes: [],
  searchQuery: "",
  searchResults: [],
});

// Sync connection state
client.subscribe((clientState) => {
  setState("connected", clientState.isConnected);
});

async function listNotes(): Promise<void> {
  setState("loading", true);
  setState("error", null);
  try {
    const result = (await client.execute("list_notes", [])) as NotesList;
    if (result && result.type === "notes_list") {
      setState({
        loading: false,
        notes: result.notes,
      });
    }
  } catch (error) {
    setState("error", String(error));
    setState("loading", false);
  }
}

async function createNote(title: string, content = ""): Promise<Note | null> {
  setState("loading", true);
  setState("error", null);
  try {
    const links = extractAllLinks(content);
    const result = (await client.execute("create_note", [title, content, links])) as NoteCreated;
    if (result && result.type === "note_created") {
      await listNotes();
      setState({
        currentNote: result.note,
        editMode: true,
        loading: false,
      });
      return result.note;
    }
    return null;
  } catch (error) {
    setState("error", String(error));
    setState("loading", false);
    return null;
  }
}

async function getNote(noteId: string): Promise<void> {
  setState("loading", true);
  setState("error", null);
  try {
    const result = (await client.execute("get_note", [noteId])) as NoteContent;
    if (result && result.type === "note_content") {
      setState({
        backlinks: result.backlinks,
        currentNote: result.note,
        editMode: false,
        loading: false,
      });
    }
  } catch (error) {
    setState("error", String(error));
    setState("loading", false);
  }
}

async function updateNote(
  noteId: string,
  content: string,
  title?: string,
): Promise<void> {
  setState("loading", true);
  setState("error", null);
  try {
    const links = extractAllLinks(content);
    const result = (await client.execute("update_note", [
      noteId,
      content,
      title ?? null,
      links,
    ])) as NoteUpdated;
    if (result && result.type === "note_updated") {
      setState({
        currentNote: result.note,
        loading: false,
      });
      await listNotes();
    }
  } catch (error) {
    setState("error", String(error));
    setState("loading", false);
  }
}

async function deleteNote(noteId: string): Promise<void> {
  setState("loading", true);
  setState("error", null);
  try {
    const result = (await client.execute("delete_note", [noteId])) as NoteDeleted;
    if (result && result.type === "note_deleted") {
      setState({
        backlinks: [],
        currentNote: null,
        loading: false,
      });
      await listNotes();
    }
  } catch (error) {
    setState("error", String(error));
    setState("loading", false);
  }
}

async function searchNotes(query: string): Promise<void> {
  setState("searchQuery", query);
  if (!query) {
    setState("searchResults", []);
    return;
  }

  setState("loading", true);
  setState("error", null);
  try {
    const result = (await client.execute("search_notes", [query])) as SearchResults;
    if (result && result.type === "search_results") {
      setState({
        loading: false,
        searchResults: result.notes,
      });
    }
  } catch (error) {
    setState("error", String(error));
    setState("loading", false);
  }
}

async function findNoteByTitle(title: string): Promise<Note | null> {
  try {
    const result = (await client.execute("find_note_by_title", [title])) as Note | null;
    return result;
  } catch {
    return null;
  }
}

async function addTag(noteId: string, tag: string): Promise<void> {
  setState("error", null);
  try {
    await client.execute("add_tag", [noteId, tag]);
    if (state.currentNote?.id === noteId) {
      await getNote(noteId);
    }
  } catch (error) {
    setState("error", String(error));
  }
}

async function removeTag(noteId: string, tag: string): Promise<void> {
  setState("error", null);
  try {
    await client.execute("remove_tag", [noteId, tag]);
    if (state.currentNote?.id === noteId) {
      await getNote(noteId);
    }
  } catch (error) {
    setState("error", String(error));
  }
}

async function addAlias(noteId: string, alias: string): Promise<void> {
  setState("error", null);
  try {
    await client.execute("add_alias", [noteId, alias]);
    if (state.currentNote?.id === noteId) {
      await getNote(noteId);
    }
  } catch (error) {
    setState("error", String(error));
  }
}

function connect(): void {
  client.connect();
}

function setEditMode(editMode: boolean): void {
  setState("editMode", editMode);
}

function clearSearch(): void {
  setState("searchQuery", "");
  setState("searchResults", []);
}

export const notesStore = {
  addAlias,
  addTag,
  clearSearch,
  connect,
  createNote,
  deleteNote,
  findNoteByTitle,
  getNote,
  listNotes,
  removeTag,
  searchNotes,
  setEditMode,
  state,
  updateNote,
};
