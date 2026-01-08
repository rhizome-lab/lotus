# Shared Package

Common utilities and types. Contains code shared across both backend (core/server) and frontend (web/client) applications.

## Overview

The Shared package ensures consistency across the entire Lotus ecosystem by providing a single source of truth for critical types and utility functions. This prevents discrepancies between the client and server.

## Contents

- **`src/jsonrpc.ts`**: JSON-RPC 2.0 Definitions. Defines the TypeScript interfaces for JSON-RPC Requests, Notifications, and Responses, ensuring type-safe communication between client and server.
- **`src/types.ts`**: Shared Types. Contains interfaces for Game Entities, Game State, and other fundamental data structures used throughout the project.
