import type { ScriptValue } from "@viwo/scripting";
import { createSignal } from "solid-js";

interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  author: string;
  created: number;
  script: ScriptValue<unknown>; // The ViwoScript for this workflow
  metadata: {
    version: string;
    tags: string[];
    thumbnail?: string;
  };
}

const STORAGE_KEY_PREFIX = "viwo:template:";
const TEMPLATES_INDEX_KEY = "viwo:templates:index";

/**
 * Workflow template management hook
 */
export function useTemplates() {
  const [templates, setTemplates] = createSignal<WorkflowTemplate[]>([]);

  // Load templates index from localStorage on initialization
  function loadTemplatesIndex(): string[] {
    try {
      const indexJson = localStorage.getItem(TEMPLATES_INDEX_KEY);
      return indexJson ? JSON.parse(indexJson) : [];
    } catch (error) {
      console.error("Failed to load templates index:", error);
      return [];
    }
  }

  // Save templates index to localStorage
  function saveTemplatesIndex(templateIds: string[]) {
    try {
      localStorage.setItem(TEMPLATES_INDEX_KEY, JSON.stringify(templateIds));
    } catch (error) {
      console.error("Failed to save templates index:", error);
    }
  }

  // Initialize templates from localStorage
  function initialize() {
    const templateIds = loadTemplatesIndex();
    const loadedTemplates: WorkflowTemplate[] = [];

    for (const id of templateIds) {
      const template = loadTemplate(id);
      if (template) {
        loadedTemplates.push(template);
      }
    }

    setTemplates(loadedTemplates);
  }

  /**
   * Save a new template
   */
  function saveTemplate(
    name: string,
    description: string,
    script: ScriptValue<unknown>,
    thumbnail?: string,
  ): string {
    const id = crypto.randomUUID();
    const template: WorkflowTemplate = {
      author: "user",
      created: Date.now(),
      description,
      id,
      metadata: {
        tags: [],
        version: "1.0",
        ...(thumbnail ? { thumbnail } : {}),
      },
      name,
      script,
    };

    try {
      localStorage.setItem(`${STORAGE_KEY_PREFIX}${id}`, JSON.stringify(template));

      // Update index
      const index = loadTemplatesIndex();
      index.push(id);
      saveTemplatesIndex(index);

      // Update state
      setTemplates([...templates(), template]);

      return id;
    } catch (error) {
      console.error("Failed to save template:", error);
      throw error;
    }
  }

  /**
   * Load a template by ID
   */
  function loadTemplate(id: string): WorkflowTemplate | null {
    try {
      const json = localStorage.getItem(`${STORAGE_KEY_PREFIX}${id}`);
      if (!json) {
        return null;
      }

      return JSON.parse(json) as WorkflowTemplate;
    } catch (error) {
      console.error(`Failed to load template ${id}:`, error);
      return null;
    }
  }

  /**
   * List all templates
   */
  function listTemplates(): WorkflowTemplate[] {
    return templates();
  }

  /**
   * Delete a template
   */
  function deleteTemplate(id: string): boolean {
    try {
      localStorage.removeItem(`${STORAGE_KEY_PREFIX}${id}`);

      // Update index
      const index = loadTemplatesIndex();
      const newIndex = index.filter((templateId) => templateId !== id);
      saveTemplatesIndex(newIndex);

      // Update state
      setTemplates(templates().filter((t) => t.id !== id));

      return true;
    } catch (error) {
      console.error(`Failed to delete template ${id}:`, error);
      return false;
    }
  }

  /**
   * Export a template as a JSON file
   */
  function exportTemplate(id: string): void {
    const template = loadTemplate(id);
    if (!template) {
      throw new Error(`Template ${id} not found`);
    }

    const json = JSON.stringify(template, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `${template.name.replaceAll(/\s+/g, "_")}.viwo-template.json`;
    a.click();

    URL.revokeObjectURL(url);
  }

  /**
   * Import a template from a JSON file
   */
  async function importTemplate(file: File): Promise<WorkflowTemplate> {
    try {
      const text = await file.text();
      const template = JSON.parse(text) as WorkflowTemplate;

      // Validate template
      if (!template.id || !template.name || !template.script || !template.metadata) {
        throw new Error("Invalid template format");
      }

      // Generate new ID to avoid conflicts
      const newId = crypto.randomUUID();
      const importedTemplate: WorkflowTemplate = {
        ...template,
        id: newId,
      };

      // Save to localStorage
      localStorage.setItem(`${STORAGE_KEY_PREFIX}${newId}`, JSON.stringify(importedTemplate));

      // Update index
      const index = loadTemplatesIndex();
      index.push(newId);
      saveTemplatesIndex(index);

      // Update state
      setTemplates([...templates(), importedTemplate]);

      return importedTemplate;
    } catch (error) {
      console.error("Failed to import template:", error);
      throw error;
    }
  }

  // Initialize on first use
  initialize();

  return {
    deleteTemplate,
    exportTemplate,
    importTemplate,
    listTemplates,
    loadTemplate,
    saveTemplate,
    templates,
  };
}
