import React, { useState, useEffect } from "react";
import { Box, Text, useInput } from "ink";

interface EditorProps {
  initialContent: string;
  onSave: (content: string) => void;
  onExit: () => void;
  onAiCompletion: (
    code: string,
    position: { lineNumber: number; column: number },
  ) => Promise<string | null>;
  onLocalCompletion: (
    code: string,
    position: { lineNumber: number; column: number },
  ) => Promise<string | null>;
}

const Editor: React.FC<EditorProps> = ({
  initialContent,
  onSave,
  onExit,
  onAiCompletion,
  onLocalCompletion,
}) => {
  const [lines, setLines] = useState<string[]>(initialContent.split("\n"));
  const [cursor, setCursor] = useState({ x: 0, y: 0 });
  const [offset, setOffset] = useState(0); // Vertical scroll offset
  const [isLoading, setIsLoading] = useState(false);

  useInput((input, key) => {
    if (key.escape || (key.ctrl && input === "c")) {
      onExit();
      return;
    }

    if (key.ctrl && input === "s") {
      onSave(lines.join("\n"));
      return;
    }

    if (key.upArrow) {
      setCursor((prev) => {
        const newY = Math.max(0, prev.y - 1);
        const line = lines[newY];
        const newX = Math.min(prev.x, line ? line.length : 0);
        return { x: newX, y: newY };
      });
    } else if (key.downArrow) {
      setCursor((prev) => {
        const newY = Math.min(lines.length - 1, prev.y + 1);
        const line = lines[newY];
        const newX = Math.min(prev.x, line ? line.length : 0);
        return { x: newX, y: newY };
      });
    } else if (key.leftArrow) {
      setCursor((prev) => {
        if (prev.x > 0) return { ...prev, x: prev.x - 1 };
        if (prev.y > 0) {
          const newY = prev.y - 1;
          const line = lines[newY];
          return { x: line ? line.length : 0, y: newY };
        }
        return prev;
      });
    } else if (key.rightArrow) {
      setCursor((prev) => {
        const line = lines[prev.y];
        if (line && prev.x < line.length) return { ...prev, x: prev.x + 1 };
        if (prev.y < lines.length - 1) {
          return { x: 0, y: prev.y + 1 };
        }
        return prev;
      });
    } else if (key.return) {
      setLines((prev) => {
        const currentLine = prev[cursor.y] || "";
        const before = currentLine.slice(0, cursor.x);
        const after = currentLine.slice(cursor.x);
        const newLines = [...prev];
        newLines.splice(cursor.y, 1, before, after);
        return newLines;
      });
      setCursor((prev) => ({ x: 0, y: prev.y + 1 }));
    } else if (key.backspace || key.delete) {
      if (cursor.x > 0) {
        // Simple backspace within line
        setLines((prev) => {
          const line = prev[cursor.y] || "";
          const newLine = line.slice(0, cursor.x - 1) + line.slice(cursor.x);
          const newLines = [...prev];
          newLines[cursor.y] = newLine;
          return newLines;
        });
        setCursor((prev) => ({ ...prev, x: prev.x - 1 }));
      } else if (cursor.y > 0) {
        // Merge with previous line
        setLines((prev) => {
          const currentLine = prev[cursor.y] || "";
          const prevLine = prev[cursor.y - 1] || "";
          const newLines = [...prev];
          newLines.splice(cursor.y - 1, 2, prevLine + currentLine);
          return newLines;
        });
        setCursor((prev) => ({
          x: (lines[prev.y - 1] || "").length,
          y: prev.y - 1,
        }));
      }
    } else if (key.tab) {
      if (isLoading) return;
      setIsLoading(true);
      // AI Completion
      onAiCompletion(lines.join("\n"), {
        lineNumber: cursor.y + 1,
        column: cursor.x + 1,
      })
        .then((completion) => {
          if (completion) {
            setLines((prev) => {
              const line = prev[cursor.y] || "";
              const newLine = line.slice(0, cursor.x) + completion + line.slice(cursor.x);
              const newLines = [...prev];
              newLines[cursor.y] = newLine;
              return newLines;
            });
            setCursor((prev) => ({ ...prev, x: prev.x + completion.length }));
          }
        })
        .finally(() => setIsLoading(false));
    } else if (key.ctrl && input === " ") {
      // Local/LSP Completion
      if (isLoading) return;
      // We don't necessarily need a loading state for local, but good practice
      onLocalCompletion(lines.join("\n"), {
        lineNumber: cursor.y + 1,
        column: cursor.x + 1,
      }).then((completion) => {
        if (completion) {
          setLines((prev) => {
            const line = prev[cursor.y] || "";
            const newLine = line.slice(0, cursor.x) + completion + line.slice(cursor.x);
            const newLines = [...prev];
            newLines[cursor.y] = newLine;
            return newLines;
          });
          setCursor((prev) => ({ ...prev, x: prev.x + completion.length }));
        }
      });
    } else {
      // Regular typing
      setLines((prev) => {
        const line = prev[cursor.y] || "";
        const newLine = line.slice(0, cursor.x) + input + line.slice(cursor.x);
        const newLines = [...prev];
        newLines[cursor.y] = newLine;
        return newLines;
      });
      setCursor((prev) => ({ ...prev, x: prev.x + 1 }));
    }
  });

  // Simple scrolling logic
  useEffect(() => {
    if (cursor.y < offset) {
      setOffset(cursor.y);
    } else if (cursor.y >= offset + 20) {
      // Assuming 20 lines visible
      setOffset(cursor.y - 19);
    }
  }, [cursor.y, offset]);

  const visibleLines = lines.slice(offset, offset + 20);

  return (
    <Box flexDirection="column" borderStyle="single" borderColor="yellow">
      <Box justifyContent="space-between">
        <Text bold> Script Editor {isLoading ? "(AI Generating...)" : ""} </Text>
        <Text>
          {" "}
          Ln {cursor.y + 1}, Col {cursor.x + 1}{" "}
        </Text>
      </Box>
      <Box flexDirection="column" height={20}>
        {visibleLines.map((line, i) => {
          const lineIndex = offset + i;
          const isCurrentLine = lineIndex === cursor.y;
          return (
            <Box key={lineIndex}>
              <Text color="gray" dimColor>
                {(lineIndex + 1).toString().padStart(3, " ")}{" "}
              </Text>
              {isCurrentLine ? (
                <Text>
                  {line.slice(0, cursor.x)}
                  <Text inverse color="cyan">
                    {line[cursor.x] || " "}
                  </Text>
                  {line.slice(cursor.x + 1)}
                </Text>
              ) : (
                <Text>{line}</Text>
              )}
            </Box>
          );
        })}
      </Box>
      <Box marginTop={1}>
        <Text dimColor>Ctrl+S: Save | Esc: Exit | Tab: AI | Ctrl+Space: Local</Text>
      </Box>
    </Box>
  );
};

export default Editor;
