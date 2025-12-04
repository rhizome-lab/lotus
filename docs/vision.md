# Viwo Vision

Viwo is designed as a **Headless MUD Engine**. It decouples the rich, persistent world state of a Multi-User Dungeon from the interface, allowing it to power a diverse range of interactive experiences.

Our vision is built on three converging pillars:

## 1. Deep Simulation (The "Sandbox" Pillar)

_Inspired by: Corruption of Champions, Lilith's Throne, Dwarf Fortress_

Viwo aims to support complex, stat-heavy simulations where the world state is as important as the narrative.

### How it fits

- **Entity System**: The flexible `props` JSON store allows for infinite extensibility of character stats, inventories, and status effects without schema migrations.
- **Scripting**: The secure, sandboxed scripting language allows for complex game logic (combat calculations, transformation events, economy simulations) to be executed safely on the server.
- **Persistence**: The SQLite backing ensures that every change—from a character's level to the location of a specific item—is permanent.

### Future Work

- **Combat System**: Standardized libraries for turn-based combat.
- **Quest Engine**: State machines for tracking complex, multi-stage narrative arcs.
- **World Gen**: Procedural generation tools for creating vast maps.

## 2. AI-Native Roleplay (The "SillyTavern" Pillar)

_Inspired by: SillyTavern, Character.AI, Façade_

Viwo is not just a game engine, but a context engine for LLMs. It provides the "grounding" that pure chatbots lack.

### How it fits

- **Context Injection**: The engine knows _where_ you are, _who_ is with you, and _what_ you are holding. This context is fed into the LLM to prevent hallucinations and ensure consistency.
- **NPC Agency**: AI agents aren't just chatbots; they are Entities that can use Verbs. An AI can decide to `pick up` an apple or `attack` a player based on its internal logic.
- **Persona Storage**: The Entity system naturally maps to "Character Cards" (Name, Description, Personality, Example Dialogue).

### Future Work

- **Memory Systems**: Vector database integration for long-term memory of past conversations.
- **Streaming**: Real-time token streaming for immersive "typing" effects.
- **Director AI**: A meta-AI that manages pacing, spawns enemies, or alters the environment to drive the story.

## 3. Ubiquitous Access (The "Chatbot" Pillar)

_Inspired by: Discord Bots, Slack Apps, Telegram Games_

The game should be playable from anywhere, not just a dedicated game client.

### How it fits

- **Headless Core**: The `packages/core` server has no UI dependencies. It speaks pure JSON-RPC.
- **Client Agnostic**: The `packages/client` SDK allows any platform that supports WebSockets to become a game client.
- **Event-Driven**: The architecture supports pushing events (like a combat notification) to passive clients (like a Discord channel) even when the user isn't logged in.

### Future Work

- **Rich Embeds**: Mapping game state to platform-specific UI elements (Discord Embeds, Slack Blocks).
- **Async Play**: Features designed for slow, correspondence-style gameplay suitable for chat platforms.
