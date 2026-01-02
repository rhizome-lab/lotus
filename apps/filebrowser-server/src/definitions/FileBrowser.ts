// oxlint-disable-next-line no-unassigned-import
import "@viwo/core/generated_types";
import { EntityBase } from "@viwo/core/seeds/definitions/EntityBase";

// Declare FS capability types for type checking
declare class FsRead {
  read(path: string): string;
  list(path: string): string[];
  stat(path: string): { size: number; mtime: string; isDirectory: boolean; isFile: boolean };
  exists(path: string): boolean;
}

declare class FsWrite {
  write(path: string, content: string): null;
  mkdir(path: string): null;
  remove(path: string): null;
}

// Augment the capability registry
declare global {
  interface CapabilityRegistry {
    "fs.read": FsRead;
    "fs.write": FsWrite;
  }
}

interface FileEntry {
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

interface FileBrowserUserProps {
  cwd?: string;
  fs_root?: string;
  bookmarks?: Record<string, string>;
  file_metadata?: Record<string, { tags?: string[]; annotations?: string[] }>;
}

/**
 * Base prototype for file browser entities.
 * Provides core navigation and file operation verbs.
 */
export class FileBrowserBase extends EntityBase {
  override name = "File Browser Base";
  override description = "Base prototype for file browser entities.";

  /**
   * Resolve a path relative to cwd, ensuring it stays within sandbox.
   */
  resolve_path(pathArg: string) {
    const cap = get_capability("fs.read", {});
    if (!cap) {
      std.throw_("No filesystem access.");
    }

    const user = std.caller() as FileBrowserUserProps;
    const fsRoot = user.fs_root ?? "/";
    const cwd = user.cwd ?? fsRoot;

    // Use helper to build the target path
    const targetPath = call(std.this_(), "_build_path", pathArg, cwd, fsRoot) as string;

    // Check sandbox bounds (must start with fs_root)
    if (!str.includes(targetPath, fsRoot)) {
      // Path escapes sandbox, clamp to root
      return fsRoot;
    }

    return targetPath;
  }

  /**
   * Helper to build absolute path from relative path.
   */
  _build_path(pathArg: string, cwd: string, fsRoot: string) {
    if (pathArg === "..") {
      // Go up one directory
      const parts = str.split(cwd, "/");
      list.pop(parts);
      const result = str.join(parts, "/");
      if (result === "") {
        return "/";
      }
      return result;
    }

    if (str.slice(pathArg, 0, 1) === "/") {
      // Absolute path within sandbox - treat "/" as fs_root
      return str.concat(fsRoot, pathArg);
    }

    // Relative path
    if (cwd === "/") {
      return str.concat("/", pathArg);
    }

    return str.concat(cwd, "/", pathArg);
  }

  /**
   * Show current location.
   */
  where() {
    const user = std.caller() as FileBrowserUserProps;
    const cwd = user.cwd ?? user.fs_root ?? "/";
    return {
      path: cwd,
      type: "where",
    };
  }

  /**
   * Change directory.
   */
  override go(path: string) {
    if (!path) {
      std.throw_("Usage: go <path>");
    }

    const cap = get_capability("fs.read", {});
    if (!cap) {
      std.throw_("No filesystem access.");
    }

    const resolved = call(std.this_(), "resolve_path", path) as string;

    // Check if it exists and is a directory
    if (!cap.exists(resolved)) {
      std.throw_(str.concat("Path does not exist: ", resolved));
    }

    const stats = cap.stat(resolved);
    if (!stats.isDirectory) {
      std.throw_(str.concat("Not a directory: ", resolved));
    }

    // Update cwd
    const controlCap = get_capability("entity.control", { target_id: std.caller().id });
    if (controlCap) {
      controlCap.update(std.caller(), { cwd: resolved });
    }

    // Return directory listing
    return call(std.this_(), "look") as DirectoryListing;
  }

  /**
   * Go back (up one directory).
   */
  back() {
    return call(std.this_(), "go", "..") as DirectoryListing;
  }

  /**
   * Helper to create a file entry from a name.
   */
  _make_entry(cwd: string, name: string) {
    const cap = get_capability("fs.read", {});
    if (!cap) {
      std.throw_("No filesystem access.");
    }
    const fullPath = cwd === "/" ? str.concat("/", name) : str.concat(cwd, "/", name);
    const stats = cap.stat(fullPath);
    return {
      isDirectory: stats.isDirectory,
      mtime: stats.mtime,
      name: name,
      path: fullPath,
      size: stats.size,
    };
  }

  /**
   * List directory contents.
   */
  look() {
    const cap = get_capability("fs.read", {});
    if (!cap) {
      std.throw_("No filesystem access.");
    }

    const user = std.caller() as FileBrowserUserProps;
    const cwd = user.cwd ?? user.fs_root ?? "/";

    const names = cap.list(cwd);
    const entries = list.map(
      names,
      (name: string) => call(std.this_(), "_make_entry", cwd, name) as FileEntry,
    );

    const result: DirectoryListing = {
      entries: entries,
      path: cwd,
      type: "directory_listing",
    };

    return result;
  }

  /**
   * Open/read a file.
   */
  open(name: string) {
    if (!name) {
      std.throw_("Usage: open <filename>");
    }

    const cap = get_capability("fs.read", {});
    if (!cap) {
      std.throw_("No filesystem access.");
    }

    const resolved = call(std.this_(), "resolve_path", name) as string;

    if (!cap.exists(resolved)) {
      std.throw_(str.concat("File does not exist: ", resolved));
    }

    const stats = cap.stat(resolved);
    if (stats.isDirectory) {
      // If it's a directory, navigate to it instead
      return call(std.this_(), "go", name) as DirectoryListing;
    }

    const content = cap.read(resolved);
    const parts = str.split(resolved, "/");
    const fileName = list.get(parts, list.len(parts) - 1) ?? name;

    const result: FileContent = {
      content: content,
      name: fileName,
      path: resolved,
      size: stats.size,
      type: "file_content",
    };

    return result;
  }

  /**
   * Write content to a file.
   */
  write(name: string, content: string) {
    if (!name) {
      std.throw_("Usage: write <filename> <content>");
    }

    const cap = get_capability("fs.write", {});
    if (!cap) {
      std.throw_("No write access.");
    }

    const resolved = call(std.this_(), "resolve_path", name) as string;
    cap.write(resolved, content ?? "");

    return {
      path: resolved,
      type: "write_success",
    };
  }

  /**
   * Create a new directory.
   */
  create_dir(name: string) {
    if (!name) {
      std.throw_("Usage: create_dir <dirname>");
    }

    const cap = get_capability("fs.write", {});
    if (!cap) {
      std.throw_("No write access.");
    }

    const resolved = call(std.this_(), "resolve_path", name) as string;
    cap.mkdir(resolved);

    return {
      path: resolved,
      type: "dir_created",
    };
  }

  /**
   * Create a new empty file.
   */
  create_file(name: string) {
    if (!name) {
      std.throw_("Usage: create_file <filename>");
    }

    const cap = get_capability("fs.write", {});
    if (!cap) {
      std.throw_("No write access.");
    }

    const resolved = call(std.this_(), "resolve_path", name) as string;

    // Check if already exists
    const readCap = get_capability("fs.read", {});
    if (readCap && readCap.exists(resolved)) {
      std.throw_(str.concat("File already exists: ", resolved));
    }

    cap.write(resolved, "");

    return {
      path: resolved,
      type: "file_created",
    };
  }

  /**
   * Remove a file or directory.
   */
  remove(name: string) {
    if (!name) {
      std.throw_("Usage: remove <path>");
    }

    const cap = get_capability("fs.write", {});
    if (!cap) {
      std.throw_("No write access.");
    }

    const resolved = call(std.this_(), "resolve_path", name) as string;

    // Check if exists
    const readCap = get_capability("fs.read", {});
    if (readCap && !readCap.exists(resolved)) {
      std.throw_(str.concat("Path does not exist: ", resolved));
    }

    cap.remove(resolved);

    return {
      path: resolved,
      type: "removed",
    };
  }
}

/**
 * User entity for file browser paradigm.
 * Has a current working directory and can store bookmarks/metadata.
 */
export class FileBrowserUser extends FileBrowserBase {
  override name = "File Browser User";
  override description = "A file browser user.";
  cwd?: string;
  fs_root?: string;
  bookmarks?: Record<string, string> = {};
  file_metadata?: Record<string, { tags?: string[]; annotations?: string[] }> = {};

  /**
   * Create a bookmark for a path.
   */
  bookmark(name: string, path?: string) {
    if (!name) {
      std.throw_("Usage: bookmark <name> [path]");
    }

    const user = std.caller() as FileBrowserUserProps;
    const targetPath = path ?? user.cwd ?? "/";
    const bookmarks = user.bookmarks ?? {};

    obj.set(bookmarks, name, targetPath);

    const controlCap = get_capability("entity.control", { target_id: std.caller().id });
    if (controlCap) {
      controlCap.update(std.caller(), { bookmarks: bookmarks });
    }

    return {
      name: name,
      path: targetPath,
      type: "bookmark_created",
    };
  }

  /**
   * List all bookmarks.
   */
  bookmarks_list() {
    const user = std.caller() as FileBrowserUserProps;
    const bookmarks = user.bookmarks ?? {};

    return {
      bookmarks: bookmarks,
      type: "bookmarks",
    };
  }

  /**
   * Jump to a bookmarked location.
   */
  jump(name: string) {
    if (!name) {
      std.throw_("Usage: jump <bookmark_name>");
    }

    const user = std.caller() as FileBrowserUserProps;
    const bookmarks = user.bookmarks ?? {};

    if (!obj.has(bookmarks, name)) {
      std.throw_(str.concat("Bookmark not found: ", name));
    }

    const path = obj.get(bookmarks, name);

    // Update cwd directly (already resolved absolute path)
    const controlCap = get_capability("entity.control", { target_id: std.caller().id });
    if (controlCap) {
      controlCap.update(std.caller(), { cwd: path });
    }

    return call(std.this_(), "look") as DirectoryListing;
  }

  /**
   * Add a tag to a file/directory.
   */
  tag(pathArg: string, tagName: string) {
    if (!pathArg || !tagName) {
      std.throw_("Usage: tag <path> <tag>");
    }

    const resolved = call(std.this_(), "resolve_path", pathArg) as string;
    const user = std.caller() as FileBrowserUserProps;
    const metadata = user.file_metadata ?? {};

    const fileData = obj.has(metadata, resolved)
      ? obj.get(metadata, resolved)
      : { annotations: [], tags: [] };
    const tags = fileData.tags ?? [];

    if (!list.includes(tags, tagName)) {
      list.push(tags, tagName);
    }

    obj.set(fileData, "tags", tags);
    obj.set(metadata, resolved, fileData);

    const controlCap = get_capability("entity.control", { target_id: std.caller().id });
    if (controlCap) {
      controlCap.update(std.caller(), { file_metadata: metadata });
    }

    return {
      path: resolved,
      tag: tagName,
      type: "tag_added",
    };
  }

  /**
   * Remove a tag from a file/directory.
   */
  untag(pathArg: string, tagName: string) {
    if (!pathArg || !tagName) {
      std.throw_("Usage: untag <path> <tag>");
    }

    const resolved = call(std.this_(), "resolve_path", pathArg) as string;
    const user = std.caller() as FileBrowserUserProps;
    const metadata = user.file_metadata ?? {};

    if (!obj.has(metadata, resolved)) {
      return { path: resolved, type: "untag_noop" };
    }
    const fileData = obj.get(metadata, resolved);

    const tags = fileData.tags ?? [];
    const newTags = list.filter(tags, (tag: string) => tag !== tagName);
    obj.set(fileData, "tags", newTags);
    obj.set(metadata, resolved, fileData);

    const controlCap = get_capability("entity.control", { target_id: std.caller().id });
    if (controlCap) {
      controlCap.update(std.caller(), { file_metadata: metadata });
    }

    return {
      path: resolved,
      tag: tagName,
      type: "tag_removed",
    };
  }

  /**
   * Get tags for a file/directory.
   */
  tags(pathArg: string) {
    const user = std.caller() as FileBrowserUserProps;
    const resolved = pathArg
      ? (call(std.this_(), "resolve_path", pathArg) as string)
      : (user.cwd ?? "/");

    const metadata = user.file_metadata ?? {};
    const fileData = obj.has(metadata, resolved)
      ? obj.get(metadata, resolved)
      : { annotations: [], tags: [] };
    const tags = fileData.tags ?? [];

    return {
      path: resolved,
      tags: tags,
      type: "tags",
    };
  }

  /**
   * Add an annotation to a file/directory.
   */
  annotate(pathArg: string, note: string) {
    if (!pathArg || !note) {
      std.throw_("Usage: annotate <path> <note>");
    }

    const resolved = call(std.this_(), "resolve_path", pathArg) as string;
    const user = std.caller() as FileBrowserUserProps;
    const metadata = user.file_metadata ?? {};

    const fileData = obj.has(metadata, resolved)
      ? obj.get(metadata, resolved)
      : { annotations: [], tags: [] };
    const annotations = fileData.annotations ?? [];

    list.push(annotations, note);
    obj.set(fileData, "annotations", annotations);
    obj.set(metadata, resolved, fileData);

    const controlCap = get_capability("entity.control", { target_id: std.caller().id });
    if (controlCap) {
      controlCap.update(std.caller(), { file_metadata: metadata });
    }

    return {
      note: note,
      path: resolved,
      type: "annotation_added",
    };
  }
}
