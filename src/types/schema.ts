/**
 * Schema definitions for groups and nodes
 */

/**
 * Field type for metadata
 */
export type FieldType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'enum'
  | 'date'
  | 'ref'
  | 'string[]';

/**
 * Field definition in node metadata schema
 */
export interface FieldDef {
  type: FieldType;
  required?: boolean;
  default?: unknown;
  values?: string[];
  description?: string;
}

/**
 * Content type identifiers
 */
export type ContentTypeId =
  | 'text'
  | 'task-list'
  | 'collection'
  | 'checklist'
  | 'table'
  | 'key-value'
  | 'reference-list';

/**
 * Section definition in node schema
 */
export interface SectionDef {
  id: string;
  type: ContentTypeId;
  description?: string;
}

/**
 * Dynamic section definition with pattern matching
 */
export interface DynamicSectionDef {
  'id-pattern': string;
  type: ContentTypeId;
  min?: number;
  description?: string;
}

/**
 * Node schema defining metadata and sections
 */
export interface NodeSchema {
  'schema-id': string;
  version?: string;
  description?: string;
  metadata?: {
    fields: Record<string, FieldDef>;
  };
  sections?: {
    required?: SectionDef[];
    optional?: SectionDef[];
    dynamic?: DynamicSectionDef[];
  };
}

/**
 * Slot definition in group schema
 */
export interface SlotDef {
  id: string;
  schema: string;
  description?: string;
}

/**
 * Group schema defining slots
 */
export interface GroupSchema {
  'schema-id': string;
  description?: string;
  slots: SlotDef[];
}

/**
 * Union of schema types
 */
export type SchemaDefinition = NodeSchema | GroupSchema;

/**
 * Schema description for introspection
 */
export interface SchemaDescription {
  'schema-id': string;
  type: 'node' | 'group';
  description?: string;
}

/**
 * Validation result for a single node
 */
export interface ValidationResult {
  valid: boolean;
  errors: {
    path: string;
    message: string;
    schema?: string;
  }[];
}

/**
 * Describe and validate operations interface
 */
export interface DescribeValidateOps {
  /**
   * Describe a node's schema structure
   */
  describe(path: string): Promise<SchemaDescription>;

  /**
   * Validate a node against its schema
   */
  validate(path: string): Promise<ValidationResult>;
}
