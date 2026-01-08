import { createEffect } from "solid-js";
import { createStore } from "solid-js/store";

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

interface ThemeManifestV1 {
  kind: "bloom-theme";
  version: "1.0.0";
  name: string;
  author: string;
  description?: string;
}

type ThemeManifest = ThemeManifestV1;

interface Theme {
  id: string;
  manifest: ThemeManifest;
  colors: ThemeColors;
  isBuiltin?: boolean;
}

const defaultThemeColors: ThemeColors = {
  "--accent-base": "oklch(100% 0 0)",
  "--accent-color": "oklch(100% 0 0 / 0.15)",
  "--accent-fg": "#e0e0e0",
  "--accent-hover": "oklch(100% 0 0 / 0.25)",
  "--bg-app": "oklch(100% 0 0 / 0.03)",
  "--bg-element": "oklch(100% 0 0 / 0.08)",
  "--bg-element-active": "oklch(100% 0 0 / 0.16)",
  "--bg-element-hover": "oklch(100% 0 0 / 0.12)",
  "--bg-input": "oklch(100% 0 0 / 0.1)",
  "--bg-panel": "oklch(100% 0 0 / 0.03)",
  "--border-color": "oklch(100% 0 0 / 0.15)",
  "--error-color": "#ff6b6b",
  "--link-color": "#aaddff",
  "--overlay-bg": "rgba(0, 0, 0, 0.5)",
  "--status-offline": "#f44",
  "--status-online": "#4f4",
  "--text-inverse": "#000000",
  "--text-muted": "#666666",
  "--text-primary": "#e0e0e0",
  "--text-secondary": "#aaaaaa",
};

const defaultTheme: Theme = {
  colors: defaultThemeColors,
  id: "default",
  isBuiltin: true,
  manifest: {
    author: "Bloom",
    description: "The default dark theme.",
    kind: "bloom-theme",
    name: "Default Dark",
    version: "1.0.0",
  },
};

interface ThemeState {
  themes: Theme[];
  activeThemeId: string;
  allowCustomCss: boolean;
}

// Migration Logic
export const loadInitialState = (): ThemeState => {
  const savedThemes = localStorage.getItem("bloom_themes");
  const savedActiveId = localStorage.getItem("bloom_active_theme_id");
  const savedCustomCssPref = localStorage.getItem("bloom_allow_custom_css");
  const oldSavedTheme = localStorage.getItem("bloom_theme");

  let themes: Theme[] = [defaultTheme];
  let activeThemeId = "default";

  if (savedThemes) {
    try {
      const parsed = JSON.parse(savedThemes);
      // Basic validation/migration for existing array
      if (Array.isArray(parsed)) {
        themes = parsed.map((theme: any) => {
          // If missing kind/version, patch it
          if (!theme.manifest.kind) {
            return {
              ...theme,
              manifest: {
                ...theme.manifest,
                kind: "bloom-theme",
                version: "1.0.0",
              },
            };
          }
          return theme;
        });
        // Ensure default is always present and up to date
        const defaultIndex = themes.findIndex((theme) => theme.id === "default");
        if (defaultIndex !== -1) {
          themes[defaultIndex] = defaultTheme;
        } else {
          themes.unshift(defaultTheme);
        }
      }
    } catch (error) {
      console.error("Failed to parse saved themes", error);
    }
  } else if (oldSavedTheme) {
    // Migrate old single theme
    try {
      const oldColors = JSON.parse(oldSavedTheme);
      const migratedTheme: Theme = {
        colors: oldColors,
        id: "migrated_custom",
        manifest: {
          author: "User",
          description: "Migrated from previous version.",
          kind: "bloom-theme",
          name: "My Custom Theme",
          version: "1.0.0",
        },
      };
      themes.push(migratedTheme);
      activeThemeId = "migrated_custom";
    } catch (error) {
      console.error("Failed to migrate old theme", error);
    }
  }

  if (savedActiveId && themes.some((theme) => theme.id === savedActiveId)) {
    activeThemeId = savedActiveId;
  }

  return {
    activeThemeId,
    allowCustomCss: savedCustomCssPref ? JSON.parse(savedCustomCssPref) : true,
    themes,
  };
};

const [state, setState] = createStore<ThemeState>(loadInitialState());

export const themeStore = {
  get activeTheme() {
    return state.themes.find((theme) => theme.id === state.activeThemeId) ?? defaultTheme;
  },

  createTheme: (name: string) => {
    const newTheme: Theme = {
      colors: { ...themeStore.activeTheme.colors },
      id: crypto.randomUUID(),
      manifest: {
        author: "User",
        kind: "bloom-theme",
        name,
        version: "1.0.0",
      }, // Clone current colors
    };
    setState("themes", (themes) => [...themes, newTheme]);
    setState("activeThemeId", newTheme.id);
  },

  deleteTheme: (id: string) => {
    const theme = state.themes.find((theme) => theme.id === id);
    if (theme?.isBuiltin) {
      return;
    }
    setState("themes", (themes) => themes.filter((theme) => theme.id !== id));
    if (state.activeThemeId === id) {
      setState("activeThemeId", "default");
    }
  },

  importTheme: (theme: any) => {
    // Validate theme structure
    if (!theme.manifest || theme.manifest.kind !== "bloom-theme" || !theme.colors) {
      alert("Invalid theme format. Must be a valid Bloom Theme.");
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

  // For testing
  reset: () => {
    setState(loadInitialState());
  },

  setActiveTheme: (id: string) => {
    setState("activeThemeId", id);
  },

  state,

  toggleCustomCss: () => {
    setState("allowCustomCss", (prev) => !prev);
  },

  updateColor: (key: keyof ThemeColors, value: string) => {
    const activeId = state.activeThemeId;
    const theme = state.themes.find((theme) => theme.id === activeId);
    if (theme?.isBuiltin) {
      // If trying to edit builtin, create a copy first?
      if (confirm("Cannot edit default theme. Create a copy?")) {
        themeStore.createTheme(`Copy of ${theme.manifest.name}`);
        // Then update the new one
        setState("themes", (theme) => theme.id === state.activeThemeId, "colors", key, value);
      }
      return;
    }

    setState("themes", (theme) => theme.id === activeId, "colors", key, value);
  },

  updateManifest: (update: Partial<ThemeManifest>) => {
    const activeId = state.activeThemeId;
    if (state.themes.find((theme) => theme.id === activeId)?.isBuiltin) {
      return;
    }
    setState(
      "themes",
      (theme) => theme.id === activeId,
      "manifest",
      (manifest) => ({ ...manifest, ...update }),
    );
  },
};

// Auto-save
createEffect(() => {
  localStorage.setItem("bloom_themes", JSON.stringify(state.themes));
  localStorage.setItem("bloom_active_theme_id", state.activeThemeId);
  localStorage.setItem("bloom_allow_custom_css", JSON.stringify(state.allowCustomCss));
});

// Apply theme to document root
createEffect(() => {
  const activeTheme = state.themes.find((theme) => theme.id === state.activeThemeId);
  if (activeTheme) {
    const root = document.documentElement;
    for (const [key, value] of Object.entries(activeTheme.colors)) {
      root.style.setProperty(key, value);
    }
  }
});
