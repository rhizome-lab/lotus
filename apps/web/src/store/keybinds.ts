import { createStore } from "solid-js/store";

export type ActionType = "north" | "south" | "east" | "west" | "look" | "inventory";

export const ACTION_LABELS: Record<ActionType, string> = {
  north: "Move North",
  south: "Move South",
  east: "Move East",
  west: "Move West",
  look: "Look",
  inventory: "Toggle Inventory",
};

interface KeybindsState {
  bindings: Record<ActionType, string>;
}

const DEFAULT_BINDINGS: Record<ActionType, string> = {
  north: "w",
  south: "s",
  east: "d",
  west: "a",
  look: "l",
  inventory: "i",
};

const STORAGE_KEY = "viwo_keybinds";

export const loadBindings = (): Record<ActionType, string> => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return { ...DEFAULT_BINDINGS, ...JSON.parse(stored) };
    }
  } catch (e) {
    console.error("Failed to load keybinds", e);
  }
  return { ...DEFAULT_BINDINGS };
};

const [state, setState] = createStore<KeybindsState>({
  bindings: loadBindings(),
});

export const keybindsStore = {
  state,

  getKey: (action: ActionType) => state.bindings[action],

  setKey: (action: ActionType, key: string) => {
    setState("bindings", action, key);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.bindings));
  },

  resetDefaults: () => {
    setState("bindings", { ...DEFAULT_BINDINGS });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_BINDINGS));
  },

  getActionForKey: (key: string): ActionType | undefined => {
    // Key is expected to be in format "Ctrl+Shift+Key" or just "Key"
    // We do case-insensitive comparison for the key part, but modifiers should be standard
    return (Object.keys(state.bindings) as ActionType[]).find((action) => {
      const binding = state.bindings[action];
      return binding.toLowerCase() === key.toLowerCase();
    });
  },
};
