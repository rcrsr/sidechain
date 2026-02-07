/**
 * Session implementation - wraps Store with token caching
 * Covers: IR-1, IR-14, IC-2, AC-1, AC-6, AC-19, AC-20, EC-3
 */

import type { ItemAddResult, ItemOps, ItemResponse } from '../types/item.js';
import type {
  MetaReadResult,
  MetaResult,
  TokenOpts,
} from '../types/metadata.js';
import type { SchemaDescription, ValidationResult } from '../types/schema.js';
import type {
  PopulateData,
  SectionResponse,
  SectionSummary,
} from '../types/section.js';
import type {
  GroupDescription,
  GroupEntry,
  GroupResult,
  GroupValidation,
  NodeResponse,
  Result,
  SlotEntry,
  Store,
} from '../types/store.js';
import { SidechainError } from './errors.js';

/**
 * Session class - wraps Store with token caching and lifecycle management
 * IR-1: constructor(store: Store)
 * IR-14: close()
 * IC-2: Session class implementation
 */
export class Session implements Store {
  private readonly store: Store;
  private readonly cache: Map<string, string>;
  private closed: boolean;

  /**
   * IR-6, IR-12, IR-13: item property with bound methods
   * Item operations with token caching and injection
   */
  readonly item: ItemOps;

  /**
   * IR-1: constructor(store: Store)
   * AC-1: new Session(store) creates a session with empty cache
   */
  constructor(store: Store) {
    this.store = store;
    this.cache = new Map<string, string>();
    this.closed = false;

    // Initialize item property with bound methods
    // Each method calls ensureOpen() and delegates to store.item
    // IR-6: get caches section token
    // IR-12: update injects cached section token
    // IR-13: add caches both section and node tokens
    this.item = {
      get: async (
        path: string,
        sectionId: string,
        itemId: string
      ): Promise<ItemResponse> => {
        this.ensureOpen();
        const response = await this.store.item.get(path, sectionId, itemId);
        // Cache section token: (path, sectionId) -> response.token
        const sectionKey = `${path}::${sectionId}`;
        this.cache.set(sectionKey, response.token);
        return response;
      },

      add: async (
        path: string,
        sectionId: string,
        data: Record<string, unknown>
      ): Promise<ItemAddResult> => {
        this.ensureOpen();
        const result = await this.store.item.add(path, sectionId, data);

        // Cache section token: (path, sectionId) -> result.token
        const sectionKey = `${path}::${sectionId}`;
        this.cache.set(sectionKey, result.token);

        // Cache node token: (path, null) -> result.nodeToken
        this.cache.set(path, result.nodeToken);

        return result;
      },

      update: async (
        path: string,
        sectionId: string,
        itemId: string,
        fields: Record<string, unknown>,
        opts?: TokenOpts
      ) => {
        this.ensureOpen();

        // Token injection logic:
        // Check (path, sectionId) for cached section token
        const sectionKey = `${path}::${sectionId}`;
        let effectiveOpts: TokenOpts | undefined;
        if (opts?.token !== undefined) {
          effectiveOpts = opts; // Explicit token provided, use as-is
        } else {
          const cachedToken = this.cache.get(sectionKey);
          effectiveOpts =
            cachedToken !== undefined ? { token: cachedToken } : undefined;
        }

        const result = await this.store.item.update(
          path,
          sectionId,
          itemId,
          fields,
          effectiveOpts
        );

        // AC-5: Update both section token and node token in cache
        // AC-13: Failed writes do not update cache (exception propagates before this line)
        this.cache.set(sectionKey, result.token);
        this.cache.set(path, result.nodeToken);
        return result;
      },

      remove: async (path: string, sectionId: string, itemId: string) => {
        this.ensureOpen();
        return this.store.item.remove(path, sectionId, itemId);
      },
    };
  }

  /**
   * IR-14: close()
   * AC-6: close() clears all cache entries
   * AC-19: Idempotent close (second call is no-op)
   * AC-20: Close empty session (0 cached entries closed without error)
   */
  close(): void {
    if (this.closed) {
      // AC-19: Idempotent close - second call is no-op
      return;
    }

    // AC-6: Clear all cache entries
    this.cache.clear();
    this.closed = true;
  }

  /**
   * Helper to ensure session is not closed
   * EC-3: Operation on closed session throws SESSION_CLOSED
   */
  private ensureOpen(): void {
    if (this.closed) {
      throw new SidechainError('SESSION_CLOSED', 'Session is closed');
    }
  }

  // Store interface delegation - all methods call ensureOpen() then delegate to this.store

  async list(): Promise<GroupEntry[]>;
  async list(group: string): Promise<SlotEntry[]>;
  async list(group?: string): Promise<GroupEntry[] | SlotEntry[]> {
    this.ensureOpen();
    if (group === undefined) {
      return this.store.list();
    }
    return this.store.list(group);
  }

  async exists(path: string): Promise<boolean> {
    this.ensureOpen();
    return this.store.exists(path);
  }

  /**
   * IR-2: get(path) with token caching
   * AC-2: Returns same response as store.get(path)
   * AC-16: Caches both node token and per-section tokens
   * AC-18: Multiple reads replace cached token
   */
  async get(path: string): Promise<NodeResponse> {
    this.ensureOpen();
    const response = await this.store.get(path);

    // Cache node token: (path, null) -> response.token
    this.cache.set(path, response.token);

    // Cache section tokens: (path, sectionId) -> section.token
    for (const section of response.sections) {
      const sectionKey = `${path}::${section.id}`;
      this.cache.set(sectionKey, section.token);
    }

    return response;
  }

  async createGroup(schemaId: string): Promise<GroupResult> {
    this.ensureOpen();
    return this.store.createGroup(schemaId);
  }

  async deleteGroup(groupAddress: string): Promise<Result<void>> {
    this.ensureOpen();
    return this.store.deleteGroup(groupAddress);
  }

  async describeGroup(groupAddress: string): Promise<GroupDescription> {
    this.ensureOpen();
    return this.store.describeGroup(groupAddress);
  }

  async validateGroup(groupAddress: string): Promise<GroupValidation> {
    this.ensureOpen();
    return this.store.validateGroup(groupAddress);
  }

  /**
   * IR-3: meta(path) with token caching
   * IR-4: meta(path, field) with token caching
   * Both cache (path, null) -> response.token
   */
  async meta(
    path: string
  ): Promise<{ metadata: Record<string, unknown>; token: string }>;
  async meta(path: string, field: string): Promise<MetaReadResult>;
  async meta(
    path: string,
    field?: string
  ): Promise<
    { metadata: Record<string, unknown>; token: string } | MetaReadResult
  > {
    this.ensureOpen();
    if (field === undefined) {
      const response = await this.store.meta(path);
      // Cache node token
      this.cache.set(path, response.token);
      return response;
    }
    const response = await this.store.meta(path, field);
    // Cache node token from field read
    this.cache.set(path, response.token);
    return response;
  }

  /**
   * IR-7: setMeta(path, field, value, opts?) with token injection
   * IR-8: setMeta(path, fields, opts?) with token injection
   * AC-3: After get(path), setMeta uses cached node token
   * AC-5: After successful write, cache updates to fresh token
   * AC-13: Failed writes do not update cache
   * AC-14: Write to path never read proceeds without token
   * AC-17: Explicit opts.token overrides cached token; cache updates on success
   * EC-1: StaleTokenError from cached token propagates unchanged
   * EC-2: StaleTokenError from explicit token propagates unchanged
   */
  async setMeta(
    path: string,
    field: string,
    value: unknown,
    opts?: TokenOpts
  ): Promise<MetaResult>;
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
    this.ensureOpen();

    // Determine actual opts parameter based on overload
    const opts =
      typeof fieldOrFields === 'string'
        ? optsOrUndefined
        : (valueOrOpts as TokenOpts | undefined);

    // Token injection logic:
    // 1. If caller provides explicit opts.token: use it, do not inject cached token
    // 2. If caller provides no token AND cache has entry: inject cached token
    // 3. If caller provides no token AND no cache entry: pass undefined (Store permissive mode)
    let effectiveOpts: TokenOpts | undefined;
    if (opts?.token !== undefined) {
      effectiveOpts = opts; // Explicit token provided, use as-is
    } else {
      const cachedToken = this.cache.get(path);
      effectiveOpts =
        cachedToken !== undefined ? { token: cachedToken } : undefined;
    }

    let result: MetaResult;
    if (typeof fieldOrFields === 'string') {
      result = await this.store.setMeta(
        path,
        fieldOrFields,
        valueOrOpts,
        effectiveOpts
      );
    } else {
      result = await this.store.setMeta(path, fieldOrFields, effectiveOpts);
    }

    // AC-5: After successful write, update cache with fresh token
    // AC-13: Failed writes do not update cache (exception propagates before this line)
    this.cache.set(path, result.token);
    return result;
  }

  async sections(path: string): Promise<SectionSummary[]> {
    this.ensureOpen();
    return this.store.sections(path);
  }

  /**
   * IR-5: section(path, sectionId) with token caching
   * Cache (path, sectionId) -> response.token
   */
  async section(path: string, sectionId: string): Promise<SectionResponse> {
    this.ensureOpen();
    const response = await this.store.section(path, sectionId);
    // Cache section token
    const sectionKey = `${path}::${sectionId}`;
    this.cache.set(sectionKey, response.token);
    return response;
  }

  /**
   * IR-9: writeSection(path, sectionId, content, opts?) with token injection
   * AC-4: After section(path, sectionId), writeSection uses cached section token
   * AC-5: After successful write, cache updates to fresh token
   * AC-13: Failed writes do not update cache
   * AC-14: Write to path never read proceeds without token
   * AC-15: Read section A, write section B: write to B has no cached token
   * AC-17: Explicit opts.token overrides cached token; cache updates on success
   * EC-1: StaleTokenError from cached token propagates unchanged
   * EC-2: StaleTokenError from explicit token propagates unchanged
   */
  async writeSection(
    path: string,
    sectionId: string,
    content: unknown,
    opts?: TokenOpts
  ): Promise<{ ok: true; path: string; token: string; nodeToken: string }> {
    this.ensureOpen();

    // Token injection logic:
    // Check (path, sectionId) for cached section token
    const sectionKey = `${path}::${sectionId}`;
    let effectiveOpts: TokenOpts | undefined;
    if (opts?.token !== undefined) {
      effectiveOpts = opts; // Explicit token provided, use as-is
    } else {
      const cachedToken = this.cache.get(sectionKey);
      effectiveOpts =
        cachedToken !== undefined ? { token: cachedToken } : undefined;
    }

    const result = await this.store.writeSection(
      path,
      sectionId,
      content,
      effectiveOpts
    );

    // AC-5: Update both section token and node token in cache
    // AC-13: Failed writes do not update cache (exception propagates before this line)
    this.cache.set(sectionKey, result.token);
    this.cache.set(path, result.nodeToken);
    return result;
  }

  /**
   * IR-10: appendSection(path, sectionId, content, opts?) with token injection
   * Same token injection logic as writeSection
   */
  async appendSection(
    path: string,
    sectionId: string,
    content: string,
    opts?: TokenOpts
  ): Promise<{ ok: true; path: string; token: string; nodeToken: string }> {
    this.ensureOpen();

    // Token injection logic: same as writeSection
    const sectionKey = `${path}::${sectionId}`;
    let effectiveOpts: TokenOpts | undefined;
    if (opts?.token !== undefined) {
      effectiveOpts = opts; // Explicit token provided, use as-is
    } else {
      const cachedToken = this.cache.get(sectionKey);
      effectiveOpts =
        cachedToken !== undefined ? { token: cachedToken } : undefined;
    }

    const result = await this.store.appendSection(
      path,
      sectionId,
      content,
      effectiveOpts
    );

    // AC-5: Update both section token and node token in cache
    this.cache.set(sectionKey, result.token);
    this.cache.set(path, result.nodeToken);
    return result;
  }

  async addSection(
    path: string,
    def: { id: string; type: string; after?: string }
  ): Promise<{ ok: true; path: string }> {
    this.ensureOpen();
    return this.store.addSection(path, def);
  }

  async removeSection(
    path: string,
    sectionId: string
  ): Promise<{ ok: true; path: string }> {
    this.ensureOpen();
    return this.store.removeSection(path, sectionId);
  }

  /**
   * IR-11: populate(path, data, opts?) with token injection
   * AC-5: After successful write, cache updates to fresh token
   * AC-13: Failed writes do not update cache
   * AC-14: Write to path never read proceeds without token
   * AC-17: Explicit opts.token overrides cached token; cache updates on success
   * EC-1: StaleTokenError from cached token propagates unchanged
   * EC-2: StaleTokenError from explicit token propagates unchanged
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
    this.ensureOpen();

    // Token injection logic:
    // Check (path, null) for cached node token
    let effectiveOpts: TokenOpts | undefined;
    if (opts?.token !== undefined) {
      effectiveOpts = opts; // Explicit token provided, use as-is
    } else {
      const cachedToken = this.cache.get(path);
      effectiveOpts =
        cachedToken !== undefined ? { token: cachedToken } : undefined;
    }

    const result = await this.store.populate(path, data, effectiveOpts);

    // AC-5: Update node token in cache
    // AC-13: Failed writes do not update cache (exception propagates before this line)
    this.cache.set(path, result.token);
    return result;
  }

  async describe(schemaOrPath: string): Promise<SchemaDescription> {
    this.ensureOpen();
    return this.store.describe(schemaOrPath);
  }

  async validate(path: string): Promise<ValidationResult> {
    this.ensureOpen();
    return this.store.validate(path);
  }
}
