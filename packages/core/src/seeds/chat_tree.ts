import { addVerb, createEntity } from "../repo";
import { loadEntityDefinition } from "./loader";
import { resolve } from "node:path";

export function seedChatTree(voidId: number, playerId: number) {
  // Load ChatTree Definition
  const chatTreeDef = loadEntityDefinition(
    resolve(__dirname, "./definitions/ChatTree.ts"),
    "ChatTree",
  );

  // Create ChatTree Prototype
  const chatTreeProtoId = createEntity({
    description: "A branching conversation tree for roleplay.",
    name: "Chat Tree Prototype",
  });

  // Add verbs to prototype
  for (const [name, code] of chatTreeDef.verbs) {
    addVerb(chatTreeProtoId, name, code);
  }

  // Create an example chat tree instance
  const exampleTreeId = createEntity(
    {
      active_branch: "main",
      branches: { main: null },
      description: "An example branching conversation.",
      location: playerId,
      messages: {},
      name: "Example Chat Tree",
      next_message_id: 1,
    },
    chatTreeProtoId,
  );

  return { chatTreeProtoId, exampleTreeId };
}
