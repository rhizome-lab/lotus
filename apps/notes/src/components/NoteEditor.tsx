import { Show, createSignal, createEffect } from "solid-js";
import { notesStore } from "../store/notes";
import { renderMarkdownWithTransclusion, type ContentResolver } from "../lib/wikilinks";

export function NoteEditor() {
  const { state, updateNote, deleteNote, setEditMode, getNote } = notesStore;

  const [content, setContent] = createSignal("");
  const [title, setTitle] = createSignal("");

  // Sync local state with current note
  createEffect(() => {
    const note = state.currentNote;
    if (note) {
      setContent(note.content);
      setTitle(note.title);
    }
  });

  function handleSave() {
    const note = state.currentNote;
    if (!note) return;

    const newTitle = title() !== note.title ? title() : undefined;
    updateNote(note.id, content(), newTitle);
    setEditMode(false);
  }

  function handleDelete() {
    const note = state.currentNote;
    if (!note) return;

    if (confirm(`Delete "${note.title}"?`)) {
      deleteNote(note.id);
    }
  }

  function handleEdit() {
    setEditMode(true);
  }

  function handleCancel() {
    const note = state.currentNote;
    if (note) {
      setContent(note.content);
      setTitle(note.title);
    }
    setEditMode(false);
  }

  async function handleWikilinkClick(event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (target.classList.contains("wikilink")) {
      event.preventDefault();
      const noteId = target.dataset["noteId"];
      if (noteId) {
        getNote(noteId);
      }
    }
  }

  function resolveLink(linkTarget: string): string | null {
    // Search through notes for matching title or alias
    const lower = linkTarget.toLowerCase();
    for (const note of state.notes) {
      if (note.title.toLowerCase() === lower) {
        return note.id;
      }
      if (note.aliases.some((a) => a.toLowerCase() === lower)) {
        return note.id;
      }
    }
    return null;
  }

  // Resolve note content for transclusion
  const resolveContent: ContentResolver = (linkTarget: string) => {
    const lower = linkTarget.toLowerCase();
    for (const note of state.notes) {
      if (note.title.toLowerCase() === lower) {
        return { content: note.content, title: note.title };
      }
      if (note.aliases.some((a) => a.toLowerCase() === lower)) {
        return { content: note.content, title: note.title };
      }
    }
    return null;
  };

  function renderContent(): string {
    const note = state.currentNote;
    if (!note) return "";
    return renderMarkdownWithTransclusion(note.content, resolveLink, resolveContent);
  }

  return (
    <div class="notes__editor">
      <Show when={state.currentNote} fallback={<EmptyState />}>
        <div class="note-editor">
          <div class="note-editor__header">
            <Show
              when={state.editMode}
              fallback={<h1 class="note-editor__title">{state.currentNote?.title}</h1>}
            >
              <input
                type="text"
                class="note-editor__title-input"
                value={title()}
                onInput={(e) => setTitle(e.currentTarget.value)}
                placeholder="Note title"
              />
            </Show>

            <div class="note-editor__actions">
              <Show
                when={state.editMode}
                fallback={
                  <>
                    <button class="note-editor__btn" onClick={handleEdit}>
                      Edit
                    </button>
                    <button class="note-editor__btn note-editor__btn--danger" onClick={handleDelete}>
                      Delete
                    </button>
                  </>
                }
              >
                <button class="note-editor__btn note-editor__btn--primary" onClick={handleSave}>
                  Save
                </button>
                <button class="note-editor__btn" onClick={handleCancel}>
                  Cancel
                </button>
              </Show>
            </div>
          </div>

          <Show
            when={state.editMode}
            fallback={
              <div
                class="note-editor__preview"
                innerHTML={renderContent()}
                onClick={handleWikilinkClick}
              />
            }
          >
            <textarea
              class="note-editor__textarea"
              value={content()}
              onInput={(e) => setContent(e.currentTarget.value)}
              placeholder="Write your note here... Use [[wikilinks]] to link, ![[note]] to embed."
            />
          </Show>

          <Show when={state.currentNote?.tags && state.currentNote.tags.length > 0}>
            <div class="note-editor__tags">
              {state.currentNote?.tags.map((tag) => (
                <span class="note-editor__tag">#{tag}</span>
              ))}
            </div>
          </Show>
        </div>
      </Show>
    </div>
  );
}

function EmptyState() {
  return (
    <div class="notes__empty-editor">
      <p>Select a note or create a new one</p>
    </div>
  );
}
