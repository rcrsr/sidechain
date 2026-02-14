/**
 * Client implementation with name-to-address mapping
 * Covers: IR-31, IR-32, IR-33
 * EC-3, EC-4, EC-5
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import type { NodeResponse, Store } from '../types/store.js';
import { MappingError, NameNotFoundError } from './errors.js';

/**
 * Mapping entry structure with metadata
 */
export interface MappingEntry {
  address: string;
  created: string;
}

/**
 * Mapping file format
 */
export type MappingFile = Record<string, MappingEntry>;

/**
 * Client constructor options
 * IR-4: ClientOptions interface
 */
export interface ClientOptions {
  clientId: string;
  mappingPath: string;
  store: Store;
}

/**
 * Client implementation providing name resolution
 */
export class Client {
  private readonly clientId: string;
  private readonly mappingPath: string;
  private readonly store: Store;

  constructor(opts: ClientOptions) {
    this.clientId = opts.clientId;
    this.mappingPath = path.resolve(opts.mappingPath);
    this.store = opts.store;
  }

  /**
   * Get the client ID
   * Used by operations that need to identify the client
   */
  getClientId(): string {
    return this.clientId;
  }

  /**
   * Get the store instance
   * Used by operations that interact with storage
   */
  getStore(): Store {
    return this.store;
  }

  /**
   * Resolve a friendly name to its cryptographic address
   * IR-31: resolveAddress(friendlyName)
   * EC-3: NAME_NOT_FOUND when name not in mappings
   */
  resolveAddress(friendlyName: string): string {
    let mappings: MappingFile;
    try {
      mappings = this.loadMappings();
    } catch (error) {
      // If file doesn't exist, treat as empty mappings (name not found)
      if (
        error instanceof MappingError &&
        error.message.includes('not found')
      ) {
        throw new NameNotFoundError(
          `Name ${friendlyName} not found in mappings`
        );
      }
      throw error;
    }

    const entry = mappings[friendlyName];

    if (!entry) {
      throw new NameNotFoundError(`Name ${friendlyName} not found in mappings`);
    }

    return entry.address;
  }

  /**
   * Save a name-to-address mapping
   * IR-32: saveMapping(name, address)
   * EC-4: MAPPING_ERROR when file unwritable or name conflict
   */
  saveMapping(name: string, address: string): void {
    try {
      // Load existing mappings
      let mappings: MappingFile;
      try {
        mappings = this.loadMappings();
      } catch (error) {
        // If file doesn't exist yet, start with empty mappings
        if (
          error instanceof MappingError &&
          error.message.includes('not found')
        ) {
          mappings = {};
        } else {
          throw error;
        }
      }

      // Check for name conflict (same name, different address)
      const existing = mappings[name];
      if (existing && existing.address !== address) {
        throw new MappingError(
          `Name ${name} already mapped to different address`
        );
      }

      // Skip if already mapped to same address (idempotent)
      if (existing?.address === address) {
        return;
      }

      // Add or update mapping
      mappings[name] = {
        address,
        created: new Date().toISOString(),
      };

      // Ensure directory exists
      const dir = path.dirname(this.mappingPath);
      fs.mkdirSync(dir, { recursive: true });

      // Write atomically via temp file + rename
      const tempPath = `${this.mappingPath}.tmp`;
      fs.writeFileSync(tempPath, JSON.stringify(mappings, null, 2), 'utf-8');
      fs.renameSync(tempPath, this.mappingPath);
    } catch (error) {
      if (error instanceof NameNotFoundError || error instanceof MappingError) {
        throw error;
      }

      // Handle filesystem errors
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        (error.code === 'EACCES' || error.code === 'EROFS')
      ) {
        throw new MappingError('Cannot write mapping file');
      }

      // Re-throw unexpected errors
      throw error;
    }
  }

  /**
   * Load all mappings from file
   * IR-33: loadMappings()
   * EC-5: MAPPING_ERROR for missing, unreadable, or malformed file
   */
  loadMappings(): MappingFile {
    try {
      const content = fs.readFileSync(this.mappingPath, 'utf-8');

      try {
        const parsed = JSON.parse(content) as MappingFile;
        return parsed;
      } catch {
        throw new MappingError('Invalid JSON in mapping file');
      }
    } catch (error) {
      if (error instanceof MappingError) {
        throw error;
      }

      // Handle filesystem errors
      if (error && typeof error === 'object' && 'code' in error) {
        if (error.code === 'ENOENT') {
          throw new MappingError('Mapping file not found');
        }
        if (error.code === 'EACCES') {
          throw new MappingError('Cannot read mapping file');
        }
      }

      // Re-throw unexpected errors
      throw error;
    }
  }

  /**
   * Create a new group with name mapping
   * IR-4: createGroup(schemaId, opts?)
   * AC-1: Create named group returns { address, schema, name }
   * AC-2: Create unnamed group returns { address, schema }
   * AC-3: Duplicate name raises MappingError
   * EC-4: Name already mapped to different address raises MappingError
   */
  async createGroup(
    schemaId: string,
    opts?: { name?: string }
  ): Promise<{ address: string; schema: string; name?: string }> {
    // Call store to create group with client ID
    // Conditionally add name to avoid passing undefined explicitly
    const storeOpts: { client: string; name?: string } = {
      client: this.clientId,
    };
    if (opts?.name) {
      storeOpts.name = opts.name;
    }
    const result = await this.store.createGroup(schemaId, storeOpts);

    // If name provided, save mapping (handles duplicate detection)
    if (opts?.name) {
      this.saveMapping(opts.name, result.address);
      return {
        address: result.address,
        schema: result.schema,
        name: opts.name,
      };
    }

    // Return without name for unnamed groups
    return { address: result.address, schema: result.schema };
  }

  /**
   * Get a complete node with name resolution and address passthrough
   * IR-5: get(path)
   * AC-5: Get by name resolves and returns data
   * AC-6: Get by address returns data
   * AC-7: Unregistered name error
   * AC-24: Address passthrough works regardless of name resolution state
   * EC-5: Name not found raises NameNotFoundError
   */
  async get(path: string): Promise<NodeResponse> {
    // Split path on first '/' to get group part and remainder
    const firstSlashIndex = path.indexOf('/');

    if (firstSlashIndex === -1) {
      // No slash - entire path is the group
      throw new Error('Path must include slot: group/slot');
    }

    const groupPart = path.substring(0, firstSlashIndex);
    const remainder = path.substring(firstSlashIndex + 1);

    // Check if group part is an address (starts with sc_g_)
    if (groupPart.startsWith('sc_g_')) {
      // Address passthrough - use path directly
      return await this.store.get(path);
    }

    // Name resolution - resolve name to address
    const resolvedAddress = this.resolveAddress(groupPart);

    // Construct full path with resolved address
    const fullPath = `${resolvedAddress}/${remainder}`;

    return await this.store.get(fullPath);
  }

  /**
   * List all groups with metadata enrichment
   * IR-6: list()
   * AC-8: List returns name, address, schema, client
   * AC-9: List empty when no groups
   * AC-10: Multiple clients see only their own groups
   * AC-19: List includes client field
   * AC-22: List empty when no groups exist
   */
  async list(): Promise<
    { name: string; address: string; schema: string; client: string }[]
  > {
    // Load mappings file (handle missing file as empty)
    let mappings: MappingFile;
    try {
      mappings = this.loadMappings();
    } catch (error) {
      // If file doesn't exist, return empty array
      if (
        error instanceof MappingError &&
        error.message.includes('not found')
      ) {
        return [];
      }
      throw error;
    }

    // For each mapping entry, read _meta.json via store
    const results: {
      name: string;
      address: string;
      schema: string;
      client: string;
    }[] = [];

    for (const [name, entry] of Object.entries(mappings)) {
      try {
        const meta = await this.store.getGroupMeta(entry.address);
        results.push({
          name,
          address: entry.address,
          schema: meta.schema,
          client: meta.client,
        });
      } catch {
        // Skip groups that no longer exist or are inaccessible
        // This handles the case where a group was deleted but mapping still exists
        continue;
      }
    }

    return results;
  }

  /**
   * Delete a group by name or address
   * IR-7: deleteGroup(nameOrAddress)
   * AC-11: Delete by name removes group and mapping
   * AC-12: Delete by address removes group
   * AC-13: Delete unregistered name error
   * EC-6: Name not found raises NameNotFoundError
   */
  async deleteGroup(nameOrAddress: string): Promise<{ ok: true }> {
    let address: string;
    let nameToRemove: string | undefined;

    // Check if input is an address (starts with sc_g_)
    if (nameOrAddress.startsWith('sc_g_')) {
      // Delete by address
      address = nameOrAddress;

      // Find any mapping pointing to this address (to remove it later)
      try {
        const mappings = this.loadMappings();
        for (const [name, entry] of Object.entries(mappings)) {
          if (entry.address === address) {
            nameToRemove = name;
            break;
          }
        }
      } catch (error) {
        // If mappings file doesn't exist, no mapping to remove
        if (
          !(
            error instanceof MappingError && error.message.includes('not found')
          )
        ) {
          throw error;
        }
      }
    } else {
      // Delete by name - resolve to address
      address = this.resolveAddress(nameOrAddress); // Throws NameNotFoundError if not found
      nameToRemove = nameOrAddress;
    }

    // Delete the group via store
    const result = await this.store.deleteGroup(address);
    if (!result.ok) {
      throw new Error(result.message);
    }

    // Remove mapping if one was found
    if (nameToRemove !== undefined) {
      try {
        const mappings = this.loadMappings();
        const { [nameToRemove]: _removed, ...remaining } = mappings;

        // Write updated mappings atomically
        const dir = path.dirname(this.mappingPath);
        fs.mkdirSync(dir, { recursive: true });

        const tempPath = `${this.mappingPath}.tmp`;
        fs.writeFileSync(tempPath, JSON.stringify(remaining, null, 2), 'utf-8');
        fs.renameSync(tempPath, this.mappingPath);
      } catch (error) {
        // If mapping file doesn't exist, nothing to remove
        if (
          !(
            error instanceof MappingError && error.message.includes('not found')
          )
        ) {
          throw error;
        }
      }
    }

    return { ok: true };
  }

  /**
   * Rebuild mappings from _meta.json files
   * IR-8: rebuildMappings()
   * AC-4: Name persists across mapping deletion via _meta.json
   * AC-14: Rebuild recreates mapping file from groups with names
   * AC-15: Rebuild skips unnamed groups
   * AC-16: Rebuild returns count of recovered mappings
   */
  async rebuildMappings(): Promise<{ recovered: number }> {
    // Get all groups across mounts
    const groups = await this.store.list();
    let recovered = 0;

    // For each group, attempt to read _meta.json
    for (const group of groups) {
      try {
        const meta = await this.store.getGroupMeta(group.id);

        // If name is non-null, save mapping
        if (meta.name !== null) {
          this.saveMapping(meta.name, group.id);
          recovered++;
        }
        // Skip groups without names (name is null)
      } catch {
        // Skip groups that are inaccessible or have errors
        continue;
      }
    }

    return { recovered };
  }
}
