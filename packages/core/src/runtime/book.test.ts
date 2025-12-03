import { describe, it, expect, beforeEach } from "bun:test";
import {
  createScriptContext,
  evaluate,
  registerLibrary,
  StdLib as Std,
  ListLib as List,
  StringLib as String,
  ObjectLib as Object,
  BooleanLib,
} from "@viwo/scripting";
import { Entity } from "@viwo/shared/jsonrpc";
import { addVerb, createEntity, getEntity } from "../repo";
import * as CoreLib from "../runtime/lib/core";

describe("Book Item Scripting", () => {
  registerLibrary(Std);
  registerLibrary(List);
  registerLibrary(String);
  registerLibrary(Object);
  registerLibrary(CoreLib);
  registerLibrary(BooleanLib);

  let book: Entity;
  let caller: Entity;
  let messages: string[] = [];

  beforeEach(() => {
    // Mock system context
    messages = [];

    // Setup entities
    const bookId = createEntity({
      name: "Test Book",
      chapters: [
        { title: "Chapter 1", content: "Content 1" },
        { title: "Chapter 2", content: "Content 2" },
      ],
    });
    book = getEntity(bookId)!;

    const callerId = createEntity({
      name: "Reader",
      is_wizard: true,
    });
    caller = getEntity(callerId)!;

    // Add tell verb
    addVerb(callerId, "tell", Std["send"]("message", Std["arg"](0)));
  });

  it("should list chapters", async () => {
    const script = Std["seq"](
      Std["let"]("chapters", Object["obj.get"](Std["this"](), "chapters")),
      CoreLib["call"](
        Std["caller"](),
        "tell",
        String["str.join"](
          List["list.map"](
            Std["var"]("chapters"),
            Std["lambda"](["c"], Object["obj.get"](Std["var"]("c"), "title")),
          ),
          "\n",
        ),
      ),
    );

    await evaluate(
      script,
      createScriptContext({
        caller,
        this: book,
        send: (_type, payload) => messages.push(payload as string),
      }),
    );
    expect(messages[0]).toBe("Chapter 1\nChapter 2");
  });

  it("should read a chapter", async () => {
    const script = Std["seq"](
      Std["let"]("index", Std["arg"](0)),
      Std["let"]("chapters", Object["obj.get"](Std["this"](), "chapters")),
      Std["let"]("chapter", List["list.get"](Std["var"]("chapters"), Std["var"]("index"))),
      Std["if"](
        Std["var"]("chapter"),
        CoreLib["call"](
          Std["caller"](),
          "tell",
          String["str.concat"](
            "Chapter: ",
            Object["obj.get"](Std["var"]("chapter"), "title"),
            "\n\n",
            Object["obj.get"](Std["var"]("chapter"), "content"),
          ),
        ),
        CoreLib["call"](Std["caller"](), "tell", "Chapter not found."),
      ),
    );

    // Read Chapter 1 (index 0)
    await evaluate(
      script,
      createScriptContext({
        caller,
        this: book,
        args: [0],
        send: (_type, payload) => messages.push(payload as string),
      }),
    );
    expect(messages[0]).toContain("Chapter: Chapter 1");
    expect(messages[0]).toContain("Content 1");

    // Read invalid chapter
    messages = [];
    await evaluate(
      script,
      createScriptContext({
        caller,
        this: book,
        args: [99],
        send: (_type, payload) => messages.push(payload as string),
      }),
    );
    expect(messages[0]).toBe("Chapter not found.");
  });

  it("should add a chapter", async () => {
    const script = Std["seq"](
      Std["let"]("title", Std["arg"](0)),
      Std["let"]("content", Std["arg"](1)),
      Std["let"]("chapters", Object["obj.get"](Std["this"](), "chapters")),
      Std["let"]("newChapter", {}),
      Object["obj.set"](Std["var"]("newChapter"), "title", Std["var"]("title")),
      Object["obj.set"](Std["var"]("newChapter"), "content", Std["var"]("content")),
      List["list.push"](Std["var"]("chapters"), Std["var"]("newChapter")),
      CoreLib["set_entity"](Object["obj.set"](Std["this"](), "chapters", Std["var"]("chapters"))),
      CoreLib["call"](Std["caller"](), "tell", "Chapter added."),
    );

    await evaluate(
      script,
      createScriptContext({
        caller,
        this: book,
        args: ["Chapter 3", "Content 3"],
        send: (_type, payload) => messages.push(payload as string),
      }),
    );
    expect(messages[0]).toBe("Chapter added.");
    expect((book["chapters"] as any).length).toBe(3);
    expect((book["chapters"] as any)[2].title).toBe("Chapter 3");
  });

  it("should search chapters", async () => {
    const script = Std["seq"](
      Std["let"]("query", Std["arg"](0)),
      Std["let"]("chapters", Object["obj.get"](Std["this"](), "chapters")),
      Std["let"](
        "results",
        List["list.filter"](
          Std["var"]("chapters"),
          Std["lambda"](
            ["c"],
            BooleanLib["or"](
              String["str.includes"](
                String["str.lower"](Object["obj.get"](Std["var"]("c"), "title")),
                String["str.lower"](Std["var"]("query")),
              ),
              String["str.includes"](
                String["str.lower"](Object["obj.get"](Std["var"]("c"), "content")),
                String["str.lower"](Std["var"]("query")),
              ),
            ),
          ),
        ),
      ),
      CoreLib["call"](
        Std["caller"](),
        "tell",
        String["str.concat"](
          "Found ",
          List["list.len"](Std["var"]("results")),
          " matches:\n",
          String["str.join"](
            List["list.map"](
              Std["var"]("results"),
              Std["lambda"](["c"], Object["obj.get"](Std["var"]("c"), "title")),
            ),
            "\n",
          ),
        ),
      ),
    );

    // Search for "Content" (should match all)
    await evaluate(
      script,
      createScriptContext({
        caller,
        this: book,
        args: ["Content"],
        send: (_type, payload) => messages.push(payload as string),
      }),
    );
    expect(messages[0]).toContain("Found 2 matches");

    // Search for "2" (should match Chapter 2)
    messages = [];
    await evaluate(
      script,
      createScriptContext({
        caller,
        this: book,
        args: ["2"],
        send: (_type, payload) => messages.push(payload as string),
      }),
    );
    expect(messages[0]).toContain("Found 1 matches");
    expect(messages[0]).toContain("Chapter 2");
  });
});
