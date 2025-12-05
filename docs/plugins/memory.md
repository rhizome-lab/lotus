# Memory Plugin

The Memory Plugin (`@viwo/plugin-memory`) provides long-term memory capabilities for the game, allowing entities and the system to store and retrieve semantic information.

## Dependencies

- **`@viwo/plugin-ai`**: Required for generating embeddings.
- **`@viwo/plugin-vector`**: Used for vector storage and similarity search.

## Usage

The plugin registers a `memory` command for interacting with the memory system.

### `memory add`

Stores a new memory.

```bash
memory add "The castle gates are closed at night." { "type": "fact", "location": "castle" }
```

### `memory search`

Retrieves memories semantically related to a query.

```bash
memory search "When do the gates close?"
```

## Architecture

### `MemoryManager`

The core class responsible for managing memories.

1.  **Add**:

    - Generates an embedding for the content using `AiPlugin`.
    - Stores the raw content and metadata in a standard SQLite table (`memories_content`).
    - Stores the embedding in a vector table (`memories_vec`) via `VectorDatabase`.

2.  **Search**:
    - Generates an embedding for the query.
    - Performs a similarity search using `VectorDatabase`.
    - Retrieves the full content from SQLite.
    - Filters results based on metadata (if provided).
