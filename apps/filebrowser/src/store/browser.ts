import { LotusClient } from "@lotus/client";
import { createStore } from "solid-js/store";

export interface FileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  size?: number;
  mtime?: string;
}

interface DirectoryListing {
  type: "directory_listing";
  path: string;
  entries: FileEntry[];
}

interface FileContent {
  type: "file_content";
  path: string;
  name: string;
  content: string;
  size: number;
}

interface BookmarkCreated {
  type: "bookmark_created";
  name: string;
  path: string;
}

interface BookmarksList {
  type: "bookmarks";
  bookmarks: Record<string, string>;
}

interface TagsResult {
  type: "tags";
  path: string;
  tags: string[];
}

interface BrowserState {
  connected: boolean;
  loading: boolean;
  cwd: string;
  entries: FileEntry[];
  preview: FileContent | null;
  error: string | null;
  bookmarks: Record<string, string>;
  selectedPath: string | null;
  tags: string[];
}

const client = new LotusClient("ws://localhost:8080");

const [state, setState] = createStore<BrowserState>({
  bookmarks: {},
  connected: false,
  cwd: "/",
  entries: [],
  error: null,
  loading: false,
  preview: null,
  selectedPath: null,
  tags: [],
});

// Sync connection state
client.subscribe((clientState) => {
  setState("connected", clientState.isConnected);
});

async function look(): Promise<void> {
  setState("loading", true);
  setState("error", null);
  try {
    const result = (await client.execute("look", [])) as DirectoryListing;
    if (result && result.type === "directory_listing") {
      setState({
        cwd: result.path,
        entries: result.entries,
        loading: false,
        preview: null,
      });
    }
  } catch (error) {
    setState("error", String(error));
    setState("loading", false);
  }
}

async function go(path: string): Promise<void> {
  setState("loading", true);
  setState("error", null);
  try {
    const result = (await client.execute("go", [path])) as DirectoryListing;
    if (result && result.type === "directory_listing") {
      setState({
        cwd: result.path,
        entries: result.entries,
        loading: false,
        preview: null,
      });
    }
  } catch (error) {
    setState("error", String(error));
    setState("loading", false);
  }
}

async function open(name: string): Promise<void> {
  setState("loading", true);
  setState("error", null);
  try {
    const result = (await client.execute("open", [name])) as DirectoryListing | FileContent;
    if (result && result.type === "directory_listing") {
      setState({
        cwd: result.path,
        entries: result.entries,
        loading: false,
        preview: null,
      });
    } else if (result && result.type === "file_content") {
      setState({
        loading: false,
        preview: result,
      });
    }
  } catch (error) {
    setState("error", String(error));
    setState("loading", false);
  }
}

function back(): Promise<void> {
  return go("..");
}

function connect(): void {
  client.connect();
}

function closePreview(): void {
  setState("preview", null);
}

async function createDir(name: string): Promise<void> {
  setState("loading", true);
  setState("error", null);
  try {
    await client.execute("create_dir", [name]);
    await look();
  } catch (error) {
    setState("error", String(error));
    setState("loading", false);
  }
}

async function createFile(name: string): Promise<void> {
  setState("loading", true);
  setState("error", null);
  try {
    await client.execute("create_file", [name]);
    await look();
  } catch (error) {
    setState("error", String(error));
    setState("loading", false);
  }
}

async function remove(name: string): Promise<void> {
  setState("loading", true);
  setState("error", null);
  try {
    await client.execute("remove", [name]);
    await look();
  } catch (error) {
    setState("error", String(error));
    setState("loading", false);
  }
}

async function bookmark(name: string): Promise<void> {
  setState("error", null);
  try {
    const result = (await client.execute("bookmark", [name])) as BookmarkCreated;
    if (result && result.type === "bookmark_created") {
      setState("bookmarks", name, result.path);
    }
  } catch (error) {
    setState("error", String(error));
  }
}

async function loadBookmarks(): Promise<void> {
  try {
    const result = (await client.execute("bookmarks_list", [])) as BookmarksList;
    if (result && result.type === "bookmarks") {
      setState("bookmarks", result.bookmarks);
    }
  } catch (error) {
    setState("error", String(error));
  }
}

async function jump(name: string): Promise<void> {
  setState("loading", true);
  setState("error", null);
  try {
    const result = (await client.execute("jump", [name])) as DirectoryListing;
    if (result && result.type === "directory_listing") {
      setState({
        cwd: result.path,
        entries: result.entries,
        loading: false,
        preview: null,
      });
    }
  } catch (error) {
    setState("error", String(error));
    setState("loading", false);
  }
}

function selectPath(path: string | null): void {
  setState("selectedPath", path);
  if (path) {
    loadTags(path);
  } else {
    setState("tags", []);
  }
}

async function loadTags(path: string): Promise<void> {
  try {
    const result = (await client.execute("tags", [path])) as TagsResult;
    if (result && result.type === "tags") {
      setState("tags", result.tags);
    }
  } catch (error) {
    setState("error", String(error));
  }
}

async function addTag(path: string, tag: string): Promise<void> {
  setState("error", null);
  try {
    await client.execute("tag", [path, tag]);
    await loadTags(path);
  } catch (error) {
    setState("error", String(error));
  }
}

async function removeTag(path: string, tag: string): Promise<void> {
  setState("error", null);
  try {
    await client.execute("untag", [path, tag]);
    await loadTags(path);
  } catch (error) {
    setState("error", String(error));
  }
}

export const browserStore = {
  addTag,
  back,
  bookmark,
  closePreview,
  connect,
  createDir,
  createFile,
  go,
  jump,
  loadBookmarks,
  look,
  open,
  remove,
  removeTag,
  selectPath,
  state,
};
