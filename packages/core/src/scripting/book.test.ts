import { describe, it, expect, beforeEach } from "bun:test";
import { createScriptContext, evaluate, registerLibrary } from "./interpreter";
import * as Core from "./lib/core";
import * as List from "./lib/list";
import * as String from "./lib/string";
import * as Object from "./lib/object";
import { Entity } from "@viwo/shared/jsonrpc";

describe("Book Item Scripting", () => {
  registerLibrary(Core);
  registerLibrary(List);
  registerLibrary(String);
  registerLibrary(Object);

  let book: Entity;
  let caller: Entity;
  let messages: string[] = [];

  beforeEach(() => {
    // Mock system context
    messages = [];

    // Setup entities
    book = {
      id: 1,
      name: "Test Book",
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
      // Disable permissions checks
      props: { is_wizard: true },
    } as any;
  });

  it("should list chapters", async () => {
    const script = Core["seq"](
      Core["let"]("chapters", Object["obj.get"](Core["this"](), "chapters")),
      Core["call"](
        Core["caller"](),
        "tell",
        String["str.join"](
          List["list.map"](
            Core["var"]("chapters"),
            Core["lambda"](["c"], Object["obj.get"](Core["var"]("c"), "title")),
          ),
          "\n",
        ),
      ),
    );

    await evaluate(script, createScriptContext({ caller, this: book }));
    expect(messages[0]).toBe("Chapter 1\nChapter 2");
  });

  it("should read a chapter", async () => {
    const script = Core["seq"](
      Core["let"]("index", Core["arg"](0)),
      Core["let"]("chapters", Object["obj.get"](Core["this"](), "chapters")),
      Core["let"](
        "chapter",
        List["list.get"](Core["var"]("chapters"), Core["var"]("index")),
      ),
      Core["if"](
        Core["var"]("chapter"),
        Core["call"](
          Core["caller"](),
          "tell",
          String["str.concat"](
            "Chapter: ",
            Object["obj.get"](Core["var"]("chapter"), "title"),
            "\n\n",
            Object["obj.get"](Core["var"]("chapter"), "content"),
          ),
        ),
        Core["call"](Core["caller"](), "tell", "Chapter not found."),
      ),
    );

    // Read Chapter 1 (index 0)
    await evaluate(
      script,
      createScriptContext({ caller, this: book, args: [0] }),
    );
    expect(messages[0]).toContain("Chapter: Chapter 1");
    expect(messages[0]).toContain("Content 1");

    // Read invalid chapter
    messages = [];
    await evaluate(
      script,
      createScriptContext({ caller, this: book, args: [99] }),
    );
    expect(messages[0]).toBe("Chapter not found.");
  });

  it("should add a chapter", async () => {
    const script = Core["seq"](
      Core["let"]("title", Core["arg"](0)),
      Core["let"]("content", Core["arg"](1)),
      Core["let"]("chapters", Object["obj.get"](Core["this"](), "chapters")),
      Core["let"]("newChapter", {}),
      Object["obj.set"](
        Core["var"]("newChapter"),
        "title",
        Core["var"]("title"),
      ),
      Object["obj.set"](
        Core["var"]("newChapter"),
        "content",
        Core["var"]("content"),
      ),
      List["list.push"](Core["var"]("chapters"), Core["var"]("newChapter")),
      Core["set_entity"](
        Object["obj.set"](Core["this"](), "chapters", Core["var"]("chapters")),
      ),
      Core["call"](Core["caller"](), "tell", "Chapter added."),
    );

    await evaluate(
      script,
      createScriptContext({
        caller,
        this: book,
        args: ["Chapter 3", "Content 3"],
      }),
    );
    expect(messages[0]).toBe("Chapter added.");
    expect((book["chapters"] as any).length).toBe(3);
    expect((book["chapters"] as any)[2].title).toBe("Chapter 3");
  });

  it("should search chapters", async () => {
    const script = Core["seq"](
      Core["let"]("query", Core["arg"](0)),
      Core["let"]("chapters", Object["obj.get"](Core["this"](), "chapters")),
      Core["let"](
        "results",
        List["list.filter"](
          Core["var"]("chapters"),
          Core["lambda"](
            ["c"],
            Core["or"](
              String["str.includes"](
                String["str.lower"](
                  Object["obj.get"](Core["var"]("c"), "title"),
                ),
                String["str.lower"](Core["var"]("query")),
              ),
              String["str.includes"](
                String["str.lower"](
                  Object["obj.get"](Core["var"]("c"), "content"),
                ),
                String["str.lower"](Core["var"]("query")),
              ),
            ),
          ),
        ),
      ),
      Core["call"](
        Core["caller"](),
        "tell",
        String["str.concat"](
          "Found ",
          List["list.len"](Core["var"]("results")),
          " matches:\n",
          String["str.join"](
            List["list.map"](
              Core["var"]("results"),
              Core["lambda"](
                ["c"],
                Object["obj.get"](Core["var"]("c"), "title"),
              ),
            ),
            "\n",
          ),
        ),
      ),
    );

    // Search for "Content" (should match all)
    await evaluate(
      script,
      createScriptContext({ caller, this: book, args: ["Content"] }),
    );
    expect(messages[0]).toContain("Found 2 matches");

    // Search for "2" (should match Chapter 2)
    messages = [];
    await evaluate(
      script,
      createScriptContext({ caller, this: book, args: ["2"] }),
    );
    expect(messages[0]).toContain("Found 1 matches");
    expect(messages[0]).toContain("Chapter 2");
  });
});
