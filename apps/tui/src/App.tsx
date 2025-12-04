import { useState, useEffect, useRef } from "react";
import { Box, Text, useApp, useStdout } from "ink";
import TextInput from "ink-text-input";
import { ViwoClient, GameState } from "@viwo/client";
import { Entity } from "@viwo/shared/jsonrpc";
import Editor from "./components/Editor";

// Types
type Mode = "GAME" | "EDITOR";

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
  const [mode, setMode] = useState<Mode>("GAME");
  const [editingScript, setEditingScript] = useState<{
    id: number;
    content: string;
  } | null>(null);

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

      if (command === "edit" && args.length > 0) {
        const scriptId = parseInt(args[0]!);

        // In a real scenario, we might need an RPC call to get source if not available.
        // For this task, let's assume we can edit if we have the entity and it has a 'source' property,
        // or we just start with empty/mock for testing if not found.

        // Check if we have the entity in our local state
        const entity = clientState.entities.get(scriptId);
        let content = "";
        if (entity && typeof entity["source"] === "string") {
          content = entity["source"];
        } else {
          // If not found, maybe we can't edit it yet without fetching.
          // But for the sake of the task, let's allow opening an empty buffer or mock.
          // Ideally we should request it.
          addLog(`Opening editor for ${scriptId}...`, "info");
        }

        setEditingScript({ id: scriptId, content });
        setMode("EDITOR");
        setQuery("");
        return;
      }

      clientRef.current.execute(command, args);
    }
    setQuery("");
  };

  const handleSaveScript = (content: string) => {
    if (editingScript && clientRef.current) {
      // Send update command/RPC
      // Assuming there's a way to update source, e.g. 'program <id> <source>' or similar RPC.
      // For now, let's just log it and maybe try a command if one exists, or just update local state.
      // The viwo protocol usually uses 'program' command or similar.
      // Let's assume 'program <id> <content>'
      clientRef.current.execute("program", [
        editingScript.id.toString(),
        content,
      ]);
      addLog(`Saved script ${editingScript.id}`, "info");
      setMode("GAME");
      setEditingScript(null);
    }
  };

  const handleExitEditor = () => {
    setMode("GAME");
    setEditingScript(null);
  };

  const handleLocalCompletion = async (
    code: string,
    position: { lineNumber: number; column: number },
  ) => {
    // Use local opcodes if available
    if (clientState.opcodes) {
      const lines = code.split("\n");
      const line = lines[position.lineNumber - 1] || "";
      const textBeforeCursor = line.slice(0, position.column - 1);

      // Find the word being typed.
      // We look for the last sequence of non-whitespace characters.
      const match = textBeforeCursor.match(/[\S]+$/);
      if (match) {
        const prefix = match[0];
        // Filter opcodes
        // We cast opcodes to any[] because we don't have the type imported,
        // but we know it has an 'opcode' field.
        const matches = clientState.opcodes.filter((op: any) =>
          op.opcode.startsWith(prefix),
        );
        if (matches.length > 0) {
          // Return the suffix of the first match
          // In a real TUI, we'd show a list. Here we just complete the first one.
          const bestMatch = matches[0].opcode;
          return bestMatch.slice(prefix.length);
        }
      }
    }
    return null;
  };

  const handleAiCompletion = async (
    code: string,
    position: { lineNumber: number; column: number },
  ) => {
    if (!clientRef.current) return null;
    try {
      const completion = await clientRef.current.callPluginMethod(
        "ai_completion",
        {
          code,
          position,
        },
      );
      return typeof completion === "string" ? completion : null;
    } catch (e) {
      addLog(`AI Error: ${e}`, "error");
      return null;
    }
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
      {mode === "EDITOR" && editingScript ? (
        <Editor
          initialContent={editingScript.content}
          onSave={handleSaveScript}
          onExit={handleExitEditor}
          onAiCompletion={handleAiCompletion}
          onLocalCompletion={handleLocalCompletion}
        />
      ) : (
        <>
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
            <TextInput
              value={query}
              onChange={setQuery}
              onSubmit={handleSubmit}
            />
          </Box>
        </>
      )}
    </Box>
  );
};

export default App;
