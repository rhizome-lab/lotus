import { type Component, For } from "solid-js";
import { type ThemeColors, themeStore } from "../store/theme";

interface Props {
  onClose: () => void;
}

export const ThemeEditor: Component<Props> = (props) => {
  const colorKeys = Object.keys(themeStore.activeTheme.colors) as (keyof ThemeColors)[];

  const handleExport = () => {
    const theme = themeStore.activeTheme;
    const dataStr = `data:text/json;charset=utf-8,${encodeURIComponent(
      JSON.stringify(theme, undefined, 2),
    )}`;
    const downloadAnchorNode = document.createElement("a");
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute(
      "download",
      `${theme.manifest.name.replaceAll(/\s+/g, "_").toLowerCase()}.json`,
    );
    document.body.append(downloadAnchorNode); // required for firefox
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  const handleImport = async (event: Event) => {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) {
      return;
    }
    const content = await file.text();
    try {
      const theme = JSON.parse(content);
      themeStore.importTheme(theme);
      alert("Theme imported successfully!");
    } catch (error) {
      console.error(error);
      alert("Failed to import theme. Invalid JSON.");
    }
  };

  return (
    <div
      class="theme-editor"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          props.onClose();
        }
      }}
    >
      <div class="theme-editor__modal">
        <div class="theme-editor__header">
          <h2 class="theme-editor__title">Theme Editor</h2>
          <button onClick={props.onClose} class="theme-editor__close-btn">
            ✕
          </button>
        </div>

        {/* Theme Selector & Actions */}
        <div class="theme-editor__actions">
          <select
            value={themeStore.state.activeThemeId}
            onChange={(event) => themeStore.setActiveTheme(event.currentTarget.value)}
            class="theme-editor__select"
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
              if (name) {
                themeStore.createTheme(name);
              }
            }}
            class="theme-editor__action-btn"
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
            class="theme-editor__action-btn theme-editor__action-delete"
            title="Delete Theme"
          >
            🗑️
          </button>
          <button onClick={handleExport} class="theme-editor__action-btn" title="Export Theme">
            ⬇️
          </button>
          <label
            class="theme-editor__action-btn"
            title="Import Theme"
            style={{ display: "inline-block" }}
          >
            ⬆️
            <input
              type="file"
              accept=".json"
              onChange={handleImport}
              class="theme-editor__file-input"
            />
          </label>
        </div>

        {/* Metadata Editor */}
        <div class="theme-editor__metadata">
          <div class="theme-editor__field">
            <label class="theme-editor__label">Name</label>
            <input
              type="text"
              value={themeStore.activeTheme.manifest.name}
              disabled={themeStore.activeTheme.isBuiltin}
              onChange={(event) => themeStore.updateManifest({ name: event.currentTarget.value })}
              class="theme-editor__input"
            />
          </div>
          <div class="theme-editor__field">
            <label class="theme-editor__label">Author</label>
            <input
              type="text"
              value={themeStore.activeTheme.manifest.author}
              disabled={themeStore.activeTheme.isBuiltin}
              onChange={(event) => themeStore.updateManifest({ author: event.currentTarget.value })}
              class="theme-editor__input"
            />
          </div>
        </div>

        <div class="theme-editor__checkbox-wrapper">
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

        <div class="theme-editor__colors">
          <For each={colorKeys}>
            {(key) => (
              <div class="theme-editor__color-row">
                <label class="theme-editor__label">{key}</label>
                <div class="theme-editor__color-input-group">
                  <input
                    type="color"
                    value={
                      themeStore.activeTheme.colors[key].startsWith("#")
                        ? themeStore.activeTheme.colors[key]
                        : "#000000"
                    }
                    onChange={(event) => themeStore.updateColor(key, event.currentTarget.value)}
                    class="theme-editor__color-picker"
                  />
                  <input
                    type="text"
                    value={themeStore.activeTheme.colors[key]}
                    onChange={(event) => themeStore.updateColor(key, event.currentTarget.value)}
                    class="theme-editor__color-text"
                  />
                </div>
              </div>
            )}
          </For>
        </div>

        <div class="theme-editor__footer">
          <button onClick={props.onClose} class="theme-editor__done-btn">
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
