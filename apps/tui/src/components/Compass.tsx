import { Box, Text } from "ink";
import type { Entity } from "@bloom/shared/jsonrpc";

interface CompassProps {
  room: Entity | null | undefined;
  entities: Map<number, Entity>;
}

// Direction grid layout
const DIRECTIONS = [
  ["northwest", "north", "northeast"],
  ["west", "", "east"],
  ["southwest", "south", "southeast"],
] as const;

const DIR_LABELS: Record<string, string> = {
  northwest: "NW",
  north: "N",
  northeast: "NE",
  west: "W",
  east: "E",
  southwest: "SW",
  south: "S",
  southeast: "SE",
};

export default function Compass({ room, entities }: CompassProps) {
  // Get exit entity for a direction
  const getExit = (dir: string): Entity | null => {
    if (!room || !Array.isArray(room["exits"])) {
      return null;
    }

    const exits = room["exits"] as number[];
    for (const exitId of exits) {
      const exit = entities.get(exitId);
      if (exit && (exit["name"] as string)?.toLowerCase() === dir.toLowerCase()) {
        return exit;
      }
    }
    return null;
  };

  // Render a single compass cell
  const Cell = ({ dir }: { dir: string }) => {
    if (!dir) {
      // Center cell
      return (
        <Box width={10} justifyContent="center" alignItems="center">
          <Text color="gray">Here</Text>
        </Box>
      );
    }

    const exit = getExit(dir);
    const label = DIR_LABELS[dir] ?? dir;
    const destName = exit ? ((exit["destination_name"] ?? exit["name"]) as string) : "";

    return (
      <Box
        width={10}
        flexDirection="column"
        alignItems="center"
        borderStyle={exit ? "single" : "round"}
        borderColor={exit ? "cyan" : "gray"}
      >
        <Text bold color={exit ? "cyan" : "gray"}>
          {label}
        </Text>
        <Text dimColor={!exit} color={exit ? "white" : "gray"}>
          {exit ? destName.slice(0, 8) : "-"}
        </Text>
      </Box>
    );
  };

  return (
    <Box flexDirection="column">
      <Text bold underline>
        Compass
      </Text>
      {DIRECTIONS.map((row, rowIdx) => (
        <Box key={rowIdx}>
          {row.map((dir, colIdx) => (
            <Cell key={colIdx} dir={dir} />
          ))}
        </Box>
      ))}
    </Box>
  );
}
