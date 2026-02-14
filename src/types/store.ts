/**
 * Store interface - root container for all operations
 * Provides list, exists, get, createGroup, deleteGroup, describeGroup, validateGroup, meta, setMeta
 */

import type { ItemOps } from './item.js';
import type { MetaReadResult, MetaResult, TokenOpts } from './metadata.js';
import type { SchemaDescription, ValidationResult } from './schema.js';
import type {
  PopulateData,
  SectionResponse,
  SectionSummary,
} from './section.js';

/**
 * Group entry returned by list operation
 */
export interface GroupEntry {
  id: string;
  schema: string;
}

/**
 * Node slot entry within a group
 */
export interface SlotEntry {
  id: string;
  schema: string;
  description?: string;
  empty: boolean;
}

/**
 * Complete node response including metadata, sections, and token
 */
export interface NodeResponse {
  metadata: Record<string, unknown>;
  sections: SectionResponse[];
  token: string;
}

/**
 * Result wrapper for group operations
 */
export interface GroupResult {
  address: string;
  schema: string;
}

/**
 * Generic result type for operations that can fail
 */
export type Result<T> =
  | { ok: true; value: T }
  | { ok: false; error: string; message: string };

/**
 * Group description including slots and schema
 */
export interface GroupDescription {
  address: string;
  schema: string;
  slots: SlotEntry[];
}

/**
 * Validation result for a group
 */
export interface GroupValidation {
  valid: boolean;
  errors: {
    slot: string;
    path: string;
    message: string;
  }[];
}

/**
 * Store interface - main entry point for all storage operations
 */
export interface Store {
  /**
   * List all groups the client has addresses for
   */
  list(): Promise<GroupEntry[]>;

  /**
   * List all slots within a group
   */
  list(group: string): Promise<SlotEntry[]>;

  /**
   * Check if a path exists
   */
  exists(path: string): Promise<boolean>;

  /**
   * Get a complete node (metadata + all sections)
   */
  get(path: string): Promise<NodeResponse>;

  /**
   * Create a new group with the specified schema
   * Returns the cryptographic address and schema ID
   */
  createGroup(
    schemaId: string,
    opts?: { client: string; name?: string }
  ): Promise<GroupResult>;

  /**
   * Delete a group and all its contents
   */
  deleteGroup(groupAddress: string): Promise<Result<void>>;

  /**
   * Get group metadata (_meta.json)
   */
  getGroupMeta(groupAddress: string): Promise<{
    schema: string;
    name: string | null;
    client: string;
    created: string;
  }>;

  /**
   * Describe a group's structure (schema and slots)
   */
  describeGroup(groupAddress: string): Promise<GroupDescription>;

  /**
   * Validate all nodes in a group against their schemas
   */
  validateGroup(groupAddress: string): Promise<GroupValidation>;

  /**
   * Read all metadata fields with token
   * IR-8: meta(path)
   */
  meta(
    path: string
  ): Promise<{ metadata: Record<string, unknown>; token: string }>;

  /**
   * Read a single metadata field with token
   * IR-9: meta(path, field)
   */
  meta(path: string, field: string): Promise<MetaReadResult>;

  /**
   * Set a single metadata field with optional token
   * IR-10: setMeta(path, field, value, opts?)
   */
  setMeta(
    path: string,
    field: string,
    value: unknown,
    opts?: TokenOpts
  ): Promise<MetaResult>;

  /**
   * Set multiple metadata fields with optional token
   * IR-11: setMeta(path, fields, opts?)
   */
  setMeta(
    path: string,
    fields: Record<string, unknown>,
    opts?: TokenOpts
  ): Promise<MetaResult>;

  /**
   * List all sections in a node
   * IR-12: sections(path)
   */
  sections(path: string): Promise<SectionSummary[]>;

  /**
   * Read a single section with token
   * IR-13: section(path, section)
   */
  section(path: string, sectionId: string): Promise<SectionResponse>;

  /**
   * Write/replace a section's content with optional token
   * IR-14: writeSection(path, section, content, opts?)
   */
  writeSection(
    path: string,
    sectionId: string,
    content: unknown,
    opts?: TokenOpts
  ): Promise<{ ok: true; path: string; token: string; nodeToken: string }>;

  /**
   * Append content to a section with optional token
   * IR-15: appendSection(path, section, content, opts?)
   */
  appendSection(
    path: string,
    sectionId: string,
    content: string,
    opts?: TokenOpts
  ): Promise<{ ok: true; path: string; token: string; nodeToken: string }>;

  /**
   * Add a new dynamic section
   * IR-16: addSection(path, def)
   */
  addSection(
    path: string,
    def: { id: string; type: string; after?: string }
  ): Promise<{ ok: true; path: string }>;

  /**
   * Remove a section from node
   * IR-17: removeSection(path, section)
   */
  removeSection(
    path: string,
    sectionId: string
  ): Promise<{ ok: true; path: string }>;

  /**
   * Populate multiple sections atomically with optional token
   * IR-18: populate(path, data, opts?)
   */
  populate(
    path: string,
    data: PopulateData,
    opts?: TokenOpts
  ): Promise<{
    ok: true;
    path: string;
    sections: number;
    metadata: number;
    token: string;
  }>;

  /**
   * Item operations for structured section content
   * IR-19, IR-20, IR-21, IR-22
   */
  item: ItemOps;

  /**
   * Describe a node's schema structure
   * IR-23: describe(schemaOrPath)
   */
  describe(schemaOrPath: string): Promise<SchemaDescription>;

  /**
   * Validate a node against its schema
   * IR-24: validate(path)
   */
  validate(path: string): Promise<ValidationResult>;
}
