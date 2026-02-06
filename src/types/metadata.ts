/**
 * Metadata operations interface
 */

/**
 * Options for token-based concurrency control
 */
export interface TokenOpts {
  token?: string;
}

/**
 * Result from metadata read operations (single field)
 */
export interface MetaReadResult {
  value: unknown;
  token: string;
}

/**
 * Result from metadata write operations
 * IR-10/IR-11: setMeta returns { ok, path, value, previous, token }
 */
export interface MetaResult {
  ok: boolean;
  path: string;
  value: unknown; // For writes: the value(s) written
  previous: unknown; // For writes: the previous value(s)
  token: string;
}

/**
 * Metadata operations interface
 */
export interface MetadataOps {
  /**
   * Read all metadata fields with token
   */
  meta(
    path: string
  ): Promise<{ metadata: Record<string, unknown>; token: string }>;

  /**
   * Read a single metadata field with token
   */
  meta(path: string, field: string): Promise<MetaReadResult>;

  /**
   * Set all metadata fields with optional token
   */
  setMeta(
    path: string,
    metadata: Record<string, unknown>,
    opts?: TokenOpts
  ): Promise<MetaResult>;

  /**
   * Set a single metadata field with optional token
   */
  setMeta(
    path: string,
    field: string,
    value: unknown,
    opts?: TokenOpts
  ): Promise<MetaResult>;
}
