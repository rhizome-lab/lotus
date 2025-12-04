import { describe, test, expect } from "bun:test";
import { parseCommand } from "./parser";

describe("CLI Parser", () => {
  test("Basic command", () => {
    expect(parseCommand("look")).toEqual({ command: "look", args: [] });
    expect(parseCommand("go north")).toEqual({
      command: "go",
      args: ["north"],
    });
  });

  test("Quoted arguments", () => {
    expect(parseCommand('say "hello world"')).toEqual({
      command: "say",
      args: ["hello world"],
    });
    expect(parseCommand('create "iron sword" weapon')).toEqual({
      command: "create",
      args: ["iron sword", "weapon"],
    });
  });

  test("Empty input", () => {
    expect(parseCommand("")).toBeNull();
    expect(parseCommand("   ")).toBeNull();
  });
});
