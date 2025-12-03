import { Component, For } from "solid-js";
import { themeStore, ThemeColors } from "../store/theme";

interface Props {
  onClose: () => void;
}

export const ThemeEditor: Component<Props> = (props) => {
  const colorKeys = Object.keys(themeStore.activeTheme.colors) as Array<keyof ThemeColors>;

  const handleExport = () => {
    const theme = themeStore.activeTheme;
    const dataStr =
      "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(theme, null, 2));
    const downloadAnchorNode = document.createElement("a");
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute(
      "download",
      `${theme.manifest.name.replace(/\s+/g, "_").toLowerCase()}.json`,
    );
    document.body.appendChild(downloadAnchorNode); // required for firefox
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  const handleImport = (e: Event) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const theme = JSON.parse(event.target?.result as string);
        themeStore.importTheme(theme);
        alert("Theme imported successfully!");
      } catch (err) {
        console.error(err);
        alert("Failed to import theme. Invalid JSON.");
      }
    };
    reader.readAsText(file);
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "rgba(0,0,0,0.8)",
        display: "flex",
        "align-items": "center",
        "justify-content": "center",
        "z-index": 1000,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) props.onClose();
      }}
    >
      <div
        style={{
          background: "var(--bg-panel)",
          padding: "20px",
          "border-radius": "8px",
          border: "1px solid var(--border-color)",
          width: "600px",
          "max-height": "85vh",
          "overflow-y": "auto",
          display: "flex",
          "flex-direction": "column",
          gap: "15px",
        }}
      >
        <div
          style={{
            display: "flex",
            "justify-content": "space-between",
            "align-items": "center",
          }}
        >
          <h2 style={{ margin: 0, color: "var(--text-primary)" }}>Theme Editor</h2>
          <button
            onClick={props.onClose}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--text-muted)",
              cursor: "pointer",
              "font-size": "1.2em",
            }}
          >
            ✕
          </button>
        </div>

        {/* Theme Selector & Actions */}
        <div style={{ display: "flex", gap: "10px", "align-items": "center" }}>
          <select
            value={themeStore.state.activeThemeId}
            onChange={(e) => themeStore.setActiveTheme(e.currentTarget.value)}
            style={{
              flex: 1,
              padding: "8px",
              background: "var(--bg-input)",
              color: "var(--text-primary)",
              border: "1px solid var(--border-color)",
              "border-radius": "4px",
            }}
          >
            <For each={themeStore.state.themes}>
              {(theme) => (
                <option value={theme.id}>
                  {theme.manifest.name} {theme.isBuiltin ? "(Built-in)" : ""}
                </option>
              )}
            </For>
          </select>
          <button
            onClick={() => {
              const name = prompt("Enter new theme name:");
              if (name) themeStore.createTheme(name);
            }}
            style={{
              padding: "8px",
              background: "var(--bg-element)",
              color: "var(--text-primary)",
              border: "1px solid var(--border-color)",
              "border-radius": "4px",
              cursor: "pointer",
            }}
            title="New Theme"
          >
            +
          </button>
          <button
            onClick={() => {
              if (confirm("Delete this theme?")) {
                themeStore.deleteTheme(themeStore.state.activeThemeId);
              }
            }}
            disabled={themeStore.activeTheme.isBuiltin}
            style={{
              padding: "8px",
              background: "var(--bg-element)",
              color: themeStore.activeTheme.isBuiltin ? "var(--text-muted)" : "var(--error-color)",
              border: "1px solid var(--border-color)",
              "border-radius": "4px",
              cursor: themeStore.activeTheme.isBuiltin ? "not-allowed" : "pointer",
            }}
            title="Delete Theme"
          >
            🗑️
          </button>
          <button
            onClick={handleExport}
            style={{
              padding: "8px",
              background: "var(--bg-element)",
              color: "var(--text-primary)",
              border: "1px solid var(--border-color)",
              "border-radius": "4px",
              cursor: "pointer",
            }}
            title="Export Theme"
          >
            ⬇️
          </button>
          <label
            style={{
              padding: "8px",
              background: "var(--bg-element)",
              color: "var(--text-primary)",
              border: "1px solid var(--border-color)",
              "border-radius": "4px",
              cursor: "pointer",
              display: "inline-block",
            }}
            title="Import Theme"
          >
            ⬆️
            <input type="file" accept=".json" onChange={handleImport} style={{ display: "none" }} />
          </label>
        </div>

        {/* Metadata Editor */}
        <div
          style={{
            display: "grid",
            "grid-template-columns": "1fr 1fr",
            gap: "10px",
            padding: "10px",
            background: "var(--bg-element)",
            "border-radius": "4px",
          }}
        >
          <div style={{ display: "flex", "flex-direction": "column", gap: "5px" }}>
            <label style={{ "font-size": "0.8em", color: "var(--text-secondary)" }}>Name</label>
            <input
              type="text"
              value={themeStore.activeTheme.manifest.name}
              disabled={themeStore.activeTheme.isBuiltin}
              onChange={(e) => themeStore.updateManifest({ name: e.currentTarget.value })}
              style={{
                padding: "5px",
                background: "var(--bg-input)",
                color: "var(--text-primary)",
                border: "1px solid var(--border-color)",
                "border-radius": "4px",
              }}
            />
          </div>
          <div style={{ display: "flex", "flex-direction": "column", gap: "5px" }}>
            <label style={{ "font-size": "0.8em", color: "var(--text-secondary)" }}>Author</label>
            <input
              type="text"
              value={themeStore.activeTheme.manifest.author}
              disabled={themeStore.activeTheme.isBuiltin}
              onChange={(e) => themeStore.updateManifest({ author: e.currentTarget.value })}
              style={{
                padding: "5px",
                background: "var(--bg-input)",
                color: "var(--text-primary)",
                border: "1px solid var(--border-color)",
                "border-radius": "4px",
              }}
            />
          </div>
        </div>

        <div
          style={{
            display: "flex",
            "align-items": "center",
            gap: "10px",
            padding: "10px",
            background: "var(--bg-element)",
            "border-radius": "4px",
          }}
        >
          <input
            type="checkbox"
            id="allowCustomCss"
            checked={themeStore.state.allowCustomCss}
            onChange={() => themeStore.toggleCustomCss()}
          />
          <label for="allowCustomCss" style={{ color: "var(--text-primary)" }}>
            Allow Custom CSS from Areas/Rooms
          </label>
        </div>

        <div
          style={{
            display: "grid",
            "grid-template-columns": "1fr 1fr",
            gap: "10px",
          }}
        >
          <For each={colorKeys}>
            {(key) => (
              <div
                style={{
                  display: "flex",
                  "flex-direction": "column",
                  gap: "5px",
                }}
              >
                <label
                  style={{
                    "font-size": "0.8em",
                    color: "var(--text-secondary)",
                  }}
                >
                  {key}
                </label>
                <div style={{ display: "flex", gap: "5px" }}>
                  <input
                    type="color"
                    value={
                      themeStore.activeTheme.colors[key].startsWith("#")
                        ? themeStore.activeTheme.colors[key]
                        : "#000000"
                    }
                    onChange={(e) => themeStore.updateColor(key, e.currentTarget.value)}
                    style={{
                      border: "none",
                      padding: 0,
                      width: "30px",
                      height: "30px",
                      cursor: "pointer",
                      background: "none",
                    }}
                  />
                  <input
                    type="text"
                    value={themeStore.activeTheme.colors[key]}
                    onChange={(e) => themeStore.updateColor(key, e.currentTarget.value)}
                    style={{
                      flex: 1,
                      background: "var(--bg-input)",
                      border: "1px solid var(--border-color)",
                      color: "var(--text-primary)",
                      padding: "4px 8px",
                      "border-radius": "4px",
                      "font-family": "monospace",
                      "font-size": "0.9em",
                    }}
                  />
                </div>
              </div>
            )}
          </For>
        </div>

        <div
          style={{
            display: "flex",
            "justify-content": "flex-end",
            gap: "10px",
            "margin-top": "10px",
            "border-top": "1px solid var(--border-color)",
            "padding-top": "10px",
          }}
        >
          <button
            onClick={props.onClose}
            style={{
              background: "var(--accent-color)",
              color: "var(--accent-fg)",
              border: "none",
              padding: "8px 16px",
              "border-radius": "4px",
              cursor: "pointer",
              "font-weight": "bold",
            }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
