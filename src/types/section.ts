/**
 * Section operations interface
 */

import type { TokenOpts } from './metadata.js';

/**
 * Section summary in list responses
 */
export interface SectionSummary {
  id: string;
  type: string;
  itemCount?: number;
}

/**
 * Complete section response including content and token
 */
export interface SectionResponse {
  id: string;
  type: string;
  content: unknown;
  token: string;
}

/**
 * Data for populate operation
 */
export interface PopulateData {
  metadata?: Record<string, unknown>;
  sections: Record<string, unknown>;
}

/**
 * Result from populate operation
 */
export interface PopulateResult {
  token: string;
}

/**
 * Section operations interface
 */
export interface SectionOps {
  /**
   * List all sections in a node
   */
  sections(path: string): Promise<SectionSummary[]>;

  /**
   * Read a single section with token
   */
  section(path: string, sectionId: string): Promise<SectionResponse>;

  /**
   * Write/replace a section's content with optional token
   */
  writeSection(
    path: string,
    sectionId: string,
    content: unknown,
    opts?: TokenOpts
  ): Promise<{ token: string; nodeToken: string }>;

  /**
   * Append content to a section with optional token
   */
  appendSection(
    path: string,
    sectionId: string,
    content: unknown,
    opts?: TokenOpts
  ): Promise<{ token: string; nodeToken: string }>;

  /**
   * Add a new dynamic section
   */
  addSection(
    path: string,
    sectionId: string,
    type: string,
    content: unknown
  ): Promise<{ token: string; nodeToken: string }>;

  /**
   * Remove a dynamic section
   */
  removeSection(
    path: string,
    sectionId: string
  ): Promise<{ nodeToken: string }>;

  /**
   * Populate multiple sections atomically with optional token
   */
  populate(
    path: string,
    data: PopulateData,
    opts?: TokenOpts
  ): Promise<PopulateResult>;
}
