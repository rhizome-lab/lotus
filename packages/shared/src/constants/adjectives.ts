export const ADJECTIVE_REGISTRY = {
  colors: [
    "pink",
    "cyan",
    "lilac",
    "lavender",
    "green",
    "red",
    "blue",
    "yellow",
    "orange",
    "purple",
    "teal",
    "grey",
    "white",
  ],
  modifiers: ["light", "dark", "pastel", "neon"],
  effects: ["glowing", "transparent", "ethereal"],
  materials: [
    "stone",
    "obsidian",
    "metal",
    "glass",
    "silver",
    "gold",
    "platinum",
  ],
};

export const ALL_ADJECTIVES = [
  ...ADJECTIVE_REGISTRY.colors.map((c) => `color:${c}`),
  ...ADJECTIVE_REGISTRY.modifiers.map((m) => `color:${m}`),
  ...ADJECTIVE_REGISTRY.effects.map((e) => `effect:${e}`),
  ...ADJECTIVE_REGISTRY.materials.map((m) => `material:${m}`),
];
