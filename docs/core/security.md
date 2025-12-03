# Capability-Based Security

Viwo uses a **Capability-Based Security** model to manage permissions and access control. Unlike Access Control Lists (ACLs) which check _who_ you are, capabilities check _what you possess_.

## Concept

A **Capability** is an unforgeable token that grants authority to perform a specific action. In Viwo, capabilities are first-class objects in the scripting language, represented as opaque handles.

- **Unforgeable**: Scripts cannot create capabilities from thin air. They must be granted by the kernel or another entity.
- **Delegatable**: A script holding a capability can pass it to another entity or create a restricted version (delegation).
- **Granular**: Capabilities can carry parameters (e.g., "read access to /tmp/\*") to fine-tune permissions.

## Structure

A capability consists of:

- **ID**: A unique UUID.
- **Owner**: The entity ID that currently possesses the capability.
- **Type**: A string identifier (e.g., `sys.mint`, `fs.read`).
- **Params**: A JSON object containing specific constraints (e.g., `{ "path": "/home/user" }`).

## Kernel Opcodes

The kernel provides low-level opcodes to manage capabilities:

- **`mint(authority, type, params)`**: Creates a new capability. Requires a `sys.mint` capability as authority.
- **`delegate(parent, restrictions)`**: Creates a new capability derived from a parent capability, potentially with tighter restrictions.
- **`give_capability(cap, target)`**: Transfers ownership of a capability to another entity.
- **`get_capability(type, filter)`**: Retrieves a capability owned by the current entity.

## Root Capabilities

The system is bootstrapped with several root capabilities:

- **`sys.mint`**: The ultimate authority. Allows minting new capabilities.
  - **Params**: `{ "namespace": "string" }`
  - **Usage**: `namespace` can be a specific prefix (e.g., `"user.123"`) or `"*"` for full authority.
- **`sys.create`**: Allows creating new entities.
  - **Params**: None (currently).
- **`sys.sudo`**: Allows impersonating other entities (executing code as them).
  - **Params**: None (currently).
- **`entity.control`**: Grants control over a specific entity (update props, delete, set prototype).
  - **Params**: `{ "target_id": number }` or `{ "*": true }`
  - **Usage**: `target_id` restricts control to a single entity. `"*": true` grants control over ALL entities (superuser).

## Subsystems

### File System (`fs`)

File system access is guarded by `fs.read` and `fs.write` capabilities.

- **Type**: `fs.read` / `fs.write`
- **Params**: `{ "path": "/allowed/path" }`
- **Check**: The system checks if the requested path is within the allowed path.

### Network (`net`)

Network access is guarded by `net.http.read` and `net.http.write`.

- **Type**: `net.http.read` (GET) / `net.http.write` (POST)
- **Params**: `{ "domain": "example.com" }`
- **Check**: The system checks if the requested URL's hostname matches or ends with the allowed domain.

## Example Usage

```typescript
// Mint a capability to read /tmp
const root = get_capability("sys.mint");
const readCap = mint(root, "fs.read", { path: "/tmp" });

// Use it to read a file
const content = fs.read(readCap, "/tmp/hello.txt");

// Give it to another entity
give_capability(readCap, someOtherEntity);
```
