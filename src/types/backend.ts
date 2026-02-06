/**
 * Backend interface for storage implementation
 */

/**
 * Slot definition for group creation
 */
export interface SlotDef {
  id: string;
  schema: string;
  description?: string;
}

/**
 * Group entry returned by listGroups
 */
export interface GroupEntry {
  id: string;
  schema: string;
}

/**
 * Raw node data structure from backend
 * Backend layer stores sections as simple ID → content mapping
 * Store layer handles type resolution and validation
 */
export interface RawNode {
  metadata: Record<string, unknown>;
  sections: Record<string, string>;
}

/**
 * Backend interface implemented by all storage backends
 */
export interface Backend {
  /**
   * Create a new group directory with slot definitions
   */
  createGroup(resolvedPath: string, slots: SlotDef[]): Promise<void>;

  /**
   * Delete a group and all its contents
   * The Store resolves addresses to physical paths
   */
  deleteGroup(resolvedPath: string): Promise<void>;

  /**
   * List all groups in a mount
   */
  listGroups(mountPath: string): Promise<GroupEntry[]>;

  /**
   * Read a node's raw data
   * The Store resolves addresses to physical paths
   */
  readNode(resolvedPath: string, slot: string): Promise<RawNode>;

  /**
   * Write a node's raw data
   * The Store resolves addresses to physical paths
   */
  writeNode(resolvedPath: string, slot: string, data: RawNode): Promise<void>;

  /**
   * Check if a group or node exists
   * If slot is provided, checks for specific node; otherwise checks for group
   */
  exists(resolvedPath: string, slot?: string): Promise<boolean>;
}
