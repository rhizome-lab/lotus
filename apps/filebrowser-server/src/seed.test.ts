import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { createScriptContext, evaluate } from "@viwo/scripting";
import { db, GameOpcodes, getEntity, getVerb, registerGameLibrary } from "@viwo/core";
import type { Entity } from "@viwo/shared/jsonrpc";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { FsLib } from "@viwo/plugin-fs";
import { seedFileBrowser } from "./seed";

describe("File Browser Seed", () => {
  let testDir: string;
  let userId: number;
  let send: (type: string, payload: unknown) => void;
  let sentMessages: Array<{ type: string; payload: unknown }> = [];

  beforeAll(async () => {
// Type assertion needed because FsLib exports capability classes, not opcode builders
    registerGameLibrary(FsLib as any);

    // Create temp test directory structure
    testDir = join(tmpdir(), `viwo-fb-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
    await mkdir(join(testDir, "src"), { recursive: true });
    await mkdir(join(testDir, "docs"), { recursive: true });
    await writeFile(join(testDir, "README.md"), "# Test Project\n");
    await writeFile(join(testDir, "src", "index.ts"), "console.log('hello');\n");
    await writeFile(join(testDir, "src", "utils.ts"), "export function add(a: number, b: number) { return a + b; }\n");
    await writeFile(join(testDir, "docs", "guide.md"), "# Guide\n\nThis is a guide.\n");
  });

  afterAll(async () => {
    // Cleanup temp directory
    await rm(testDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    // Reset DB state
    db.query("DELETE FROM entities").run();
    db.query("DELETE FROM verbs").run();
    db.query("DELETE FROM capabilities").run();
    db.query("DELETE FROM sqlite_sequence").run();

    sentMessages = [];
    send = (type: string, payload: unknown) => {
      sentMessages.push({ type, payload });
    };

    // Seed file browser world
    const result = seedFileBrowser({ rootPath: testDir });
    userId = result!.userId;
  });

  const runVerb = async (
    entity: Entity,
    verbName: string,
    args: unknown[] = [],
    caller?: Entity,
  ) => {
    const freshEntity = getEntity(entity.id)!;
    const verb = getVerb(freshEntity.id, verbName);
    if (!verb) {
      throw new Error(`Verb ${verbName} not found on entity ${freshEntity.id}`);
    }

    const ctx = createScriptContext({
      args,
      caller: caller ?? freshEntity,
      gas: 100_000,
      ops: GameOpcodes,
      send,
      this: freshEntity,
    });

    return evaluate(verb.code, ctx);
  };

  describe("where verb", () => {
    it("should return current location", async () => {
      const user = getEntity(userId)!;
      const result = (await runVerb(user, "where")) as { type: string; path: string };

      expect(result.type).toBe("where");
      expect(result.path).toBe(testDir);
    });
  });

  describe("look verb", () => {
    it("should list directory contents", async () => {
      const user = getEntity(userId)!;
      const result = (await runVerb(user, "look")) as {
        type: string;
        path: string;
        entries: Array<{ name: string; isDirectory: boolean }>;
      };

      expect(result.type).toBe("directory_listing");
      expect(result.path).toBe(testDir);
      expect(result.entries.length).toBeGreaterThan(0);

      const names = result.entries.map((entry) => entry.name);
      expect(names).toContain("src");
      expect(names).toContain("docs");
      expect(names).toContain("README.md");

      const srcEntry = result.entries.find((entry) => entry.name === "src");
      expect(srcEntry?.isDirectory).toBe(true);

      const readmeEntry = result.entries.find((entry) => entry.name === "README.md");
      expect(readmeEntry?.isDirectory).toBe(false);
    });
  });

  describe("go verb", () => {
    it("should change directory", async () => {
      const user = getEntity(userId)!;
      const result = (await runVerb(user, "go", ["src"])) as {
        type: string;
        path: string;
        entries: Array<{ name: string }>;
      };

      expect(result.type).toBe("directory_listing");
      expect(result.path).toBe(join(testDir, "src"));

      const names = result.entries.map((entry) => entry.name);
      expect(names).toContain("index.ts");
      expect(names).toContain("utils.ts");

      // Verify cwd was updated
      const freshUser = getEntity(userId)!;
      expect(freshUser["cwd"]).toBe(join(testDir, "src"));
    });

    it("should go back with ..", async () => {
      const user = getEntity(userId)!;

      // First go to src
      await runVerb(user, "go", ["src"]);

      // Then go back
      const result = (await runVerb(getEntity(userId)!, "go", [".."])) as {
        type: string;
        path: string;
      };

      expect(result.path).toBe(testDir);
    });

    it("should throw on non-existent path", async () => {
      const user = getEntity(userId)!;

      await expect(runVerb(user, "go", ["nonexistent"])).rejects.toThrow(
        /does not exist/i,
      );
    });

    it("should throw on file path", async () => {
      const user = getEntity(userId)!;

      await expect(runVerb(user, "go", ["README.md"])).rejects.toThrow(
        /not a directory/i,
      );
    });
  });

  describe("back verb", () => {
    it("should go up one directory", async () => {
      const user = getEntity(userId)!;

      // Go to src
      await runVerb(user, "go", ["src"]);

      // Go back
      const result = (await runVerb(getEntity(userId)!, "back")) as {
        type: string;
        path: string;
      };

      expect(result.path).toBe(testDir);
    });
  });

  describe("open verb", () => {
    it("should read file contents", async () => {
      const user = getEntity(userId)!;
      const result = (await runVerb(user, "open", ["README.md"])) as {
        type: string;
        path: string;
        name: string;
        content: string;
        size: number;
      };

      expect(result.type).toBe("file_content");
      expect(result.name).toBe("README.md");
      expect(result.content).toBe("# Test Project\n");
      expect(result.size).toBe(15);
    });

    it("should navigate to directory when opening a dir", async () => {
      const user = getEntity(userId)!;
      const result = (await runVerb(user, "open", ["src"])) as {
        type: string;
        path: string;
      };

      // Opening a directory should behave like go
      expect(result.type).toBe("directory_listing");
      expect(result.path).toBe(join(testDir, "src"));
    });
  });

  describe("bookmark verbs", () => {
    it("should create a bookmark", async () => {
      const user = getEntity(userId)!;

      // Go to src first
      await runVerb(user, "go", ["src"]);

      // Bookmark current location
      const result = (await runVerb(getEntity(userId)!, "bookmark", ["mysrc"])) as {
        type: string;
        name: string;
        path: string;
      };

      expect(result.type).toBe("bookmark_created");
      expect(result.name).toBe("mysrc");
      expect(result.path).toBe(join(testDir, "src"));

      // Verify bookmark was saved
      const freshUser = getEntity(userId)!;
      const bookmarks = freshUser["bookmarks"] as Record<string, string>;
      expect(bookmarks["mysrc"]).toBe(join(testDir, "src"));
    });

    it("should jump to bookmarked location", async () => {
      const user = getEntity(userId)!;

      // Go to src and bookmark
      await runVerb(user, "go", ["src"]);
      await runVerb(getEntity(userId)!, "bookmark", ["mysrc"]);

      // Go back to root
      await runVerb(getEntity(userId)!, "go", [".."]);

      // Jump to bookmark
      const result = (await runVerb(getEntity(userId)!, "jump", ["mysrc"])) as {
        type: string;
        path: string;
      };

      expect(result.type).toBe("directory_listing");
      expect(result.path).toBe(join(testDir, "src"));
    });

    it("should throw on unknown bookmark", async () => {
      const user = getEntity(userId)!;

      await expect(runVerb(user, "jump", ["nonexistent"])).rejects.toThrow(
        /bookmark not found/i,
      );
    });
  });

  describe("tag verbs", () => {
    it("should add tag to file", async () => {
      const user = getEntity(userId)!;

      const result = (await runVerb(user, "tag", ["README.md", "important"])) as {
        type: string;
        path: string;
        tag: string;
      };

      expect(result.type).toBe("tag_added");
      expect(result.tag).toBe("important");

      // Verify tag was saved
      const freshUser = getEntity(userId)!;
      const metadata = freshUser["file_metadata"] as Record<
        string,
        { tags?: string[] }
      >;
      const filePath = join(testDir, "README.md");
      expect(metadata[filePath]?.tags).toContain("important");
    });

    it("should get tags for file", async () => {
      const user = getEntity(userId)!;

      // Add tag first
      await runVerb(user, "tag", ["README.md", "important"]);

      // Get tags
      const result = (await runVerb(getEntity(userId)!, "tags", ["README.md"])) as {
        type: string;
        tags: string[];
      };

      expect(result.type).toBe("tags");
      expect(result.tags).toContain("important");
    });

    it("should remove tag from file", async () => {
      const user = getEntity(userId)!;

      // Add tag
      await runVerb(user, "tag", ["README.md", "important"]);

      // Remove tag
      const result = (await runVerb(getEntity(userId)!, "untag", [
        "README.md",
        "important",
      ])) as {
        type: string;
      };

      expect(result.type).toBe("tag_removed");

      // Verify tag was removed
      const freshUser = getEntity(userId)!;
      const metadata = freshUser["file_metadata"] as Record<
        string,
        { tags?: string[] }
      >;
      const filePath = join(testDir, "README.md");
      expect(metadata[filePath]?.tags ?? []).not.toContain("important");
    });
  });

  describe("annotate verb", () => {
    it("should add annotation to file", async () => {
      const user = getEntity(userId)!;

      const result = (await runVerb(user, "annotate", [
        "README.md",
        "This is the main readme",
      ])) as {
        type: string;
        note: string;
      };

      expect(result.type).toBe("annotation_added");
      expect(result.note).toBe("This is the main readme");

      // Verify annotation was saved
      const freshUser = getEntity(userId)!;
      const metadata = freshUser["file_metadata"] as Record<
        string,
        { annotations?: string[] }
      >;
      const filePath = join(testDir, "README.md");
      expect(metadata[filePath]?.annotations).toContain("This is the main readme");
    });
  });
});

describe("File Browser Seed (writable)", () => {
  let testDir: string;
  let userId: number;
  let send: (type: string, payload: unknown) => void;
  let sentMessages: Array<{ type: string; payload: unknown }> = [];

  beforeAll(async () => {
// Type assertion needed because FsLib exports capability classes, not opcode builders
    registerGameLibrary(FsLib as any);

    // Create temp test directory structure
    testDir = join(tmpdir(), `viwo-fb-write-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
  });

  afterAll(async () => {
    // Cleanup temp directory
    await rm(testDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    // Reset DB state
    db.query("DELETE FROM entities").run();
    db.query("DELETE FROM verbs").run();
    db.query("DELETE FROM capabilities").run();
    db.query("DELETE FROM sqlite_sequence").run();

    sentMessages = [];
    send = (type: string, payload: unknown) => {
      sentMessages.push({ type, payload });
    };

    // Seed file browser world with write access
    const result = seedFileBrowser({ rootPath: testDir, writable: true });
    userId = result!.userId;
  });

  const runVerb = async (
    entity: Entity,
    verbName: string,
    args: unknown[] = [],
    caller?: Entity,
  ) => {
    const freshEntity = getEntity(entity.id)!;
    const verb = getVerb(freshEntity.id, verbName);
    if (!verb) {
      throw new Error(`Verb ${verbName} not found on entity ${freshEntity.id}`);
    }

    const ctx = createScriptContext({
      args,
      caller: caller ?? freshEntity,
      gas: 100_000,
      ops: GameOpcodes,
      send,
      this: freshEntity,
    });

    return evaluate(verb.code, ctx);
  };

  describe("create_dir verb", () => {
    it("should create a new directory", async () => {
      const user = getEntity(userId)!;

      const result = (await runVerb(user, "create_dir", ["newdir"])) as {
        type: string;
        path: string;
      };

      expect(result.type).toBe("dir_created");
      expect(result.path).toBe(join(testDir, "newdir"));

      // Verify directory was created by listing
      const listing = (await runVerb(getEntity(userId)!, "look")) as {
        entries: Array<{ name: string; isDirectory: boolean }>;
      };
      const names = listing.entries.map((e) => e.name);
      expect(names).toContain("newdir");
    });
  });

  describe("create_file verb", () => {
    it("should create a new empty file", async () => {
      const user = getEntity(userId)!;

      const result = (await runVerb(user, "create_file", ["newfile.txt"])) as {
        type: string;
        path: string;
      };

      expect(result.type).toBe("file_created");
      expect(result.path).toBe(join(testDir, "newfile.txt"));

      // Verify file was created by opening
      const content = (await runVerb(getEntity(userId)!, "open", ["newfile.txt"])) as {
        type: string;
        content: string;
      };
      expect(content.type).toBe("file_content");
      expect(content.content).toBe("");
    });

    it("should throw if file already exists", async () => {
      const user = getEntity(userId)!;

      // Create the file first
      await runVerb(user, "create_file", ["existing.txt"]);

      // Try to create again
      await expect(runVerb(getEntity(userId)!, "create_file", ["existing.txt"])).rejects.toThrow(
        /already exists/i,
      );
    });
  });

  describe("remove verb", () => {
    it("should remove a file", async () => {
      const user = getEntity(userId)!;

      // Create a file first
      await runVerb(user, "create_file", ["todelete.txt"]);

      // Remove it
      const result = (await runVerb(getEntity(userId)!, "remove", ["todelete.txt"])) as {
        type: string;
        path: string;
      };

      expect(result.type).toBe("removed");
      expect(result.path).toBe(join(testDir, "todelete.txt"));

      // Verify file is gone
      const listing = (await runVerb(getEntity(userId)!, "look")) as {
        entries: Array<{ name: string }>;
      };
      const names = listing.entries.map((e) => e.name);
      expect(names).not.toContain("todelete.txt");
    });

    it("should remove a directory", async () => {
      const user = getEntity(userId)!;

      // Create a directory first
      await runVerb(user, "create_dir", ["toremove"]);

      // Remove it
      const result = (await runVerb(getEntity(userId)!, "remove", ["toremove"])) as {
        type: string;
        path: string;
      };

      expect(result.type).toBe("removed");

      // Verify directory is gone
      const listing = (await runVerb(getEntity(userId)!, "look")) as {
        entries: Array<{ name: string }>;
      };
      const names = listing.entries.map((e) => e.name);
      expect(names).not.toContain("toremove");
    });

    it("should throw on non-existent path", async () => {
      const user = getEntity(userId)!;

      await expect(runVerb(user, "remove", ["nonexistent"])).rejects.toThrow(
        /does not exist/i,
      );
    });
  });
});
