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
 * Group metadata stored in manifest file
 * Required for group creation (§CORE.1.1)
 */
export interface GroupMeta {
  schema: string;
  name: string | null;
  client: string;
  created: string;
}

/**
 * Backend interface implemented by all storage backends
 */
export interface Backend {
  /**
   * Create a new group directory with slot definitions
   * IR-1: createGroup gains required meta parameter (§CORE.1.1)
   */
  createGroup(
    resolvedPath: string,
    slots: SlotDef[],
    meta: GroupMeta
  ): Promise<void>;

  /**
   * Read group metadata from manifest file
   * IR-2: readGroupMeta reads group manifest
   */
  readGroupMeta(resolvedPath: string): Promise<GroupMeta>;

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
