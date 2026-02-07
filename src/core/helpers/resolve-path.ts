/**
 * Path resolution helper
 * Consolidates the preamble pattern that splits a path, validates group address format,
 * resolves filesystem path, checks node existence, and reads raw node data.
 */

import type { Backend, RawNode } from '../../types/backend.js';
import { isValidGroupAddress } from '../addressing.js';
import { NotFoundError } from '../errors.js';

/**
 * Resolved node with all components and raw data
 */
export interface ResolvedNode {
  group: string;
  slot: string;
  resolvedPath: string;
  rawNode: RawNode;
}

/**
 * Resolve a node path to its components and raw data
 *
 * IR-1: Path Resolution Helper
 * AC-1: Path resolution helper exists and all 15 store methods delegate to it
 * AC-4: Error messages from helpers match current behavior character-for-character
 *
 * Error Contract:
 * - Path has fewer than 2 parts → NotFoundError: "Invalid node path: ${path}"
 * - Group address fails format check → NotFoundError: "Invalid group address: ${group}"
 * - Node slot does not exist on disk → NotFoundError: "Node not found: ${path}"
 *
 * @param path - Node path in format <group>/<slot>
 * @param backend - Backend instance for existence check and reading
 * @param resolveGroupPath - Function to resolve group address to filesystem path
 * @returns Resolved node with group, slot, resolved path, and raw node data
 * @throws NotFoundError - Invalid path, invalid group address, or missing node
 */
export async function resolveNodePath(
  path: string,
  backend: Backend,
  resolveGroupPath: (group: string) => Promise<string>
): Promise<ResolvedNode> {
  // Split path and filter empty segments (handles trailing slashes and empty segments)
  const parts = path.split('/').filter((p) => p.length > 0);

  // EC-1: Path has fewer than 2 parts
  if (parts.length < 2) {
    throw new NotFoundError(path, `Invalid node path: ${path}`);
  }

  const group = parts[0];
  const slot = parts[1];

  // Check for undefined after filter (defensive check)
  if (group === undefined || slot === undefined) {
    throw new NotFoundError(path, `Invalid node path: ${path}`);
  }

  // EC-2: Group address fails format check
  if (!isValidGroupAddress(group)) {
    throw new NotFoundError(path, `Invalid group address: ${group}`);
  }

  // Resolve group address to filesystem path
  const resolvedPath = await resolveGroupPath(group);

  // EC-3: Check if node exists
  const nodeExists = await backend.exists(resolvedPath, slot);
  if (!nodeExists) {
    throw new NotFoundError(path, `Node not found: ${path}`);
  }

  // Read raw node data
  const rawNode = await backend.readNode(resolvedPath, slot);

  return {
    group,
    slot,
    resolvedPath,
    rawNode,
  };
}
