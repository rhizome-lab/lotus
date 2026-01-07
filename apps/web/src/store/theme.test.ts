import { beforeEach, describe, expect, mock, spyOn, test } from "bun:test";

// Mock alert
globalThis.alert = mock(() => {});

// Mock localStorage
const mockStorage = new Map<string, string>();
const localStorageMock = {
  clear: mock(() => mockStorage.clear()),
  getItem: mock((key: string) => mockStorage.get(key) || null),
  key: mock(() => null),
  length: 0,
  removeItem: mock((key: string) => mockStorage.delete(key)),
  setItem: mock((key: string, value: string) => mockStorage.set(key, value)),
};

if (!globalThis.localStorage) {
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: localStorageMock,
    writable: true,
  });
}

// Mock crypto.randomUUID
globalThis.crypto = {
  randomUUID: mock(() => `test-uuid-${Math.random()}`),
} as any;

// Mock confirm/alert
globalThis.confirm = mock(() => true);
globalThis.alert = mock(() => {});

// This is intentionally imported later so that mocks are setup first.
// oxlint-disable-next-line first
import { themeStore, loadInitialState } from "./theme";

describe("Theme Store", () => {
  beforeEach(() => {
    // Clear storage (whichever mock is used)
    if (globalThis.localStorage) {
      globalThis.localStorage.clear();
    }
    themeStore.reset();
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
    expect(themeStore.state.themes.find((theme) => theme.id === id)).toBeDefined();

    themeStore.deleteTheme(id);
    expect(themeStore.state.themes.find((theme) => theme.id === id)).toBeUndefined();
    expect(themeStore.state.activeThemeId).toBe("default");
  });

  test("Delete Builtin Theme (Protected)", () => {
    themeStore.setActiveTheme("default");
    themeStore.deleteTheme("default");
    expect(themeStore.state.themes.find((theme) => theme.id === "default")).toBeDefined();
  });

  test("Import Theme", () => {
    const validTheme = {
      colors: { "--bg-app": "green" },
      manifest: { kind: "bloom-theme", name: "Imported", version: "1.0.0" },
    };
    themeStore.importTheme(validTheme);

    expect(themeStore.activeTheme.manifest.name).toBe("Imported");
    expect(themeStore.activeTheme.colors["--bg-app"]).toBe("green");
    expect(themeStore.activeTheme.isBuiltin).toBe(false);
  });

  test("Delete Active Theme", () => {
    themeStore.createTheme("To Delete");
    const newTheme = themeStore.state.themes.at(-1)!;
    themeStore.setActiveTheme(newTheme.id);
    expect(themeStore.state.activeThemeId).toBe(newTheme.id);

    themeStore.deleteTheme(newTheme.id);
    expect(themeStore.state.themes.find((theme) => theme.id === newTheme.id)).toBeUndefined();
    expect(themeStore.state.activeThemeId).toBe("default");
  });

  test("Import Invalid Theme", () => {
    const alertSpy = spyOn(globalThis, "alert").mockImplementation(() => {});
    themeStore.importTheme({}); // Empty object
    expect(alertSpy).toHaveBeenCalledWith("Invalid theme format. Must be a valid Bloom Theme.");
    alertSpy.mockRestore();
  });

  test("Import Theme Version Warning", () => {
    const warnSpy = spyOn(console, "warn").mockImplementation(() => {});
    const theme = {
      colors: {},
      manifest: { kind: "bloom-theme", name: "Old", version: "0.9.0" },
    };
    themeStore.importTheme(theme);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  test("Toggle Custom CSS", () => {
    const initial = themeStore.state.allowCustomCss;
    themeStore.toggleCustomCss();
    expect(themeStore.state.allowCustomCss).toBe(!initial);
  });

  describe("Theme Migration", () => {
    beforeEach(() => {
      if (globalThis.localStorage) {
        globalThis.localStorage.removeItem("bloom_theme");
        globalThis.localStorage.removeItem("bloom_themes");
        globalThis.localStorage.removeItem("bloom_active_theme_id");
        globalThis.localStorage.removeItem("bloom_allow_custom_css");
      }
      themeStore.reset();
    });

    test("Migrate from old single theme", () => {
      globalThis.localStorage.setItem("bloom_theme", JSON.stringify({ "--bg-app": "red" }));

      const state = loadInitialState();

      expect(state.themes.length).toBe(2); // Default + Migrated
      expect(state.activeThemeId).toBe("migrated_custom");
      expect(state.themes[1]!.colors["--bg-app"]).toBe("red");
    });

    test("Migrate from array with missing manifest", () => {
      const oldThemes = JSON.stringify([
        {
          colors: { "--bg-app": "blue" },
          id: "t1",
          manifest: { name: "Old Theme" }, // Missing kind/version
        },
      ]);
      globalThis.localStorage.setItem("bloom_themes", oldThemes);

      const state = loadInitialState();

      expect(state.themes.length).toBe(2); // Default + Old
      const migrated = state.themes.find((theme) => theme.id === "t1");
      expect(migrated).toBeDefined();
      expect(migrated!.manifest.kind).toBe("bloom-theme");
      expect(migrated!.manifest.version).toBe("1.0.0");
    });
  });
});
