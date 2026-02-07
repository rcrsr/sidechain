/**
 * Item operations module
 * Covers: IR-4, IR-5, IR-6, IR-7
 * AC-6: Item operations exist in a separate module under src/core/
 * AC-7: StoreImpl.item delegates all 4 operations to extracted module
 * AC-8: Item module uses path resolution, section type, and token validation helpers
 */

import type { Backend, RawNode } from '../types/backend.js';
import type {
  ItemAddResult,
  ItemOps,
  ItemRemoveResult,
  ItemResponse,
  ItemUpdateResult,
} from '../types/item.js';
import type { TokenOpts } from '../types/metadata.js';
import type { NodeSchema } from '../types/schema.js';
import {
  NotFoundError,
  SectionNotFoundError,
  ValidationError,
} from './errors.js';
import {
  resolveNodePath,
  resolveSectionType,
  validateWriteToken,
} from './helpers/index.js';
import type { SchemaRegistry } from './schema.js';
import { generateNodeToken, generateSectionToken } from './tokens.js';

/**
 * Dependencies for item operations
 */
export interface ItemOperationsDeps {
  backend: Backend;
  registry: SchemaRegistry;
  tokenSalt: string;
  resolveGroupPath: (group: string) => Promise<string>;
}

/**
 * Create item operations implementation
 *
 * @param deps - Dependencies for item operations
 * @returns Object containing all 4 item operations
 */
export function createItemOperations(deps: ItemOperationsDeps): ItemOps {
  const { backend, registry, tokenSalt, resolveGroupPath } = deps;

  return {
    /**
     * Get a single item from a structured section
     * IR-4: item.get(path, section, item)
     * EC-7: Section not found
     * EC-8: Content not array
     * EC-9: Item not found
     */
    get: async (
      path: string,
      sectionId: string,
      itemId: string
    ): Promise<ItemResponse> => {
      // AC-8: Use IR-1 (path resolution)
      const { rawNode } = await resolveNodePath(
        path,
        backend,
        resolveGroupPath
      );

      // EC-7: Section not found
      const sectionContent = rawNode.sections[sectionId];
      if (sectionContent === undefined) {
        throw new SectionNotFoundError(
          `${path}/${sectionId}`,
          `Section '${sectionId}' not found in node`
        );
      }

      // Parse section content
      const content =
        typeof sectionContent === 'string'
          ? (JSON.parse(sectionContent) as unknown)
          : sectionContent;

      // EC-8: Content not array
      if (!Array.isArray(content)) {
        throw new ValidationError(
          `${path}/${sectionId}`,
          `Section content is not an array`
        );
      }

      // Find item by ID
      const item: unknown = content.find(
        (i: unknown) =>
          typeof i === 'object' &&
          i !== null &&
          (i as { id?: string }).id === itemId
      );

      // EC-9: Item not found
      if (item === undefined) {
        throw new NotFoundError(
          `${path}/${sectionId}/${itemId}`,
          `Item '${itemId}' not found in section`
        );
      }

      // Generate section token
      const sectionToken = generateSectionToken(sectionContent, tokenSalt);

      return {
        content: item,
        token: sectionToken,
      };
    },

    /**
     * Add a new item to a structured section
     * IR-5: item.add(path, section, data)
     * EC-7: Section not found
     * EC-8: Content not array
     * EC-10: Text section item add
     * EC-11: Duplicate item ID
     */
    add: async (
      path: string,
      sectionId: string,
      data: Record<string, unknown>
    ): Promise<ItemAddResult> => {
      // AC-8: Use IR-1 (path resolution)
      const { resolvedPath, slot, rawNode } = await resolveNodePath(
        path,
        backend,
        resolveGroupPath
      );

      // EC-7: Section not found
      const sectionContent = rawNode.sections[sectionId];
      if (sectionContent === undefined) {
        throw new SectionNotFoundError(
          `${path}/${sectionId}`,
          `Section '${sectionId}' not found in node`
        );
      }

      // Get node schema to determine section type
      const nodeSchemaId = rawNode.metadata['schema-id'];
      if (typeof nodeSchemaId !== 'string') {
        throw new ValidationError(path, `Missing schema-id in node metadata`);
      }

      const nodeSchema = registry.getSchema(nodeSchemaId) as NodeSchema;

      // AC-8: Use IR-2 (section type resolution)
      const sectionType = resolveSectionType(nodeSchema, sectionId);

      // EC-10: Text section item add
      if (sectionType === 'text') {
        throw new ValidationError(
          `${path}/${sectionId}`,
          `Cannot add item to text section`
        );
      }

      // Parse existing content
      const existingContent: unknown =
        typeof sectionContent === 'string'
          ? JSON.parse(sectionContent)
          : sectionContent;

      // EC-8: Content not array
      if (!Array.isArray(existingContent)) {
        throw new ValidationError(
          `${path}/${sectionId}`,
          `Section content is not an array`
        );
      }

      // Type assertion after validation
      const contentArray = existingContent as unknown[];

      // Generate ID if not provided
      const itemId =
        typeof data['id'] === 'string'
          ? data['id']
          : `item-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

      // EC-11: Duplicate item ID
      if (
        contentArray.some(
          (i: unknown) =>
            typeof i === 'object' &&
            i !== null &&
            (i as { id?: string }).id === itemId
        )
      ) {
        throw new ValidationError(
          `${path}/${sectionId}/${itemId}`,
          `Item with id '${itemId}' already exists`
        );
      }

      // Add item to content
      const newContent = [...contentArray, { ...data, id: itemId }];

      // Serialize content
      const serializedContent = JSON.stringify(newContent);

      // Update node
      const updatedNode: RawNode = {
        metadata: rawNode.metadata,
        sections: {
          ...rawNode.sections,
          [sectionId]: serializedContent,
        },
      };

      // Write updated node
      await backend.writeNode(resolvedPath, slot, updatedNode);

      // Generate new tokens
      const newSectionToken = generateSectionToken(
        serializedContent,
        tokenSalt
      );
      const newNodeToken = generateNodeToken(updatedNode, tokenSalt);

      return {
        ok: true,
        path: `${path}/${sectionId}/${itemId}`,
        item: itemId,
        token: newSectionToken,
        nodeToken: newNodeToken,
      };
    },

    /**
     * Update an existing item in a structured section
     * IR-6: item.update(path, section, item, fields, opts?)
     * EC-7: Section not found
     * EC-8: Content not array
     * EC-9: Item not found
     * EC-12: Stale token on update
     */
    update: async (
      path: string,
      sectionId: string,
      itemId: string,
      fields: Record<string, unknown>,
      opts?: TokenOpts
    ): Promise<ItemUpdateResult> => {
      // AC-8: Use IR-1 (path resolution)
      const { resolvedPath, slot, rawNode } = await resolveNodePath(
        path,
        backend,
        resolveGroupPath
      );

      // EC-7: Section not found
      const sectionContent = rawNode.sections[sectionId];
      if (sectionContent === undefined) {
        throw new SectionNotFoundError(
          `${path}/${sectionId}`,
          `Section '${sectionId}' not found in node`
        );
      }

      // AC-8: Use IR-3 (token validation)
      validateWriteToken(rawNode, opts, path, tokenSalt, sectionId);

      // Parse existing content
      const existingContent: unknown =
        typeof sectionContent === 'string'
          ? JSON.parse(sectionContent)
          : sectionContent;

      // EC-8: Content not array
      if (!Array.isArray(existingContent)) {
        throw new ValidationError(
          `${path}/${sectionId}`,
          `Section content is not an array`
        );
      }

      // Type assertion after validation
      const contentArray = existingContent as unknown[];

      // Find item index
      const itemIndex = contentArray.findIndex(
        (i: unknown) =>
          typeof i === 'object' &&
          i !== null &&
          (i as { id?: string }).id === itemId
      );

      // EC-9: Item not found
      if (itemIndex === -1) {
        throw new NotFoundError(
          `${path}/${sectionId}/${itemId}`,
          `Item '${itemId}' not found in section`
        );
      }

      const existingItem: unknown = contentArray[itemIndex];

      // Update item - merge existing with updates
      const updatedItem =
        typeof existingItem === 'object' && existingItem !== null
          ? { ...(existingItem as Record<string, unknown>), ...fields }
          : { ...fields };
      const newContent = [...contentArray];
      newContent[itemIndex] = updatedItem;

      // Serialize content
      const serializedContent = JSON.stringify(newContent);

      // Update node
      const updatedNode: RawNode = {
        metadata: rawNode.metadata,
        sections: {
          ...rawNode.sections,
          [sectionId]: serializedContent,
        },
      };

      // Write updated node
      await backend.writeNode(resolvedPath, slot, updatedNode);

      // Generate new tokens
      const newSectionToken = generateSectionToken(
        serializedContent,
        tokenSalt
      );
      const newNodeToken = generateNodeToken(updatedNode, tokenSalt);

      return {
        ok: true,
        path: `${path}/${sectionId}/${itemId}`,
        item: itemId,
        previous: existingItem,
        token: newSectionToken,
        nodeToken: newNodeToken,
      };
    },

    /**
     * Remove an item from a structured section
     * IR-7: item.remove(path, section, item)
     * EC-7: Section not found
     * EC-8: Content not array
     * EC-9: Item not found
     */
    remove: async (
      path: string,
      sectionId: string,
      itemId: string
    ): Promise<ItemRemoveResult> => {
      // AC-8: Use IR-1 (path resolution)
      const { resolvedPath, slot, rawNode } = await resolveNodePath(
        path,
        backend,
        resolveGroupPath
      );

      // EC-7: Section not found
      const sectionContent = rawNode.sections[sectionId];
      if (sectionContent === undefined) {
        throw new SectionNotFoundError(
          `${path}/${sectionId}`,
          `Section '${sectionId}' not found in node`
        );
      }

      // Parse existing content
      const existingContent: unknown =
        typeof sectionContent === 'string'
          ? JSON.parse(sectionContent)
          : sectionContent;

      // EC-8: Content not array
      if (!Array.isArray(existingContent)) {
        throw new ValidationError(
          `${path}/${sectionId}`,
          `Section content is not an array`
        );
      }

      // Find item index
      const itemIndex = existingContent.findIndex(
        (i: unknown) =>
          typeof i === 'object' &&
          i !== null &&
          (i as { id?: string }).id === itemId
      );

      // EC-9: Item not found
      if (itemIndex === -1) {
        throw new NotFoundError(
          `${path}/${sectionId}/${itemId}`,
          `Item '${itemId}' not found in section`
        );
      }

      // Remove item
      const newContent = existingContent.filter(
        (i: unknown) =>
          typeof i === 'object' &&
          i !== null &&
          (i as { id?: string }).id !== itemId
      );

      // Serialize content
      const serializedContent = JSON.stringify(newContent);

      // Update node
      const updatedNode: RawNode = {
        metadata: rawNode.metadata,
        sections: {
          ...rawNode.sections,
          [sectionId]: serializedContent,
        },
      };

      // Write updated node
      await backend.writeNode(resolvedPath, slot, updatedNode);

      return {
        ok: true,
        path: `${path}/${sectionId}/${itemId}`,
      };
    },
  };
}
