# Capability-Based Security Guide

Lotus uses a **capability-based security** model to control access to sensitive operations like file I/O, network requests, and system resources. This guide explains how capabilities work and how to use them effectively.

## What are Capabilities?

A capability is a secure token that grants specific permissions to an entity. Think of it as a key that unlocks certain operations:

- **Unforgeable**: Capabilities cannot be created arbitrarily; they must be minted by authorized entities
- **Transferable**: Capabilities can be given to other entities
- **Delegable**: Existing capabilities can create restricted versions
- **Fine-grained**: Each capability specifies exactly what operations are allowed

## Core Concepts

### Capability Structure

Every capability has:

- **Type**: The kind of permission (e.g., `fs.read`, `net.http`, `sys.mint`)
- **Parameters**: Restrictions on what the capability allows (e.g., specific directory paths, domain names)
- **Owner**: The entity ID that owns this capability
- **ID**: A unique identifier for this specific capability instance

### Why Capabilities?

Traditional permission models check "Can this user do X?" every time an action is performed. Capabilities flip this: possession of the capability itself proves authorization. This has several advantages:

- **Delegation**: An entity can grant temporary permissions without admin intervention
- **Audit Trail**: You can track who has which capabilities
- **Least Privilege**: Grant exactly the permissions needed, nothing more
- **Review**: Capabilities can be listed, reviewed, and revoked

## Acquiring Capabilities

### Getting Existing Capabilities

Use `get_capability` to retrieve a capability your entity owns:

\`\`\`json
["let", "readCap", ["get_capability", "fs.read", ["obj.new", ["path", "/data"]]]]
\`\`\`

This searches for an `fs.read` capability with matching parameters. If found, returns the capability object; otherwise returns `null`.

**Pattern**: Always check if the capability exists before using it:

\`\`\`json
["seq",
["let", "cap", ["get_capability", "fs.read", ["obj.new", ["path", "/config"]]]],
["if", ["var", "cap"],
["fs.read", ["var", "cap"], "/config/settings.json"],
["warn", "Missing fs.read capability for /config"]
]
]
\`\`\`

### Checking Capabilities on Other Entities

Use `has_capability` to check if another entity owns a specific capability:

\`\`\`json
["if", ["has_capability", ["entity", 123], "fs.write", ["obj.new", ["path", "/logs"]]],
["log", "Entity 123 can write to /logs"],
["log", "Entity 123 lacks write permission"]
]
\`\`\`

## Minting New Capabilities

Only entities with a `sys.mint` capability can create (mint) new capabilities.

### The sys.mint Capability

The `sys.mint` capability includes a `namespace` parameter that restricts what capability types can be minted:

- `namespace: "*"` - Can mint any capability type (admin)
- `namespace: "fs"` - Can mint `fs.read`, `fs.write`, etc.
- `namespace: "user.123"` - Can mint capabilities starting with `user.123`

### Minting Example

\`\`\`json
["seq",
["let", "mintAuth", ["get_capability", "sys.mint", ["obj.new", ["namespace", "fs"]]]],
["if", ["var", "mintAuth"],
["seq",
["let", "newCap", ["mint",
["var", "mintAuth"],
"fs.write",
["obj.new", ["path", "/user/uploads"]]
]],
["log", "Created new capability:", ["var", "newCap"]]
],
["warn", "Missing sys.mint authority"]
]
]
\`\`\`

## Delegation

Delegation creates a restricted version of an existing capability. This is useful for temporary or limited permissions.

### Delegation Example

\`\`\`json
["seq",
["let", "parentCap", ["get_capability", "net.http", ["obj.new", ["domain", "example.com"]]]],
["let", "restrictedCap", ["delegate",
["var", "parentCap"],
["obj.new", ["methods", ["list.new", "GET"]]]
]],
["log", "Created GET-only capability for example.com"]
]
\`\`\`

The delegated capability inherits the parent's type and params, but adds additional restrictions.

## Transferring Capabilities

Use `give_capability` to transfer ownership to another entity:

\`\`\`json
["seq",
["let", "cap", ["get_capability", "fs.read", ["obj.new", ["path", "/shared"]]]],
["let", "targetEntity", ["entity", 456]],
["give_capability", ["var", "cap"], ["var", "targetEntity"]],
["log", "Transferred capability to entity 456"]
]
\`\`\`

Once transferred, the original owner no longer has access to the capability.

## Wildcard Capabilities

> [!CAUTION]
> Wildcard capabilities are powerful but potentially dangerous. Use them sparingly.

A capability with `"*": true` in its parameters acts as a wildcard, matching any filter:

\`\`\`json
["seq",
["comment", "This capability grants fs.read for ANY path"],
["let", "adminCap", ["get_capability", "fs.read", ["obj.new", ["*", true]]]],
["if", ["var", "adminCap"],
["log", "Has admin fs.read capability"],
["log", "No wildcard capability"]
]
]
\`\`\`

When `get_capability` checks filters:

1. If capability has `"*": true`, it matches regardless of filter params
2. Otherwise, all filter params must match exactly

**Use case**: System or admin entities that need unrestricted access. Regular entities should have scoped capabilities.

> [!NOTE]
> Wildcard capability support is the current solution for admin permissions. This may be refined in future versions to provide more granular control while maintaining security.

## Practical Examples

### Multi-Step Workflow with Capabilities

\`\`\`json
["seq",
["comment", "1. Get network capability"],
["let", "httpCap", ["get_capability", "net.http", ["obj.new", ["domain", "api.data.gov"]]]],

["comment", "2. Fetch data from API"],
["let", "response", ["net.http.fetch", ["var", "httpCap"], "https://api.data.gov/dataset", ["obj.new"]]],
["let", "data", ["net.http.response_json", ["var", "response"]]],

["comment", "3. Get write capability"],
["let", "writeCap", ["get_capability", "fs.write", ["obj.new", ["path", "/cache"]]]],

["comment", "4. Save to disk"],
["fs.write", ["var", "writeCap"], "/cache/dataset.json", ["json.stringify", ["var", "data"]]],

["log", "Downloaded and cached dataset"]
]
\`\`\`

### Creating a Sandboxed Environment

\`\`\`json
["seq",
["comment", "Create a new entity with limited permissions"],
["let", "sandboxEntity", ["create", ["obj.new", ["name", "Sandbox"]]]],

["comment", "Mint read-only capability for sandbox"],
["let", "mintAuth", ["get_capability", "sys.mint", ["obj.new", ["namespace", "fs"]]]],
["let", "readCap", ["mint", ["var", "mintAuth"], "fs.read", ["obj.new", ["path", "/public"]]]],

["comment", "Give capability to sandbox entity"],
["give_capability", ["var", "readCap"], ["var", "sandboxEntity"]],

["log", "Created sandbox entity with read-only access to /public"]
]
\`\`\`

### Permission Escalation (Admin Creates User Capability)

\`\`\`json
["seq",
["comment", "Admin entity creates capability for user"],
["let", "adminMint", ["get_capability", "sys.mint", ["obj.new", ["namespace", "*"]]]],

["comment", "Mint capability for user upload directory"],
["let", "userUploadCap", ["mint",
["var", "adminMint"],
"fs.write",
["obj.new", ["path", "/uploads/user_123"]]
]],

["comment", "Transfer to user entity"],
["let", "userEntity", ["entity", 123]],
["give_capability", ["var", "userUploadCap"], ["var", "userEntity"]],

["log", "User 123 can now write to their upload directory"]
]
\`\`\`

## Best Practices

### 1. Principle of Least Privilege

Grant the minimum permissions needed:

\`\`\`json
["comment", "GOOD: Specific path"],
["mint", ["var", "mintAuth"], "fs.read", ["obj.new", ["path", "/app/config"]]]

["comment", "BAD: Wildcard (unless truly needed)"],
["mint", ["var", "mintAuth"], "fs.read", ["obj.new", ["*", true]]]
\`\`\`

### 2. Always Validate Capability Existence

\`\`\`json
["let", "cap", ["get_capability", "fs.write", ["obj.new", ["path", "/data"]]]],
["if", ["var", "cap"],
["comment", "Safe to use capability"],
["comment", "Handle missing capability"]
]
\`\`\`

### 3. Use Delegation for Temporary Access

Instead of minting new capabilities, delegate from existing ones when possible:

\`\`\`json
["let", "fullCap", ["get_capability", "net.http", ["obj.new", ["domain", "api.example.com"]]]],
["let", "readOnlyCap", ["delegate", ["var", "fullCap"], ["obj.new", ["methods", ["list.new", "GET"]]]]]
\`\`\`

### 4. Document Capability Requirements

In your entity verbs, document which capabilities are needed:

\`\`\`json
["comment", "Requires: fs.read capability for /logs"],
["comment", "Requires: fs.write capability for /reports"],
["seq",
["let", "readCap", ["get_capability", "fs.read", ["obj.new", ["path", "/logs"]]]],
["let", "writeCap", ["get_capability", "fs.write", ["obj.new", ["path", "/reports"]]]],
["comment", "... rest of verb logic"]
]
\`\`\`

### 5. Audit Capability Chains

Keep track of who has what capabilities and how they were obtained:

\`\`\`json
["log", "Granting capability to entity", ["obj.get", ["var", "target"], "id"], "for reason:", ["var", "reason"]]
\`\`\`

## Common Capability Types

### File System

- `fs.read` - Read files in a specific path
- `fs.write` - Write files to a specific path

### Network

- `net.http` - Make HTTP requests to specific domains

### System

- `sys.mint` - Create new capabilities within a namespace
- `entity.control` - Edit entity properties (used internally)

### Plugin Capabilities

Plugins can define custom capability types. Check plugin documentation for available capabilities.

## Troubleshooting

### "Missing capability" errors

**Problem**: Operation fails with missing capability error.

**Solution**:

1. Check if entity owns the required capability: `get_capability`
2. Verify capability parameters match what's needed
3. Ensure capability hasn't been transferred away
4. For new operations, mint appropriate capability with `sys.mint`

### "Invalid authority" when minting

**Problem**: `mint` fails with "invalid authority" error.

**Solution**:

1. Verify you have a `sys.mint` capability
2. Check that the capability type matches the mint authority's namespace
3. Ensure `sys.mint` capability is owned by the current entity (`this`)

### Capability not matching filters

**Problem**: `get_capability` returns `null` despite having similar capability.

**Solution**:

1. Parameters must match exactly (except for wildcard capabilities)
2. Check for typos in parameter names or values
3. Use `obj.new` to build filter objects: `["obj.new", ["path", "/data"]]`

## See Also

- [Security](security.md) - Overview of Lotus's security model
- [Scripting Specification](../scripting/spec.md) - Core opcodes including capability operations
- Plugin documentation for plugin-specific capabilities
