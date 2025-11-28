import {
  describe,
  it,
  expect,
  beforeEach,
  beforeAll,
  afterAll,
} from "bun:test";
import { evaluate, getOpcode, registerLibrary } from "./interpreter";
import { ListLibrary } from "./lib/list";
import { StringLibrary } from "./lib/string";
import { ObjectLibrary } from "./lib/object";
import { registerOpcode } from "./interpreter";
import { Entity } from "../repo";

describe("Book Item Scripting", () => {
  let book: Entity;
  let caller: Entity;
  let messages: string[] = [];

  // Save original opcodes
  let originalTell: any;
  let originalProp: any;
  let originalSet: any;

  beforeAll(() => {
    originalTell = getOpcode("tell");
    originalProp = getOpcode("prop");
    originalSet = getOpcode("set");
  });

  afterAll(() => {
    // Restore original opcodes
    if (originalTell) registerOpcode("tell", originalTell);
    if (originalProp) registerOpcode("prop", originalProp);
    if (originalSet) registerOpcode("set", originalSet);
  });

  beforeEach(() => {
    // Mock system context
    messages = [];

    // Register libraries
    registerLibrary(ListLibrary);
    registerLibrary(StringLibrary);
    registerLibrary(ObjectLibrary);

    // Mock tell opcode since we don't have full repo/sys setup in this isolated test
    registerOpcode("tell", async (args, ctx) => {
      const [targetExpr, msgExpr] = args;
      if (targetExpr === "caller") {
        const msg = await evaluate(msgExpr, ctx);
        messages.push(msg);
      }
      return null;
    });

    // Mock prop/set opcodes for local entity manipulation
    registerOpcode("prop", async (args, ctx) => {
      const [targetExpr, keyExpr] = args;
      const key = await evaluate(keyExpr, ctx);
      if (targetExpr === "this") {
        return ctx.this.props[key];
      }
      return null;
    });

    registerOpcode("set", async (args, ctx) => {
      const [targetExpr, keyExpr, valExpr] = args;
      const key = await evaluate(keyExpr, ctx);
      const val = await evaluate(valExpr, ctx);
      if (targetExpr === "this") {
        ctx.this.props[key] = val;
      }
      return val;
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
      props: {},
    } as any;
  });

  it("should list chapters", async () => {
    const script = [
      "seq",
      ["let", "chapters", ["prop", "this", "chapters"]],
      [
        "tell",
        "caller",
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
          "caller",
          [
            "str.concat",
            "Chapter: ",
            ["obj.get", ["var", "chapter"], "title"],
            "\n\n",
            ["obj.get", ["var", "chapter"], "content"],
          ],
        ],
        ["tell", "caller", "Chapter not found."],
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
      ["set", "this", "chapters", ["var", "chapters"]],
      ["tell", "caller", "Chapter added."],
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
        "caller",
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
