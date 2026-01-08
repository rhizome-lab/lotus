import { Box, Text, useApp, useStdout } from "ink";
import { type GameState, BloomClient } from "@bloom/client";
import { useEffect, useRef, useState } from "react";
import Editor from "./components/Editor";
import Compass from "./components/Compass";
import Inspector from "./components/Inspector";
import type { Entity } from "@bloom/shared/jsonrpc";
import TextInput from "ink-text-input";

// Types
type Mode = "GAME" | "EDITOR";

interface LogEntry {
  id: string;
  message: string | object;
  type: "info" | "error" | "other";
}

const App = () => {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const [rows, setRows] = useState(stdout.rows || 24);
  const [query, setQuery] = useState("");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [room, setRoom] = useState<Entity | null>();
  const [inventory, setInventory] = useState<Entity[]>([]);
  const [mode, setMode] = useState<Mode>("GAME");
  const [inspectedItem, setInspectedItem] = useState<Entity | null>(null);
  const [editingScript, setEditingScript] = useState<{
    id: number;
    verb: string;
    content: string;
  } | null>();

  // Client state
  const [clientState, setClientState] = useState<GameState>({
    entities: new Map(),
    isConnected: false,
    messages: [],
    opcodes: null,
    playerId: null,
    roomId: null,
  });

  const clientRef = useRef<BloomClient | null>(null);

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
        const items = contents.flatMap((id) => {
          const entity = entities.get(id);
          return entity ? [entity] : [];
        });
        setInventory(items);
      }
    }
  }, [clientState]);

  useEffect(() => {
    const client = new BloomClient("ws://localhost:8080");
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

  const addLog = (message: string | object, type: "info" | "error" | "other" = "info") => {
    setLogs((prev) => [...prev, { id: Math.random().toString(36).slice(2, 9), message, type }]);
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
      const [command] = parts;
      const args = parts.slice(1).map((arg) => arg.replace(/^"(.*)"$/, "$1"));

      if (command === "edit" && args.length >= 2) {
        const scriptId = parseInt(args[0]!, 10);
        const verbName = args[1]!;

        const openEditor = (initialContent: string) => {
          setEditingScript({ content: initialContent, id: scriptId, verb: verbName });
          setMode("EDITOR");
          setQuery("");
        };

        addLog(`Fetching verb '${verbName}' on entity ${scriptId}...`, "info");
        clientRef.current
          .getVerb(scriptId, verbName)
          .then((source) => {
            openEditor(source);
          })
          .catch((error) => {
            addLog(`Failed to fetch verb: ${error.message}. Starting empty.`, "error");
            openEditor("");
          });
        return;
      }

      // Handle inspect command
      if (command === "inspect" && args.length >= 1) {
        const itemName = args[0]!.toLowerCase();
        // Search in room contents and inventory
        const allItems = [...getRoomContents(), ...inventory].filter(
          (i): i is Entity => i !== undefined,
        );
        const item = allItems.find((i) => (i["name"] as string)?.toLowerCase() === itemName);
        if (item) {
          handleInspect(item);
          addLog(`Inspecting: ${item["name"]}`, "info");
        } else {
          addLog(`Item not found: ${args[0]}`, "error");
        }
        setQuery("");
        return;
      }

      clientRef.current.execute(command, args);
    }
    setQuery("");
  };

  const handleSaveScript = (content: string) => {
    if (editingScript && clientRef.current) {
      clientRef.current
        .updateVerb(editingScript.id, editingScript.verb, content)
        .then(() => {
          addLog(`Saved verb '${editingScript.verb}' on ${editingScript.id}`, "info");
          setMode("GAME");
          setEditingScript(undefined);
        })
        .catch((error) => {
          addLog(`Failed to save: ${error.message}`, "error");
          // Don't exit editor on error?
          // For now, let's just log and keep editor open or close?
          // User might lose work if we close.
          // But existing logic closed it.
          // Let's keep it simple: log error, don't close?
          // The original code passed `onSave` which called `handleSaveScript`.
          // `Editor` component usually handles save and exit?
          // If we don't clear editingScript/mode, `Editor` stays open?
          // Let's assume onSave implies "Save and Close" for TUI.
          // But if it fails, we should probably stay open.
        });
    }
  };

  const handleExitEditor = () => {
    setMode("GAME");
    setEditingScript(undefined);
  };

  // oxlint-disable-next-line require-await
  const handleLocalCompletion = async (
    code: string,
    position: { lineNumber: number; column: number },
  ) => {
    // Use local opcodes if available
    if (clientState.opcodes) {
      const lines = code.split("\n");
      const line = lines[position.lineNumber - 1] ?? "";
      const textBeforeCursor = line.slice(0, position.column - 1);

      // Find the word being typed.
      // We look for the last sequence of non-whitespace characters.
      const match = textBeforeCursor.match(/[\S]+$/);
      if (match) {
        const [prefix] = match;
        // Filter opcodes
        // We cast opcodes to any[] because we don't have the type imported,
        // But we know it has an 'opcode' field.
        const matches = clientState.opcodes.filter((op: any) => op.opcode.startsWith(prefix));
        if (matches.length > 0) {
          // Return the suffix of the first match
          // In a real TUI, we'd show a list. Here we just complete the first one.
          const bestMatch = matches[0].opcode;
          return bestMatch.slice(prefix.length);
        }
      }
    }
    return;
  };

  const handleAiCompletion = async (
    code: string,
    position: { lineNumber: number; column: number },
  ) => {
    if (!clientRef.current) {
      return null;
    }
    try {
      const completion = await clientRef.current.callPluginMethod("ai_completion", {
        code,
        position,
      });
      return typeof completion === "string" ? completion : null;
    } catch (error) {
      addLog(`AI Error: ${error}`, "error");
      return null;
    }
  };

  // Helper to get room contents
  const getRoomContents = () => {
    if (!room || !room["contents"] || !Array.isArray(room["contents"])) {
      return [];
    }
    return room["contents"]
      .map((id: number) => clientState.entities.get(id))
      .filter((entity) => Boolean(entity));
  };

  // Handle item inspection
  const handleInspect = (item: Entity) => {
    setInspectedItem(item);
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
              Bloom TUI{" "}
            </Text>
            <Text> | </Text>
            <Text color={clientState.isConnected ? "green" : "red"}>
              {" "}
              {clientState.isConnected ? "ONLINE" : "OFFLINE"}{" "}
            </Text>
          </Box>

          {/* Main Content Area - Top Row */}
          <Box flexGrow={1}>
            {/* Left Column: Log */}
            <Box width="30%" borderStyle="single" flexDirection="column">
              <Text bold underline>
                Log
              </Text>
              <Box flexDirection="column" flexGrow={1} overflowY="hidden">
                {logs.slice(-15).map((log) => (
                  <Box key={log.id}>
                    <Text
                      color={log.type === "error" ? "red" : log.type === "info" ? "white" : "blue"}
                    >
                      {typeof log.message === "string" ? log.message : JSON.stringify(log.message)}
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
                  <Box marginTop={1} flexDirection="column">
                    <Text underline>Contents:</Text>
                    {getRoomContents()
                      .filter((item): item is Entity => item !== undefined)
                      .map((item, idx) => (
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
                inventory.map((item, idx) => <Text key={idx}>- {item["name"] as string}</Text>)
              ) : (
                <Text color="gray">(empty)</Text>
              )}
            </Box>
          </Box>

          {/* Bottom Row: Compass + Inspector */}
          <Box height={8}>
            {/* Left: Compass */}
            <Box width="35%" borderStyle="single">
              <Compass room={room} entities={clientState.entities} />
            </Box>

            {/* Right: Inspector */}
            <Box width="65%" borderStyle="single">
              <Inspector inspectedItem={inspectedItem} entities={clientState.entities} />
            </Box>
          </Box>

          {/* Input Bar */}
          <Box borderStyle="single" borderColor="blue">
            <Text color="green">&gt; </Text>
            <TextInput value={query} onChange={setQuery} onSubmit={handleSubmit} />
          </Box>
        </>
      )}
    </Box>
  );
};

export default App;
