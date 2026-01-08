import { Box, Text } from "ink";
import type { Entity } from "@lotus/shared/jsonrpc";

interface InspectorProps {
  inspectedItem: Entity | null | undefined;
  entities: Map<number, Entity>;
  maxDepth?: number;
}

// Recursive item view for nested contents
function ItemView({
  itemId,
  entities,
  depth = 0,
  maxDepth = 2,
}: {
  itemId: number;
  entities: Map<number, Entity>;
  depth?: number;
  maxDepth?: number;
}) {
  const item = entities.get(itemId);
  if (!item) return null;

  const name = item["name"] as string;
  const contents = (item["contents"] as number[]) || [];
  const indent = "  ".repeat(depth);

  return (
    <Box flexDirection="column">
      <Text>
        {indent}- {name}
      </Text>
      {depth < maxDepth &&
        contents.map((subId) => (
          <ItemView
            key={subId}
            itemId={subId}
            entities={entities}
            depth={depth + 1}
            maxDepth={maxDepth}
          />
        ))}
    </Box>
  );
}

export default function Inspector({ inspectedItem, entities, maxDepth = 2 }: InspectorProps) {
  if (!inspectedItem) {
    return (
      <Box flexDirection="column">
        <Text bold underline>
          Inspector
        </Text>
        <Text color="gray">Select an item to inspect</Text>
      </Box>
    );
  }

  const name = inspectedItem["name"] as string;
  const description = inspectedItem["description"] as string;
  const contents = (inspectedItem["contents"] as number[]) || [];

  return (
    <Box flexDirection="column">
      <Text bold underline>
        Inspector
      </Text>
      <Text bold color="cyan">
        {name}
      </Text>
      {description && <Text italic>{description}</Text>}

      {contents.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Text underline>Contains:</Text>
          {contents.map((itemId) => (
            <ItemView key={itemId} itemId={itemId} entities={entities} maxDepth={maxDepth} />
          ))}
        </Box>
      )}
    </Box>
  );
}
