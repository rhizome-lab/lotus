import { createSignal } from "solid-js";

interface ImageEntityData {
  id: number;
  image: string;
  image_type: string;
  metadata: string;
  name: string;
}

/**
 * Hook for managing image entities
 * Provides functionality to load and query image entities from the viwo database
 */
export function useEntityImages(
  sendRpc: (method: string, params: any, signal?: AbortSignal) => Promise<any>,
) {
  const [entities, setEntities] = createSignal<ImageEntityData[]>([]);
  const [loading, setLoading] = createSignal(false);

  /**
   * Load all entities with an 'image' property
   * Note: This requires backend support for entity querying
   * Placeholder implementation - would need server-side query support
   */
  function loadImageEntities() {
    setLoading(true);
    try {
      // Placeholder - requires backend support for filtered entity queries
      console.warn("loadImageEntities: Backend support needed for entity querying");
      setEntities([]);
    } catch (error) {
      console.error("Failed to load image entities:", error);
    } finally {
      setLoading(false);
    }
  }

  /**
   * Load the image data for a specific entity
   * @param entityId - Entity ID to load image from
   * @returns Base64 image data URL
   */
  async function loadEntityImage(entityId: number): Promise<string> {
    try {
      // Call the get_data verb on the entity
      const result = await sendRpc("entity.verb", {
        args: [],
        entity: entityId,
        verb: "get_data",
      });
      return result;
    } catch (error) {
      console.error(`Failed to load image for entity ${entityId}:`, error);
      throw error;
    }
  }

  /**
   * Load metadata for a specific entity
   * @param entityId - Entity ID to load metadata from
   * @returns Parsed metadata object
   */
  async function loadEntityMetadata(entityId: number): Promise<Record<string, unknown>> {
    try {
      const result = await sendRpc("entity.verb", {
        args: [],
        entity: entityId,
        verb: "get_metadata",
      });
      return result;
    } catch (error) {
      console.error(`Failed to load metadata for entity ${entityId}:`, error);
      return {};
    }
  }

  return {
    entities,
    loadEntityImage,
    loadEntityMetadata,
    loadImageEntities,
    loading,
  };
}
