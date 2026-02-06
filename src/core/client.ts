/**
 * Client implementation with name-to-address mapping
 * Covers: IR-31, IR-32, IR-33
 * EC-3, EC-4, EC-5
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

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
 * Client implementation providing name resolution
 */
export class Client {
  private readonly mappingPath: string;

  constructor(mappingPath: string) {
    this.mappingPath = path.resolve(mappingPath);
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
}
