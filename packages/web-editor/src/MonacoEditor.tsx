import { Component, createEffect, onCleanup, onMount } from "solid-js";
import loader from "@monaco-editor/loader";
import { generateTypeDefinitions, OpcodeMetadata } from "@viwo/scripting";

interface MonacoEditorProps {
  value?: string;
  onChange?: (value: string) => void;
  opcodes?: OpcodeMetadata[];
  onAICompletion?: (
    code: string,
    position: { lineNumber: number; column: number },
  ) => Promise<string | null>;
}

export const MonacoEditor: Component<MonacoEditorProps> = (props) => {
  // oxlint-disable-next-line no-unassigned-vars
  let containerRef: HTMLDivElement | undefined;
  let editorInstance: any; // monaco.editor.IStandaloneCodeEditor

  onMount(() => {
    loader.init().then((monaco) => {
      if (!containerRef) return;

      // Set up compiler options
      monaco.languages.typescript.javascriptDefaults.setCompilerOptions({
        target: monaco.languages.typescript.ScriptTarget.ES2020,
        allowNonTsExtensions: true,
        moduleResolution:
          monaco.languages.typescript.ModuleResolutionKind.NodeJs,
        module: monaco.languages.typescript.ModuleKind.CommonJS,
        noEmit: true,
        // typeRoots: ["node_modules/@types"],
      });

      // Generate and add types
      createEffect(() => {
        const opcodes = props.opcodes;
        if (opcodes) {
          const typeDefs = generateTypeDefinitions(opcodes);
          monaco.languages.typescript.javascriptDefaults.addExtraLib(
            typeDefs,
            "ts:filename/viwo.d.ts",
          );
        }
      });

      // Register AI Completion Provider
      monaco.languages.registerCompletionItemProvider("javascript", {
        triggerCharacters: [" "], // Trigger on space to help with arguments
        provideCompletionItems: async (model: any, position: any) => {
          if (!props.onAICompletion) return { suggestions: [] };

          const code = model.getValue();
          const { lineNumber, column } = position;

          try {
            // Call AI plugin via callback
            const completion = await props.onAICompletion(code, {
              lineNumber,
              column,
            });

            if (!completion || typeof completion !== "string") {
              return { suggestions: [] };
            }

            return {
              suggestions: [
                {
                  label: "AI Completion",
                  kind: monaco.languages.CompletionItemKind.Snippet,
                  insertText: completion,
                  detail: "AI Generated Code",
                  documentation: "AI Generated Code",
                  insertTextRules:
                    monaco.languages.CompletionItemInsertTextRule
                      .InsertAsSnippet,
                },
              ],
            };
          } catch (e) {
            console.error("AI Completion Failed:", e);
            return { suggestions: [] };
          }
        },
      });

      editorInstance = monaco.editor.create(containerRef, {
        value: props.value ?? "// Start typing your script here...\n\n",
        language: "javascript",
        theme: "vs-dark",
        automaticLayout: true,
        minimap: { enabled: false },
        fontSize: 14,
        suggest: {
          showMethods: true,
          showFunctions: true,
          showConstructors: true,
          showFields: true,
          showVariables: true,
          showClasses: true,
          showStructs: true,
          showInterfaces: true,
          showModules: true,
          showProperties: true,
          showEvents: true,
          showOperators: true,
          showUnits: true,
          showValues: true,
          showConstants: true,
          showEnums: true,
          showEnumMembers: true,
          showKeywords: true,
          showWords: true,
          showColors: true,
          showFiles: true,
          showReferences: true,
          showFolders: true,
          showTypeParameters: true,
          showSnippets: true,
        },
      });

      editorInstance.onDidChangeModelContent(() => {
        const newValue = editorInstance.getValue();
        if (props.onChange) {
          props.onChange(newValue);
        }
      });
    });
  });

  createEffect(() => {
    if (
      editorInstance &&
      props.value !== undefined &&
      props.value !== editorInstance.getValue()
    ) {
      editorInstance.setValue(props.value);
    }
  });

  onCleanup(() => {
    if (editorInstance) {
      editorInstance.dispose();
    }
  });

  return (
    <div
      ref={containerRef}
      style={{ width: "100%", height: "100%", "min-height": "400px" }}
    />
  );
};
