import { Show, onMount } from "solid-js";
import { NoteList } from "./components/NoteList";
import { NoteEditor } from "./components/NoteEditor";
import { BacklinksPanel } from "./components/BacklinksPanel";
import { notesStore } from "./store/notes";

export default function App() {
  const { state, connect, listNotes } = notesStore;

  onMount(() => {
    connect();
  });

  // Load notes when connected
  onMount(() => {
    const unsubscribe = setInterval(() => {
      if (state.connected) {
        listNotes();
        clearInterval(unsubscribe);
      }
    }, 100);

    return () => clearInterval(unsubscribe);
  });

  return (
    <div class="notes">
      <header class="notes__header">
        <h1 class="notes__title">Bloom Notes</h1>
        <Show
          when={state.connected}
          fallback={<span class="notes__status notes__status--disconnected">Connecting...</span>}
        >
          <span class="notes__status notes__status--connected">Connected</span>
        </Show>
      </header>

      <Show when={state.error}>
        <div class="notes__error">{state.error}</div>
      </Show>

      <main class="notes__main">
        <NoteList />
        <NoteEditor />
        <BacklinksPanel />
      </main>
    </div>
  );
}
