import { createStore } from "solid-js/store";
import { createEffect } from "solid-js";

export interface ThemeColors {
  "--bg-app": string;
  "--bg-panel": string;
  "--bg-element": string;
  "--bg-element-hover": string;
  "--bg-element-active": string;
  "--bg-input": string;
  "--border-color": string;
  "--text-primary": string;
  "--text-secondary": string;
  "--text-muted": string;
  "--text-inverse": string;
  "--accent-base": string;
  "--accent-color": string;
  "--accent-hover": string;
  "--accent-fg": string;
  "--status-online": string;
  "--status-offline": string;
  "--link-color": string;
  "--error-color": string;
  "--overlay-bg": string;
}

export interface ThemeManifestV1 {
  kind: "viwo-theme";
  version: "1.0.0";
  name: string;
  author: string;
  description?: string;
}

export type ThemeManifest = ThemeManifestV1;

export interface Theme {
  id: string;
  manifest: ThemeManifest;
  colors: ThemeColors;
  isBuiltin?: boolean;
}

const defaultThemeColors: ThemeColors = {
  "--bg-app": "oklch(100% 0 0 / 0.03)",
  "--bg-panel": "oklch(100% 0 0 / 0.03)",
  "--bg-element": "oklch(100% 0 0 / 0.08)",
  "--bg-element-hover": "oklch(100% 0 0 / 0.12)",
  "--bg-element-active": "oklch(100% 0 0 / 0.16)",
  "--bg-input": "oklch(100% 0 0 / 0.1)",
  "--border-color": "oklch(100% 0 0 / 0.15)",
  "--text-primary": "#e0e0e0",
  "--text-secondary": "#aaaaaa",
  "--text-muted": "#666666",
  "--text-inverse": "#000000",
  "--accent-base": "oklch(100% 0 0)",
  "--accent-color": "oklch(100% 0 0 / 0.15)",
  "--accent-hover": "oklch(100% 0 0 / 0.25)",
  "--accent-fg": "#e0e0e0",
  "--status-online": "#4f4",
  "--status-offline": "#f44",
  "--link-color": "#aaddff",
  "--error-color": "#ff6b6b",
  "--overlay-bg": "rgba(0, 0, 0, 0.5)",
};

const defaultTheme: Theme = {
  id: "default",
  manifest: {
    kind: "viwo-theme",
    version: "1.0.0",
    name: "Default Dark",
    author: "Viwo",
    description: "The default dark theme.",
  },
  colors: defaultThemeColors,
  isBuiltin: true,
};

interface ThemeState {
  themes: Theme[];
  activeThemeId: string;
  allowCustomCss: boolean;
}

// Migration Logic
export const loadInitialState = (): ThemeState => {
  const savedThemes = localStorage.getItem("viwo_themes");
  const savedActiveId = localStorage.getItem("viwo_active_theme_id");
  const savedCustomCssPref = localStorage.getItem("viwo_allow_custom_css");
  const oldSavedTheme = localStorage.getItem("viwo_theme");

  let themes: Theme[] = [defaultTheme];
  let activeThemeId = "default";

  if (savedThemes) {
    try {
      const parsed = JSON.parse(savedThemes);
      // Basic validation/migration for existing array
      if (Array.isArray(parsed)) {
        themes = parsed.map((t: any) => {
          // If missing kind/version, patch it
          if (!t.manifest.kind) {
            return {
              ...t,
              manifest: {
                ...t.manifest,
                kind: "viwo-theme",
                version: "1.0.0",
              },
            };
          }
          return t;
        });
        // Ensure default is always present and up to date
        const defaultIndex = themes.findIndex((t) => t.id === "default");
        if (defaultIndex !== -1) {
          themes[defaultIndex] = defaultTheme;
        } else {
          themes.unshift(defaultTheme);
        }
      }
    } catch (e) {
      console.error("Failed to parse saved themes", e);
    }
  } else if (oldSavedTheme) {
    // Migrate old single theme
    try {
      const oldColors = JSON.parse(oldSavedTheme);
      const migratedTheme: Theme = {
        id: "migrated_custom",
        manifest: {
          kind: "viwo-theme",
          version: "1.0.0",
          name: "My Custom Theme",
          author: "User",
          description: "Migrated from previous version.",
        },
        colors: oldColors,
      };
      themes.push(migratedTheme);
      activeThemeId = "migrated_custom";
    } catch (e) {
      console.error("Failed to migrate old theme", e);
    }
  }

  if (savedActiveId && themes.find((t) => t.id === savedActiveId)) {
    activeThemeId = savedActiveId;
  }

  return {
    themes,
    activeThemeId,
    allowCustomCss: savedCustomCssPref ? JSON.parse(savedCustomCssPref) : true,
  };
};

const [state, setState] = createStore<ThemeState>(loadInitialState());

export const themeStore = {
  state,

  get activeTheme() {
    return state.themes.find((t) => t.id === state.activeThemeId) || defaultTheme;
  },

  setActiveTheme: (id: string) => {
    setState("activeThemeId", id);
  },

  createTheme: (name: string) => {
    const newTheme: Theme = {
      id: crypto.randomUUID(),
      manifest: {
        kind: "viwo-theme",
        version: "1.0.0",
        name,
        author: "User",
      },
      colors: { ...themeStore.activeTheme.colors }, // Clone current colors
    };
    setState("themes", (themes) => [...themes, newTheme]);
    setState("activeThemeId", newTheme.id);
  },

  deleteTheme: (id: string) => {
    const theme = state.themes.find((t) => t.id === id);
    if (theme?.isBuiltin) return;

    setState("themes", (themes) => themes.filter((t) => t.id !== id));
    if (state.activeThemeId === id) {
      setState("activeThemeId", "default");
    }
  },

  updateColor: (key: keyof ThemeColors, value: string) => {
    const activeId = state.activeThemeId;
    const theme = state.themes.find((t) => t.id === activeId);
    if (theme?.isBuiltin) {
      // If trying to edit builtin, create a copy first?
      if (confirm("Cannot edit default theme. Create a copy?")) {
        themeStore.createTheme("Copy of " + theme.manifest.name);
        // Then update the new one
        setState("themes", (t) => t.id === state.activeThemeId, "colors", key, value);
      }
      return;
    }

    setState("themes", (t) => t.id === activeId, "colors", key, value);
  },

  updateManifest: (update: Partial<ThemeManifest>) => {
    const activeId = state.activeThemeId;
    if (state.themes.find((t) => t.id === activeId)?.isBuiltin) return;
    setState(
      "themes",
      (t) => t.id === activeId,
      "manifest",
      (m) => ({
        ...m,
        ...update,
      }),
    );
  },

  importTheme: (theme: any) => {
    // Validate theme structure
    if (!theme.manifest || theme.manifest.kind !== "viwo-theme" || !theme.colors) {
      alert("Invalid theme format. Must be a valid Viwo Theme.");
      return;
    }

    // Version check (optional, for now just accept 1.0.0)
    if (theme.manifest.version !== "1.0.0") {
      console.warn("Unknown theme version:", theme.manifest.version);
    }

    // Ensure ID is unique or regenerate
    const newTheme: Theme = {
      ...theme,
      id: crypto.randomUUID(),
      isBuiltin: false, // Ensure imported themes aren't builtin
    };
    setState("themes", (themes) => [...themes, newTheme]);
    setState("activeThemeId", newTheme.id);
  },

  toggleCustomCss: () => {
    setState("allowCustomCss", (prev) => !prev);
  },

  // For testing
  reset: () => {
    setState(loadInitialState());
  },
};

// Auto-save
createEffect(() => {
  localStorage.setItem("viwo_themes", JSON.stringify(state.themes));
  localStorage.setItem("viwo_active_theme_id", state.activeThemeId);
  localStorage.setItem("viwo_allow_custom_css", JSON.stringify(state.allowCustomCss));
});

// Apply theme to document root
createEffect(() => {
  const activeTheme = state.themes.find((t) => t.id === state.activeThemeId);
  if (activeTheme) {
    const root = document.documentElement;
    for (const [key, value] of Object.entries(activeTheme.colors)) {
      root.style.setProperty(key, value);
    }
  }
});
