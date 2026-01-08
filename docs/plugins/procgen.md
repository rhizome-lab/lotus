# ProcGen Plugin

The ProcGen plugin (`@lotus/plugin-procgen`) provides procedural generation capabilities for the Lotus engine, allowing for the creation of noise-based terrains, random events, and seeded content.

## Opcodes

The plugin exposes the following opcodes under the `procgen` namespace:

### `procgen.seed(seed)`

Seeds the procedural generation system. This affects both noise generation and random number generation sequences.

- **Parameters**:
  - `seed` (number): The seed value.
- **Returns**: `void`.

### `procgen.noise(x, y)`

Generates 2D Simplex noise at the specified coordinates.

- **Parameters**:
  - `x` (number): The X coordinate.
  - `y` (number): The Y coordinate.
- **Returns**: `number` (value between -1 and 1).

### `procgen.random(min?, max?)`

Generates a seeded random number.

- **Parameters**:
  - `min` (number, optional): Minimum value (inclusive). Defaults to 0.
  - `max` (number, optional): Maximum value (inclusive). Defaults to 1.
- **Returns**: `number`.

**Usage Variations**:

- `procgen.random()`: Returns a float between 0 and 1.
- `procgen.random(max)`: Returns a number between 0 and `max`.
- `procgen.random(min, max)`: Returns a number between `min` and `max`.

## Common Use Cases

### Terrain Generation

Generate height values for a terrain grid using noise:

```json
[
  "seq",
  ["procgen.seed", 12345],
  ["let", "terrainSize", 64],
  ["let", "terrain", ["list.new"]],
  [
    "for",
    "y",
    ["list.new", 0, 1, 2, 3, 4, 5, 6, 7],
    [
      "seq",
      ["let", "row", ["list.new"]],
      [
        "for",
        "x",
        ["list.new", 0, 1, 2, 3, 4, 5, 6, 7],
        [
          "seq",
          ["let", "height", ["procgen.noise", ["var", "x"], ["var", "y"]]],
          ["let", "scaled", ["*", ["+", ["var", "height"], 1], 50]],
          ["list.push", ["var", "row"], ["var", "scaled"]]
        ]
      ],
      ["list.push", ["var", "terrain"], ["var", "row"]]
    ]
  ],
  ["log", "Generated terrain:", ["var", "terrain"]]
]
```

### Dungeon Generation

Generate a procedural dungeon layout using seeded random numbers:

```json
[
  "seq",
  ["procgen.seed", 54321],
  ["let", "numRooms", ["procgen.random", 5, 10]],
  ["let", "rooms", ["list.new"]],
  [
    "for",
    "idx",
    ["list.new", 0, 1, 2, 3, 4],
    [
      "seq",
      [
        "let",
        "room",
        [
          "obj.new",
          ["x", ["procgen.random", 0, 100]],
          ["y", ["procgen.random", 0, 100]],
          ["width", ["procgen.random", 5, 15]],
          ["height", ["procgen.random", 5, 15]],
          [
            "type",
            ["list.get", ["list.new", "treasure", "monster", "empty"], ["procgen.random", 0, 2]]
          ]
        ]
      ],
      ["list.push", ["var", "rooms"], ["var", "room"]]
    ]
  ],
  ["log", "Generated dungeon:", ["var", "rooms"]]
]
```

### Biome Selection with Noise

Use noise to determine biome types across a map:

```json
[
  "seq",
  ["procgen.seed", 98765],
  ["let", "scale", 0.1],
  [
    "for",
    "y",
    ["list.new", 0, 10, 20, 30, 40],
    [
      "for",
      "x",
      ["list.new", 0, 10, 20, 30, 40],
      [
        "seq",
        [
          "let",
          "noiseValue",
          [
            "procgen.noise",
            ["*", ["var", "x"], ["var", "scale"]],
            ["*", ["var", "y"], ["var", "scale"]]
          ]
        ],
        [
          "let",
          "biome",
          [
            "if",
            ["<", ["var", "noiseValue"], -0.3],
            "ocean",
            [
              "if",
              ["<", ["var", "noiseValue"], 0.1],
              "plains",
              ["if", ["<", ["var", "noiseValue"], 0.5], "forest", "mountains"]
            ]
          ]
        ],
        ["log", "Biome at", ["var", "x"], ["var", "y"], ":", ["var", "biome"]]
      ]
    ]
  ]
]
```

### Loot Table with Weighted Random

Generate random loot with weights:

```json
[
  "seq",
  ["procgen.seed", ["time.to_timestamp", ["time.now"]]],
  ["let", "roll", ["procgen.random", 1, 100]],
  [
    "let",
    "loot",
    [
      "if",
      ["<", ["var", "roll"], 50],
      "common_item",
      [
        "if",
        ["<", ["var", "roll"], 80],
        "uncommon_item",
        ["if", ["<", ["var", "roll"], 95], "rare_item", "legendary_item"]
      ]
    ]
  ],
  ["log", "Dropped loot:", ["var", "loot"]]
]
```

## Best Practices

### Deterministic Generation

Always seed the generator with a known value for reproducible results:

```json
[
  "seq",
  ["let", "worldSeed", ["obj.get", ["this"], "worldSeed"]],
  ["procgen.seed", ["var", "worldSeed"]],
  ["comment", "Now all generation is deterministic based on worldSeed"]
]
```

### Combining Noise Layers

Layer multiple noise functions at different scales for complex terrain:

```json
[
  "seq",
  ["procgen.seed", 11111],
  ["let", "x", 10],
  ["let", "y", 20],
  ["let", "base", ["procgen.noise", ["*", ["var", "x"], 0.1], ["*", ["var", "y"], 0.1]]],
  ["let", "detail", ["procgen.noise", ["*", ["var", "x"], 0.5], ["*", ["var", "y"], 0.5]]],
  ["let", "combined", ["+", ["*", ["var", "base"], 0.7], ["*", ["var", "detail"], 0.3]]],
  ["log", "Layered height:", ["var", "combined"]]
]
```

### Chunked Generation

For large worlds, generate content in chunks as needed:

```json
[
  "seq",
  ["let", "chunkX", 5],
  ["let", "chunkY", 3],
  ["let", "chunkSeed", ["+", ["*", ["var", "chunkX"], 1000], ["var", "chunkY"]]],
  ["procgen.seed", ["var", "chunkSeed"]],
  ["comment", "Generate content for this specific chunk"],
  ["let", "chunkData", ["procgen.random", 0, 100]]
]
```

> [!TIP]
> Use consistent seeds for the same content. For example, use `chunkX * largeNumber + chunkY` to ensure each chunk has a unique but reproducible seed.

## Example: Complete World Generation

```json
[
  "seq",
  ["comment", "Initialize world with seed"],
  ["procgen.seed", 424242],

  ["comment", "Generate terrain height map"],
  ["let", "heightMap", ["list.new"]],
  [
    "for",
    "y",
    ["list.new", 0, 1, 2, 3, 4],
    [
      "seq",
      ["let", "row", ["list.new"]],
      [
        "for",
        "x",
        ["list.new", 0, 1, 2, 3, 4],
        ["list.push", ["var", "row"], ["procgen.noise", ["var", "x"], ["var", "y"]]]
      ],
      ["list.push", ["var", "heightMap"], ["var", "row"]]
    ]
  ],

  ["comment", "Place random encounters"],
  ["let", "encounters", ["procgen.random", 3, 7]],
  ["log", "World will have", ["var", "encounters"], "random encounters"],

  ["comment", "Generate starting resources"],
  ["let", "startingGold", ["procgen.random", 50, 150]],
  ["log", "Player starts with", ["var", "startingGold"], "gold"]
]
```
