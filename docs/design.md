# Viwo Design Document

## Overview

Viwo is a virtual world engine inspired by ChatMUD and LambdaMOO. It focuses on semantic world state, rich object interactions, and AI integration.

## Tech Stack

- **Runtime**: Bun
- **Database**: Bun:SQLite
- **Frontend**: SolidJS (Web)
- **AI**: Vercel AI SDK

## Core Architecture

The system is divided into:

1.  **Core Engine**: Handles world state, object persistence, scripting, and logic.
2.  **API Layer**: Exposes the world to various frontends (WebSocket/HTTP).
3.  **Frontends (Plugins)**:
    - Web Client (SolidJS) - Rich HTML display.
    - Discord Bot - Markdown/Text interface.
    - Terminal/Telnet - ANSI/Plain text.

## Object System

- **Everything is an Object**: Rooms, players, items.
- **Inheritance**: Objects can inherit properties and methods from parent objects.
- **Persistence**: Stored in SQLite.
- **Scripting**: Objects can have attached scripts (JavaScript/TypeScript executed in a sandbox).

## AI Integration

- **Text Generation**: For NPC dialogue, room descriptions, and dynamic responses.
- **Image Generation**: For character avatars and item icons.
- **Vercel AI SDK**: Used for abstracting LLM providers.

## Frontend Plugins

Frontends are treated as plugins that consume the Core API.

- **HTML**: Rich UI with stats, inventory, etc.
- **Markdown**: For text-based platforms like Discord.
- **ANSI**: For terminal lovers.
- **Plain Text**: Minimalist fallback.

## Directory Structure

- `packages/core`: The main server and engine.
- `packages/web`: The SolidJS web client.
- `packages/discord`: (Future) Discord bot client.
- `packages/cli`: (Future) Terminal client.
