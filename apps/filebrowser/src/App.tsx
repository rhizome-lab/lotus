import { type FileEntry, browserStore } from "./store/browser";
import { For, Show, createSignal, onMount } from "solid-js";

function formatSize(bytes?: number): string {
  if (bytes === undefined) {
    return "";
  }
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function Toolbar() {
  const [showCreateDir, setShowCreateDir] = createSignal(false);
  const [showCreateFile, setShowCreateFile] = createSignal(false);
  const [showBookmark, setShowBookmark] = createSignal(false);
  const [inputValue, setInputValue] = createSignal("");

  const handleCreateDir = () => {
    const name = inputValue().trim();
    if (name) {
      browserStore.createDir(name);
      setInputValue("");
      setShowCreateDir(false);
    }
  };

  const handleCreateFile = () => {
    const name = inputValue().trim();
    if (name) {
      browserStore.createFile(name);
      setInputValue("");
      setShowCreateFile(false);
    }
  };

  const handleBookmark = () => {
    const name = inputValue().trim();
    if (name) {
      browserStore.bookmark(name);
      setInputValue("");
      setShowBookmark(false);
    }
  };

  const handleKeyDown = (event: KeyboardEvent, action: () => void) => {
    if (event.key === "Enter") {
      action();
    } else if (event.key === "Escape") {
      setInputValue("");
      setShowCreateDir(false);
      setShowCreateFile(false);
      setShowBookmark(false);
    }
  };

  return (
    <div class="fb-toolbar">
      <Show
        when={!showCreateDir() && !showCreateFile() && !showBookmark()}
        fallback={
          <div class="fb-toolbar__input-group">
            <input
              class="fb-toolbar__input"
              type="text"
              placeholder={
                showCreateDir()
                  ? "Directory name..."
                  : showCreateFile()
                    ? "File name..."
                    : "Bookmark name..."
              }
              value={inputValue()}
              onInput={(event) => setInputValue(event.currentTarget.value)}
              onKeyDown={(event) =>
                handleKeyDown(
                  event,
                  showCreateDir()
                    ? handleCreateDir
                    : showCreateFile()
                      ? handleCreateFile
                      : handleBookmark,
                )
              }
              autofocus
            />
            <button
              class="fb-toolbar__btn fb-toolbar__btn--confirm"
              onClick={
                showCreateDir()
                  ? handleCreateDir
                  : showCreateFile()
                    ? handleCreateFile
                    : handleBookmark
              }
            >
              OK
            </button>
            <button
              class="fb-toolbar__btn fb-toolbar__btn--cancel"
              onClick={() => {
                setInputValue("");
                setShowCreateDir(false);
                setShowCreateFile(false);
                setShowBookmark(false);
              }}
            >
              Cancel
            </button>
          </div>
        }
      >
        <button class="fb-toolbar__btn" onClick={() => setShowCreateDir(true)} title="Create directory">
          + Dir
        </button>
        <button class="fb-toolbar__btn" onClick={() => setShowCreateFile(true)} title="Create file">
          + File
        </button>
        <button class="fb-toolbar__btn" onClick={() => setShowBookmark(true)} title="Bookmark current directory">
          Bookmark
        </button>
        <Show when={browserStore.state.selectedPath}>
          <button
            class="fb-toolbar__btn fb-toolbar__btn--danger"
            onClick={() => {
              const selected = browserStore.state.selectedPath;
              if (selected && confirm(`Delete ${selected}?`)) {
                const name = selected.split("/").pop() ?? selected;
                browserStore.remove(name);
                browserStore.selectPath(null);
              }
            }}
            title="Delete selected"
          >
            Delete
          </button>
        </Show>
      </Show>
    </div>
  );
}

function Breadcrumb() {
  const segments = () => {
    const { cwd } = browserStore.state;
    if (!cwd || cwd === "/") {
      return ["/"];
    }
    const parts = cwd.split("/").filter(Boolean);
    return ["/", ...parts];
  };

  const navigateToSegment = (idx: number) => {
    const segs = segments();
    if (idx === 0) {
      browserStore.go("/");
    } else {
      const path = `/${segs.slice(1, idx + 1).join("/")}`;
      browserStore.go(path);
    }
  };

  return (
    <div class="fb-breadcrumb">
      <For each={segments()}>
        {(segment, idx) => (
          <>
            <span class="fb-breadcrumb__segment" onClick={() => navigateToSegment(idx())}>
              {segment}
            </span>
            <Show when={idx() < segments().length - 1}>
              <span class="fb-breadcrumb__separator">/</span>
            </Show>
          </>
        )}
      </For>
    </div>
  );
}

function FileList() {
  const handleClick = (entry: FileEntry) => {
    browserStore.selectPath(entry.path);
    browserStore.open(entry.name);
  };

  const handleSelect = (event: MouseEvent, entry: FileEntry) => {
    event.stopPropagation();
    browserStore.selectPath(entry.path);
  };

  return (
    <div class="fb-list" onClick={() => browserStore.selectPath(null)}>
      <Show when={browserStore.state.cwd !== "/"}>
        <div class="fb-entry fb-entry--dir" onClick={() => browserStore.back()}>
          <span class="fb-entry__icon">..</span>
          <span class="fb-entry__name">(parent)</span>
        </div>
      </Show>
      <For each={browserStore.state.entries}>
        {(entry) => (
          <div
            class={`fb-entry ${entry.isDirectory ? "fb-entry--dir" : ""} ${browserStore.state.selectedPath === entry.path ? "fb-entry--selected" : ""}`}
            onClick={(event) => handleSelect(event, entry)}
            onDblClick={() => handleClick(entry)}
          >
            <span class="fb-entry__icon">{entry.isDirectory ? "D" : "F"}</span>
            <span class="fb-entry__name">{entry.name}</span>
            <span class="fb-entry__size">{formatSize(entry.size)}</span>
          </div>
        )}
      </For>
    </div>
  );
}

function Bookmarks() {
  const bookmarkEntries = () => Object.entries(browserStore.state.bookmarks);

  return (
    <div class="fb-bookmarks">
      <div class="fb-bookmarks__header">Bookmarks</div>
      <Show when={bookmarkEntries().length === 0}>
        <div class="fb-bookmarks__empty">No bookmarks</div>
      </Show>
      <For each={bookmarkEntries()}>
        {([name, path]) => (
          <div class="fb-bookmarks__item" onClick={() => browserStore.jump(name)} title={path}>
            {name}
          </div>
        )}
      </For>
    </div>
  );
}

function TagsPanel() {
  const [newTag, setNewTag] = createSignal("");
  const selectedPath = () => browserStore.state.selectedPath;

  const handleAddTag = () => {
    const tag = newTag().trim();
    const path = selectedPath();
    if (tag && path) {
      browserStore.addTag(path, tag);
      setNewTag("");
    }
  };

  return (
    <div class="fb-tags">
      <div class="fb-tags__header">Tags</div>
      <Show when={selectedPath()} fallback={<div class="fb-tags__empty">Select a file</div>}>
        <div class="fb-tags__path">{selectedPath()?.split("/").pop()}</div>
        <div class="fb-tags__list">
          <For each={browserStore.state.tags}>
            {(tag) => (
              <span class="fb-tags__tag">
                {tag}
                <button
                  class="fb-tags__remove"
                  onClick={() => browserStore.removeTag(selectedPath()!, tag)}
                >
                  x
                </button>
              </span>
            )}
          </For>
        </div>
        <div class="fb-tags__add">
          <input
            class="fb-tags__input"
            type="text"
            placeholder="Add tag..."
            value={newTag()}
            onInput={(event) => setNewTag(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                handleAddTag();
              }
            }}
          />
          <button class="fb-tags__btn" onClick={handleAddTag}>
            +
          </button>
        </div>
      </Show>
    </div>
  );
}

function Preview() {
  const preview = () => browserStore.state.preview;

  return (
    <div class="fb-preview">
      <Show when={preview()} fallback={<div class="fb-preview__empty">Select a file to preview</div>}>
        <div class="fb-preview__header">
          <span class="fb-preview__name">{preview()!.name}</span>
          <span class="fb-preview__size">{formatSize(preview()!.size)}</span>
          <button class="fb-preview__close" onClick={() => browserStore.closePreview()}>
            x
          </button>
        </div>
        <pre class="fb-preview__content">{preview()!.content}</pre>
      </Show>
    </div>
  );
}

function App() {
  onMount(() => {
    browserStore.connect();
    const checkConnection = setInterval(() => {
      if (browserStore.state.connected) {
        clearInterval(checkConnection);
        browserStore.look();
        browserStore.loadBookmarks();
      }
    }, 100);
  });

  return (
    <div class="fb">
      <header class="fb__header">
        <div class="fb__title">Bloom File Browser</div>
        <div class={`fb__status ${browserStore.state.connected ? "fb__status--online" : ""}`}>
          {browserStore.state.connected ? "ONLINE" : "OFFLINE"}
        </div>
      </header>

      <Show when={browserStore.state.error}>
        <div class="fb__error">{browserStore.state.error}</div>
      </Show>

      <Toolbar />

      <div class="fb__main">
        <aside class="fb__left-sidebar">
          <Bookmarks />
        </aside>
        <div class="fb__content">
          <Breadcrumb />
          <Show when={browserStore.state.loading}>
            <div class="fb__loading">Loading...</div>
          </Show>
          <FileList />
        </div>
        <aside class="fb__right-sidebar">
          <TagsPanel />
          <Preview />
        </aside>
      </div>
    </div>
  );
}

export default App;
