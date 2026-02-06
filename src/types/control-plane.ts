/**
 * Control plane operations interface
 */

import type { GroupSchema, NodeSchema } from './schema.js';

/**
 * Mount entry in control plane
 */
export interface MountEntry {
  id: string;
  path: string;
  groupSchema: string;
}

/**
 * Store information
 */
export interface StoreInfo {
  mounts: MountEntry[];
  nodeExtension: string;
}

/**
 * Content type registry entry
 */
export interface ContentTypeEntry {
  id: string;
  description: string;
}

/**
 * Control plane operations interface
 */
export interface ControlPlane {
  /**
   * List all configured mounts
   */
  mounts(): Promise<MountEntry[]>;

  /**
   * List all registered schemas (returns schema IDs only)
   */
  listSchemas(): Promise<string[]>;

  /**
   * Get a specific schema by ID
   */
  getSchema(schemaId: string): Promise<NodeSchema | GroupSchema>;

  /**
   * Register a new schema
   */
  registerSchema(schema: NodeSchema | GroupSchema): Promise<void>;

  /**
   * Get store information
   */
  info(): Promise<StoreInfo>;

  /**
   * List all registered content types
   */
  listContentTypes(): Promise<ContentTypeEntry[]>;
}
