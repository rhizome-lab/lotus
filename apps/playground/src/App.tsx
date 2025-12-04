import { Component, createSignal, For } from "solid-js";
import { ScriptEditor } from "@viwo/web-editor";
import { playgroundOpcodes, clearOutput, getOutput } from "./runtime";
import { examples } from "./examples";
import { evaluate, createScriptContext, transpile } from "@viwo/scripting";

const App: Component = () => {
  const [output, setOutput] = createSignal("");
  const [selectedExample, setSelectedExample] = createSignal("HelloWorld");

  // Initialize with HelloWorld
  const initialScript = transpile(examples["Hello World"]);
  const [script, setScript] = createSignal<any>(initialScript ?? ["seq"]);

  const runScript = async () => {
    clearOutput();
    setOutput("");
    try {
      const ctx = createScriptContext({
        caller: { id: 0 } as any,
        this: { id: 0 } as any,
      });

      await evaluate(script(), ctx);
      setOutput(getOutput());
    } catch (e: any) {
      console.error(e);
      setOutput(
        `Error: ${e.message}\n${e.stackTrace ? JSON.stringify(e.stackTrace, null, 2) : ""}`,
      );
    }
  };

  const loadExample = (name: string) => {
    setSelectedExample(name);
    setScript((examples as any)[name]);
  };

  return (
    <div class="playground">
      <header class="playground__header">
        <h1>Viwo Scripting Playground</h1>
        <div class="playground__controls">
          <select
            value={selectedExample()}
            onChange={(e) => loadExample(e.currentTarget.value)}
          >
            <For each={Object.keys(examples)}>
              {(name) => <option value={name}>{name}</option>}
            </For>
          </select>
          <button onClick={runScript}>Run</button>
        </div>
      </header>
      <div class="playground__main">
        <ScriptEditor
          value={script()}
          onChange={setScript}
          opcodes={playgroundOpcodes}
        />
      </div>
      <div class="playground__output">
        <h3>Output</h3>
        <pre>{output()}</pre>
      </div>
    </div>
  );
};

export default App;
