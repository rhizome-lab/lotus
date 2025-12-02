import { useState, useEffect, useRef } from "react";
import { Box, Text, useApp, useStdout } from "ink";
import TextInput from "ink-text-input";
import { ViwoClient, GameState } from "@viwo/client";
import { Entity } from "@viwo/shared/jsonrpc";

// Types
type LogEntry = {
  id: string;
  message: string | object;
  type: "info" | "error" | "other";
};

const App = () => {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const [rows, setRows] = useState(stdout.rows || 24);
  const [query, setQuery] = useState("");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [room, setRoom] = useState<Entity | null>(null);
  const [inventory, setInventory] = useState<Entity[]>([]);

  // Client state
  const [clientState, setClientState] = useState<GameState>({
    isConnected: false,
    messages: [],
    entities: new Map(),
    roomId: null,
    playerId: null,
    opcodes: null,
  });

  const clientRef = useRef<ViwoClient | null>(null);

  useEffect(() => {
    const onResize = () => setRows(stdout.rows || 24);
    stdout.on?.("resize", onResize);
    return () => {
      stdout.off?.("resize", onResize);
    };
  }, [stdout]);

  useEffect(() => {
    // Update room and inventory based on entities and IDs
    const { roomId, playerId, entities } = clientState;

    if (roomId && entities.has(roomId)) {
      setRoom(entities.get(roomId)!);
    }
    if (playerId && entities.has(playerId)) {
      const player = entities.get(playerId);
      const contents = player?.["contents"] as number[] | undefined;
      if (contents && Array.isArray(contents)) {
        const items = contents
          .map((id) => entities.get(id))
          .filter((e): e is Entity => !!e);
        setInventory(items);
      }
    }
  }, [clientState]);

  useEffect(() => {
    const client = new ViwoClient("ws://localhost:8080");
    clientRef.current = client;

    const unsubscribeState = client.subscribe((state) => {
      setClientState(state);
    });

    const unsubscribeMessage = client.onMessage((msg) => {
      addLog(msg.text, msg.type === "message" ? "info" : "error");
    });

    client.connect();

    return () => {
      unsubscribeState();
      unsubscribeMessage();
      client.disconnect();
    };
  }, []);

  const addLog = (
    message: string | object,
    type: "info" | "error" | "other" = "info",
  ) => {
    setLogs((prev) => [
      ...prev,
      { id: Math.random().toString(36).substr(2, 9), message, type },
    ]);
  };

  const handleSubmit = (input: string) => {
    if (!clientRef.current || !clientState.isConnected) {
      addLog("Not connected.", "error");
      return;
    }

    if (input.trim() === "exit" || input.trim() === "quit") {
      exit();
      return;
    }

    // Echo command
    addLog(`> ${input}`, "other");

    const parts = input.match(/(?:[^\s"]+|"[^"]*")+/g);
    if (parts) {
      const command = parts[0];
      const args = parts.slice(1).map((arg) => arg.replace(/^"(.*)"$/, "$1"));
      clientRef.current.execute(command, args);
    }
    setQuery("");
  };

  // Helper to get room contents
  const getRoomContents = () => {
    if (!room || !room["contents"] || !Array.isArray(room["contents"]))
      return [];
    return room["contents"]
      .map((id: number) => clientState.entities.get(id))
      .filter((e: Entity | undefined): e is Entity => !!e);
  };

  return (
    <Box flexDirection="column" height={rows}>
      {/* Header */}
      <Box borderStyle="single" borderColor="green">
        <Text bold color="green">
          {" "}
          Viwo TUI{" "}
        </Text>
        <Text> | </Text>
        <Text color={clientState.isConnected ? "green" : "red"}>
          {" "}
          {clientState.isConnected ? "ONLINE" : "OFFLINE"}{" "}
        </Text>
      </Box>

      {/* Main Content Area */}
      <Box flexGrow={1}>
        {/* Left Column: Log */}
        <Box width="30%" borderStyle="single" flexDirection="column">
          <Text bold underline>
            Log
          </Text>
          <Box flexDirection="column" flexGrow={1} overflowY="hidden">
            {logs.slice(-20).map((log) => (
              <Box key={log.id}>
                <Text
                  color={
                    log.type === "error"
                      ? "red"
                      : log.type === "info"
                      ? "white"
                      : "blue"
                  }
                >
                  {typeof log.message === "string"
                    ? log.message
                    : JSON.stringify(log.message)}
                </Text>
              </Box>
            ))}
          </Box>
        </Box>

        {/* Center Column: Room */}
        <Box width="40%" borderStyle="single" flexDirection="column">
          <Text bold underline>
            Current Room
          </Text>
          {room ? (
            <>
              <Text bold color="cyan">
                {room["name"] as string}
              </Text>
              <Text italic>{room["description"] as string}</Text>
              <Box marginTop={1}>
                <Text underline>Contents:</Text>
                {getRoomContents().map((item: Entity, idx: number) => (
                  <Text key={idx}>- {item["name"] as string}</Text>
                ))}
              </Box>
            </>
          ) : (
            <Text>No room data.</Text>
          )}
        </Box>

        {/* Right Column: Inventory */}
        <Box width="30%" borderStyle="single" flexDirection="column">
          <Text bold underline>
            Inventory
          </Text>
          {inventory.length > 0 ? (
            inventory.map((item, idx) => (
              <Text key={idx}>- {item["name"] as string}</Text>
            ))
          ) : (
            <Text color="gray">(empty)</Text>
          )}
        </Box>
      </Box>

      {/* Input Bar */}
      <Box borderStyle="single" borderColor="blue">
        <Text color="green">&gt; </Text>
        <TextInput value={query} onChange={setQuery} onSubmit={handleSubmit} />
      </Box>
    </Box>
  );
};

export default App;
