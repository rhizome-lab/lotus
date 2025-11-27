/// <reference types="bun" />
import { describe, test, expect, beforeEach, mock, spyOn } from "bun:test";

// Mock localStorage
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

describe("Theme Migration", () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  test("Migrate from old single theme", async () => {
    const oldColors = JSON.stringify({ "--bg-app": "red" });
    localStorageMock.setItem("viwo_theme", oldColors);

    // Cache buster to force re-evaluation
    const module = await import(`./theme?v=${Date.now()}`);
    const store = module.themeStore;

    expect(store.state.themes.length).toBe(2); // Default + Migrated
    expect(store.state.activeThemeId).toBe("migrated_custom");
    expect(store.state.themes[1].colors["--bg-app"]).toBe("red");
  });

  test("Migrate from array with missing manifest", async () => {
    const oldThemes = JSON.stringify([
      {
        id: "t1",
        colors: { "--bg-app": "blue" },
        manifest: { name: "Old Theme" }, // Missing kind/version
      },
    ]);
    localStorageMock.setItem("viwo_themes", oldThemes);

    const module = await import(`./theme?v=${Date.now() + 1}`);
    const store = module.themeStore;

    expect(store.state.themes.length).toBe(2); // Default + Old
    const migrated = store.state.themes.find((t: any) => t.id === "t1");
    expect(migrated).toBeDefined();
    expect(migrated.manifest.kind).toBe("viwo-theme");
    expect(migrated.manifest.version).toBe("1.0.0");
  });
});
