/**
 * Client layer types for name resolution
 */

/**
 * Mapping record structure
 */
export interface MappingRecord {
  address: string;
  created: string;
}

/**
 * Client interface for name resolution and address storage
 */
export interface Client {
  /**
   * Resolve a friendly name to a group address (synchronous)
   * Throws NAME_NOT_FOUND if no mapping exists
   */
  resolveAddress(friendlyName: string): string;

  /**
   * Save a name to address mapping (synchronous)
   */
  saveMapping(name: string, address: string): void;

  /**
   * Load all stored mappings (synchronous)
   * Returns a Record mapping names to address records
   */
  loadMappings(): Record<string, MappingRecord>;
}
