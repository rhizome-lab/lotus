/// <reference types="bun" />
import { describe, test, expect, beforeEach, mock } from "bun:test";
import { loadBindings } from "./keybinds";

// Mock localStorage BEFORE import
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: mock((key: string) => store[key] || null),
    setItem: mock((key: string, value: string) => {
      store[key] = value.toString();
    }),
    clear: mock(() => {
      store = {};
    }),
    removeItem: mock((key: string) => {
      delete store[key];
    }),
  };
})();

if (!global.localStorage) {
  Object.defineProperty(global, "localStorage", {
    value: localStorageMock,
    writable: true,
    configurable: true,
  });
}

// Import after mock
// import { keybindsStore } from "./keybinds";

let keybindsStore: any;

describe("Keybinds Store", () => {
  beforeEach(async () => {
    if (global.localStorage) {
      global.localStorage.removeItem("viwo_keybinds");
    }
    // Reset the store state by reloading the module or using a reset method if available.
    const module = await import("./keybinds");
    keybindsStore = module.keybindsStore;
    keybindsStore.resetDefaults();
  });

  test("Default bindings", () => {
    expect(keybindsStore.getKey("north")).toBe("w");
    expect(keybindsStore.getKey("look")).toBe("l");
  });

  test("Set key", () => {
    keybindsStore.setKey("north", "ArrowUp");
    expect(keybindsStore.getKey("north")).toBe("ArrowUp");
    expect(localStorageMock.setItem).toHaveBeenCalled();
  });

  test("Get action for key", () => {
    expect(keybindsStore.getActionForKey("l")).toBe("look");
    expect(keybindsStore.getActionForKey("z")).toBeUndefined();
  });

  test("loadBindings with existing data", () => {
    // Assuming `spyOn` is available globally or imported, e.g., from Jest or a similar test utility.
    // If using Bun's `mock`, it would be `const getItemSpy = mock(global.localStorage, "getItem").mockReturnValue(...)`
    global.localStorage.setItem("viwo_keybinds", JSON.stringify({ north: "up" }));

    const bindings = loadBindings();
    expect(bindings.north).toBe("up");
    expect(bindings.south).toBe("s"); // Default preserved
  });

  test("Reset defaults", () => {
    keybindsStore.setKey("north", "ArrowUp");
    keybindsStore.resetDefaults();
    expect(keybindsStore.getKey("north")).toBe("w");
  });
});
