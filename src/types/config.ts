/**
 * Configuration schema types
 */

import type { Backend } from './backend.js';
import type { GroupSchema, NodeSchema } from './schema.js';

/**
 * Mount definition in configuration
 */
export interface MountDef {
  path: string;
  groupSchema: string;
}

/**
 * Sidechain configuration schema
 */
export interface SidechainConfig {
  backend?: Backend;
  /** Base directory for resolving relative mount paths. Defaults to cwd. */
  rootDir?: string;
  mounts: Record<string, MountDef>;
  groupSchemas: Record<string, string | GroupSchema>;
  nodeSchemas: Record<string, string | NodeSchema>;
  nodeExtension?: string;
}
