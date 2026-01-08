import { Box, Text, useInput } from "ink";
import React, { useEffect, useState } from "react";

interface EditorProps {
  initialContent: string;
  onSave: (content: string) => void;
  onExit: () => void;
  onAiCompletion: (
    code: string,
    position: { lineNumber: number; column: number },
  ) => string | null | Promise<string | null>;
  onLocalCompletion: (
    code: string,
    position: { lineNumber: number; column: number },
  ) => string | null | Promise<string | null>;
}

const Editor: React.FC<EditorProps> = ({
  initialContent,
  onSave,
  onExit,
  onAiCompletion,
  onLocalCompletion,
}) => {
  const [lines, setLines] = useState<string[]>(initialContent.split("\n"));
  const [cursor, setCursor] = useState({ col: 0, row: 0 });
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
        const newY = Math.max(0, prev.row - 1);
        const line = lines[newY];
        const newX = Math.min(prev.col, line ? line.length : 0);
        return { col: newX, row: newY };
      });
    } else if (key.downArrow) {
      setCursor((prev) => {
        const newY = Math.min(lines.length - 1, prev.row + 1);
        const line = lines[newY];
        const newX = Math.min(prev.col, line ? line.length : 0);
        return { col: newX, row: newY };
      });
    } else if (key.leftArrow) {
      setCursor((prev) => {
        if (prev.col > 0) {
          return { ...prev, col: prev.col - 1 };
        }
        if (prev.row > 0) {
          const newY = prev.row - 1;
          const line = lines[newY];
          return { col: line ? line.length : 0, row: newY };
        }
        return prev;
      });
    } else if (key.rightArrow) {
      setCursor((prev) => {
        const line = lines[prev.row];
        if (line && prev.col < line.length) {
          return { ...prev, col: prev.col + 1 };
        }
        if (prev.row < lines.length - 1) {
          return { col: 0, row: prev.row + 1 };
        }
        return prev;
      });
    } else if (key.return) {
      setLines((prev) => {
        const currentLine = prev[cursor.row] ?? "";
        const before = currentLine.slice(0, cursor.col);
        const after = currentLine.slice(cursor.col);
        const newLines = [...prev];
        newLines.splice(cursor.row, 1, before, after);
        return newLines;
      });
      setCursor((prev) => ({ col: 0, row: prev.row + 1 }));
    } else if (key.backspace || key.delete) {
      if (cursor.col > 0) {
        // Simple backspace within line
        setLines((prev) => {
          const line = prev[cursor.row] ?? "";
          const newLine = line.slice(0, cursor.col - 1) + line.slice(cursor.col);
          const newLines = [...prev];
          newLines[cursor.row] = newLine;
          return newLines;
        });
        setCursor((prev) => ({ ...prev, col: prev.col - 1 }));
      } else if (cursor.row > 0) {
        // Merge with previous line
        setLines((prev) => {
          const currentLine = prev[cursor.row] ?? "";
          const prevLine = prev[cursor.row - 1] ?? "";
          const newLines = [...prev];
          newLines.splice(cursor.row - 1, 2, prevLine + currentLine);
          return newLines;
        });
        setCursor((prev) => ({
          col: (lines[prev.row - 1] ?? "").length,
          row: prev.row - 1,
        }));
      }
    } else if (key.tab) {
      if (isLoading) {
        return;
      }
      setIsLoading(true);
      // AI Completion
      Promise.resolve()
        .then(() =>
          onAiCompletion(lines.join("\n"), { column: cursor.col + 1, lineNumber: cursor.row + 1 }),
        )
        .then((completion) => {
          if (completion) {
            setLines((prev) => {
              const line = prev[cursor.row] ?? "";
              const newLine = line.slice(0, cursor.col) + completion + line.slice(cursor.col);
              const newLines = [...prev];
              newLines[cursor.row] = newLine;
              return newLines;
            });
            setCursor((prev) => ({ ...prev, col: prev.col + completion.length }));
          }
        })
        .finally(() => setIsLoading(false));
    } else if (key.ctrl && input === " ") {
      // Local/LSP Completion
      if (isLoading) {
        return;
      }
      // We don't necessarily need a loading state for local, but good practice
      Promise.resolve()
        .then(() =>
          onLocalCompletion(lines.join("\n"), {
            column: cursor.col + 1,
            lineNumber: cursor.row + 1,
          }),
        )
        .then((completion) => {
          if (completion) {
            setLines((prev) => {
              const line = prev[cursor.row] ?? "";
              const newLine = line.slice(0, cursor.col) + completion + line.slice(cursor.col);
              const newLines = [...prev];
              newLines[cursor.row] = newLine;
              return newLines;
            });
            setCursor((prev) => ({ ...prev, col: prev.col + completion.length }));
          }
        });
    } else {
      // Regular typing
      setLines((prev) => {
        const line = prev[cursor.row] ?? "";
        const newLine = line.slice(0, cursor.col) + input + line.slice(cursor.col);
        const newLines = [...prev];
        newLines[cursor.row] = newLine;
        return newLines;
      });
      setCursor((prev) => ({ ...prev, col: prev.col + 1 }));
    }
  });

  // Simple scrolling logic
  useEffect(() => {
    if (cursor.row < offset) {
      setOffset(cursor.row);
    } else if (cursor.row >= offset + 20) {
      // Assuming 20 lines visible
      setOffset(cursor.row - 19);
    }
  }, [cursor.row, offset]);

  const visibleLines = lines.slice(offset, offset + 20);

  return (
    <Box flexDirection="column" borderStyle="single" borderColor="yellow">
      <Box justifyContent="space-between">
        <Text bold> Script Editor {isLoading ? "(AI Generating...)" : ""} </Text>
        <Text>
          {" "}
          Ln {cursor.row + 1}, Col {cursor.col + 1}{" "}
        </Text>
      </Box>
      <Box flexDirection="column" height={20}>
        {visibleLines.map((line, idx) => {
          const lineIndex = offset + idx;
          const isCurrentLine = lineIndex === cursor.row;
          return (
            <Box key={lineIndex}>
              <Text color="gray" dimColor>
                {(lineIndex + 1).toString().padStart(3, " ")}{" "}
              </Text>
              {isCurrentLine ? (
                <Text>
                  {line.slice(0, cursor.col)}
                  <Text inverse color="cyan">
                    {line[cursor.col] ?? " "}
                  </Text>
                  {line.slice(cursor.col + 1)}
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
