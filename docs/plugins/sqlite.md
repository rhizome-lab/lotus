# SQLite Plugin

Provides capability-based access to SQLite databases for lotus entities.

## Overview

The SQLite plugin enables controlled database access through three distinct capabilities:

1. **`sqlite.open`** - Opens database connections (file or in-memory)
2. **`sqlite.query`** - Executes SELECT queries
3. **`sqlite.exec`** - Executes INSERT/UPDATE/DELETE statements

Access is controlled through capability ownership and parameters, enabling secure database operations with path restrictions and permission controls.

## Architecture

The plugin uses Bun's native SQLite bindings (`bun:sqlite`) for high performance:

- **No external dependencies**: Built-in SQLite support
- **Type-safe**: Full TypeScript integration
- **Fast**: Native C bindings via Bun runtime
- **Secure**: Capability-based access control

## Setup

The plugin is automatically loaded by the lotus server. No additional configuration is required.

## Capabilities

### `sqlite.open`

Opens a SQLite database connection with path and permission restrictions.

**Capability Parameters:**

- `path` (required): Allowed base path for database files
- `readonly` (optional): If true, opens database in read-only mode
- `allowMemory` (optional): If true, allows `:memory:` databases

**Creating a Capability:**

```typescript
// File-based database
const openCap = sys.mint.mint("sqlite.open", {
  path: "/path/to/databases",
  readonly: false,
});

// Read-only database
const readOnlyCap = sys.mint.mint("sqlite.open", {
  path: "/path/to/databases",
  readonly: true,
});

// Memory database only
const memoryCap = sys.mint.mint("sqlite.open", {
  path: "/dev/null", // Not used for :memory:
  allowMemory: true,
});
```

### `sqlite.query`

Executes SELECT queries and returns results as arrays.

**Capability Parameters:** None (uses database handle from `sqlite.open`)

**Creating a Capability:**

```typescript
const queryCap = sys.mint.mint("sqlite.query", {});
```

### `sqlite.exec`

Executes INSERT, UPDATE, DELETE, and DDL statements. Returns the number of rows changed.

**Capability Parameters:** None (uses database handle from `sqlite.open`)

**Creating a Capability:**

```typescript
const execCap = sys.mint.mint("sqlite.exec", {});
```

## Methods

### `open(path)`

Opens a database connection.

**Parameters:**

- `path` (string): Path to database file or `:memory:` for in-memory database

**Returns:** Database handle object

**Example:**

```typescript
// Open file database
const db = openCap.open("/path/to/databases/myapp.db");

// Open in-memory database (if allowed)
const memDb = memoryCap.open(":memory:");
```

**Path Validation:**

The capability enforces path restrictions:

```typescript
// Allowed: within permitted path
openCap.open("/path/to/databases/myapp.db"); // ✓

// Denied: outside permitted path
openCap.open("/etc/passwd"); // ✗ Error: path not allowed

// Denied: directory traversal
openCap.open("/path/to/databases/../../../etc/passwd"); // ✗ Error: path not allowed
```

### `close(db)`

Closes a database connection.

**Parameters:**

- `db` (object): Database handle from `open()`

**Returns:** `null`

**Example:**

```typescript
const db = openCap.open("/path/to/databases/myapp.db");
// ... use database ...
openCap.close(db);
```

### `query(db, sql, [params])`

Executes a SELECT query and returns all matching rows.

**Parameters:**

- `db` (object): Database handle
- `sql` (string): SQL SELECT statement
- `params` (array, optional): Parameterized query values

**Returns:** Array of row objects

**Example:**

```typescript
// Simple query
const users = queryCap.query(db, "SELECT * FROM users");
// [{id: 1, name: "Alice"}, {id: 2, name: "Bob"}]

// Parameterized query
const activeUsers = queryCap.query(db, "SELECT * FROM users WHERE status = ?", ["active"]);

// Multiple parameters
const filtered = queryCap.query(
  db,
  "SELECT * FROM posts WHERE author_id = ? AND published = ?",
  [42, 1],
);
```

### `exec(db, sql, [params])`

Executes an INSERT, UPDATE, DELETE, or DDL statement.

**Parameters:**

- `db` (object): Database handle
- `sql` (string): SQL statement
- `params` (array, optional): Parameterized statement values

**Returns:** Number of rows changed

**Example:**

```typescript
// Create table
execCap.exec(
  db,
  `
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE
  )
`,
);

// Insert row
const changes = execCap.exec(db, "INSERT INTO users (name, email) VALUES (?, ?)", [
  "Alice",
  "alice@example.com",
]);
console.log(`Inserted ${changes} row(s)`); // "Inserted 1 row(s)"

// Update rows
const updated = execCap.exec(db, "UPDATE users SET email = ? WHERE name = ?", [
  "newemail@example.com",
  "Alice",
]);

// Delete rows
const deleted = execCap.exec(db, "DELETE FROM users WHERE id = ?", [42]);
```

## Usage Patterns

### Basic CRUD Operations

```typescript
// Setup capabilities
const openCap = sys.mint.mint("sqlite.open", { path: "/data/db" });
const queryCap = sys.mint.mint("sqlite.query", {});
const execCap = sys.mint.mint("sqlite.exec", {});

// Open database
const db = openCap.open("/data/db/app.db");

// Create table
execCap.exec(
  db,
  `
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    completed INTEGER DEFAULT 0
  )
`,
);

// Insert
execCap.exec(db, "INSERT INTO tasks (title) VALUES (?)", ["Buy groceries"]);

// Read
const tasks = queryCap.query(db, "SELECT * FROM tasks WHERE completed = 0");

// Update
execCap.exec(db, "UPDATE tasks SET completed = 1 WHERE id = ?", [1]);

// Delete
execCap.exec(db, "DELETE FROM tasks WHERE completed = 1");

// Close
openCap.close(db);
```

### Read-Only Access

Use readonly capabilities to prevent modifications:

```typescript
const readOnlyCap = sys.mint.mint("sqlite.open", {
  path: "/data/db",
  readonly: true,
});

const db = readOnlyCap.open("/data/db/app.db");

// Query works
const data = queryCap.query(db, "SELECT * FROM tasks");

// Exec fails with read-only database error
execCap.exec(db, "DELETE FROM tasks"); // Error: attempt to write a readonly database
```

### In-Memory Database

Useful for temporary storage or testing:

```typescript
const memoryCap = sys.mint.mint("sqlite.open", {
  path: "/ignored",
  allowMemory: true,
});

const db = memoryCap.open(":memory:");

// Create temporary table
execCap.exec(db, "CREATE TABLE temp (id INTEGER, value TEXT)");
execCap.exec(db, "INSERT INTO temp VALUES (1, 'test')");

const results = queryCap.query(db, "SELECT * FROM temp");

// Data is lost when database is closed
openCap.close(db);
```

## Security

### Capability-Based Access

All operations require the appropriate capability:

```typescript
// Entity owns all three capabilities
entity.openCap = sys.mint.mint("sqlite.open", { path: "/data" });
entity.queryCap = sys.mint.mint("sqlite.query", {});
entity.execCap = sys.mint.mint("sqlite.exec", {});

// Another entity gets restricted access
otherEntity.queryCap = sys.mint.mint("sqlite.query", {});
// Can query but cannot open/exec
```

### Path Restrictions

The `sqlite.open` capability enforces path boundaries:

- Paths are resolved to absolute paths
- Access is denied if resolved path is outside allowed base path
- Symbolic links and `..` traversal are prevented

### SQL Injection Prevention

Always use parameterized queries:

```typescript
// UNSAFE: SQL injection vulnerability
const username = userInput; // "'; DROP TABLE users; --"
const rows = queryCap.query(db, `SELECT * FROM users WHERE name = '${username}'`);

// SAFE: Parameterized query
const rows = queryCap.query(db, "SELECT * FROM users WHERE name = ?", [userInput]);
```

## Error Handling

All methods throw `ScriptError` on failure:

```typescript
try {
  const db = openCap.open("/invalid/path/db.sqlite");
} catch (error) {
  console.error(error.message); // "sqlite.open: path not allowed"
}

try {
  queryCap.query(db, "SELECT * FROM nonexistent_table");
} catch (error) {
  console.error(error.message); // "sqlite.query failed: no such table: nonexistent_table"
}

try {
  execCap.exec(db, "INSERT INTO users (id) VALUES (1), (1)"); // Duplicate key
} catch (error) {
  console.error(error.message); // "sqlite.exec failed: UNIQUE constraint failed"
}
```

## Troubleshooting

### Database locked errors

SQLite supports multiple readers but only one writer at a time:

```typescript
// Solution 1: Close connections when done
openCap.close(db);

// Solution 2: Use WAL mode for better concurrency
execCap.exec(db, "PRAGMA journal_mode=WAL");
```

### Permission errors

Ensure the process has read/write access to the database file and directory:

```bash
chmod 755 /data/db
chmod 644 /data/db/app.db
```

### Path not allowed errors

Verify the capability's path parameter includes the target database:

```typescript
// Capability path: /data/db
openCap.open("/data/db/app.db"); // ✓ Allowed
openCap.open("/data/other/app.db"); // ✗ Not allowed
```

## Performance Tips

1. **Use transactions for bulk inserts:**

```typescript
execCap.exec(db, "BEGIN TRANSACTION");
for (const item of items) {
  execCap.exec(db, "INSERT INTO table VALUES (?)", [item]);
}
execCap.exec(db, "COMMIT");
```

2. **Create indexes for frequently queried columns:**

```typescript
execCap.exec(db, "CREATE INDEX idx_users_email ON users(email)");
```

3. **Use prepared statements for repeated queries** (automatically handled by Bun's SQLite)

4. **Enable WAL mode for better concurrency:**

```typescript
execCap.exec(db, "PRAGMA journal_mode=WAL");
```

## See Also

- [Bun SQLite Documentation](https://bun.sh/docs/api/sqlite)
- [SQLite Documentation](https://sqlite.org/docs.html)
- [Filesystem Plugin](./fs.md) - Similar capability-based file access
