import { createStore } from "solid-js/store";

export type ActionType = "north" | "south" | "east" | "west" | "look" | "inventory";

export const ACTION_LABELS: Record<ActionType, string> = {
  east: "Move East",
  inventory: "Toggle Inventory",
  look: "Look",
  north: "Move North",
  south: "Move South",
  west: "Move West",
};

interface KeybindsState {
  bindings: Record<ActionType, string>;
}

const DEFAULT_BINDINGS: Record<ActionType, string> = {
  east: "d",
  inventory: "i",
  look: "l",
  north: "w",
  south: "s",
  west: "a",
};

const STORAGE_KEY = "lotus_keybinds";

export const loadBindings = (): Record<ActionType, string> => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return { ...DEFAULT_BINDINGS, ...JSON.parse(stored) };
    }
  } catch (error) {
    console.error("Failed to load keybinds", error);
  }
  return { ...DEFAULT_BINDINGS };
};

const [state, setState] = createStore<KeybindsState>({
  bindings: loadBindings(),
});

export const keybindsStore = {
  // Key is expected to be in format "Ctrl+Shift+Key" or just "Key"
  // We do case-insensitive comparison for the key part, but modifiers should be standard
  getActionForKey: (key: string): ActionType | undefined =>
    (Object.keys(state.bindings) as ActionType[]).find((action) => {
      const binding = state.bindings[action];
      return binding.toLowerCase() === key.toLowerCase();
    }),
  getKey: (action: ActionType) => state.bindings[action],
  resetDefaults: () => {
    setState("bindings", { ...DEFAULT_BINDINGS });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_BINDINGS));
  },
  setKey: (action: ActionType, key: string) => {
    setState("bindings", action, key);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.bindings));
  },
  state,
};
