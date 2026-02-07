/**
 * Path parsing and address resolution utilities
 * Handles hierarchical addressing: <group>/<slot>/<section>/<item>
 */

import { GROUP_ADDRESS_PREFIX } from '../shared/constants.js';
import { NameNotFoundError } from './errors.js';

/**
 * Parsed path components
 */
export interface ParsedPath {
  group?: string;
  slot?: string;
  section?: string;
  item?: string;
  isMeta: boolean;
  metaField?: string;
}

/**
 * Parse a hierarchical path into components
 * Path format: <group>/<slot>/<section>/<item>
 * Special handling for @meta and @meta/<field>
 */
export function parsePath(path: string): ParsedPath {
  // Validate against path traversal attacks
  if (path.includes('..')) {
    throw new Error('Path traversal not allowed');
  }

  const parts = path.split('/').filter((p) => p.length > 0);
  const result: ParsedPath = { isMeta: false };

  if (parts.length === 0) {
    return result;
  }

  // Group
  if (parts[0]) {
    result.group = parts[0];
  }

  if (parts.length === 1) {
    return result;
  }

  // Slot
  if (parts[1]) {
    result.slot = parts[1];
  }

  if (parts.length === 2) {
    return result;
  }

  // Check for @meta path
  if (parts[2] === '@meta') {
    result.isMeta = true;
    const field = parts[3];
    if (parts.length > 3 && field) {
      result.metaField = field;
    }
    return result;
  }

  // Section
  if (parts[2]) {
    result.section = parts[2];
  }

  if (parts.length === 3) {
    return result;
  }

  // Item
  if (parts[3]) {
    result.item = parts[3];
  }

  return result;
}

/**
 * Convert a string to a URL-safe slug
 * Algorithm: lowercase, spaces to hyphens, strip special characters
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Address resolver interface for client layer
 * Maps friendly names to cryptographic addresses
 */
export interface AddressResolver {
  resolve(friendlyName: string): Promise<string>;
  save(friendlyName: string, address: string): Promise<void>;
  load(): Promise<Map<string, string>>;
}

/**
 * In-memory address resolver for testing
 */
export class InMemoryAddressResolver implements AddressResolver {
  private mappings = new Map<string, string>();

  resolve(friendlyName: string): Promise<string> {
    const address = this.mappings.get(friendlyName);
    if (!address) {
      throw new NameNotFoundError(
        `No address mapping found for name: ${friendlyName}`
      );
    }
    return Promise.resolve(address);
  }

  save(friendlyName: string, address: string): Promise<void> {
    this.mappings.set(friendlyName, address);
    return Promise.resolve();
  }

  load(): Promise<Map<string, string>> {
    return Promise.resolve(new Map(this.mappings));
  }
}

/**
 * Validate that a string is a valid group address
 * Format: sc_g_<hex-hash>
 */
export function isValidGroupAddress(address: string): boolean {
  const pattern = new RegExp(`^${GROUP_ADDRESS_PREFIX}[a-f0-9]+$`);
  return pattern.test(address);
}

/**
 * Generate a cryptographic group address from schema ID and random salt
 * Format: sc_g_<hex-hash>
 */
export function generateGroupAddress(schemaId: string, salt: string): string {
  // Simple implementation - in production would use crypto.createHash
  const combined = `${schemaId}-${salt}`;
  let hash = 0;
  for (let i = 0; i < combined.length; i++) {
    const char = combined.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  const hex = Math.abs(hash).toString(16).padStart(16, '0');
  return `${GROUP_ADDRESS_PREFIX}${hex}`;
}
