# Network Plugin

The `@lotus/plugin-net` package provides network capabilities to Reed, enabling HTTP requests with capability-based security.

## Capabilities

### `net.http`

Allows making HTTP requests to specific domains.

**Parameters:**

- `domain`: The domain suffix allowed (e.g., `"example.com"` allows `api.example.com`, `www.example.com`, etc.).
- `methods`: (Optional) List of allowed HTTP methods (e.g., `["GET", "POST"]`). If not specified, all methods are allowed.

## Opcodes

### `net.http.fetch(cap, url, options)`

Performs an HTTP request.

- `cap`: A capability of type `net.http`.
- `url`: The URL to fetch.
- `options`: Optional object with `method`, `headers`, and `body`.

**Returns:** Response object with status, headers, and body access methods.

### `net.http.response_text(response)`

Returns the response body as text.

- `response`: Response object from `net.http.fetch`.

**Returns:** String containing the response body.

### `net.http.response_json(response)`

Returns the response body parsed as JSON.

- `response`: Response object from `net.http.fetch`.

**Returns:** Parsed JSON object.

### `net.http.response_bytes(response)`

Returns the response body as an array of bytes.

- `response`: Response object from `net.http.fetch`.

**Returns:** Array of byte values.

## Security Model

The network plugin enforces domain-based restrictions:

- **Domain Whitelisting**: Each capability specifies which domain(s) can be accessed. The URL must end with the specified domain suffix.
- **Method Restriction**: Optionally restrict which HTTP methods (GET, POST, PUT, DELETE, etc.) are allowed.
- **No Wildcard Domains**: Capabilities must specify explicit domain suffixes; wildcards are not supported for security reasons.

> [!IMPORTANT]
> Domain matching is suffix-based. A capability with `domain: "example.com"` will match:
>
> - `api.example.com`
> - `www.example.com`
> - `example.com`
>
> But NOT `malicious-example.com` (no dot separator).

## Common Use Cases

### Simple GET Request

Fetching data from an API:

```json
[
  "seq",
  ["let", "cap", ["get_capability", "net.http", ["obj.new", ["domain", "api.github.com"]]]],
  [
    "if",
    ["var", "cap"],
    [
      "seq",
      [
        "let",
        "response",
        ["net.http.fetch", ["var", "cap"], "https://api.github.com/users/octocat", ["obj.new"]]
      ],
      ["let", "data", ["net.http.response_json", ["var", "response"]]],
      ["log", "User data:", ["var", "data"]]
    ],
    ["warn", "Missing net.http capability for api.github.com"]
  ]
]
```

### POST Request with JSON Body

Sending data to an API:

```json
[
  "seq",
  [
    "let",
    "cap",
    [
      "get_capability",
      "net.http",
      ["obj.new", ["domain", "api.example.com"], ["methods", ["list.new", "POST"]]]
    ]
  ],
  ["let", "payload", ["obj.new", ["title", "New Item"], ["description", "Created via Reed"]]],
  [
    "let",
    "options",
    [
      "obj.new",
      ["method", "POST"],
      ["headers", ["obj.new", ["Content-Type", "application/json"]]],
      ["body", ["json.stringify", ["var", "payload"]]]
    ]
  ],
  [
    "let",
    "response",
    ["net.http.fetch", ["var", "cap"], "https://api.example.com/items", ["var", "options"]]
  ],
  ["let", "result", ["net.http.response_json", ["var", "response"]]],
  ["log", "Created:", ["var", "result"]]
]
```

### Webhook Integration

Sending notifications to a webhook:

```json
[
  "seq",
  ["let", "cap", ["get_capability", "net.http", ["obj.new", ["domain", "hooks.slack.com"]]]],
  ["let", "message", ["obj.new", ["text", "Quest completed!"], ["username", "GameBot"]]],
  [
    "let",
    "options",
    [
      "obj.new",
      ["method", "POST"],
      ["headers", ["obj.new", ["Content-Type", "application/json"]]],
      ["body", ["json.stringify", ["var", "message"]]]
    ]
  ],
  [
    "net.http.fetch",
    ["var", "cap"],
    "https://hooks.slack.com/services/YOUR/WEBHOOK/URL",
    ["var", "options"]
  ],
  ["log", "Notification sent"]
]
```

### External Data Fetching

Loading remote content:

```json
[
  "seq",
  [
    "let",
    "cap",
    ["get_capability", "net.http", ["obj.new", ["domain", "raw.githubusercontent.com"]]]
  ],
  [
    "let",
    "response",
    [
      "net.http.fetch",
      ["var", "cap"],
      "https://raw.githubusercontent.com/owner/repo/main/data.json",
      ["obj.new", ["method", "GET"]]
    ]
  ],
  ["let", "content", ["net.http.response_text", ["var", "response"]]],
  ["let", "data", ["json.parse", ["var", "content"]]],
  ["log", "Downloaded data:", ["var", "data"]]
]
```

## Error Handling

Network requests can fail for many reasons. Always handle errors appropriately:

```json
[
  "try",
  [
    "seq",
    ["let", "cap", ["get_capability", "net.http", ["obj.new", ["domain", "api.example.com"]]]],
    [
      "if",
      ["var", "cap"],
      [
        "seq",
        [
          "let",
          "response",
          ["net.http.fetch", ["var", "cap"], "https://api.example.com/data", ["obj.new"]]
        ],
        ["let", "data", ["net.http.response_json", ["var", "response"]]],
        ["log", "Success:", ["var", "data"]]
      ],
      ["warn", "Missing net.http capability"]
    ]
  ],
  "error",
  ["log", "Request failed:", ["var", "error"]]
]
```

Common error scenarios:

- **Network timeout**: Server doesn't respond in time
- **DNS failure**: Domain cannot be resolved
- **Connection refused**: Server isn't accepting connections
- **HTTP error codes**: Server returns 4xx or 5xx status
- **Invalid JSON**: Response body isn't valid JSON
- **Missing capability**: Entity lacks permission for the domain
- **Domain mismatch**: URL doesn't match capability's allowed domain
