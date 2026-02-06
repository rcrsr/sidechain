/**
 * Content type definitions and registry interface
 */

import type { ContentTypeId } from './schema.js';

/**
 * Task item in task-list content type
 */
export interface TaskItem {
  id: string;
  title: string;
  status: string;
  tags?: string[];
  refs?: string[];
  body?: string;
  notes?: string;
}

/**
 * Collection item in collection content type
 */
export interface CollectionItem {
  id: string;
  title: string;
  body?: string;
}

/**
 * Checklist item in checklist content type
 */
export interface ChecklistItem {
  id: string;
  label: string;
  checked: boolean;
}

/**
 * Column definition in table content type
 */
export interface ColumnDef {
  id: string;
  type: 'string' | 'number' | 'boolean' | 'date';
  label?: string;
}

/**
 * Row in table content type
 */
export interface Row {
  id: string;
  [key: string]: unknown;
}

/**
 * Table content structure
 */
export interface TableContent {
  columns: ColumnDef[];
  rows: Row[];
}

/**
 * Key-value pair in key-value content type
 */
export interface KVPair {
  key: string;
  value: string;
  type?: string;
}

/**
 * Reference in reference-list content type
 */
export interface Ref {
  id?: string;
  target: string;
  relation?: string;
  label?: string;
}

/**
 * Content type interface for validation and operations
 */
export interface ContentType {
  id: ContentTypeId;
  description: string;
  validate(content: unknown): boolean;
  serialize(content: unknown): string;
  deserialize(text: string): unknown;
}
