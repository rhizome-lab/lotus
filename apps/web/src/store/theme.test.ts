import { describe, test, expect, mock, beforeEach } from "bun:test";

// Mock localStorage
const mockStorage = new Map<string, string>();
const localStorageMock = {
  getItem: mock((key: string) => mockStorage.get(key) || null),
  setItem: mock((key: string, value: string) => mockStorage.set(key, value)),
  removeItem: mock((key: string) => mockStorage.delete(key)),
  clear: mock(() => mockStorage.clear()),
  length: 0,
  key: mock(() => null),
};

if (!global.localStorage) {
  Object.defineProperty(global, "localStorage", {
    value: localStorageMock,
    writable: true,
    configurable: true,
  });
}

// Mock crypto.randomUUID
global.crypto = {
  randomUUID: mock(() => "test-uuid-" + Math.random()),
} as any;

// Mock confirm/alert
global.confirm = mock(() => true);
global.alert = mock(() => {});

describe("Theme Store", () => {
  let themeStore: any;

  beforeEach(async () => {
    // Clear storage (whichever mock is used)
    if (global.localStorage) {
      global.localStorage.clear();
    }

    const module = await import("./theme");
    themeStore = module.themeStore;
    themeStore.reset();
    // Reset state to default if needed (though import usually caches, so we might need to rely on store actions to reset or use a fresh isolate if possible.
    // Since Bun caches modules, we might need to manually reset the store state if the module is reused.)
    // However, for unit tests, we often want to test the *initial load* logic which only runs once.
    // We might need to use `jest.resetModules()` equivalent or just test actions on the existing store.
    // For now, let's assume we can test actions. For initial load, we might need a separate test file or trickery.
    // Actually, we can just manually reset the store state using setState if it was exported, but it's not.
    // We'll test actions primarily.
  });

  test("Initial State", () => {
    expect(themeStore.state.activeThemeId).toBe("default");
    expect(themeStore.state.themes.length).toBeGreaterThan(0);
    expect(themeStore.activeTheme.id).toBe("default");
  });

  test("Create Theme", () => {
    themeStore.createTheme("New Theme");
    expect(themeStore.state.themes.length).toBe(2);
    expect(themeStore.state.activeThemeId).not.toBe("default");
    expect(themeStore.activeTheme.manifest.name).toBe("New Theme");
  });

  test("Update Color (Custom Theme)", () => {
    // Ensure we are on a custom theme
    if (themeStore.state.activeThemeId === "default") {
      themeStore.createTheme("Custom");
    }

    themeStore.updateColor("--bg-app", "red");
    expect(themeStore.activeTheme.colors["--bg-app"]).toBe("red");
  });

  test("Update Color (Builtin Theme - Auto Fork)", () => {
    themeStore.setActiveTheme("default");
    expect(themeStore.activeTheme.isBuiltin).toBe(true);

    // Should trigger confirm (mocked to true) and create copy
    themeStore.updateColor("--bg-app", "blue");

    expect(themeStore.state.activeThemeId).not.toBe("default");
    expect(themeStore.activeTheme.manifest.name).toContain("Copy of");
    expect(themeStore.activeTheme.colors["--bg-app"]).toBe("blue");
  });

  test("Delete Theme", () => {
    themeStore.createTheme("To Delete");
    const id = themeStore.state.activeThemeId;
    expect(themeStore.state.themes.find((t: any) => t.id === id)).toBeDefined();

    themeStore.deleteTheme(id);
    expect(
      themeStore.state.themes.find((t: any) => t.id === id),
    ).toBeUndefined();
    expect(themeStore.state.activeThemeId).toBe("default");
  });

  test("Delete Builtin Theme (Protected)", () => {
    themeStore.setActiveTheme("default");
    themeStore.deleteTheme("default");
    expect(
      themeStore.state.themes.find((t: any) => t.id === "default"),
    ).toBeDefined();
  });

  test("Import Theme", () => {
    const validTheme = {
      manifest: { kind: "viwo-theme", version: "1.0.0", name: "Imported" },
      colors: { "--bg-app": "green" },
    };
    themeStore.importTheme(validTheme);

    expect(themeStore.activeTheme.manifest.name).toBe("Imported");
    expect(themeStore.activeTheme.colors["--bg-app"]).toBe("green");
    expect(themeStore.activeTheme.isBuiltin).toBe(false);
  });

  test("Import Invalid Theme", () => {
    const invalidTheme = { foo: "bar" };
    themeStore.importTheme(invalidTheme);
    expect(global.alert).toHaveBeenCalled();
  });

  test("Toggle Custom CSS", () => {
    const initial = themeStore.state.allowCustomCss;
    themeStore.toggleCustomCss();
    expect(themeStore.state.allowCustomCss).toBe(!initial);
  });
});
