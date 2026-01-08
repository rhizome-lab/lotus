# Vector Plugin

The Vector Plugin (`@lotus/plugin-vector`) provides a wrapper around `sqlite-vec` to enable vector similarity search within SQLite databases.

## Features

- **`sqlite-vec` Integration**: Uses the `sqlite-vec` extension for high-performance vector operations.
- **Simple API**: Provides a clean TypeScript API for creating vector tables, inserting embeddings, and performing similarity searches.

## API Reference

### `VectorDatabase`

#### `constructor(db: Database)`

Initializes the vector database wrapper around an existing `bun:sqlite` Database instance.

#### `createTable(name: string, dimensions: number)`

Creates a virtual table for storing vectors of a specific dimension.

```typescript
vectorDb.createTable("embeddings", 1536);
```

#### `insert(tableName: string, rowId: number, embedding: number[])`

Inserts a vector linked to a specific row ID.

#### `search(tableName: string, embedding: number[], limit?: number)`

Performs a K-Nearest Neighbors (KNN) search to find the most similar vectors.

```typescript
const results = vectorDb.search("embeddings", queryVector, 5);
// returns [{ rowid: 1, distance: 0.123 }, ...]
```
