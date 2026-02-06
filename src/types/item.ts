/**
 * Item operations interface for structured section content
 */

import type { TokenOpts } from './metadata.js';

/**
 * Item response including content and token
 */
export interface ItemResponse {
  content: unknown;
  token: string;
}

/**
 * Result from item.add operation
 * IR-20
 */
export interface ItemAddResult {
  ok: true;
  path: string;
  item: string;
  token: string;
  nodeToken: string;
}

/**
 * Result from item.update operation
 * IR-21
 */
export interface ItemUpdateResult {
  ok: true;
  path: string;
  item: string;
  previous: unknown;
  token: string;
  nodeToken: string;
}

/**
 * Result from item.remove operation
 * IR-22
 */
export interface ItemRemoveResult {
  ok: true;
  path: string;
}

/**
 * Item operations interface
 */
export interface ItemOps {
  /**
   * Get a single item from a structured section
   * IR-19
   */
  get(path: string, sectionId: string, itemId: string): Promise<ItemResponse>;

  /**
   * Add a new item to a structured section
   * IR-20
   */
  add(
    path: string,
    sectionId: string,
    data: Record<string, unknown>
  ): Promise<ItemAddResult>;

  /**
   * Update an existing item
   * IR-21
   */
  update(
    path: string,
    sectionId: string,
    itemId: string,
    fields: Record<string, unknown>,
    opts?: TokenOpts
  ): Promise<ItemUpdateResult>;

  /**
   * Remove an item from a structured section
   * IR-22
   */
  remove(
    path: string,
    sectionId: string,
    itemId: string
  ): Promise<ItemRemoveResult>;
}
