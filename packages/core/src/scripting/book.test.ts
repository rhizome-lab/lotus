import { describe, it, expect, beforeEach } from "bun:test";
import { evaluate, registerLibrary, registerOpcode } from "./interpreter";
import { ListLibrary } from "./lib/list";
import { StringLibrary } from "./lib/string";
import { ObjectLibrary } from "./lib/object";
import { Entity } from "../repo";
import { CoreLibrary } from "./lib/core";

describe("Book Item Scripting", () => {
  let book: Entity;
  let caller: Entity;
  let messages: string[] = [];

  beforeEach(() => {
    // Mock system context
    messages = [];

    // Register libraries
    registerLibrary(CoreLibrary);
    registerLibrary(ListLibrary);
    registerLibrary(StringLibrary);
    registerLibrary(ObjectLibrary);

    // Mock tell opcode since we don't have full repo/sys setup in this isolated test
    registerOpcode("tell", async (args, ctx) => {
      const [targetExpr, msgExpr] = args;
      if (targetExpr === "me") {
        const msg = await evaluate(msgExpr, ctx);
        messages.push(msg);
      }
      return null;
    });

    // Setup entities
    book = {
      id: 1,
      name: "Test Book",
      kind: "ITEM",
      props: {
        chapters: [
          { title: "Chapter 1", content: "Content 1" },
          { title: "Chapter 2", content: "Content 2" },
        ],
      },
    } as any;

    caller = {
      id: 2,
      name: "Reader",
      kind: "ACTOR",
      // Disable permissions checks
      props: { is_wizard: true },
    } as any;
  });

  it("should list chapters", async () => {
    const script = [
      "seq",
      ["let", "chapters", ["prop", "this", "chapters"]],
      [
        "tell",
        "me",
        [
          "str.join",
          [
            "list.map",
            ["var", "chapters"],
            ["lambda", ["c"], ["obj.get", ["var", "c"], "title"]],
          ],
          "\n",
        ],
      ],
    ];

    await evaluate(script, { caller, this: book, args: [], warnings: [] });
    expect(messages[0]).toBe("Chapter 1\nChapter 2");
  });

  it("should read a chapter", async () => {
    const script = [
      "seq",
      ["let", "index", ["arg", 0]],
      ["let", "chapters", ["prop", "this", "chapters"]],
      ["let", "chapter", ["list.get", ["var", "chapters"], ["var", "index"]]],
      [
        "if",
        ["var", "chapter"],
        [
          "tell",
          "me",
          [
            "str.concat",
            "Chapter: ",
            ["obj.get", ["var", "chapter"], "title"],
            "\n\n",
            ["obj.get", ["var", "chapter"], "content"],
          ],
        ],
        ["tell", "me", "Chapter not found."],
      ],
    ];

    // Read Chapter 1 (index 0)
    await evaluate(script, { caller, this: book, args: [0], warnings: [] });
    expect(messages[0]).toContain("Chapter: Chapter 1");
    expect(messages[0]).toContain("Content 1");

    // Read invalid chapter
    messages = [];
    await evaluate(script, { caller, this: book, args: [99], warnings: [] });
    expect(messages[0]).toBe("Chapter not found.");
  });

  it("should add a chapter", async () => {
    const script = [
      "seq",
      ["let", "title", ["arg", 0]],
      ["let", "content", ["arg", 1]],
      ["let", "chapters", ["prop", "this", "chapters"]],
      ["let", "newChapter", {}],
      ["obj.set", ["var", "newChapter"], "title", ["var", "title"]],
      ["obj.set", ["var", "newChapter"], "content", ["var", "content"]],
      ["list.push", ["var", "chapters"], ["var", "newChapter"]],
      ["set_prop", "this", "chapters", ["var", "chapters"]],
      ["tell", "me", "Chapter added."],
    ];

    await evaluate(script, {
      caller,
      this: book,
      args: ["Chapter 3", "Content 3"],
      warnings: [],
    });
    expect(messages[0]).toBe("Chapter added.");
    expect(book.props["chapters"].length).toBe(3);
    expect(book.props["chapters"][2].title).toBe("Chapter 3");
  });

  it("should search chapters", async () => {
    const script = [
      "seq",
      ["let", "query", ["arg", 0]],
      ["let", "chapters", ["prop", "this", "chapters"]],
      [
        "let",
        "results",
        [
          "list.filter",
          ["var", "chapters"],
          [
            "lambda",
            ["c"],
            [
              "or",
              [
                "str.includes",
                ["str.lower", ["obj.get", ["var", "c"], "title"]],
                ["str.lower", ["var", "query"]],
              ],
              [
                "str.includes",
                ["str.lower", ["obj.get", ["var", "c"], "content"]],
                ["str.lower", ["var", "query"]],
              ],
            ],
          ],
        ],
      ],
      [
        "tell",
        "me",
        [
          "str.concat",
          "Found ",
          ["list.len", ["var", "results"]],
          " matches:\n",
          [
            "str.join",
            [
              "list.map",
              ["var", "results"],
              ["lambda", ["c"], ["obj.get", ["var", "c"], "title"]],
            ],
            "\n",
          ],
        ],
      ],
    ];

    // Search for "Content" (should match all)
    await evaluate(script, {
      caller,
      this: book,
      args: ["Content"],
      warnings: [],
    });
    expect(messages[0]).toContain("Found 2 matches");

    // Search for "2" (should match Chapter 2)
    messages = [];
    await evaluate(script, { caller, this: book, args: ["2"], warnings: [] });
    expect(messages[0]).toContain("Found 1 matches");
    expect(messages[0]).toContain("Chapter 2");
  });
});
