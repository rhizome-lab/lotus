import * as CoreLib from "../runtime/lib/core";
import * as KernelLib from "../runtime/lib/kernel";
import {
  BooleanLib,
  ListLib,
  ObjectLib,
  StdLib,
  StringLib,
  createScriptContext,
  evaluate,
} from "@viwo/scripting";
import { addVerb, createCapability, createEntity, getEntity } from "../repo";
import { beforeEach, describe, expect, it } from "bun:test";
import type { Entity } from "@viwo/shared/jsonrpc";
import { GameOpcodes } from "./opcodes";

describe("Book Item Scripting", () => {
  let book: Entity;
  let caller: Entity;
  let messages: string[] = [];

  beforeEach(() => {
    // Mock system context
    messages = [];

    // Setup entities
    const bookId = createEntity({
      chapters: [
        { content: "Content 1", title: "Chapter 1" },
        { content: "Content 2", title: "Chapter 2" },
      ],
      name: "Test Book",
    });
    book = getEntity(bookId)!;

    const callerId = createEntity({
      is_wizard: true,
      name: "Reader",
    });
    caller = getEntity(callerId)!;

    // Add tell verb
    addVerb(callerId, "tell", StdLib.send("message", StdLib.arg(0)));

    // Give book control over itself
    createCapability(bookId, "entity.control", { target_id: bookId });
  });

  it("should list chapters", async () => {
    const script = StdLib.seq(
      StdLib.let("chapters", ObjectLib.objGet(StdLib.this(), "chapters")),
      CoreLib.call(
        StdLib.caller(),
        "tell",
        StringLib.strJoin(
          ListLib.listMap(
            StdLib.var("chapters"),
            StdLib.lambda(["c"], ObjectLib.objGet(StdLib.var("c"), "title")),
          ),
          "\n",
        ),
      ),
    );

    await evaluate(
      script,
      createScriptContext({
        caller,
        ops: GameOpcodes,
        send: (_type, payload) => messages.push(payload as string),
        this: book,
      }),
    );
    expect(messages[0]).toBe("Chapter 1\nChapter 2");
  });

  it("should read a chapter", async () => {
    const script = StdLib.seq(
      StdLib.let("index", StdLib.arg(0)),
      StdLib.let("chapters", ObjectLib.objGet(StdLib.this(), "chapters")),
      StdLib.let("chapter", ListLib.listGet(StdLib.var("chapters"), StdLib.var("index"))),
      StdLib.if(
        StdLib.var("chapter"),
        CoreLib.call(
          StdLib.caller(),
          "tell",
          StringLib.strConcat(
            "Chapter: ",
            ObjectLib.objGet(StdLib.var("chapter"), "title"),
            "\n\n",
            ObjectLib.objGet(StdLib.var("chapter"), "content"),
          ),
        ),
        CoreLib.call(StdLib.caller(), "tell", "Chapter not found."),
      ),
    );

    // Read Chapter 1 (index 0)
    await evaluate(
      script,
      createScriptContext({
        args: [0],
        caller,
        ops: GameOpcodes,
        send: (_type, payload) => messages.push(payload as string),
        this: book,
      }),
    );
    expect(messages[0]).toContain("Chapter: Chapter 1");
    expect(messages[0]).toContain("Content 1");

    // Read invalid chapter
    messages = [];
    await evaluate(
      script,
      createScriptContext({
        args: [99],
        caller,
        ops: GameOpcodes,
        send: (_type, payload) => messages.push(payload as string),
        this: book,
      }),
    );
    expect(messages[0]).toBe("Chapter not found.");
  });

  it("should add a chapter", async () => {
    const script = StdLib.seq(
      StdLib.let("title", StdLib.arg(0)),
      StdLib.let("content", StdLib.arg(1)),
      StdLib.let("chapters", ObjectLib.objGet(StdLib.this(), "chapters")),
      StdLib.let("newChapter", {}),
      ObjectLib.objSet(StdLib.var("newChapter"), "title", StdLib.var("title")),
      ObjectLib.objSet(StdLib.var("newChapter"), "content", StdLib.var("content")),
      ListLib.listPush(StdLib.var("chapters"), StdLib.var("newChapter")),
      StdLib.let(
        "cap",
        KernelLib.getCapability(
          "entity.control",
          ObjectLib.objNew(["target_id", ObjectLib.objGet(StdLib.this(), "id")]),
        ),
      ),
      CoreLib.setEntity(
        StdLib.var("cap"),
        StdLib.this(),
        ObjectLib.objNew(["chapters", StdLib.var("chapters")]),
      ),
      CoreLib.call(StdLib.caller(), "tell", "Chapter added."),
    );

    await evaluate(
      script,
      createScriptContext({
        args: ["Chapter 3", "Content 3"],
        caller,
        ops: GameOpcodes,
        send: (_type, payload) => messages.push(payload as string),
        this: book,
      }),
    );
    expect(messages[0]).toBe("Chapter added.");
    expect((book["chapters"] as any).length).toBe(3);
    expect((book["chapters"] as any)[2].title).toBe("Chapter 3");
  });

  it("should search chapters", async () => {
    const script = StdLib.seq(
      StdLib.let("query", StdLib.arg(0)),
      StdLib.let("chapters", ObjectLib.objGet(StdLib.this(), "chapters")),
      StdLib.let(
        "results",
        ListLib.listFilter(
          StdLib.var("chapters"),
          StdLib.lambda(
            ["c"],
            BooleanLib.or(
              StringLib.strIncludes(
                StringLib.strLower(ObjectLib.objGet(StdLib.var("c"), "title")),
                StringLib.strLower(StdLib.var("query")),
              ),
              StringLib.strIncludes(
                StringLib.strLower(ObjectLib.objGet(StdLib.var("c"), "content")),
                StringLib.strLower(StdLib.var("query")),
              ),
            ),
          ),
        ),
      ),
      CoreLib.call(
        StdLib.caller(),
        "tell",
        StringLib.strConcat(
          "Found ",
          ListLib.listLen(StdLib.var("results")),
          " matches:\n",
          StringLib.strJoin(
            ListLib.listMap(
              StdLib.var("results"),
              StdLib.lambda(["c"], ObjectLib.objGet(StdLib.var("c"), "title")),
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
        args: ["Content"],
        caller,
        ops: GameOpcodes,
        send: (_type, payload) => messages.push(payload as string),
        this: book,
      }),
    );
    expect(messages[0]).toContain("Found 2 matches");

    // Search for "2" (should match Chapter 2)
    messages = [];
    await evaluate(
      script,
      createScriptContext({
        args: ["2"],
        caller,
        ops: GameOpcodes,
        send: (_type, payload) => messages.push(payload as string),
        this: book,
      }),
    );
    expect(messages[0]).toContain("Found 1 matches");
    expect(messages[0]).toContain("Chapter 2");
  });
});
