# File System Plugin

The `@lotus/plugin-fs` package provides file system capabilities to Reed, enabling safe, sandboxed file operations.

## Capabilities

### `fs.read`

Allows reading files within a specific directory.

**Parameters:**

- `path`: The directory path that can be read.

### `fs.write`

Allows writing files within a specific directory.

**Parameters:**

- `path`: The directory path that can be written to.

## Opcodes

### `fs.read(cap, path)`

Reads the content of a file as a string.

- `cap`: A capability of type `fs.read`.
- `path`: The path to the file.

**Returns:** String content of the file.

### `fs.write(cap, path, content)`

Writes content to a file.

- `cap`: A capability of type `fs.write`.
- `path`: The path to the file.
- `content`: The string content to write.

**Returns:** `null`

### `fs.list(cap, path)`

Lists the contents of a directory.

- `cap`: A capability of type `fs.read`.
- `path`: The path to the directory.

**Returns:** Array of file/directory names.

## Security Considerations

The file system plugin uses capability-based security to restrict file access:

- **Path Sandboxing**: Capabilities are scoped to specific directory paths. An entity can only access files within directories they have capabilities for.
- **Path Traversal Prevention**: The plugin validates paths to prevent `..` attacks that could escape the sandboxed directory.
- **Separate Read/Write**: Read and write operations require separate capabilities, enabling fine-grained permission control.

> [!WARNING]
> Always validate file paths in your scripts to prevent unintended file access, even within sandboxed directories.

## Common Use Cases

### Configuration Files

Reading application configuration:

```json
[
  "seq",
  ["let", "readCap", ["get_capability", "fs.read", ["obj.new", ["path", "/app/config"]]]],
  ["let", "configText", ["fs.read", ["var", "readCap"], "/app/config/settings.json"]],
  ["let", "config", ["json.parse", ["var", "configText"]]],
  ["log", "Loaded config:", ["var", "config"]]
]
```

### Data Persistence

Saving entity state to disk:

```json
[
  "seq",
  ["let", "writeCap", ["get_capability", "fs.write", ["obj.new", ["path", "/data/entities"]]]],
  [
    "let",
    "state",
    ["obj.new", ["health", 100], ["level", 5], ["inventory", ["list.new", "sword", "potion"]]]
  ],
  ["let", "stateJson", ["json.stringify", ["var", "state"]]],
  ["fs.write", ["var", "writeCap"], "/data/entities/player_state.json", ["var", "stateJson"]],
  ["log", "State saved successfully"]
]
```

### Mod Loading

Listing and loading mod files:

```json
[
  "seq",
  ["let", "readCap", ["get_capability", "fs.read", ["obj.new", ["path", "/mods"]]]],
  ["let", "modFiles", ["fs.list", ["var", "readCap"], "/mods"]],
  ["log", "Found mods:", ["var", "modFiles"]],
  [
    "for",
    "modFile",
    ["var", "modFiles"],
    [
      "seq",
      ["let", "modPath", ["str.concat", "/mods/", ["var", "modFile"]]],
      ["let", "modContent", ["fs.read", ["var", "readCap"], ["var", "modPath"]]],
      ["log", "Loaded mod:", ["var", "modFile"]]
    ]
  ]
]
```

## Error Handling

File operations can fail for various reasons. Always use `try` blocks for robust error handling:

```json
[
  "try",
  [
    "seq",
    ["let", "cap", ["get_capability", "fs.read", ["obj.new", ["path", "/data"]]]],
    [
      "if",
      ["var", "cap"],
      [
        "seq",
        ["let", "content", ["fs.read", ["var", "cap"], "/data/file.txt"]],
        ["log", "File content:", ["var", "content"]]
      ],
      ["warn", "Missing fs.read capability"]
    ]
  ],
  "error",
  ["log", "Failed to read file:", ["var", "error"]]
]
```

Common error scenarios:

- **File not found**: Attempting to read a non-existent file
- **Permission denied**: File exists but isn't readable/writable
- **Missing capability**: Entity lacks required capability
- **Invalid path**: Path escapes sandbox or is malformed
