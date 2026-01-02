# File Browser Server

The File Browser Server (`apps/filebrowser-server`) provides a sandboxed file browser using capability-gated filesystem access.

## Overview

The server uses the Viwo entity system with filesystem capabilities:

1. **FileBrowserBase**: Base prototype with path resolution and core verbs
2. **FileBrowserUser**: User prototype with bookmarks and tags
3. **Browser**: User instance with `fs.read` and `fs.write` capabilities

## Running

```bash
bun dev:filebrowser-server  # runs on port 8080
```

## Verbs

| Verb | Description |
|------|-------------|
| `look` | List current directory |
| `go` | Navigate to path |
| `back` | Go up one directory |
| `where` | Show current location |
| `open` | Open file or directory |
| `write` | Write content to file |
| `create_dir` | Create directory |
| `create_file` | Create empty file |
| `remove` | Delete file/directory |
| `bookmark` | Save location |
| `bookmarks_list` | List bookmarks |
| `jump` | Jump to bookmark |
| `tag` | Add tag to file |
| `untag` | Remove tag |
| `tags` | List tags |
| `annotate` | Add annotation |

## Security

All paths are resolved relative to `cwd` and clamped to `fs_root`, preventing directory traversal attacks. Access is controlled via `fs.read` and `fs.write` capabilities.
