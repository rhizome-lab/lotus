# Admin CLI

The Admin CLI (`apps/admin-cli`) provides administrative utilities for managing the Lotus game server, primarily focusing on database management.

## Usage

To use the Admin CLI, run the following command from the `apps/admin-cli` directory:

```bash
bun run start <command> [args]
```

## Commands

### `backup`

Creates a timestamped backup of the world database (`world.sqlite`).

**Usage:**

```bash
bun run start backup
```

**Behavior:**

- Checks if `packages/core/world.sqlite` exists.
- Creates a `backups` directory in the project root if it doesn't exist.
- Copies the database to `backups/world-<timestamp>.sqlite`.

### `restore`

Restores the world database from a backup file.

**Usage:**

```bash
bun run start restore <backup_filename_or_path>
```

**Arguments:**

- `<backup_filename_or_path>`: The name of the backup file (if in the `backups` directory) or the full path to a backup file.

**Behavior:**

- Overwrites `packages/core/world.sqlite` with the selected backup file.
- **Warning**: This operation is destructive and will replace the current game state.
