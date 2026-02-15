/**
 * Store implementation - main entry point for all storage operations
 * Covers: IR-1, IR-2, IR-3, IR-4, IR-5, IR-6, IR-7, IR-34, IR-35, IR-36, IR-37, IR-38, IR-39
 * AC-1, AC-2, AC-3, AC-4, AC-5, AC-6, AC-7, AC-8, AC-9, AC-26, AC-31
 * EC-1, EC-2, EC-10
 */

import * as path from 'node:path';

import { DEFAULT_NODE_EXTENSION } from '../shared/constants.js';
import type { Backend, GroupMeta, RawNode, SlotDef } from '../types/backend.js';
import type { SidechainConfig } from '../types/config.js';
import type {
  ContentTypeEntry,
  ControlPlane,
  MountEntry,
  StoreInfo,
} from '../types/control-plane.js';
import type {
  MetaReadResult,
  MetaResult,
  TokenOpts,
} from '../types/metadata.js';
import type { GroupSchema, NodeSchema } from '../types/schema.js';
import type {
  PopulateData,
  SectionResponse,
  SectionSummary,
} from '../types/section.js';
import type {
  CreateGroupOptions,
  GroupDescription,
  GroupEntry,
  GroupResult,
  GroupValidation,
  NodeResponse,
  Result,
  SlotEntry,
  Store,
} from '../types/store.js';
import { generateGroupAddress, isValidGroupAddress } from './addressing.js';
import {
  InvalidSchemaError,
  NotFoundError,
  SectionNotFoundError,
  StaleTokenError,
  ValidationError,
} from './errors.js';
import {
  resolveNodePath,
  resolveSectionType,
  validateWriteToken,
} from './helpers/index.js';
import { createItemOperations } from './items.js';
import {
  matchDynamicPattern,
  SchemaRegistry,
  validateDynamicSectionId,
  validateDynamicSectionMin,
  validateMetadata,
} from './schema.js';
import {
  generateNodeToken,
  generateSalt as generateTokenSalt,
  generateSectionToken,
} from './tokens.js';

/**
 * Store implementation class
 */
class StoreImpl implements Store, ControlPlane {
  private readonly backend: Backend;
  private readonly registry: SchemaRegistry;
  private readonly mountsMap: Map<string, MountEntry>;
  private readonly groupToMount: Map<string, string>;
  private readonly nodeExtension: string;
  private readonly tokenSalt: string;

  // AC-7: StoreImpl.item delegates all 4 operations to extracted module
  readonly item: ReturnType<typeof createItemOperations>;

  constructor(
    backend: Backend,
    registry: SchemaRegistry,
    mounts: MountEntry[],
    nodeExtension: string,
    tokenSalt: string
  ) {
    this.backend = backend;
    this.registry = registry;
    this.nodeExtension = nodeExtension;
    this.tokenSalt = tokenSalt;

    this.mountsMap = new Map();
    this.groupToMount = new Map();

    for (const mount of mounts) {
      this.mountsMap.set(mount.id, mount);
    }

    // AC-7: Initialize item operations with dependencies
    this.item = createItemOperations({
      backend: this.backend,
      registry: this.registry,
      tokenSalt: this.tokenSalt,
      resolveGroupPath: this.resolveGroupPath.bind(this),
    });
  }

  /**
   * List all groups or slots within a group
   * IR-1: list(group?: string)
   * AC-7: list() returns only groups client has addresses for
   * AC-8: list(group) returns slot summaries with empty flag
   */
  async list(): Promise<GroupEntry[]>;
  async list(group: string): Promise<SlotEntry[]>;
  async list(group?: string): Promise<GroupEntry[] | SlotEntry[]> {
    if (group === undefined) {
      // List all groups across mounts
      const allGroups: GroupEntry[] = [];

      for (const mount of this.mountsMap.values()) {
        const backendGroups = await this.backend.listGroups(mount.path);

        for (const backendGroup of backendGroups) {
          // Cache group-to-mount mapping for subsequent operations
          this.groupToMount.set(backendGroup.id, mount.id);

          allGroups.push({
            id: backendGroup.id,
            schema: mount.groupSchema,
          });
        }
      }

      return allGroups;
    }

    // List slots within a group
    if (!isValidGroupAddress(group)) {
      throw new NotFoundError(group, `Invalid group address: ${group}`);
    }

    // Verify group exists
    const resolvedPath = await this.resolveGroupPath(group);
    const groupSchema = this.getGroupSchemaForGroup(group);

    const slots: SlotEntry[] = await Promise.all(
      groupSchema.slots.map(async (slotDef): Promise<SlotEntry> => {
        const nodeExists = await this.backend.exists(resolvedPath, slotDef.id);
        let empty = true;
        if (nodeExists) {
          const rawNode = await this.backend.readNode(resolvedPath, slotDef.id);
          empty = Object.keys(rawNode.sections).length === 0;
        }
        return {
          id: slotDef.id,
          schema: slotDef.schema,
          empty,
          ...(slotDef.description !== undefined && {
            description: slotDef.description,
          }),
        };
      })
    );

    return slots;
  }

  /**
   * Check if a path exists
   * IR-2: exists(path)
   */
  async exists(path: string): Promise<boolean> {
    const parts = path.split('/').filter((p) => p.length > 0);

    if (parts.length === 0) {
      return false;
    }

    const group = parts[0];
    if (group === undefined || !isValidGroupAddress(group)) {
      return false;
    }

    try {
      const resolvedPath = await this.resolveGroupPath(group);

      if (parts.length === 1) {
        // Check group existence
        return await this.backend.exists(resolvedPath);
      }

      const slot = parts[1];
      if (slot === undefined) {
        return false;
      }

      // Check slot existence
      return await this.backend.exists(resolvedPath, slot);
    } catch {
      return false;
    }
  }

  /**
   * Get a complete node (metadata + all sections)
   * IR-3: get(path)
   * AC-9: get(path) returns node with metadata, sections, empty flag, token
   * EC-10: Group or slot does not exist
   */
  async get(path: string): Promise<NodeResponse> {
    const { rawNode } = await resolveNodePath(
      path,
      this.backend,
      this.resolveGroupPath.bind(this)
    );

    // Get node schema
    const nodeSchemaId = rawNode.metadata['schema-id'];
    if (typeof nodeSchemaId !== 'string') {
      throw new ValidationError(path, `Missing schema-id in node metadata`);
    }

    const nodeSchema = this.registry.getSchema(nodeSchemaId) as NodeSchema;

    // Convert sections to SectionResponse format
    const sections: SectionResponse[] = [];
    for (const [sectionId, content] of Object.entries(rawNode.sections)) {
      // Determine section type from schema
      const sectionType = resolveSectionType(nodeSchema, sectionId);

      // Generate section token
      const sectionToken = this.generateSectionToken(content);

      sections.push({
        id: sectionId,
        type: sectionType,
        content,
        token: sectionToken,
      });
    }

    // Generate node token covering all metadata + sections
    const nodeContent = {
      metadata: rawNode.metadata,
      sections: rawNode.sections,
    };
    const nodeToken = generateNodeToken(nodeContent, this.tokenSalt);

    return {
      metadata: rawNode.metadata,
      sections,
      token: nodeToken,
    };
  }

  /**
   * Create a new group with the specified schema
   * IR-3: createGroup(schemaId, opts)
   * AC-4: createGroup materializes all slots with defaults
   * AC-5: createGroup on existing group returns existing (idempotent)
   * AC-17, AC-18: createGroup with opts requires client, includes in metadata
   * EC-3: Empty client throws InvalidSchemaError
   */
  async createGroup(
    schemaId: string,
    opts: CreateGroupOptions
  ): Promise<GroupResult> {
    // EC-3: Validate client is non-empty after trimming
    if (opts.client.trim() === '') {
      throw new InvalidSchemaError(
        'client must be non-empty in opts for createGroup',
        { schemaId }
      );
    }

    // Get group schema
    const groupSchema = this.registry.getSchema(schemaId);

    if (!('slots' in groupSchema)) {
      throw new InvalidSchemaError(
        `Schema '${schemaId}' is not a group schema`,
        { schemaId }
      );
    }

    // Generate cryptographic address
    const salt = generateTokenSalt();
    const address = generateGroupAddress(schemaId, salt);

    // Find mount for this schema
    const mount = this.findMountForSchema(schemaId);
    if (mount === undefined) {
      throw new InvalidSchemaError(
        `No mount configured for group schema: ${schemaId}`,
        { schemaId }
      );
    }

    const resolvedPath = `${mount.path}/${address}`;

    // Check if group already exists (idempotent)
    const groupExists = await this.backend.exists(resolvedPath);
    if (groupExists) {
      return { address, schema: schemaId };
    }

    // Create group with all slots
    const slots: SlotDef[] = groupSchema.slots.map(
      (slot): SlotDef => ({
        id: slot.id,
        schema: slot.schema,
        ...(slot.description !== undefined && {
          description: slot.description,
        }),
      })
    );

    // IR-3: Build GroupMeta object
    const meta: GroupMeta = {
      schema: schemaId,
      name: opts.name ?? null,
      client: opts.client,
      created: new Date().toISOString(),
    };

    await this.backend.createGroup(resolvedPath, slots, meta);

    // Track group-to-mount mapping
    this.groupToMount.set(address, mount.id);

    return { address, schema: schemaId };
  }

  /**
   * Delete a group and all its contents
   * IR-5: deleteGroup(id)
   * AC-6: deleteGroup removes group and slots
   * AC-31: Delete locked group fails with locked node citation
   * EC-1: Group does not exist
   * EC-2: Group contains locked nodes
   */
  async deleteGroup(groupAddress: string): Promise<Result<void>> {
    if (!isValidGroupAddress(groupAddress)) {
      throw new NotFoundError(
        groupAddress,
        `Invalid group address: ${groupAddress}`
      );
    }

    const resolvedPath = await this.resolveGroupPath(groupAddress);

    // EC-1: Check if group exists
    const groupExists = await this.backend.exists(resolvedPath);
    if (!groupExists) {
      throw new NotFoundError(
        groupAddress,
        `Group does not exist: ${groupAddress}`
      );
    }

    // EC-2: Check for locked nodes
    const groupSchema = this.getGroupSchemaForGroup(groupAddress);

    for (const slotDef of groupSchema.slots) {
      const nodeExists = await this.backend.exists(resolvedPath, slotDef.id);
      if (!nodeExists) {
        continue;
      }

      const rawNode = await this.backend.readNode(resolvedPath, slotDef.id);
      const locked = rawNode.metadata['locked'];

      if (locked === true) {
        throw new ValidationError(
          `${groupAddress}/${slotDef.id}`,
          `Cannot delete group: node '${slotDef.id}' is locked`,
          groupSchema['schema-id']
        );
      }
    }

    // Delete group
    await this.backend.deleteGroup(resolvedPath);

    // Remove mapping
    this.groupToMount.delete(groupAddress);

    return { ok: true, value: undefined };
  }

  /**
   * Get group metadata (_meta.json)
   * Returns schema, name, client, and created timestamp
   */
  async getGroupMeta(groupAddress: string): Promise<{
    schema: string;
    name: string | null;
    client: string;
    created: string;
  }> {
    if (!isValidGroupAddress(groupAddress)) {
      throw new NotFoundError(
        groupAddress,
        `Invalid group address: ${groupAddress}`
      );
    }

    const resolvedPath = await this.resolveGroupPath(groupAddress);
    const meta = await this.backend.readGroupMeta(resolvedPath);

    return {
      schema: meta.schema,
      name: meta.name,
      client: meta.client,
      created: meta.created,
    };
  }

  /**
   * Describe a group's structure (schema and slots)
   * IR-6: describeGroup(schemaOrGroup)
   */
  async describeGroup(groupAddress: string): Promise<GroupDescription> {
    if (!isValidGroupAddress(groupAddress)) {
      throw new NotFoundError(
        groupAddress,
        `Invalid group address: ${groupAddress}`
      );
    }

    const resolvedPath = await this.resolveGroupPath(groupAddress);
    const groupSchema = this.getGroupSchemaForGroup(groupAddress);

    const slots: SlotEntry[] = await Promise.all(
      groupSchema.slots.map(async (slotDef): Promise<SlotEntry> => {
        const nodeExists = await this.backend.exists(resolvedPath, slotDef.id);
        let empty = true;
        if (nodeExists) {
          const rawNode = await this.backend.readNode(resolvedPath, slotDef.id);
          empty = Object.keys(rawNode.sections).length === 0;
        }
        return {
          id: slotDef.id,
          schema: slotDef.schema,
          empty,
          ...(slotDef.description !== undefined && {
            description: slotDef.description,
          }),
        };
      })
    );

    return {
      address: groupAddress,
      schema: groupSchema['schema-id'],
      slots,
    };
  }

  /**
   * Validate all nodes in a group against their schemas
   * IR-7: validateGroup(group)
   */
  async validateGroup(groupAddress: string): Promise<GroupValidation> {
    if (!isValidGroupAddress(groupAddress)) {
      throw new NotFoundError(
        groupAddress,
        `Invalid group address: ${groupAddress}`
      );
    }

    const resolvedPath = await this.resolveGroupPath(groupAddress);
    const groupSchema = this.getGroupSchemaForGroup(groupAddress);

    const errors: {
      slot: string;
      path: string;
      message: string;
    }[] = [];

    for (const slotDef of groupSchema.slots) {
      const nodeExists = await this.backend.exists(resolvedPath, slotDef.id);
      if (!nodeExists) {
        errors.push({
          slot: slotDef.id,
          path: `${groupAddress}/${slotDef.id}`,
          message: `Node does not exist`,
        });
        continue;
      }

      try {
        const rawNode = await this.backend.readNode(resolvedPath, slotDef.id);
        const nodeSchema = this.registry.getSchema(
          slotDef.schema
        ) as NodeSchema;

        // Validate metadata
        validateMetadata(
          rawNode.metadata,
          nodeSchema,
          `${groupAddress}/${slotDef.id}`
        );

        // Validate required sections
        if (nodeSchema.sections?.required !== undefined) {
          for (const requiredSection of nodeSchema.sections.required) {
            if (!(requiredSection.id in rawNode.sections)) {
              errors.push({
                slot: slotDef.id,
                path: `${groupAddress}/${slotDef.id}/${requiredSection.id}`,
                message: `Required section '${requiredSection.id}' is missing`,
              });
            }
          }
        }

        // Validate dynamic section minimum counts
        if (nodeSchema.sections?.dynamic !== undefined) {
          const sectionIds = Object.keys(rawNode.sections);
          for (const dynamicDef of nodeSchema.sections.dynamic) {
            try {
              validateDynamicSectionMin(
                sectionIds,
                dynamicDef,
                `${groupAddress}/${slotDef.id}`
              );
            } catch (error) {
              if (error instanceof ValidationError) {
                errors.push({
                  slot: slotDef.id,
                  path: error.path,
                  message: error.message,
                });
              } else {
                throw error;
              }
            }
          }
        }
      } catch (error) {
        if (error instanceof ValidationError) {
          errors.push({
            slot: slotDef.id,
            path: error.path,
            message: error.message,
          });
        } else {
          throw error;
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Read all metadata fields with token
   * IR-8: meta(path)
   * Returns all metadata for a node with token
   */
  async meta(
    path: string
  ): Promise<{ metadata: Record<string, unknown>; token: string }>;
  /**
   * Read a single metadata field with token
   * IR-9: meta(path, field)
   * Path format: <group>/<slot> with field name, or <group>/<slot>/@meta/<field>
   */
  async meta(path: string, field: string): Promise<MetaReadResult>;
  async meta(
    path: string,
    field?: string
  ): Promise<
    { metadata: Record<string, unknown>; token: string } | MetaReadResult
  > {
    const { rawNode } = await resolveNodePath(
      path,
      this.backend,
      this.resolveGroupPath.bind(this)
    );

    // Generate node token for metadata
    const nodeContent = {
      metadata: rawNode.metadata,
      sections: rawNode.sections,
    };
    const nodeToken = generateNodeToken(nodeContent, this.tokenSalt);

    if (field === undefined) {
      // Return all metadata
      return {
        metadata: rawNode.metadata,
        token: nodeToken,
      };
    }

    // Return single field
    const value = rawNode.metadata[field];
    return {
      value,
      token: nodeToken,
    };
  }

  /**
   * Set a single metadata field with optional token
   * IR-10: setMeta(path, field, value, opts?)
   * EC-9: Value fails schema constraint
   * EC-12: Stale token
   * AC-16: Required metadata fields enforced on every write
   */
  async setMeta(
    path: string,
    field: string,
    value: unknown,
    opts?: TokenOpts
  ): Promise<MetaResult>;
  /**
   * Set multiple metadata fields with optional token
   * IR-11: setMeta(path, fields, opts?)
   * EC-9: Value fails schema constraint
   * EC-12: Stale token
   * AC-16: Required metadata fields enforced on every write
   */
  async setMeta(
    path: string,
    fields: Record<string, unknown>,
    opts?: TokenOpts
  ): Promise<MetaResult>;
  async setMeta(
    path: string,
    fieldOrFields: string | Record<string, unknown>,
    valueOrOpts?: unknown,
    optsOrUndefined?: TokenOpts
  ): Promise<MetaResult> {
    const { resolvedPath, slot, rawNode } = await resolveNodePath(
      path,
      this.backend,
      this.resolveGroupPath.bind(this)
    );

    // Determine if single field or multiple fields
    let fieldsToUpdate: Record<string, unknown>;
    let opts: TokenOpts | undefined;
    let previousValues: unknown;

    if (typeof fieldOrFields === 'string') {
      // Single field: setMeta(path, field, value, opts?)
      fieldsToUpdate = { [fieldOrFields]: valueOrOpts };
      previousValues = rawNode.metadata[fieldOrFields];
      opts = optsOrUndefined;
    } else {
      // Multiple fields: setMeta(path, fields, opts?)
      fieldsToUpdate = fieldOrFields;
      previousValues = Object.fromEntries(
        Object.keys(fieldOrFields).map((k) => [k, rawNode.metadata[k]])
      );
      opts = valueOrOpts as TokenOpts | undefined;
    }

    // Token validation (EC-12)
    validateWriteToken(rawNode, opts, path, this.tokenSalt);

    // Get node schema for validation
    const nodeSchemaId = rawNode.metadata['schema-id'];
    if (typeof nodeSchemaId !== 'string') {
      throw new ValidationError(path, `Missing schema-id in node metadata`);
    }

    const nodeSchema = this.registry.getSchema(nodeSchemaId) as NodeSchema;

    // Create updated metadata by merging
    const updatedMetadata = { ...rawNode.metadata };
    for (const [fieldId, fieldValue] of Object.entries(fieldsToUpdate)) {
      updatedMetadata[fieldId] = fieldValue;
    }

    // Validate updated metadata against schema (EC-9, AC-16)
    validateMetadata(updatedMetadata, nodeSchema, path);

    // Write updated node
    const updatedNode = {
      metadata: updatedMetadata,
      sections: rawNode.sections,
    };

    await this.backend.writeNode(resolvedPath, slot, updatedNode);

    // Generate new token
    const newToken = generateNodeToken(updatedNode, this.tokenSalt);

    return {
      ok: true,
      path,
      value: fieldsToUpdate,
      previous: previousValues,
      token: newToken,
    };
  }

  /**
   * List all sections in a node
   * IR-12: sections(path)
   */
  async sections(path: string): Promise<SectionSummary[]> {
    const { rawNode } = await resolveNodePath(
      path,
      this.backend,
      this.resolveGroupPath.bind(this)
    );

    // Get node schema
    const nodeSchemaId = rawNode.metadata['schema-id'];
    if (typeof nodeSchemaId !== 'string') {
      throw new ValidationError(path, `Missing schema-id in node metadata`);
    }

    const nodeSchema = this.registry.getSchema(nodeSchemaId) as NodeSchema;

    // Build section summaries
    const summaries: SectionSummary[] = [];

    for (const [sectionId, content] of Object.entries(rawNode.sections)) {
      // Determine section type from schema
      const sectionType = resolveSectionType(nodeSchema, sectionId);

      const summary: SectionSummary = {
        id: sectionId,
        type: sectionType,
      };

      // Add item count for list types
      if (Array.isArray(content)) {
        summary.itemCount = content.length;
      }

      summaries.push(summary);
    }

    return summaries;
  }

  /**
   * Read a single section with token
   * IR-13: section(path, section)
   * EC-11: Section ID not present
   */
  async section(path: string, sectionId: string): Promise<SectionResponse> {
    const { rawNode } = await resolveNodePath(
      path,
      this.backend,
      this.resolveGroupPath.bind(this)
    );

    // Check if section exists
    const content = rawNode.sections[sectionId];
    if (content === undefined) {
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

    const nodeSchema = this.registry.getSchema(nodeSchemaId) as NodeSchema;

    // Determine section type
    const sectionType = resolveSectionType(nodeSchema, sectionId);

    // Generate section token
    const sectionToken = generateSectionToken(content, this.tokenSalt);

    return {
      id: sectionId,
      type: sectionType,
      content,
      token: sectionToken,
    };
  }

  /**
   * Write/replace a section's content with optional token
   * IR-14: writeSection(path, section, content, opts?)
   * EC-9: Value fails schema constraint
   * EC-11: Section ID not present
   * EC-12: Stale token
   * AC-10: writeSection with valid token succeeds
   * AC-11: writeSection with stale token throws STALE_TOKEN
   */
  async writeSection(
    path: string,
    sectionId: string,
    content: unknown,
    opts?: TokenOpts
  ): Promise<{ ok: true; path: string; token: string; nodeToken: string }> {
    const { resolvedPath, slot, rawNode } = await resolveNodePath(
      path,
      this.backend,
      this.resolveGroupPath.bind(this)
    );

    // Check if section exists
    if (!(sectionId in rawNode.sections)) {
      throw new SectionNotFoundError(
        `${path}/${sectionId}`,
        `Section '${sectionId}' not found in node`
      );
    }

    // Token validation (EC-12, AC-10, AC-11)
    validateWriteToken(rawNode, opts, path, this.tokenSalt, sectionId);

    // Update section content
    // Content must be serialized to string for backend
    const serializedContent =
      typeof content === 'string' ? content : JSON.stringify(content);

    const updatedNode: RawNode = {
      metadata: rawNode.metadata,
      sections: {
        ...rawNode.sections,
        [sectionId]: serializedContent,
      },
    };

    // Write updated node
    await this.backend.writeNode(resolvedPath, slot, updatedNode);

    // Generate new tokens
    const newSectionToken = generateSectionToken(
      serializedContent,
      this.tokenSalt
    );
    const newNodeToken = generateNodeToken(updatedNode, this.tokenSalt);

    return {
      ok: true,
      path: `${path}/${sectionId}`,
      token: newSectionToken,
      nodeToken: newNodeToken,
    };
  }

  /**
   * Append content to a section with optional token
   * IR-15: appendSection(path, section, content, opts?)
   * Only valid for text content type
   */
  async appendSection(
    path: string,
    sectionId: string,
    content: string,
    opts?: TokenOpts
  ): Promise<{ ok: true; path: string; token: string; nodeToken: string }> {
    const { resolvedPath, slot, rawNode } = await resolveNodePath(
      path,
      this.backend,
      this.resolveGroupPath.bind(this)
    );

    // Check if section exists
    if (!(sectionId in rawNode.sections)) {
      throw new SectionNotFoundError(
        `${path}/${sectionId}`,
        `Section '${sectionId}' not found in node`
      );
    }

    const currentContent = rawNode.sections[sectionId];

    // Validate that current content is text
    if (typeof currentContent !== 'string') {
      throw new ValidationError(
        `${path}/${sectionId}`,
        `appendSection only valid for text content, got ${typeof currentContent}`
      );
    }

    // Token validation
    validateWriteToken(rawNode, opts, path, this.tokenSalt, sectionId);

    // Append to content
    const newContent = currentContent + content;

    // Update section content
    const updatedNode: RawNode = {
      metadata: rawNode.metadata,
      sections: {
        ...rawNode.sections,
        [sectionId]: newContent,
      },
    };

    // Write updated node
    await this.backend.writeNode(resolvedPath, slot, updatedNode);

    // Generate new tokens
    const newSectionToken = generateSectionToken(newContent, this.tokenSalt);
    const newNodeToken = generateNodeToken(updatedNode, this.tokenSalt);

    return {
      ok: true,
      path: `${path}/${sectionId}`,
      token: newSectionToken,
      nodeToken: newNodeToken,
    };
  }

  /**
   * Add a new dynamic section
   * IR-16: addSection(path, def)
   * AC-13: addSection validates ID against schema dynamic patterns
   * AC-14: addSection rejects non-matching IDs
   * EC-13: Dynamic section ID fails pattern
   */
  async addSection(
    path: string,
    def: { id: string; type: string; after?: string }
  ): Promise<{ ok: true; path: string }> {
    const { resolvedPath, slot, rawNode } = await resolveNodePath(
      path,
      this.backend,
      this.resolveGroupPath.bind(this)
    );

    // Get node schema
    const nodeSchemaId = rawNode.metadata['schema-id'];
    if (typeof nodeSchemaId !== 'string') {
      throw new ValidationError(path, `Missing schema-id in node metadata`);
    }

    const nodeSchema = this.registry.getSchema(nodeSchemaId) as NodeSchema;

    // Validate section ID against dynamic patterns (AC-13, AC-14, EC-13)
    if (nodeSchema.sections?.dynamic !== undefined) {
      let patternMatched = false;

      for (const dynamicDef of nodeSchema.sections.dynamic) {
        if (matchDynamicPattern(def.id, dynamicDef['id-pattern'])) {
          patternMatched = true;
          break;
        }
      }

      if (!patternMatched) {
        // Try to provide helpful error with first pattern
        const firstPattern =
          nodeSchema.sections.dynamic[0]?.['id-pattern'] ?? '';
        validateDynamicSectionId(def.id, firstPattern, `${path}/${def.id}`);
      }
    } else {
      throw new ValidationError(
        path,
        `Node schema '${nodeSchemaId}' does not define dynamic sections`
      );
    }

    // Check if section already exists
    if (def.id in rawNode.sections) {
      throw new ValidationError(
        `${path}/${def.id}`,
        `Section '${def.id}' already exists`
      );
    }

    // Add new section with empty content
    const updatedNode: RawNode = {
      metadata: rawNode.metadata,
      sections: {
        ...rawNode.sections,
        [def.id]: '',
      },
    };

    // Write updated node
    await this.backend.writeNode(resolvedPath, slot, updatedNode);

    return {
      ok: true,
      path: `${path}/${def.id}`,
    };
  }

  /**
   * Remove a section from node
   * IR-17: removeSection(path, section)
   */
  async removeSection(
    path: string,
    sectionId: string
  ): Promise<{ ok: true; path: string }> {
    const { resolvedPath, slot, rawNode } = await resolveNodePath(
      path,
      this.backend,
      this.resolveGroupPath.bind(this)
    );

    // Check if section exists
    if (!(sectionId in rawNode.sections)) {
      throw new SectionNotFoundError(
        `${path}/${sectionId}`,
        `Section '${sectionId}' not found in node`
      );
    }

    // Remove section
    const { [sectionId]: _removed, ...remainingSections } = rawNode.sections;

    const updatedNode: RawNode = {
      metadata: rawNode.metadata,
      sections: remainingSections,
    };

    // Write updated node
    await this.backend.writeNode(resolvedPath, slot, updatedNode);

    return {
      ok: true,
      path: `${path}/${sectionId}`,
    };
  }

  /**
   * Populate multiple sections atomically with optional token
   * IR-18: populate(path, data, opts?)
   * AC-12: populate validates complete result before committing
   */
  async populate(
    path: string,
    data: PopulateData,
    opts?: TokenOpts
  ): Promise<{
    ok: true;
    path: string;
    sections: number;
    metadata: number;
    token: string;
  }> {
    const { resolvedPath, slot, rawNode } = await resolveNodePath(
      path,
      this.backend,
      this.resolveGroupPath.bind(this)
    );

    // Token validation
    if (opts?.token !== undefined) {
      const providedToken = opts.token;
      const currentNodeContent = {
        metadata: rawNode.metadata,
        sections: rawNode.sections,
      };
      const currentNodeToken = generateNodeToken(
        currentNodeContent,
        this.tokenSalt
      );

      if (providedToken !== currentNodeToken) {
        throw new StaleTokenError(
          path,
          `Content has changed since token was issued`,
          {
            metadata: rawNode.metadata,
            sections: Object.entries(rawNode.sections).map(
              ([id, sectionContent]) => ({
                id,
                content: sectionContent,
              })
            ),
          },
          currentNodeToken
        );
      }
    }

    // Build updated node
    const updatedMetadata = data.metadata
      ? { ...rawNode.metadata, ...data.metadata }
      : rawNode.metadata;

    // Serialize section content to strings for backend
    const serializedSections: Record<string, string> = {};
    for (const [sectionId, sectionContent] of Object.entries(data.sections)) {
      serializedSections[sectionId] =
        typeof sectionContent === 'string'
          ? sectionContent
          : JSON.stringify(sectionContent);
    }

    const updatedSections = {
      ...rawNode.sections,
      ...serializedSections,
    };

    const updatedNode: RawNode = {
      metadata: updatedMetadata,
      sections: updatedSections,
    };

    // Get node schema
    const nodeSchemaId = updatedMetadata['schema-id'];
    if (typeof nodeSchemaId !== 'string') {
      throw new ValidationError(path, `Missing schema-id in node metadata`);
    }

    const nodeSchema = this.registry.getSchema(nodeSchemaId) as NodeSchema;

    // AC-12: Validate complete result before committing
    validateMetadata(updatedMetadata, nodeSchema, path);

    // Validate required sections exist
    if (nodeSchema.sections?.required !== undefined) {
      for (const requiredSection of nodeSchema.sections.required) {
        if (!(requiredSection.id in updatedSections)) {
          throw new ValidationError(
            `${path}/${requiredSection.id}`,
            `Required section '${requiredSection.id}' is missing`
          );
        }
      }
    }

    // Validate dynamic section minimum counts
    if (nodeSchema.sections?.dynamic !== undefined) {
      const sectionIds = Object.keys(updatedSections);
      for (const dynamicDef of nodeSchema.sections.dynamic) {
        validateDynamicSectionMin(sectionIds, dynamicDef, path);
      }
    }

    // Write updated node (atomic operation)
    await this.backend.writeNode(resolvedPath, slot, updatedNode);

    // Generate new token
    const newToken = generateNodeToken(updatedNode, this.tokenSalt);

    return {
      ok: true,
      path,
      sections: Object.keys(data.sections).length,
      metadata: data.metadata ? Object.keys(data.metadata).length : 0,
      token: newToken,
    };
  }

  /**
   * Describe a node's schema structure
   * IR-23: describe(schemaOrPath)
   * Returns natural language description for LLM consumption
   */
  async describe(schemaOrPath: string): Promise<{
    'schema-id': string;
    type: 'node' | 'group';
    description?: string;
  }> {
    // Check if it's a path (contains /) or a schema ID
    if (schemaOrPath.includes('/')) {
      // It's a path - resolve to schema
      const { rawNode } = await resolveNodePath(
        schemaOrPath,
        this.backend,
        this.resolveGroupPath.bind(this)
      );
      const nodeSchemaId = rawNode.metadata['schema-id'];

      if (typeof nodeSchemaId !== 'string') {
        throw new ValidationError(
          schemaOrPath,
          `Missing schema-id in node metadata`
        );
      }

      // Get schema
      const nodeSchema = this.registry.getSchema(nodeSchemaId) as NodeSchema;

      return {
        'schema-id': nodeSchema['schema-id'],
        type: 'node',
        ...(nodeSchema.description !== undefined && {
          description: nodeSchema.description,
        }),
      };
    }

    // It's a schema ID - look it up directly
    const schema = this.registry.getSchema(schemaOrPath);

    if ('slots' in schema) {
      // Group schema
      return {
        'schema-id': schema['schema-id'],
        type: 'group',
        ...(schema.description !== undefined && {
          description: schema.description,
        }),
      };
    }

    // Node schema
    return {
      'schema-id': schema['schema-id'],
      type: 'node',
      ...(schema.description !== undefined && {
        description: schema.description,
      }),
    };
  }

  /**
   * Validate a node against its schema
   * IR-24: validate(path)
   * AC-18: Required sections checked
   * AC-19: Dynamic section minimum counts checked
   * AC-36: Schemaless node structural checks only
   */
  async validate(path: string): Promise<{
    valid: boolean;
    errors: {
      path: string;
      message: string;
      schema?: string;
    }[];
  }> {
    const { rawNode } = await resolveNodePath(
      path,
      this.backend,
      this.resolveGroupPath.bind(this)
    );

    const errors: {
      path: string;
      message: string;
      schema?: string;
    }[] = [];

    // Check if node has schema-id (AC-36: schemaless nodes)
    const nodeSchemaId = rawNode.metadata['schema-id'];

    if (typeof nodeSchemaId !== 'string') {
      // AC-36: Schemaless node - only structural checks
      // RawNode type guarantees metadata and sections are objects
      // No additional validation needed for schemaless nodes
      return {
        valid: true,
        errors: [],
      };
    }

    // Get node schema
    const nodeSchema = this.registry.getSchema(nodeSchemaId) as NodeSchema;

    // Validate metadata
    try {
      validateMetadata(rawNode.metadata, nodeSchema, path);
    } catch (error) {
      if (error instanceof ValidationError) {
        errors.push({
          path: error.path,
          message: error.message,
          schema: nodeSchemaId,
        });
      } else {
        throw error;
      }
    }

    // AC-18: Validate required sections
    if (nodeSchema.sections?.required !== undefined) {
      for (const requiredSection of nodeSchema.sections.required) {
        if (!(requiredSection.id in rawNode.sections)) {
          errors.push({
            path: `${path}/${requiredSection.id}`,
            message: `Required section '${requiredSection.id}' is missing`,
            schema: nodeSchemaId,
          });
        }
      }
    }

    // AC-19: Validate dynamic section minimum counts
    if (nodeSchema.sections?.dynamic !== undefined) {
      const sectionIds = Object.keys(rawNode.sections);
      for (const dynamicDef of nodeSchema.sections.dynamic) {
        try {
          validateDynamicSectionMin(sectionIds, dynamicDef, path);
        } catch (error) {
          if (error instanceof ValidationError) {
            errors.push({
              path: error.path,
              message: error.message,
              schema: nodeSchemaId,
            });
          } else {
            throw error;
          }
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  // ControlPlane methods

  /**
   * List all configured mounts
   * IR-34: mounts()
   */
  async mounts(): Promise<MountEntry[]> {
    return Promise.resolve(Array.from(this.mountsMap.values()));
  }

  /**
   * List all registered schemas
   * IR-35: listSchemas()
   */
  async listSchemas(): Promise<string[]> {
    return Promise.resolve(this.registry.listSchemas());
  }

  /**
   * Get a specific schema by ID
   * IR-36: getSchema(schema)
   */
  async getSchema(schemaId: string): Promise<NodeSchema | GroupSchema> {
    return Promise.resolve(this.registry.getSchema(schemaId));
  }

  /**
   * Register a new schema
   * IR-37: registerSchema(schema)
   */
  async registerSchema(schema: NodeSchema | GroupSchema): Promise<void> {
    this.registry.registerSchema(schema);
    return Promise.resolve();
  }

  /**
   * Get store information
   * IR-38: info()
   */
  async info(): Promise<StoreInfo> {
    return Promise.resolve({
      mounts: Array.from(this.mountsMap.values()),
      nodeExtension: this.nodeExtension,
    });
  }

  /**
   * List all registered content types
   * IR-39: listContentTypes()
   */
  async listContentTypes(): Promise<ContentTypeEntry[]> {
    // Content type registry not implemented in Task 3.1
    // Return empty array for now
    return Promise.resolve([]);
  }

  // Helper methods

  /**
   * Resolve group address to physical path
   */
  private async resolveGroupPath(groupAddress: string): Promise<string> {
    // Check cached mapping
    const mountId = this.groupToMount.get(groupAddress);
    if (mountId !== undefined) {
      const mount = this.mountsMap.get(mountId);
      if (mount !== undefined) {
        return `${mount.path}/${groupAddress}`;
      }
    }

    // Search all mounts for existing group
    for (const mount of this.mountsMap.values()) {
      const candidatePath = `${mount.path}/${groupAddress}`;
      const exists = await this.backend.exists(candidatePath);
      if (exists) {
        this.groupToMount.set(groupAddress, mount.id);
        return candidatePath;
      }
    }

    throw new NotFoundError(groupAddress, `Group not found: ${groupAddress}`);
  }

  /**
   * Get group schema for a group address
   */
  private getGroupSchemaForGroup(groupAddress: string): GroupSchema {
    // Look up mount ID from group address
    const mountId = this.groupToMount.get(groupAddress);

    if (mountId === undefined) {
      throw new NotFoundError(groupAddress, `Group not found: ${groupAddress}`);
    }

    // Get mount configuration
    const mount = this.mountsMap.get(mountId);

    if (mount === undefined) {
      throw new NotFoundError(
        groupAddress,
        `Mount '${mountId}' not found for group`
      );
    }

    // Get group schema from mount configuration
    const groupSchema = this.registry.getSchema(mount.groupSchema);

    if (!('slots' in groupSchema)) {
      throw new InvalidSchemaError(
        `Schema '${mount.groupSchema}' is not a group schema`,
        { schemaId: mount.groupSchema }
      );
    }

    return groupSchema;
  }

  /**
   * Find mount for a given group schema
   */
  private findMountForSchema(schemaId: string): MountEntry | undefined {
    for (const mount of this.mountsMap.values()) {
      if (mount.groupSchema === schemaId) {
        return mount;
      }
    }
    return undefined;
  }

  /**
   * Generate section token
   */
  private generateSectionToken(content: unknown): string {
    return generateNodeToken(content, this.tokenSalt);
  }
}

/**
 * Static entry point: Sidechain.open(config)
 * AC-1: Sidechain.open(config) with valid config returns Store
 * AC-2: Sidechain.open(config) with missing fields throws INVALID_SCHEMA
 * AC-3: Registered schemas accessible via getSchema() after init
 */
export const Sidechain = {
  async open(config: SidechainConfig): Promise<Store & ControlPlane> {
    // AC-2: Validate required fields
    // TypeScript ensures fields exist, but validate they are proper objects
    if (typeof config.mounts !== 'object') {
      throw new InvalidSchemaError('Config missing required field: mounts', {
        field: 'mounts',
      });
    }

    if (typeof config.groupSchemas !== 'object') {
      throw new InvalidSchemaError(
        'Config missing required field: groupSchemas',
        { field: 'groupSchemas' }
      );
    }

    if (typeof config.nodeSchemas !== 'object') {
      throw new InvalidSchemaError(
        'Config missing required field: nodeSchemas',
        {
          field: 'nodeSchemas',
        }
      );
    }

    // Create schema registry and register schemas
    const registry = new SchemaRegistry();

    // Register group schemas
    for (const [id, schema] of Object.entries(config.groupSchemas)) {
      if (typeof schema === 'string') {
        // Schema is a file path - not supported in this implementation
        throw new InvalidSchemaError(
          `Schema file paths not supported: ${schema}`,
          { schemaId: id }
        );
      }
      registry.registerSchema(schema);
    }

    // Register node schemas
    for (const [id, schema] of Object.entries(config.nodeSchemas)) {
      if (typeof schema === 'string') {
        // Schema is a file path - not supported in this implementation
        throw new InvalidSchemaError(
          `Schema file paths not supported: ${schema}`,
          { schemaId: id }
        );
      }
      registry.registerSchema(schema);
    }

    // Create mount entries, resolving relative paths against rootDir
    const rootDir = config.rootDir ?? process.cwd();
    const mounts: MountEntry[] = [];
    for (const [mountId, mountDef] of Object.entries(config.mounts)) {
      mounts.push({
        id: mountId,
        path: path.resolve(rootDir, mountDef.path),
        groupSchema: mountDef.groupSchema,
      });
    }

    // Generate token salt
    const tokenSalt = generateTokenSalt();

    // Create backend (filesystem by default)
    const backend =
      config.backend ??
      (await (async () => {
        const { FilesystemBackend } = await import('../backends/filesystem.js');
        return new FilesystemBackend(
          config.nodeExtension !== undefined
            ? { nodeExtension: config.nodeExtension }
            : {}
        );
      })());

    // Create store instance
    const store = new StoreImpl(
      backend,
      registry,
      mounts,
      config.nodeExtension ?? DEFAULT_NODE_EXTENSION,
      tokenSalt
    );

    return store;
  },
};
