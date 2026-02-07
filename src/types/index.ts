/**
 * Type definitions index - re-exports all public types
 */

// Store types
export type {
  GroupDescription,
  GroupEntry,
  GroupResult,
  GroupValidation,
  NodeResponse,
  Result,
  SlotEntry,
  Store,
} from './store.js';

// Metadata types
export type {
  MetadataOps,
  MetaReadResult,
  MetaResult,
  TokenOpts,
} from './metadata.js';

// Section types
export type {
  PopulateData,
  PopulateResult,
  SectionOps,
  SectionResponse,
  SectionSummary,
} from './section.js';

// Item types
export type {
  ItemAddResult,
  ItemOps,
  ItemRemoveResult,
  ItemResponse,
  ItemUpdateResult,
} from './item.js';

// Schema types
export type {
  ContentTypeId,
  DescribeValidateOps,
  DynamicSectionDef,
  FieldDef,
  FieldType,
  GroupSchema,
  NodeSchema,
  SchemaDefinition,
  SchemaDescription,
  SectionDef,
  SlotDef,
  ValidationResult,
} from './schema.js';

// Backend types
export type { Backend, RawNode } from './backend.js';

// Client types
export type { Client, MappingRecord } from './client.js';

// Session types
export type { Session } from './session.js';

// Control plane types
export type {
  ContentTypeEntry,
  ControlPlane,
  MountEntry,
  StoreInfo,
} from './control-plane.js';

// Config types
export type { MountDef, SidechainConfig } from './config.js';

// Content type types
export type {
  ChecklistItem,
  CollectionItem,
  ColumnDef,
  ContentType,
  KVPair,
  Ref,
  Row,
  TableContent,
  TaskItem,
} from './content-type.js';
